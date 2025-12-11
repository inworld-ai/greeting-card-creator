import { useState, useEffect } from 'react'
import './StoryGeneration.css'

interface GreetingCardGenerationProps {
  senderName: string
  recipientName: string
  relationship?: string
  specialAboutThem?: string
  funnyStory: string
  uploadedImageUrl?: string | null
  onCardGenerated: (cardMessage: string, generatedImageUrl: string | null) => void
  onError: () => void
}

function GreetingCardGeneration({ 
  senderName, 
  recipientName, 
  relationship,
  specialAboutThem, 
  funnyStory, 
  uploadedImageUrl,
  onCardGenerated, 
  onError 
}: GreetingCardGenerationProps) {
  const [status, setStatus] = useState('Generating your personalized Christmas card...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const generateCard = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://inworld-christmas-story-production.up.railway.app'

        // Step 1: Generate card message
        setStatus('Writing your personalized message...')
        const messageResponse = await fetch(`${API_BASE_URL}/api/generate-greeting-card-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderName,
            recipientName,
            relationship,
            specialAboutThem,
            funnyStory
          })
        })

        if (!messageResponse.ok) {
          throw new Error('Failed to generate card message')
        }

        const messageData = await messageResponse.json()
        const cardMessage = messageData.cardMessage

        // Step 2: Use uploaded image if available, otherwise generate card image
        let finalImageUrl = uploadedImageUrl || null
        
        if (!uploadedImageUrl) {
          setStatus('Creating your card image...')
          const imageResponse = await fetch(`${API_BASE_URL}/api/generate-greeting-card-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipientName,
              specialAboutThem: specialAboutThem || '',
              funnyStory,
              uploadedImageUrl: null
            })
          })

          if (imageResponse.ok) {
            const imageData = await imageResponse.json()
            finalImageUrl = imageData.imageUrl
          } else {
            console.warn('Image generation failed, continuing without image')
          }
        }

        // Callback with results
        onCardGenerated(cardMessage, finalImageUrl)
      } catch (err: any) {
        console.error('Error generating greeting card:', err)
        setError(err.message || 'Failed to generate greeting card')
        onError()
      }
    }

    generateCard()
  }, [senderName, recipientName, relationship, specialAboutThem, funnyStory, uploadedImageUrl, onCardGenerated, onError])

  return (
    <div className="story-generation">
      <div className="generation-status">
        <div className="loading-spinner"></div>
        <p className="status-text" style={{ fontSize: '2rem', fontWeight: '600' }}>{status}</p>
      </div>
      {error && (
        <div className="error-message" style={{ color: '#f5576c', marginTop: '20px' }}>
          {error}
        </div>
      )}
    </div>
  )
}

export default GreetingCardGeneration

