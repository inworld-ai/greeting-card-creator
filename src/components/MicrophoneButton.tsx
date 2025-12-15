import { useEffect, useRef, useState } from 'react'
import './MicrophoneButton.css'

interface MicrophoneButtonProps {
  onTranscript: (transcript: string) => void
  disabled?: boolean
}

function MicrophoneButton({ onTranscript, disabled = false }: MicrophoneButtonProps) {
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    // Check if browser supports Web Speech API
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript.trim()
      onTranscript(transcript)
      setIsListening(false)
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

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [onTranscript])

  const handleClick = () => {
    if (disabled || isListening) return

    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start()
      } catch (error) {
        console.error('Error starting recognition:', error)
      }
    }
  }

  const handleStop = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }

  // Check if speech recognition is available
  const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
  const isSupported = !!SpeechRecognition

  if (!isSupported) {
    return null // Don't show microphone button if not supported
  }

  return (
    <button
      className={`microphone-button ${isListening ? 'listening' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={isListening ? handleStop : handleClick}
      type="button"
      disabled={disabled}
      title={isListening ? 'Click to stop listening' : 'Click to speak'}
    >
      <svg 
        className="microphone-icon" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z" 
          fill="currentColor"
        />
        <path 
          d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z" 
          fill="currentColor"
        />
      </svg>
      {isListening && <span className="mic-pulse-ring" />}
    </button>
  )
}

export default MicrophoneButton

