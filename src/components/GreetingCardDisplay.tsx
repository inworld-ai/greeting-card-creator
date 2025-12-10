import { useState } from 'react'
import './GreetingCardDisplay.css'

interface GreetingCardDisplayProps {
  coverImageUrl: string | null
  message: string
  recipientName: string
  onAddNarration: () => void
  onStartOver: () => void
}

function GreetingCardDisplay({ coverImageUrl, message, recipientName, onAddNarration, onStartOver }: GreetingCardDisplayProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  return (
    <div className="greeting-card-display-container">
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.8rem', color: '#333' }}>
        Rough Draft
      </h2>
      
      <div className="greeting-card-display-wrapper">
        <div 
          className={`greeting-card-flip-container ${isFlipped ? 'flipped' : ''}`}
          onClick={() => !isFlipped && setIsFlipped(true)}
        >
          {/* Front - Cover Image */}
          <div className="greeting-card-flip-front">
            {coverImageUrl ? (
              <div className="greeting-card-cover-image-wrapper">
                <img 
                  src={coverImageUrl} 
                  alt="Greeting card cover" 
                  className="greeting-card-cover-image"
                />
                <div className="greeting-card-cover-hint">
                  Click to see the message
                </div>
              </div>
            ) : (
              <div className="greeting-card-cover-placeholder">
                <div className="greeting-card-placeholder-icon">💌</div>
                <p className="greeting-card-placeholder-text">To: {recipientName}</p>
                <p className="greeting-card-placeholder-hint">Click to see the message</p>
              </div>
            )}
          </div>

          {/* Back - Message */}
          <div className="greeting-card-flip-back">
            <div className="greeting-card-message-container">
              <div className="greeting-card-message-content">
                {message.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="greeting-card-message-paragraph">
                    {paragraph.trim()}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {isFlipped && (
          <button
            className="btn btn-secondary greeting-card-back-button"
            onClick={() => setIsFlipped(false)}
          >
            ← Back to Cover
          </button>
        )}
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={onAddNarration}
          style={{ fontSize: '1.2rem', padding: '12px 24px' }}
        >
          Add Narration →
        </button>
        <button
          className="btn btn-secondary"
          onClick={onStartOver}
          style={{ fontSize: '1.2rem', padding: '12px 24px' }}
        >
          Start Over
        </button>
      </div>
    </div>
  )
}

export default GreetingCardDisplay

