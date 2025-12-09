import { useState } from 'react'
import './NameInput.css'
import MicrophoneButton from './MicrophoneButton'

interface SimpleNameInputProps {
  onSubmit: (name: string) => void
  onBack: () => void
  title?: string
  prompt?: string
}

function SimpleNameInput({ onSubmit, onBack, title, prompt }: SimpleNameInputProps) {
  const [name, setName] = useState('')

  const handleSubmit = () => {
    if (name.trim().length > 0) {
      onSubmit(name.trim())
    }
  }

  const handleVoiceTranscript = (transcript: string) => {
    setName(transcript)
  }

  return (
    <div className="name-input">
      {title && (
        <p className="prompt-text">
          {title}
        </p>
      )}
      <p className="prompt-text">
        {prompt || "What's your name?"}
      </p>
      
      <div className="input-group">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Enter your name..."
            className="name-input-field"
            autoFocus
            style={{ flex: 1 }}
          />
          <MicrophoneButton onTranscript={handleVoiceTranscript} />
        </div>
        
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="submit-button"
        >
          Continue →
        </button>
      </div>
      
      <button onClick={onBack} className="back-button">
        ← Back
      </button>
    </div>
  )
}

export default SimpleNameInput

