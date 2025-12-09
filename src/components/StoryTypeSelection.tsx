import { useState } from 'react'
import React from 'react'
import './StoryTypeSelection.css'
import MicrophoneButton from './MicrophoneButton'
import type { StoryType } from '../App'

interface StoryTypeSelectionProps {
  onSelect: (type: StoryType) => void
  onBack?: () => void
}

const SUGGESTED_STORY_TYPES: { value: string; label: string | JSX.Element; emoji: string; description: string }[] = [
  { value: 'Meeting Santa Claus', label: <>Meeting<br />Santa Claus</>, emoji: '🎅', description: 'A magical visit with Santa at the North Pole' },
  { value: 'Christmas Eve Adventure', label: 'Christmas Eve Adventure', emoji: '🎁', description: 'A special Christmas Eve journey' },
  { value: 'Elf Workshop Visit', label: 'Elf Workshop Visit', emoji: '🧝', description: 'Helping the elves make toys for Christmas' },
]

function StoryTypeSelection({ onSelect, onBack }: StoryTypeSelectionProps) {
  const [textInput, setTextInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleTextInput = (value: string) => {
    setTextInput(value)
    setError(null)
  }

  const handleContinue = () => {
    if (!textInput.trim()) {
      setError('Please enter a story idea or select a suggestion below')
      return
    }

    setError(null)
    onSelect(textInput.trim())
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleContinue()
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setTextInput(suggestion)
    onSelect(suggestion)
  }

  const handleVoiceTranscript = (transcript: string) => {
    setTextInput(transcript)
    setError(null)
  }

  const handleClear = () => {
    setTextInput('')
    setError(null)
  }

  return (
    <div className="story-type-selection">
      <p className="prompt-text">
        What kind of Christmas story would you like?<br />
        Type your idea, use the microphone, or choose a suggestion below!
      </p>
      
      <div className="text-input-container">
        <div className="text-input-wrapper">
          <input
            type="text"
            value={textInput}
            onChange={(e) => handleTextInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="eg A snowball fight with Scrooge"
            className="story-type-input"
            autoFocus
          />
          <MicrophoneButton onTranscript={handleVoiceTranscript} />
        </div>
        {textInput.trim() && (
          <div className="action-buttons">
            <button
              onClick={handleContinue}
              className="continue-button"
              type="button"
            >
              Continue
            </button>
            <button
              onClick={handleClear}
              className="clear-button"
              type="button"
            >
              Clear
            </button>
          </div>
        )}
        {error && (
          <div className="error-message" style={{ 
            color: '#8b3a3a', 
            marginTop: '12px', 
            textAlign: 'center',
            fontStyle: 'italic',
            fontSize: '0.95rem'
          }}>
            {error}
          </div>
        )}
      </div>
      
      <div className="suggestions-section">
        <div className="story-type-grid">
          {SUGGESTED_STORY_TYPES.map((type) => (
            <button
              key={type.value}
              className="story-type-card"
              onClick={() => handleSuggestionClick(type.value)}
            >
              <span className="story-type-emoji">{type.emoji}</span>
              <span className="story-type-label">{type.label}</span>
              <span className="story-type-description">{type.description}</span>
            </button>
          ))}
        </div>
      </div>

      {onBack && (
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}

export default StoryTypeSelection

