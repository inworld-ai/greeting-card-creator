import { useState } from 'react'
import './ChristmasCard.css'

interface ChristmasCardProps {
  imageUrl: string | null
  title: string
  content: string
  childName: string
}

function ChristmasCard({ imageUrl, title, content, childName: _childName }: ChristmasCardProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleCardClick = () => {
    if (!isOpen) {
      setIsOpen(true)
    }
  }

  // Extract title from content if it starts with "Title: "
  const displayTitle = title || (content.startsWith('Title: ') 
    ? content.split('\n')[0].replace('Title: ', '')
    : 'A Christmas Story For You')

  // Remove title from content if it's in the content
  const displayContent = content.startsWith('Title: ')
    ? content.split('\n').slice(1).join('\n').trim()
    : content

  return (
    <div className={`christmas-card-container ${isOpen ? 'open' : ''}`}>
      <div className="christmas-card" onClick={handleCardClick}>
        {!isOpen ? (
          // Front Cover
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
            <div className="card-front-text">
              <h2 className="card-front-title">{displayTitle}</h2>
              <p className="card-front-hint">Click to open</p>
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
  )
}

export default ChristmasCard

