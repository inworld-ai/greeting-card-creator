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
  const [status, setStatus] = useState('Creating your Christmas card...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const generateCard = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://inworld-christmas-story-production.up.railway.app'

        // Generate message and image in parallel to cut generation time in half
        setStatus('Creating your Christmas card...')
        
        // Start both API calls simultaneously
        const messagePromise = fetch(`${API_BASE_URL}/api/generate-greeting-card-message`, {
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

        // Only generate image if no uploaded image is provided
        const imagePromise = uploadedImageUrl 
          ? Promise.resolve({ ok: true, json: async () => ({ imageUrl: uploadedImageUrl }) })
          : fetch(`${API_BASE_URL}/api/generate-greeting-card-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipientName,
                specialAboutThem: specialAboutThem || '',
                funnyStory,
                uploadedImageUrl: null
              })
            })

        // Wait for both to complete in parallel
        const [messageResponse, imageResponse] = await Promise.all([messagePromise, imagePromise])

        // Process message response
        if (!messageResponse.ok) {
          throw new Error('Failed to generate card message')
        }
        const messageData = await messageResponse.json()
        const cardMessage = messageData.cardMessage

        // Process image response
        let finalImageUrl = uploadedImageUrl || null
        if (imageResponse.ok) {
          const imageData = await imageResponse.json()
          finalImageUrl = imageData.imageUrl || uploadedImageUrl || null
        } else {
          console.warn('Image generation failed, continuing without image')
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
      <div className="loading-container">
        <h2 className="loading-title">CREATING YOUR CHRISTMAS CARD...</h2>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
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

