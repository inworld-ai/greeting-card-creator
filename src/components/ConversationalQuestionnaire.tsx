import { useState, useRef, useEffect } from 'react'
import { synthesizeSpeech } from '../services/ttsService'
import './ConversationalQuestionnaire.css'

interface ConversationalQuestionnaireProps {
  experienceType: 'year-review' | 'wish-list' | 'greeting-card'
  recipientName?: string // For greeting-card: the name of the person the card is for
  relationship?: string // For greeting-card: the relationship between sender and recipient
  onSubmit: (answers: {
    favoriteMemory?: string
    newThing?: string
    lookingForward?: string
    dreamGift?: string
    experience?: string
    practicalNeed?: string
    specialAboutThem?: string
    funnyStory?: string
  }) => void
  onBack: () => void
}

interface ConversationMessage {
  role: 'assistant' | 'user'
  content: string
}

function ConversationalQuestionnaire({ experienceType, recipientName, relationship, onSubmit, onBack }: ConversationalQuestionnaireProps) {
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, string>>({})
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [hasStarted, setHasStarted] = useState(false) // Track if conversation has started
  const [clickedPresets, setClickedPresets] = useState<Set<string>>(new Set()) // Track which presets have been clicked
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const answeredQuestionsRef = useRef<Record<string, string>>({}) // Track current answered questions to avoid stale closures
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isTTSInProgressRef = useRef(false)  // Prevent multiple simultaneous TTS requests
  const allAudioChunksRef = useRef<HTMLAudioElement[]>([])  // Track all audio chunks
  const isProcessingRef = useRef(false)  // Use ref to avoid stale closure issues
  
  // Backend API URL
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')

  const questions = experienceType === 'year-review'
    ? [
        { key: 'favoriteMemory', question: "What was your favorite memory or adventure from 2025?" },
        { key: 'newThing', question: "What's something new you tried or learned in 2025?" },
        { key: 'lookingForward', question: "What are you most looking forward to or hoping for in 2026?" }
      ]
    : experienceType === 'greeting-card'
    ? [
        { key: 'specialAboutThem', question: recipientName ? `What's something special about ${recipientName} that you love?` : "What's something special about them that you love?" },
        { key: 'funnyStory', question: recipientName ? `What's something funny about ${recipientName} or a story that you love to joke with ${recipientName} about?` : "What's something funny about them or a story that you love to joke with them about?" }
      ]
    : [
        { key: 'dreamGift', question: "What's the one gift you've been thinking about all year?" },
        { key: 'experience', question: "Is there something you'd love to experience rather than receive? (like a trip, concert, or special dinner)" },
        { key: 'practicalNeed', question: "What's something practical you actually need but wouldn't buy for yourself?" }
      ]

  // Preset options for Christmas Wish List
  const presetOptions: Record<string, string[]> = {
    dreamGift: [
      "A new laptop or tablet for work and creativity",
      "A high-quality camera to capture special moments",
      "A subscription to a streaming service or book club"
    ],
    experience: [
      "A weekend getaway to a cozy cabin or beach",
      "Tickets to a concert or live show",
      "A cooking class or wine tasting experience"
    ],
    practicalNeed: [
      "A new pair of comfortable shoes or boots",
      "A quality coffee maker or kitchen appliance",
      "A professional organizer or home improvement tool"
    ]
  }

  // Get the current question being asked
  const remainingQuestions = questions.filter(q => !answeredQuestions[q.key])
  const currentQuestion = remainingQuestions[0]
  
  // Only show presets for the initial question, not for follow-ups
  // A follow-up is when the question has been asked MORE THAN ONCE in the conversation
  const isFollowUp = currentQuestion && (() => {
    if (!conversationHistory.length) return false
    
    const questionStart = currentQuestion.question.substring(0, 30).toLowerCase()
    let questionAskedCount = 0
    
    conversationHistory.forEach(msg => {
      if (msg.role === 'assistant') {
        const msgLower = msg.content.toLowerCase()
        // Check if the question text appears in the assistant message
        if (msgLower.includes(questionStart)) {
          // Make sure it's not matching another question
          const otherQuestions = questions.filter(q => q.key !== currentQuestion.key)
          const isOtherQuestion = otherQuestions.some(q => msgLower.includes(q.question.substring(0, 20).toLowerCase()))
          if (!isOtherQuestion) {
            questionAskedCount++
          }
        }
      }
    })
    
    // If the question has been asked more than once, it's a follow-up
    return questionAskedCount > 1
  })()
  
  // Show presets only if:
  // 1. It's a wish-list experience
  // 2. There's a current question
  // 3. It's NOT a follow-up (question has been asked 0 or 1 times, not more)
  const currentPresets = currentQuestion && experienceType === 'wish-list' && !isFollowUp ? presetOptions[currentQuestion.key] : null

  // Handle preset option click
  const handlePresetClick = async (presetText: string) => {
    if (isProcessing || isTTSInProgressRef.current || clickedPresets.has(presetText)) {
      return // Don't allow clicks while processing or if already clicked
    }
    console.log('🎯 Preset option clicked:', presetText)
    setClickedPresets(prev => new Set(prev).add(presetText)) // Mark as clicked
    await handleUserMessage(presetText)
  }

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Your browser does not support speech recognition. Please use the text questionnaire instead.')
      onBack()
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true  // Keep microphone open continuously
    recognition.interimResults = false
    recognition.lang = 'en-US'

    let isProcessingUserInput = false  // Flag to prevent processing duplicate results

    recognition.onstart = () => {
      // Always set listening to true when recognition actually starts
      // This ensures the mic is active and we can process user input
      setIsListening(true)
      console.log('🎤 Speech recognition started (continuous mode) - mic is now ACTIVE')
    }

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      // CRITICAL: Don't process results if we're processing (Olivia is speaking)
      // This is the primary safety check to prevent feedback loop
      // Use ref to avoid stale closure issues
      if (isProcessingRef.current || isTTSInProgressRef.current) {
        console.log('🔇 IGNORING speech recognition result - Olivia is speaking', {
          isProcessing: isProcessingRef.current,
          isTTSInProgress: isTTSInProgressRef.current
        })
        return
      }
      
      // In continuous mode, we get results as the user speaks
      // Get the most recent result
      const resultIndex = event.results.length - 1
      const transcript = event.results[resultIndex][0].transcript.trim()
      
      // Only process if we have a transcript and we're not already processing
      // Use refs to avoid stale closure issues
      if (transcript && !isProcessingUserInput && !isProcessingRef.current && !isTTSInProgressRef.current && !isComplete) {
        isProcessingUserInput = true
        console.log('✅ User response captured:', transcript)

        // Process the response with the updated conversation history
        try {
          await handleUserMessage(transcript)
        } finally {
          // Reset flag after processing completes
          isProcessingUserInput = false
        }
      } else {
        if (transcript) {
          console.log('🔇 Ignored transcript (conditions not met):', transcript.substring(0, 50), {
            hasTranscript: !!transcript,
            isProcessingUserInput,
            isProcessing,
            isComplete
          })
        }
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      
      // Only stop listening for critical errors
      if (event.error === 'not-allowed') {
        setIsListening(false)
        alert("Please allow microphone access to use voice input!")
        recognition.stop()
      } else if (event.error === 'network') {
        // Network errors are often transient - log but keep trying
        console.log('Network error in speech recognition, continuing to listen')
      } else if (event.error === 'no-speech') {
        // No-speech is normal in continuous mode - just continue listening
        console.log('No speech detected yet, continuing to listen')
      } else {
        // For other errors, log but try to continue
        console.log(`Speech recognition error: ${event.error}, attempting to continue`)
      }
    }

    recognition.onend = () => {
      // In continuous mode, onend should rarely fire unless there's an error
      // CRITICAL: Use refs to avoid stale closure issues - check current values, not closure values
      if (!isComplete && !isProcessingRef.current && !isTTSInProgressRef.current) {
        console.log('🎤 Speech recognition ended unexpectedly, checking if we should restart...')
        // Only restart if we're not processing and recognition ref exists
        if (recognitionRef.current) {
          setTimeout(() => {
            try {
              // Triple-check using refs to get current values: not processing, not complete, TTS not in progress, and no audio playing
              if (!isProcessingRef.current && !isComplete && !isTTSInProgressRef.current && recognitionRef.current) {
                // Check if audio is still playing
                const anyAudioPlaying = allAudioChunksRef.current.some(chunk => !chunk.ended && !chunk.paused)
                if (anyAudioPlaying || (audioRef.current && !audioRef.current.paused && !audioRef.current.ended)) {
                  console.log('🔇 Not restarting recognition - audio is still playing')
                  setIsListening(false)
                  return
                }
                setIsListening(true)  // Set listening state before starting
                recognition.start()
                console.log('🎤 Restarted speech recognition after unexpected end - mic should be active')
                // onstart will also set isListening to true, but set it here too
              } else {
                console.log('🔇 Not restarting recognition - processing, complete, or TTS in progress', {
                  isProcessing: isProcessingRef.current,
                  isComplete,
                  isTTSInProgress: isTTSInProgressRef.current
                })
                setIsListening(false)
              }
            } catch (error: any) {
              if (error.name === 'InvalidStateError' && error.message.includes('already started')) {
                console.log('🎤 Recognition already running - setting listening to true')
                setIsListening(true)
              } else if (error.name !== 'InvalidStateError') {
                console.error('Error restarting recognition:', error)
                setIsListening(false)
              }
            }
          }, 1000)  // Wait 1 second before restarting to ensure audio has stopped
        }
      } else if (isComplete) {
        console.log('🎤 Speech recognition ended (conversation complete)')
        setIsListening(false)
      } else if (isProcessingRef.current || isTTSInProgressRef.current) {
        console.log('🔇 Speech recognition ended while processing (expected - Olivia is speaking)', {
          isProcessing: isProcessingRef.current,
          isTTSInProgress: isTTSInProgressRef.current
        })
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition

    // Start the conversation and begin continuous listening
    startConversation()
    
    // Start continuous recognition immediately, but only if not processing
    setTimeout(() => {
      try {
        // Don't start if we're already processing (e.g., conversation already started)
        if (!isProcessingRef.current && !isTTSInProgressRef.current) {
          recognition.start()
          setIsListening(true)  // Set listening state immediately when we start
          console.log('🎤 Started continuous speech recognition - mic should be active')
        } else {
          console.log('🔇 Not starting recognition - already processing', {
            isProcessing: isProcessingRef.current,
            isTTSInProgress: isTTSInProgressRef.current
          })
          setIsListening(false)
        }
      } catch (error) {
        console.error('Error starting initial recognition:', error)
        setIsListening(false)
      }
    }, 1000)  // Small delay to ensure component is fully mounted

    return () => {
      // CRITICAL: Stop recognition and clean up when component unmounts
      console.log('🛑 ConversationalQuestionnaire unmounting - stopping recognition and cleaning up')
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
          recognitionRef.current = null
        } catch (error) {
          console.error('Error stopping recognition on unmount:', error)
        }
      }
      setIsListening(false)
      isProcessingRef.current = false
      isTTSInProgressRef.current = false
      
      // Stop and clean up all audio
      if (audioRef.current) {
        audioRef.current.pause()
        if (audioRef.current.src.startsWith('blob:')) {
          URL.revokeObjectURL(audioRef.current.src)
        }
        audioRef.current = null
      }
      
      // Clean up all audio chunks
      allAudioChunksRef.current.forEach(chunk => {
        chunk.pause()
        if (chunk.src.startsWith('blob:')) {
          URL.revokeObjectURL(chunk.src)
        }
      })
      allAudioChunksRef.current = []
    }
  }, [])

  const startConversation = async () => {
    // Don't set isProcessing here - sendMessage will set it when it starts processing
    // Setting it here causes sendMessage to return early because it checks isProcessingRef.current
    try {
      console.log('🎤 Starting conversation...')
      setHasStarted(true) // Mark conversation as started
      await sendMessage('', [], answeredQuestionsRef.current)
    } catch (error: any) {
      console.error('❌ Error starting conversation:', error)
      setIsProcessing(false)
      isProcessingRef.current = false
      isTTSInProgressRef.current = false
      // Show error to user
      const errorMessage = error?.message || 'Failed to start conversation. Please try again.'
      alert(`Unable to start conversation: ${errorMessage}`)
    }
  }

  const handleUserMessage = async (userMessage: string) => {
    // Don't process messages if conversation is complete
    if (isComplete) {
      console.log('🛑 Conversation is complete, not processing user message')
      return
    }
    
    // CRITICAL: Prevent multiple simultaneous requests - use refs to avoid stale closure
    if (isTTSInProgressRef.current || isProcessingRef.current) {
      console.log('⚠️ Already processing, ignoring duplicate user message', {
        isTTSInProgress: isTTSInProgressRef.current,
        isProcessing: isProcessingRef.current
      })
      return
    }
    
    // Stop speech recognition immediately when user message is being processed
    // This prevents any additional speech from being captured while we process
    // Don't set isProcessing here - sendMessage will set it when it starts processing
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
        setIsListening(false)
        console.log('🔇 STOPPED speech recognition while processing user message')
      } catch (error: any) {
        setIsListening(false)
        if (error.name !== 'InvalidStateError') {
          console.error('Error stopping recognition:', error)
        }
      }
    } else {
      setIsListening(false)
    }
    
    // Update conversation history first, then send with updated history
    // Use functional update to get the latest state
    const updatedHistory: ConversationMessage[] = [...conversationHistory, { role: 'user' as const, content: userMessage }]
    setConversationHistory(updatedHistory)
    
    // Send message with updated history - await it to prevent race conditions
    // sendMessage will set isProcessing and isTTSInProgress flags internally
    // Use ref to get the most current answeredQuestions to avoid stale closure
    try {
      await sendMessage(userMessage, updatedHistory, answeredQuestionsRef.current)
    } catch (error: any) {
      console.error('Error sending message:', error)
      isTTSInProgressRef.current = false
      setIsProcessing(false)
      isProcessingRef.current = false
      // Restart recognition on error
      if (!isComplete && recognitionRef.current) {
        setTimeout(() => {
          try {
            if (!isProcessingRef.current && !isTTSInProgressRef.current) {
              recognitionRef.current?.start()
              setIsListening(true)
            }
          } catch (err: any) {
            if (err.name !== 'InvalidStateError') {
              console.error('Error restarting recognition after error:', err)
            }
          }
        }, 300)
      }
    }
  }

  const sendMessage = async (userMessage: string, currentHistory: ConversationMessage[] = conversationHistory, currentAnswers: Record<string, string> = answeredQuestions) => {
    // Don't send messages if conversation is complete
    if (isComplete) {
      console.log('🛑 Conversation is complete, not sending message')
      return { response: '', detectedAnswer: null, detectedQuestionKey: null }
    }
    
    // Prevent multiple simultaneous requests - this should already be checked in handleUserMessage, but double-check here
    // CRITICAL: Check BOTH flags to prevent any race conditions
    if (isTTSInProgressRef.current || isProcessingRef.current) {
      console.log('⚠️ TTS already in progress or processing, ignoring duplicate request', {
        isTTSInProgress: isTTSInProgressRef.current,
        isProcessing: isProcessingRef.current
      })
      return { response: '', detectedAnswer: null, detectedQuestionKey: null }
    }
    
    // Set flags BEFORE making the request to prevent race conditions
    // This ensures that any subsequent calls to sendMessage or handleUserMessage will be blocked
    isTTSInProgressRef.current = true
    isProcessingRef.current = true
    setIsProcessing(true)
    
    try {
      console.log('📤 Sending message to backend:', { 
        experienceType, 
        userMessage, 
        conversationHistoryLength: currentHistory.length, 
        answeredQuestions: Object.keys(currentAnswers) 
      })
      
      const response = await fetch(`${API_BASE_URL}/api/conversational-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experienceType,
          userMessage,
          recipientName: experienceType === 'greeting-card' ? recipientName : undefined,
          relationship: experienceType === 'greeting-card' ? relationship : undefined,
          conversationHistory: currentHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          answeredQuestions: currentAnswers
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Backend error:', errorText)
        throw new Error(`Failed to get conversational response: ${errorText}`)
      }

      const data = await response.json()
      console.log('📥 Received response from backend:', data)
      const aiResponse = data.response || ''
      
      if (!aiResponse) {
        console.error('❌ No response text from backend')
        throw new Error('No response received from backend')
      }

      // CRITICAL: Set isProcessing to true FIRST, then stop recognition
      // This prevents the onend handler from restarting recognition too early
      setIsProcessing(true)
      isProcessingRef.current = true
      console.log('🔄 Set isProcessing=true (Olivia will be speaking soon)')

      // CRITICAL: Stop speech recognition IMMEDIATELY when we receive AI response
      // Stop REGARDLESS of isListening state - we must be aggressive here to prevent feedback
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
          setIsListening(false)
          console.log('🔇 STOPPED speech recognition when AI response received (preventing feedback)')
        } catch (error: any) {
          // Even if there's an error, set listening to false
          setIsListening(false)
          if (error.name !== 'InvalidStateError') {
            console.error('Error stopping recognition:', error)
          } else {
            console.log('🔇 Recognition was already stopped (good)')
          }
        }
      } else {
        // If recognitionRef is null, still set listening to false as a safeguard
        setIsListening(false)
        console.log('🔇 Recognition ref is null, setting listening to false')
      }

      // Update conversation history and answered questions together
      setConversationHistory(prev => {
        const updatedHistory: ConversationMessage[] = [...prev, { role: 'assistant' as const, content: aiResponse }]
        
        // Check if an answer was detected and update answered questions
        setAnsweredQuestions(prevAnswers => {
          let updatedAnswers = { ...prevAnswers } // Create a new object to ensure state update
          if (data.detectedAnswer && data.detectedQuestionKey) {
            updatedAnswers = {
              ...prevAnswers,
              [data.detectedQuestionKey]: data.detectedAnswer
            }
            // Update ref to keep it in sync
            answeredQuestionsRef.current = updatedAnswers
            console.log(`✅ Answer detected for ${data.detectedQuestionKey}: ${data.detectedAnswer.substring(0, 50)}...`)
            console.log(`📊 Progress: ${Object.keys(updatedAnswers).length}/${questions.length} questions answered`)
            console.log(`📊 Updated answeredQuestions keys:`, Object.keys(updatedAnswers))
          } else {
            console.log(`⚠️ No answer detected. detectedAnswer: ${data.detectedAnswer}, detectedQuestionKey: ${data.detectedQuestionKey}`)
          }

          // Check if all questions are answered
          const allAnswered = questions.every(q => (updatedAnswers as Record<string, string>)[q.key])
          
          // Check if Olivia is wrapping up the conversation
          const isWrappingUp = aiResponse.toLowerCase().includes('all set') ||
                              aiResponse.toLowerCase().includes('i\'ll create your christmas card') ||
                              aiResponse.toLowerCase().includes('compile my notes') ||
                              aiResponse.toLowerCase().includes('i\'ll take your answers') ||
                              aiResponse.toLowerCase().includes('create your') ||
                              (aiResponse.toLowerCase().includes('thank') && 
                               (aiResponse.toLowerCase().includes('year in review') || 
                                aiResponse.toLowerCase().includes('wish list') ||
                                aiResponse.toLowerCase().includes('christmas card') ||
                                aiResponse.toLowerCase().includes('create')))
          
          if (allAnswered || isWrappingUp) {
            if (!isComplete) {
              // If wrapping up but not all detected, extract answers from conversation history
              if (isWrappingUp && !allAnswered) {
                console.log('⚠️ Conversation wrapping up but not all answers detected, extracting from history...')
                // Extract user responses for each question from conversation history
                questions.forEach(q => {
                  if (!updatedAnswers[q.key]) {
                    // Find user responses related to this question
                    const questionIndex = updatedHistory.findIndex(msg => 
                      msg.role === 'assistant' && 
                      msg.content.toLowerCase().includes(q.question.substring(0, 20).toLowerCase())
                    )
                    if (questionIndex >= 0) {
                      // Get all user responses after this question
                      const userResponses = updatedHistory
                        .slice(questionIndex + 1)
                        .filter((msg, idx) => {
                          // Stop at next assistant question
                          const nextQuestionIndex = updatedHistory.findIndex((m, i) => 
                            i > questionIndex && 
                            m.role === 'assistant' && 
                            questions.some(q2 => q2.key !== q.key && m.content.toLowerCase().includes(q2.question.substring(0, 20).toLowerCase()))
                          )
                          return msg.role === 'user' && (nextQuestionIndex < 0 || idx < nextQuestionIndex - questionIndex - 1)
                        })
                        .map(msg => msg.content)
                        .join(' ')
                      
                      if (userResponses.trim()) {
                        updatedAnswers[q.key] = userResponses.trim()
                        // Update ref to keep it in sync
                        answeredQuestionsRef.current = updatedAnswers
                        console.log(`✅ Extracted answer for ${q.key}: ${userResponses.substring(0, 50)}...`)
                      }
                    }
                  }
                })
                // Re-check if all are answered after extraction
                const allAnsweredAfterExtraction = questions.every(q => (updatedAnswers as Record<string, string>)[q.key])
                if (allAnsweredAfterExtraction) {
                  console.log('✅ All questions answered after extraction!')
                }
              }
              
              setIsComplete(true)
              console.log('✅ All questions answered! Completing conversation...')
              console.log('📊 Final answers:', updatedAnswers)
              console.log(`📊 Final progress: ${Object.keys(updatedAnswers).length}/${questions.length} questions answered`)
              // Don't auto-submit - show Continue button instead
            }
          }
          
          // Always return updatedAnswers to ensure state updates
          return updatedAnswers
        })
        
        return updatedHistory
      })

      // Stop speech recognition while Olivia is speaking to prevent feedback
      if (recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop()
          setIsListening(false)
          console.log('🔇 Stopped speech recognition while Olivia is speaking')
        } catch (error) {
          console.error('Error stopping recognition:', error)
        }
      }

      // Get TTS audio for the response using Olivia voice
      // Use the ttsService which handles the WAV chunk parsing correctly
      try {
        const audio = await synthesizeSpeech(aiResponse, {
          voiceId: 'Olivia',
          apiKey: undefined // Use default API key
        })
        
        // Clean up previous audio
        if (audioRef.current) {
          audioRef.current.pause()
          // Only revoke URL if it's a blob URL
          if (audioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.current.src)
          }
        }
        
        audioRef.current = audio
        // Don't set isTTSInProgressRef to false here - wait until all chunks finish playing

        // Stop recognition when audio starts playing (additional safety)
        audio.onplay = () => {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop()
              setIsListening(false)
              console.log('🔇 Stopped speech recognition when audio started playing')
            } catch (error: any) {
              if (error.name !== 'InvalidStateError') {
                console.error('Error stopping recognition on play:', error)
              }
              setIsListening(false)
            }
          } else {
            setIsListening(false)
          }
        }

        // Track if this is the last chunk
        const lastChunk = (audio as any).__lastChunk as HTMLAudioElement | undefined
        
        // Set up handler on the LAST chunk only
        if (lastChunk) {
          lastChunk.onended = () => {
            // Check if ALL audio chunks have actually finished playing
            const allChunksFinished = allAudioChunksRef.current.every(chunk => chunk.ended || chunk.paused)
            
            if (!allChunksFinished) {
              console.log('🔇 Not all chunks finished yet, waiting...')
              return
            }
            
            // Mark TTS as complete and processing as false
            isTTSInProgressRef.current = false
            setIsProcessing(false)
            isProcessingRef.current = false
            // CRITICAL: Wait longer before restarting to ensure audio is fully stopped
            // and speakers are quiet to prevent feedback loop
            if (!isComplete && recognitionRef.current) {
              setTimeout(() => {
                // Triple-check: not processing, not complete, recognition exists, TTS not in progress, and no audio playing
                // Use refs to avoid stale closure issues
                const anyAudioPlaying = allAudioChunksRef.current.some(chunk => !chunk.ended && !chunk.paused)
                if (!isProcessingRef.current && !isComplete && !isTTSInProgressRef.current && recognitionRef.current && !anyAudioPlaying) {
                  try {
                    if (!isComplete) {
                      console.log('🎤 Restarting speech recognition after Olivia finished speaking (all chunks done, waited 2s)')
                      // Set listening to true BEFORE starting (onstart will also set it, but this ensures it's set)
                      setIsListening(true)
                      recognitionRef.current?.start()
                    } else {
                      console.log('🛑 Conversation is complete, not restarting recognition')
                    }
                    // onstart handler will also set isListening to true, but set it here too for immediate effect
                  } catch (error: any) {
                    if (error.name === 'InvalidStateError' && error.message.includes('already started')) {
                      console.log('🎤 Recognition already running - setting listening to true')
                      setIsListening(true)
                    } else {
                      console.error('Error restarting recognition:', error)
                      setIsListening(false)
                    }
                  }
                } else {
                  console.log('🔇 Not restarting recognition - still processing, complete, or audio playing', {
                    isProcessing,
                    isComplete,
                    anyAudioPlaying
                  })
                }
              }, 2000)  // 2 second delay to ensure audio is fully stopped and speakers are quiet
            }
          }
        } else {
          // Fallback: if we can't find the last chunk, use the first audio's ended event
          // But only restart after a longer delay to ensure all chunks are done
          audio.onended = () => {
            setIsProcessing(false)
            if (!isComplete && recognitionRef.current) {
              setTimeout(() => {
                // Double-check we're still not processing
                if (!isProcessing && !isComplete && recognitionRef.current) {
                  try {
                    if (!isComplete) {
                      console.log('🎤 Restarting speech recognition after Olivia finished speaking (fallback, waited 2.5s)')
                      // Set listening to true BEFORE starting
                      setIsListening(true)
                      recognitionRef.current?.start()
                    } else {
                      console.log('🛑 Conversation is complete, not restarting recognition')
                    }
                    // onstart handler will also set isListening to true
                  } catch (error: any) {
                    if (error.name === 'InvalidStateError' && error.message.includes('already started')) {
                      console.log('🎤 Recognition already running - setting listening to true')
                      setIsListening(true)
                    } else {
                      console.error('Error restarting recognition:', error)
                      setIsListening(false)
                    }
                  }
                } else {
                  console.log('🔇 Not restarting recognition - still processing or complete')
                }
              }, 2500)  // Even longer delay for fallback
            }
          }
        }

        audio.onerror = (error) => {
          console.error('❌ Audio playback error:', error)
          setIsProcessing(false)
          // Restart recognition after audio error
          if (!isComplete && recognitionRef.current) {
            setTimeout(() => {
              try {
                recognitionRef.current?.start()
                setIsListening(true)
              } catch (err: any) {
                if (err.name === 'InvalidStateError' && err.message.includes('already started')) {
                  console.log('🎤 Recognition already running')
                  setIsListening(true)
                } else {
                  console.error('Error restarting recognition after audio error:', err)
                }
              }
            }, 300)
          }
        }

        await audio.play()
      } catch (ttsError: any) {
        console.error('❌ Error generating TTS:', ttsError)
        isTTSInProgressRef.current = false
        setIsProcessing(false)
        // In continuous mode, recognition should already be running
        if (!isComplete && recognitionRef.current && !isListening) {
          setTimeout(() => {
            try {
              recognitionRef.current?.start()
            } catch (error: any) {
              if (error.name === 'InvalidStateError' && error.message.includes('already started')) {
                console.log('🎤 Recognition already running, ignoring restart attempt')
              } else {
                console.error('Error restarting recognition:', error)
              }
            }
          }, 300)
        }
      }
    } catch (error: any) {
      console.error('❌ Error sending message:', error)
      setIsProcessing(false)
      // Show error to user
      const errorMessage = error?.message || 'Failed to send message. Please try again.'
      alert(`Error: ${errorMessage}`)
      // Don't alert on every error, just log it
      console.error('Error details:', error)
    }
  }

  const handleSubmit = () => {
    // CRITICAL: Stop recognition immediately when submitting
    console.log('🛑 Submitting answers - stopping recognition and cleaning up')
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
        recognitionRef.current = null
      } catch (error) {
        console.error('Error stopping recognition on submit:', error)
      }
    }
    setIsListening(false)
    isProcessingRef.current = false
    isTTSInProgressRef.current = false
    
    // Stop and clean up all audio
    if (audioRef.current) {
      audioRef.current.pause()
      if (audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src)
      }
      audioRef.current = null
    }
    
    // Clean up all audio chunks
    allAudioChunksRef.current.forEach(chunk => {
      chunk.pause()
      if (chunk.src.startsWith('blob:')) {
        URL.revokeObjectURL(chunk.src)
      }
    })
    allAudioChunksRef.current = []
    
    // If conversation is complete, extract any missing answers from conversation history
    let finalAnswers = { ...answeredQuestions }
    
    if (isComplete) {
      // Extract any missing answers from conversation history
      questions.forEach(q => {
        if (!finalAnswers[q.key] || finalAnswers[q.key].trim() === '') {
          const questionIndex = conversationHistory.findIndex(msg => 
            msg.role === 'assistant' && 
            msg.content.toLowerCase().includes(q.question.substring(0, 20).toLowerCase())
          )
          if (questionIndex >= 0) {
            const userResponses = conversationHistory
              .slice(questionIndex + 1)
              .filter((msg, idx) => {
                const nextQuestionIndex = conversationHistory.findIndex((m, i) => 
                  i > questionIndex && 
                  m.role === 'assistant' && 
                  questions.some(q2 => q2.key !== q.key && m.content.toLowerCase().includes(q2.question.substring(0, 20).toLowerCase()))
                )
                return msg.role === 'user' && (nextQuestionIndex < 0 || idx < nextQuestionIndex - questionIndex - 1)
              })
              .map(msg => msg.content)
              .join(' ')
            
            if (userResponses.trim()) {
              finalAnswers[q.key] = userResponses.trim()
            }
          }
        }
      })
    }
    
    console.log('📤 Submitting answers:', finalAnswers)
    
    // Convert answers to the expected format - ensure all fields have values
    if (experienceType === 'year-review') {
      onSubmit({
        favoriteMemory: finalAnswers.favoriteMemory || 'Not specified',
        newThing: finalAnswers.newThing || 'Not specified',
        lookingForward: finalAnswers.lookingForward || 'Not specified'
      })
    } else if (experienceType === 'greeting-card') {
      onSubmit({
        specialAboutThem: finalAnswers.specialAboutThem || 'Not specified',
        funnyStory: finalAnswers.funnyStory || 'Not specified'
      })
    } else {
      onSubmit({
        dreamGift: finalAnswers.dreamGift || 'Not specified',
        experience: finalAnswers.experience || 'Not specified',
        practicalNeed: finalAnswers.practicalNeed || 'Not specified'
      })
    }
  }

  const handleManualStart = () => {
    // In continuous mode, this button should rarely be needed
    // But if recognition stopped, restart it
    if (recognitionRef.current && !isListening && !isProcessing && !isComplete) {
      try {
        console.log('🎤 Manually restarting speech recognition')
        recognitionRef.current.start()
        setIsListening(true)
      } catch (error) {
        console.error('Error starting recognition:', error)
        setIsListening(false)
      }
    }
  }

  const progress = (Object.keys(answeredQuestions).length / questions.length) * 100

  return (
    <div className="conversational-questionnaire">
      <div className="conversational-header">
        {experienceType !== 'greeting-card' && (
          <h2 className="conversational-title">
            {experienceType === 'year-review' ? 'Year In Review' : 'Christmas Wish List'}
          </h2>
        )}
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="progress-text">
          {Object.keys(answeredQuestions).length} of {questions.length} questions answered
        </p>
      </div>

      <div className="conversational-content">
        <div className="olivia-blob-container">
          <div className={`olivia-blob ${isComplete ? 'complete' : isProcessing ? 'processing' : isListening ? 'listening' : hasStarted ? 'processing' : 'idle'}`}>
            <div className="blob-inner"></div>
            <div className="blob-pulse"></div>
            {isComplete && (
              <div className="complete-overlay">
                <div className="checkmark">✓</div>
              </div>
            )}
          </div>
        </div>

        <div className="listening-indicator">
          {isComplete ? (
            <div className="complete">
              <button
                className="btn btn-primary continue-btn"
                onClick={handleSubmit}
                style={{ marginTop: '16px', display: 'block', margin: '16px auto 0' }}
              >
                Continue →
              </button>
            </div>
          ) : isProcessing ? (
            <div className="processing-text">
              <span>{experienceType === 'greeting-card' ? 'Please listen...' : 'Olivia is thinking...'}</span>
            </div>
          ) : isListening ? (
            <div className="listening-container">
              <div className="listening-text">
                <span>{experienceType === 'greeting-card' ? 'Speak now...' : 'Listening...'}</span>
              </div>
              {currentPresets && experienceType === 'wish-list' && (
                <div className="preset-options">
                  <p className="preset-label">Or choose a preset option:</p>
                  <div className="preset-buttons">
                    {currentPresets.map((preset, index) => (
                      <button
                        key={index}
                        className="preset-button"
                        onClick={() => handlePresetClick(preset)}
                        disabled={isProcessing || isTTSInProgressRef.current || clickedPresets.has(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : hasStarted ? (
            // If conversation has started but we're not listening/processing, show a brief "waiting" state
            // This prevents the "Start Conversation" button from appearing mid-conversation
            <div className="processing-text">
              <span>{experienceType === 'greeting-card' ? 'Please listen...' : 'Olivia is thinking...'}</span>
            </div>
          ) : (
            <button
              className="btn btn-primary start-listening-btn"
              onClick={handleManualStart}
              disabled={isProcessing || isComplete}
            >
              Start Conversation
            </button>
          )}
        </div>
      </div>

      <div className="conversational-actions">
        <button 
          className="btn btn-secondary"
          onClick={onBack}
          disabled={isListening || isProcessing}
        >
          ← Back
        </button>
      </div>
    </div>
  )
}

export default ConversationalQuestionnaire
