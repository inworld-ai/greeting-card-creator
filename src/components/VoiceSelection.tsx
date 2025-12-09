import { useState } from 'react'
import './VoiceSelection.css'
import type { VoiceId } from '../App'

interface VoiceSelectionProps {
  onSubmit: (voiceId: VoiceId | 'custom') => void
  onBack: () => void
  title?: string
  description?: string
}

const VOICES: { id: VoiceId | 'custom'; label: string | JSX.Element; description: string }[] = [
  { id: 'custom', label: <>Create Your<br />Own Narrator</>, description: '' },
  { id: 'christmas_story_generator__female_elf_narrator', label: <>Holly<br />the Elf</>, description: '' },
  { id: 'christmas_story_generator__male_elf_narrator', label: <>Clark<br />the Elf</>, description: '' },
]

function VoiceSelection({ onSubmit, onBack, title, description }: VoiceSelectionProps) {
  const [voiceId, setVoiceId] = useState<VoiceId | 'custom' | null>(null)

  const handleSubmit = () => {
    if (voiceId) {
      onSubmit(voiceId)
    }
  }

  return (
    <div className="voice-selection">
      {title && (
        <p className="prompt-text">
          {title}
        </p>
      )}
      {description && (
        <p className="prompt-text" style={{ fontSize: '1rem', marginTop: '0.5rem' }}>
          {description}
        </p>
      )}
      {!title && !description && (
        <p className="prompt-text">
          Choose a narrator voice for your story!
        </p>
      )}
      
      <div className="voice-grid">
        {VOICES.map((voice) => (
          <button
            key={voice.id}
            className={`voice-button ${voiceId === voice.id ? 'selected' : ''}`}
            onClick={() => setVoiceId(voice.id)}
            type="button"
          >
            <div className="voice-label">{voice.label}</div>
            {voice.description && (
              <div className="voice-description">{voice.description}</div>
            )}
          </button>
        ))}
      </div>

      <div className="voice-selection-actions">
        <button 
          className="btn btn-secondary"
          onClick={onBack}
        >
          ← Back
        </button>
        <button 
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!voiceId}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

export default VoiceSelection

