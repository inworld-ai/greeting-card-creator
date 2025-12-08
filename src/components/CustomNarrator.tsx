import { useState } from 'react'
import './NameInput.css'

interface CustomNarratorProps {
  childName: string
  onSubmit: (apiKey: string, voiceId: string) => void
  onBack: () => void
}

function CustomNarrator({ childName, onSubmit, onBack }: CustomNarratorProps) {
  const [apiKey, setApiKey] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    setError(null)
    
    if (!apiKey.trim()) {
      setError('Please enter your Inworld API Key')
      return
    }
    
    if (!voiceId.trim()) {
      setError('Please enter your Inworld Voice ID')
      return
    }
    
    onSubmit(apiKey.trim(), voiceId.trim())
  }

  return (
    <div className="name-input">
      <p className="prompt-text">
        Create your own narrator for the story about <strong>{childName}</strong>! 🎤
      </p>
      
      <div style={{ 
        marginTop: '10px', 
        padding: '18px', 
        backgroundColor: '#fff5f5', 
        borderRadius: '8px',
        border: '1px solid #f0d0d0'
      }}>
        <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '14px', color: '#333' }}>
          Getting Started:
        </p>
        <ol style={{ fontSize: '0.85rem', lineHeight: '1.7', color: '#555', marginLeft: '20px', paddingLeft: '0', marginBottom: '16px' }}>
          <li style={{ marginBottom: '10px' }}>
            <strong>Log in to Inworld:</strong> Go to <a href="https://studio.inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc', textDecoration: 'underline' }}>studio.inworld.ai</a> and sign in to your account
          </li>
          <li style={{ marginBottom: '10px' }}>
            <strong>Get your API Key:</strong> Navigate to API Keys → Copy the "Basic (Base64) key"
          </li>
          <li style={{ marginBottom: '10px' }}>
            <strong>Create a Voice Clone (optional):</strong> Go to TTS → Clone Voice → Upload/record audio samples to create your custom narrator voice
          </li>
          <li style={{ marginBottom: '0' }}>
            <strong>Get your Voice ID:</strong> Go to TTS → In the Select Voice list, copy the Voice ID (see format details below)
          </li>
        </ol>
        
        <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '14px', marginTop: '16px', color: '#333' }}>
          Important:
        </p>
        <ul style={{ fontSize: '0.85rem', lineHeight: '1.7', color: '#555', marginLeft: '20px', paddingLeft: '0', marginBottom: '0' }}>
          <li style={{ marginBottom: '10px' }}>
            <strong>API Key:</strong> Must be the Basic (Base64) key copied from your Inworld workspace (API Keys → Copy the "Basic (Base64) key")
          </li>
          <li style={{ marginBottom: '0' }}>
            <strong>Voice ID:</strong> Copy directly from your Select Voice list
            <ul style={{ marginTop: '8px', marginLeft: '20px', marginBottom: '0' }}>
              <li style={{ marginBottom: '6px' }}>Inworld voices: Just the name (e.g., "Alex")</li>
              <li style={{ marginBottom: '0' }}>Custom voices: Full format (e.g., <code style={{ fontSize: '0.8em', background: '#f0f0f0', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' }}>default-workspaceid__voice_name</code>)</li>
            </ul>
          </li>
        </ul>
      </div>
      
      <div className="input-group" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="voice-selection-label" style={{ marginBottom: '8px', display: 'block' }}>
              Inworld API Key (Base64):
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Base64-encoded Inworld API Key..."
              className="name-input-field"
              autoFocus
              style={{ width: '100%' }}
            />
          </div>
          
          <div>
            <label className="voice-selection-label" style={{ marginBottom: '8px', display: 'block' }}>
              Inworld Voice ID:
            </label>
            <input
              type="text"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Enter your Inworld Voice ID..."
              className="name-input-field"
              style={{ width: '100%' }}
            />
          </div>
        </div>
        
        {error && (
          <div className="error-message" style={{ color: '#f5576c', marginTop: '10px', textAlign: 'center' }}>
            {error}
          </div>
        )}
        
        <button
          onClick={handleSubmit}
          disabled={!apiKey.trim() || !voiceId.trim()}
          className="submit-button"
          style={{ marginTop: '20px' }}
        >
          Create Story with Custom Narrator
        </button>
      </div>
      
      <button onClick={onBack} className="back-button">
        ← Go Back
      </button>
    </div>
  )
}

export default CustomNarrator

