import { useEffect, useRef } from 'react'
import './VoiceInput.css'

interface VoiceInputProps {
  onResult: (transcript: string) => void
  isListening: boolean
  onListeningChange: (listening: boolean) => void
  placeholder?: string
}

function VoiceInput({ onResult, isListening, onListeningChange, placeholder = "Speak now..." }: VoiceInputProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    // Check if browser supports Web Speech API
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      onListeningChange(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      onResult(transcript)
      onListeningChange(false)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      onListeningChange(false)
      if (event.error === 'no-speech') {
        alert("I didn't hear anything. Please try again!")
      } else if (event.error === 'not-allowed') {
        alert("Please allow microphone access to use voice input!")
      }
    }

    recognition.onend = () => {
      onListeningChange(false)
    }

    recognitionRef.current = recognition

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [onResult, onListeningChange])

  const handleStartListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start()
      } catch (error) {
        console.error('Error starting recognition:', error)
      }
    }
  }

  const handleStopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }

  // Check if speech recognition is available
  const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
  const isSupported = !!SpeechRecognition

  if (!isSupported) {
    return null // Don't show voice input if not supported
  }

  return (
    <div className="voice-input">
      <button
        className={`voice-button ${isListening ? 'listening' : ''}`}
        onClick={isListening ? handleStopListening : handleStartListening}
        type="button"
      >
        {isListening ? (
          <>
            <span className="voice-icon">🎤</span>
            <span>Listening... Click to stop</span>
          </>
        ) : (
          <>
            <span className="voice-icon">🎙️</span>
            <span>Click to speak</span>
          </>
        )}
      </button>
      {isListening && (
        <p className="listening-indicator">{placeholder}</p>
      )}
    </div>
  )
}

export default VoiceInput

