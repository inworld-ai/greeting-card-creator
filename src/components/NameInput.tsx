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
  { id: 'christmas_story_generator__male_elf_narrator', label: <>Ralphy<br />the Elf</>, description: '' },
]

function NameInput({ storyType: _storyType, onSubmit, onBack }: NameInputProps) {
  const [name, setName] = useState('')

  const handleVoiceTranscript = (transcript: string) => {
    setName(transcript)
  }

  const handleNarratorSelect = (selectedVoiceId: VoiceId | 'custom') => {
    // If name is entered, automatically proceed when narrator is selected
    if (name.trim().length > 0) {
      onSubmit(name.trim(), selectedVoiceId)
    }
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
            placeholder="Enter your character's name..."
            className="name-input-field"
          />
          <MicrophoneButton onTranscript={handleVoiceTranscript} />
        </div>
        
        <div className="voice-selection">
          <label className="voice-selection-label">Select a story narrator:</label>
          <div className="voice-options">
            {VOICES.map((voice) => (
              <button
                key={voice.id}
                className={`voice-option ${!name.trim() ? 'disabled' : ''}`}
                onClick={() => handleNarratorSelect(voice.id)}
                type="button"
                disabled={!name.trim()}
              >
                <span className="voice-name">{voice.label}</span>
                {voice.description && (
                  <span className="voice-description">{voice.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        <div className="name-input-actions">
          <button onClick={onBack} className="back-button">
            ← Go Back
          </button>
        </div>
      </div>
    </div>
  )
}

export default NameInput

