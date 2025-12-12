import { useState } from 'react'
import './NameInput.css'
import MicrophoneButton from './MicrophoneButton'
import type { StoryType, VoiceId } from '../App'

interface NameInputProps {
  storyType: StoryType
  onSubmit: (name: string, voiceId: VoiceId | 'custom') => void
  onBack: () => void
}

const VOICES: { id: VoiceId | 'custom'; label: string | JSX.Element; description: string }[] = [
  { id: 'custom', label: <>Create Your<br />Own Narrator</>, description: '' },
  { id: 'christmas_story_generator__female_elf_narrator', label: <>Holly<br />the Elf</>, description: '' },
  { id: 'christmas_story_generator__male_elf_narrator', label: <>Clark<br />the Elf</>, description: '' },
]

function NameInput({ storyType: _storyType, onSubmit, onBack }: NameInputProps) {
  const [name, setName] = useState('')
  const [voiceId, setVoiceId] = useState<VoiceId | 'custom' | null>(null)

  const handleSubmit = () => {
    if (name.trim().length > 0 && voiceId) {
      onSubmit(name.trim(), voiceId)
    }
  }

  const handleVoiceTranscript = (transcript: string) => {
    setName(transcript)
  }

  return (
    <div className="name-input">
      <p className="prompt-text">
        What's the name of your story's main character?
      </p>
      
      <div className="input-group">
        <div className="name-input-container">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Enter your character's name..."
            className="name-input-field"
            autoFocus
          />
          <MicrophoneButton onTranscript={handleVoiceTranscript} />
        </div>
        
        <div className="voice-selection">
          <label className="voice-selection-label">Select a narrator:</label>
          <div className="voice-options">
            {VOICES.map((voice) => (
              <button
                key={voice.id}
                className={`voice-option ${voiceId === voice.id ? 'selected' : ''}`}
                onClick={() => setVoiceId(voice.id)}
                type="button"
              >
                <span className="voice-name">{voice.label}</span>
                {voice.description && (
                  <span className="voice-description">{voice.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        
      </div>
      
      <div className="name-input-actions">
        <button onClick={onBack} className="back-button">
          ← Go Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !voiceId}
          className="submit-button"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

export default NameInput

