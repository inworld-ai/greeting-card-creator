import { useState } from 'react'
import GreetingCard from './GreetingCard'
import './GreetingCardDisplay.css'

interface GreetingCardDisplayProps {
  coverImageUrl: string | null
  message: string
  recipientName: string
  onAddNarration: () => void
  onStartOver: () => void
}

function GreetingCardDisplay({ coverImageUrl, message, recipientName, onAddNarration, onStartOver }: GreetingCardDisplayProps) {
  const [showMessage, setShowMessage] = useState(false)

  return (
    <div className="greeting-card-display-container">
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.8rem', color: '#333' }}>
        Rough Draft
      </h2>
      
      {!showMessage ? (
        // Show cover image first
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
          {coverImageUrl ? (
            <div 
              style={{ 
                maxWidth: '500px', 
                width: '100%', 
                cursor: 'pointer',
                position: 'relative'
              }}
              onClick={() => setShowMessage(true)}
            >
              <img 
                src={coverImageUrl} 
                alt="Greeting card cover" 
                style={{ 
                  width: '100%', 
                  height: 'auto', 
                  borderRadius: '8px', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              />
              <div 
                style={{
                  position: 'absolute',
                  bottom: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.7)',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '20px',
                  fontSize: '0.9rem',
                  pointerEvents: 'none'
                }}
              >
                Click to see the message
              </div>
            </div>
          ) : (
            <div 
              style={{
                maxWidth: '500px',
                width: '100%',
                height: '400px',
                background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
              onClick={() => setShowMessage(true)}
            >
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>💌</div>
              <p style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>To: {recipientName}</p>
              <p style={{ fontSize: '0.9rem', marginTop: '1rem', opacity: 0.9 }}>Click to see the message</p>
            </div>
          )}
        </div>
      ) : (
        // Show message when clicked
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ maxWidth: '600px', width: '100%' }}>
            <GreetingCard
              frontImageUrl={null}
              message={message}
              recipientName={recipientName}
              isOpen={true}
              onOpen={() => {}}
              showFullText={true}
            />
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setShowMessage(false)}
            style={{ fontSize: '1rem', padding: '8px 16px' }}
          >
            ← Back to Cover
          </button>
        </div>
      )}
      
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

