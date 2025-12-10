import { useState } from 'react'
import './NameInput.css'

interface GreetingCardNamesProps {
  onSubmit: (senderName: string, recipientName: string, relationship: string) => void
  onBack: () => void
}

function GreetingCardNames({ onSubmit, onBack }: GreetingCardNamesProps) {
  const [senderName, setSenderName] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [relationship, setRelationship] = useState('')

  const handleSubmit = () => {
    if (!senderName.trim() || !recipientName.trim() || !relationship.trim()) {
      alert('Please enter your name, the recipient\'s name, and your relationship')
      return
    }
    onSubmit(senderName.trim(), recipientName.trim(), relationship.trim())
  }

  return (
    <div className="name-input">
      <p className="prompt-text">
        Let's create a personalized greeting card! 💌
      </p>
      
      <div style={{ marginTop: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
          What's your name?
        </label>
        <input
          type="text"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder="Your name"
          className="name-input-field"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSubmit()
            }
          }}
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
          Who is this card for?
        </label>
        <input
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="Recipient's name"
          className="name-input-field"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSubmit()
            }
          }}
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
          What's your relationship?
        </label>
        <input
          type="text"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          placeholder="e.g., wife, best friend, grandmother"
          className="name-input-field"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSubmit()
            }
          }}
        />
      </div>

      <div className="name-input-actions">
        <button 
          className="btn btn-secondary"
          onClick={onBack}
        >
          ← Back
        </button>
        <button 
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!senderName.trim() || !recipientName.trim() || !relationship.trim()}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

export default GreetingCardNames

