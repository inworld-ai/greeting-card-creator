import { useState, useRef, useEffect } from 'react'
import { synthesizeSpeech } from '../services/ttsService'
import './ConversationalQuestionnaire.css'

interface ConversationalQuestionnaireProps {
  experienceType: 'year-review' | 'wish-list'
  onSubmit: (answers: {
    favoriteMemory?: string
    newThing?: string
    lookingForward?: string
    dreamGift?: string
    experience?: string
    practicalNeed?: string
  }) => void
  onBack: () => void
}

interface ConversationMessage {
  role: 'assistant' | 'user'
  content: string
}

function ConversationalQuestionnaire({ experienceType, onSubmit, onBack }: ConversationalQuestionnaireProps) {
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, string>>({})
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Backend API URL
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')

  const questions = experienceType === 'year-review'
    ? [
        { key: 'favoriteMemory', question: "What was your favorite memory or adventure from 2025?" },
        { key: 'newThing', question: "What's something new you tried or learned in 2025?" },
        { key: 'lookingForward', question: "What are you most looking forward to or hoping for in 2026?" }
      ]
    : [
        { key: 'dreamGift', question: "What's the one gift you've been thinking about all year, and why does it matter to you?" },
        { key: 'experience', question: "Is there something you'd love to experience rather than receive? (like a trip, concert, or special dinner)" },
        { key: 'practicalNeed', question: "What's something practical you actually need but wouldn't buy for yourself?" }
      ]

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
      setIsListening(true)
      console.log('🎤 Speech recognition started (continuous mode)')
    }

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      // In continuous mode, we get results as the user speaks
      // Get the most recent result
      const resultIndex = event.results.length - 1
      const transcript = event.results[resultIndex][0].transcript.trim()
      
      // Only process if we have a transcript and we're not already processing
      if (transcript && !isProcessingUserInput && !isProcessing && !isComplete) {
        isProcessingUserInput = true
        console.log('User response:', transcript)

        // Process the response with the updated conversation history
        try {
          await handleUserMessage(transcript)
        } finally {
          // Reset flag after processing completes
          isProcessingUserInput = false
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
      // If it does fire and we're not complete, try to restart
      if (!isComplete && !isProcessing) {
        console.log('🎤 Speech recognition ended unexpectedly, restarting...')
        setTimeout(() => {
          try {
            recognition.start()
          } catch (error) {
            console.error('Error restarting recognition:', error)
            setIsListening(false)
          }
        }, 500)
      } else if (isComplete) {
        console.log('🎤 Speech recognition ended (conversation complete)')
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition

    // Start the conversation and begin continuous listening
    startConversation()
    
    // Start continuous recognition immediately
    setTimeout(() => {
      try {
        recognition.start()
        console.log('🎤 Started continuous speech recognition')
      } catch (error) {
        console.error('Error starting initial recognition:', error)
      }
    }, 1000)  // Small delay to ensure component is fully mounted

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        setIsListening(false)
      }
      if (audioRef.current) {
        audioRef.current.pause()
        if (audioRef.current.src.startsWith('blob:')) {
          URL.revokeObjectURL(audioRef.current.src)
        }
        audioRef.current = null
      }
    }
  }, [])

  const startConversation = async () => {
    setIsProcessing(true)
    
    try {
      console.log('🎤 Starting conversation...')
      await sendMessage('')
    } catch (error: any) {
      console.error('❌ Error starting conversation:', error)
      setIsProcessing(false)
      // Show error to user
      const errorMessage = error?.message || 'Failed to start conversation. Please try again.'
      alert(`Unable to start conversation: ${errorMessage}`)
    }
  }

  const handleUserMessage = async (userMessage: string) => {
    setIsProcessing(true)
    
    // Stop speech recognition when user message is being processed
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop()
        setIsListening(false)
        console.log('🔇 Stopped speech recognition while processing user message')
      } catch (error) {
        console.error('Error stopping recognition:', error)
      }
    }
    
    // Update conversation history first, then send with updated history
    setConversationHistory(prev => {
      const updatedHistory: ConversationMessage[] = [...prev, { role: 'user' as const, content: userMessage }]
      // Send message with updated history using functional update
      sendMessage(userMessage, updatedHistory, answeredQuestions).catch((error: any) => {
        console.error('Error sending message:', error)
        setIsProcessing(false)
        // Restart recognition on error
        if (!isComplete && recognitionRef.current) {
          setTimeout(() => {
            try {
              recognitionRef.current?.start()
              setIsListening(true)
            } catch (err: any) {
              if (err.name !== 'InvalidStateError') {
                console.error('Error restarting recognition after error:', err)
              }
            }
          }, 300)
        }
      })
      return updatedHistory
    })
  }

  const sendMessage = async (userMessage: string, currentHistory: ConversationMessage[] = conversationHistory, currentAnswers: Record<string, string> = answeredQuestions) => {
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
            console.log(`✅ Answer detected for ${data.detectedQuestionKey}: ${data.detectedAnswer.substring(0, 50)}...`)
            console.log(`📊 Progress: ${Object.keys(updatedAnswers).length}/${questions.length} questions answered`)
            console.log(`📊 Updated answeredQuestions keys:`, Object.keys(updatedAnswers))
          } else {
            console.log(`⚠️ No answer detected. detectedAnswer: ${data.detectedAnswer}, detectedQuestionKey: ${data.detectedQuestionKey}`)
          }

          // Check if all questions are answered
          const allAnswered = questions.every(q => (updatedAnswers as Record<string, string>)[q.key])
          
          // Check if Olivia is wrapping up the conversation
          const isWrappingUp = aiResponse.toLowerCase().includes('i\'ll take your answers') ||
                              aiResponse.toLowerCase().includes('create your') ||
                              (aiResponse.toLowerCase().includes('thank') && 
                               (aiResponse.toLowerCase().includes('year in review') || 
                                aiResponse.toLowerCase().includes('wish list') ||
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

        // Stop recognition when audio starts playing (additional safety)
        audio.onplay = () => {
          if (recognitionRef.current && isListening) {
            try {
              recognitionRef.current.stop()
              setIsListening(false)
              console.log('🔇 Stopped speech recognition when audio started playing')
            } catch (error) {
              console.error('Error stopping recognition on play:', error)
            }
          }
        }

        audio.onended = () => {
          setIsProcessing(false)
          // Restart speech recognition after Olivia finishes speaking
          if (!isComplete && recognitionRef.current) {
            setTimeout(() => {
              try {
                console.log('🎤 Restarting speech recognition after Olivia finished speaking')
                recognitionRef.current?.start()
                setIsListening(true)
              } catch (error: any) {
                if (error.name === 'InvalidStateError' && error.message.includes('already started')) {
                  console.log('🎤 Recognition already running')
                  setIsListening(true)
                } else {
                  console.error('Error restarting recognition:', error)
                  setIsListening(false)
                }
              }
            }, 300)  // Small delay to ensure audio is fully stopped
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
    // Stop recognition if still running
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
    
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
        <h2 className="conversational-title">
          {experienceType === 'year-review' ? 'Year In Review' : 'Christmas Wish List'}
        </h2>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="progress-text">
          {Object.keys(answeredQuestions).length} of {questions.length} questions answered
        </p>
      </div>

      <div className="conversational-content">
        <div className="olivia-blob-container">
          <div className={`olivia-blob ${isProcessing ? 'processing' : isListening ? 'listening' : isComplete ? 'complete' : 'idle'}`}>
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
              <span>Olivia is thinking...</span>
            </div>
          ) : isListening ? (
            <div className="listening-text">
              <span>Listening...</span>
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
