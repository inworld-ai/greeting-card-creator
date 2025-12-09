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

function ConversationalQuestionnaire({ experienceType, onSubmit, onBack }: ConversationalQuestionnaireProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentQuestionText, setCurrentQuestionText] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Backend API URL
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')

  const questions = experienceType === 'year-review'
    ? [
        {
          key: 'favoriteMemory',
          question: "What was your favorite memory or adventure from 2025?",
          prompt: "Ask the user about their favorite memory or adventure from 2025 in a warm, conversational way."
        },
        {
          key: 'newThing',
          question: "What's something new you tried or learned in 2025?",
          prompt: "Ask the user about something new they tried or learned in 2025 in a friendly, encouraging way."
        },
        {
          key: 'lookingForward',
          question: "What are you most looking forward to or hoping for in 2026?",
          prompt: "Ask the user what they're most looking forward to or hoping for in 2026 in an enthusiastic, positive way."
        }
      ]
    : [
        {
          key: 'dreamGift',
          question: "What's the one gift you've been thinking about all year, and why does it matter to you?",
          prompt: "Ask the user about the one gift they've been thinking about all year and why it matters to them, in a warm, curious way."
        },
        {
          key: 'experience',
          question: "Is there something you'd love to experience rather than receive? (like a trip, concert, or special dinner)",
          prompt: "Ask the user if there's something they'd love to experience rather than receive, like a trip, concert, or special dinner, in a friendly way."
        },
        {
          key: 'practicalNeed',
          question: "What's something practical you actually need but wouldn't buy for yourself?",
          prompt: "Ask the user about something practical they actually need but wouldn't buy for themselves, in a gentle, understanding way."
        }
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
      
      // Store the answer
      const currentQuestion = questions[currentQuestionIndex]
      setAnswers(prev => ({ ...prev, [currentQuestion.key]: transcript }))
      setIsListening(false)

      // Process the response and move to next question
      await handleResponse(transcript)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      if (event.error === 'no-speech') {
        alert("I didn't hear anything. Please try again!")
      } else if (event.error === 'not-allowed') {
        alert("Please allow microphone access to use voice input!")
      }
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition

    // Start with the first question
    askQuestion(0)

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const askQuestion = async (index: number) => {
    if (index >= questions.length) {
      // All questions answered
      handleSubmit()
      return
    }

    setIsProcessing(true)
    const question = questions[index]
    setCurrentQuestionIndex(index)
    setCurrentQuestionText(question.question)

    try {
      // Call backend to get conversational question
      const response = await fetch(`${API_BASE_URL}/api/conversational-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionPrompt: question.prompt,
          conversationHistory: Object.entries(answers).map(([key, value]) => ({
            question: questions.find(q => q.key === key)?.question || '',
            answer: value
          }))
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get conversational question')
      }

      const data = await response.json()
      const conversationalQuestion = data.question || question.question

      // Update the question text
      setCurrentQuestionText(conversationalQuestion)

      // Get TTS audio for the question
      const audioResponse = await fetch(`${API_BASE_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: conversationalQuestion,
          voiceId: 'christmas_story_generator__female_elf_narrator'
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
          // Start listening after question is asked
          if (recognitionRef.current && !isListening) {
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
          if (recognitionRef.current && !isListening) {
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
        if (recognitionRef.current && !isListening) {
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
      console.error('Error asking question:', error)
      setIsProcessing(false)
      // Fallback: use the original question text
      setCurrentQuestionText(question.question)
      // Allow listening even if backend fails
      if (recognitionRef.current && !isListening) {
        setTimeout(() => {
          try {
            recognitionRef.current?.start()
          } catch (error) {
            console.error('Error starting recognition:', error)
          }
        }, 500)
      }
    }
  }

  const handleResponse = async (_transcript: string) => {
    // Move to next question
    const nextIndex = currentQuestionIndex + 1
    if (nextIndex < questions.length) {
      await askQuestion(nextIndex)
    } else {
      // All questions answered
      handleSubmit()
    }
  }

  const handleSubmit = () => {
    // Convert answers to the expected format
    if (experienceType === 'year-review') {
      onSubmit({
        favoriteMemory: answers.favoriteMemory || '',
        newThing: answers.newThing || '',
        lookingForward: answers.lookingForward || ''
      })
    } else {
      onSubmit({
        dreamGift: answers.dreamGift || '',
        experience: answers.experience || '',
        practicalNeed: answers.practicalNeed || ''
      })
    }
  }

  const handleManualStart = () => {
    if (recognitionRef.current && !isListening && !isProcessing) {
      try {
        recognitionRef.current.start()
      } catch (error) {
        console.error('Error starting recognition:', error)
      }
    }
  }

  const progress = ((currentQuestionIndex + 1) / questions.length) * 100

  return (
    <div className="conversational-questionnaire">
      <div className="conversational-header">
        <h2 className="conversational-title">
          {experienceType === 'year-review' ? 'Year In Review' : 'Christmas Wish List'}
        </h2>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="progress-text">Question {currentQuestionIndex + 1} of {questions.length}</p>
      </div>

      <div className="conversational-content">
        <div className="ai-avatar">🎤</div>
        
        <div className="question-bubble">
          {isProcessing ? (
            <p className="question-text">Thinking...</p>
          ) : (
            <p className="question-text">{currentQuestionText || questions[currentQuestionIndex]?.question}</p>
          )}
        </div>

        <div className="listening-indicator">
          {isListening ? (
            <div className="listening-active">
              <div className="pulse-ring"></div>
              <span>🎤 Listening...</span>
            </div>
          ) : isProcessing ? (
            <div className="processing">
              <span>⏳ Processing...</span>
            </div>
          ) : (
            <button
              className="btn btn-primary start-listening-btn"
              onClick={handleManualStart}
              disabled={isProcessing}
            >
              🎤 Start Speaking
            </button>
          )}
        </div>

        {Object.keys(answers).length > 0 && (
          <div className="answers-preview">
            <h3>Your Answers So Far:</h3>
            {Object.entries(answers).map(([key, value]) => {
              const question = questions.find(q => q.key === key)
              return (
                <div key={key} className="answer-item">
                  <strong>{question?.question}</strong>
                  <p>{value}</p>
                </div>
              )
            })}
          </div>
        )}
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

