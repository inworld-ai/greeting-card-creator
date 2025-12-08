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
      <span className="microphone-icon">
        🎤
      </span>
    </button>
  )
}

export default MicrophoneButton

