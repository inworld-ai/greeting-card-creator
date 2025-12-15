import { useState, useRef } from 'react'
import './ChristmasCard.css'

interface ChristmasCardProps {
  imageUrl: string | null
  title: string
  content: string
  childName: string
  onCardOpen?: () => void // Callback when user clicks to open the card
  isAudioReady?: boolean // Whether audio is preloaded and ready for instant playback
  isAudioLoading?: boolean // Whether audio is currently being preloaded
}

function ChristmasCard({ imageUrl, title, content, childName: _childName, onCardOpen, isAudioReady = false, isAudioLoading = false }: ChristmasCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const hasTriggeredAudioRef = useRef(false) // Track if audio has already been triggered

  const handleOpenCard = () => {
    if (!isOpen) {
      setIsOpen(true)
      // Only trigger audio playback on the FIRST open, not subsequent opens
      if (onCardOpen && !hasTriggeredAudioRef.current) {
        hasTriggeredAudioRef.current = true
        onCardOpen()
      }
    }
  }

  // Extract title from content if it starts with "Title: "
  const displayTitle = title || (content.startsWith('Title: ') 
    ? content.split('\n')[0].replace('Title: ', '')
    : 'The Voice Before Christmas')

  // Remove title from content if it's in the content
  const displayContent = content.startsWith('Title: ')
    ? content.split('\n').slice(1).join('\n').trim()
    : content

  // Suppress unused variable warnings
  void isAudioReady
  void isAudioLoading

  return (
    <div className="christmas-card-wrapper">
      <div className={`christmas-card-container ${isOpen ? 'open' : ''}`}>
        <div className="christmas-card">
          {!isOpen ? (
            // Front Cover - just the image, no overlay text
            <div className="card-front">
              <div className="card-front-image">
                {imageUrl ? (
                  <img src={imageUrl} alt="Christmas card" />
                ) : (
                  <div className="card-placeholder">
                    <div className="placeholder-icon">🎄</div>
                    <div className="placeholder-text">Merry Christmas!</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Inside Page
            <div className="card-inside">
              <div className="card-inside-content">
                <h1 className="card-inside-title">{displayTitle}</h1>
                <div className="card-inside-story">
                  {displayContent.split('\n\n').map((paragraph, index) => (
                    <p key={index} className="story-paragraph">
                      {paragraph.trim()}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Buttons below the card - matching Christmas Card Creator style */}
      {!isOpen && (
        <button
          className="card-action-button"
          onClick={handleOpenCard}
        >
          Click to see the story
        </button>
      )}
      
      {isOpen && (
        <button
          className="card-action-button"
          onClick={() => setIsOpen(false)}
        >
          ← Back to Cover
        </button>
      )}
    </div>
  )
}

export default ChristmasCard

