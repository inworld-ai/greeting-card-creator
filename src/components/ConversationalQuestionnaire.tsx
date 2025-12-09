import { useState, useRef, useEffect } from 'react'
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
  const [currentResponse, setCurrentResponse] = useState('')
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
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript.trim()
      console.log('User response:', transcript)
      setIsListening(false)

      // Add user message to conversation history
      setConversationHistory(prev => [...prev, { role: 'user', content: transcript }])

      // Process the response
      await handleUserMessage(transcript)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      if (event.error === 'no-speech') {
        // Don't alert on no-speech, just allow user to try again
        console.log('No speech detected, user can try again')
      } else if (event.error === 'not-allowed') {
        alert("Please allow microphone access to use voice input!")
      }
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition

    // Start the conversation
    startConversation()

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
        audioRef.current = null
      }
    }
  }, [])

  const startConversation = async () => {
    setIsProcessing(true)
    setCurrentResponse('')
    
    try {
      await sendMessage('')
    } catch (error) {
      console.error('Error starting conversation:', error)
      setIsProcessing(false)
    }
  }

  const handleUserMessage = async (userMessage: string) => {
    setIsProcessing(true)
    setCurrentResponse('')
    
    try {
      await sendMessage(userMessage)
    } catch (error) {
      console.error('Error handling user message:', error)
      setIsProcessing(false)
    }
  }

  const sendMessage = async (userMessage: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversational-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experienceType,
          userMessage,
          conversationHistory: conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          answeredQuestions
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get conversational response')
      }

      const data = await response.json()
      const aiResponse = data.response || ''

      // Add AI response to conversation history
      setConversationHistory(prev => [...prev, { role: 'assistant', content: aiResponse }])
      setCurrentResponse(aiResponse)

      // Check if an answer was detected and update answered questions
      let updatedAnswers = answeredQuestions
      if (data.detectedAnswer && data.detectedQuestionKey) {
        updatedAnswers = {
          ...answeredQuestions,
          [data.detectedQuestionKey]: data.detectedAnswer
        }
        setAnsweredQuestions(updatedAnswers)
      }

      // Check if all questions are answered
      const allAnswered = questions.every(q => (updatedAnswers as Record<string, string>)[q.key])
      if (allAnswered || (aiResponse.toLowerCase().includes('thank') && aiResponse.toLowerCase().includes('complete'))) {
        if (!isComplete) {
          setIsComplete(true)
          // Wait a moment, then submit
          setTimeout(() => {
            handleSubmit()
          }, 2000)
        }
        return
      }

      // Get TTS audio for the response using Olivia voice
      const audioResponse = await fetch(`${API_BASE_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiResponse,
          voiceId: 'Olivia'
        })
      })

      if (audioResponse.ok) {
        // Create audio element and play
        const audioBlob = await audioResponse.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        
        // Clean up previous audio
        if (audioRef.current) {
          audioRef.current.pause()
          URL.revokeObjectURL(audioRef.current.src)
        }
        
        audioRef.current = audio

        audio.onended = () => {
          setIsProcessing(false)
          // Start listening after AI finishes speaking (unless conversation is complete)
          if (!isComplete && recognitionRef.current && !isListening) {
            setTimeout(() => {
              try {
                recognitionRef.current?.start()
              } catch (error) {
                console.error('Error starting recognition:', error)
              }
            }, 500)
          }
        }

        audio.onerror = () => {
          setIsProcessing(false)
          // If audio fails, still allow listening
          if (!isComplete && recognitionRef.current && !isListening) {
            setTimeout(() => {
              try {
                recognitionRef.current?.start()
              } catch (error) {
                console.error('Error starting recognition:', error)
              }
            }, 500)
          }
        }

        await audio.play()
      } else {
        setIsProcessing(false)
        // If TTS fails, still allow listening
        if (!isComplete && recognitionRef.current && !isListening) {
          setTimeout(() => {
            try {
              recognitionRef.current?.start()
            } catch (error) {
              console.error('Error starting recognition:', error)
            }
          }, 500)
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setIsProcessing(false)
    }
  }

  const handleSubmit = () => {
    // Convert answers to the expected format
    if (experienceType === 'year-review') {
      onSubmit({
        favoriteMemory: answeredQuestions.favoriteMemory || '',
        newThing: answeredQuestions.newThing || '',
        lookingForward: answeredQuestions.lookingForward || ''
      })
    } else {
      onSubmit({
        dreamGift: answeredQuestions.dreamGift || '',
        experience: answeredQuestions.experience || '',
        practicalNeed: answeredQuestions.practicalNeed || ''
      })
    }
  }

  const handleManualStart = () => {
    if (recognitionRef.current && !isListening && !isProcessing && !isComplete) {
      try {
        recognitionRef.current.start()
      } catch (error) {
        console.error('Error starting recognition:', error)
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
        <div className="ai-avatar">🎤</div>
        
        <div className="conversation-messages">
          {conversationHistory.map((msg, index) => (
            <div key={index} className={`message-bubble ${msg.role === 'assistant' ? 'assistant' : 'user'}`}>
              <p className="message-text">{msg.content}</p>
            </div>
          ))}
          {currentResponse && !conversationHistory.some(msg => msg.content === currentResponse) && (
            <div className="message-bubble assistant">
              <p className="message-text">{currentResponse}</p>
            </div>
          )}
        </div>

        <div className="listening-indicator">
          {isComplete ? (
            <div className="complete">
              <span>✅ Conversation Complete!</span>
            </div>
          ) : isListening ? (
            <div className="listening-active">
              <div className="pulse-ring"></div>
              <span>🎤 Listening...</span>
            </div>
          ) : isProcessing ? (
            <div className="processing">
              <span>⏳ Olivia is thinking...</span>
            </div>
          ) : (
            <button
              className="btn btn-primary start-listening-btn"
              onClick={handleManualStart}
              disabled={isProcessing}
            >
              🎤 Speak Now
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
