import { useState } from 'react'
import './GreetingCard.css'

interface GreetingCardProps {
  frontImageUrl: string | null
  message: string
  senderName: string
  recipientName: string
  isOpen?: boolean
  onOpen?: () => void
}

function GreetingCard({ frontImageUrl, message, senderName, recipientName, isOpen: initialIsOpen = false, onOpen }: GreetingCardProps) {
  const [isOpen, setIsOpen] = useState(initialIsOpen)

  const handleOpen = () => {
    if (!isOpen) {
      setIsOpen(true)
      if (onOpen) {
        onOpen()
      }
    }
  }

  return (
    <div className="greeting-card-container">
      <div className={`greeting-card ${isOpen ? 'open' : ''}`} onClick={!isOpen ? handleOpen : undefined}>
        {/* Front of card */}
        <div className="greeting-card-front">
          {frontImageUrl ? (
            <img src={frontImageUrl} alt="Greeting card front" className="greeting-card-image" />
          ) : (
            <div className="greeting-card-placeholder">
              <div className="greeting-card-placeholder-icon">💌</div>
              <p>To: {recipientName}</p>
            </div>
          )}
          {!isOpen && (
            <div className="greeting-card-open-hint">
              <p>Click to open</p>
            </div>
          )}
        </div>

        {/* Inside of card */}
        <div className="greeting-card-inside">
          <div className="greeting-card-message">
            {message.split('\n\n').map((paragraph, index) => (
              <p key={index} className="greeting-card-paragraph">
                {paragraph.trim()}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default GreetingCard

