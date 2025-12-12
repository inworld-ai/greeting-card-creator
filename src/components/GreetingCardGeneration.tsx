import { useState, useEffect, useRef } from 'react'
import { synthesizeSpeech } from '../services/ttsService'
import './StoryGeneration.css'

interface GreetingCardGenerationProps {
  senderName: string
  recipientName: string
  relationship?: string
  specialAboutThem?: string
  funnyStory: string
  uploadedImageUrl?: string | null
  conversationHistory?: Array<{ role: string; content: string }>
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
  conversationHistory,
  onCardGenerated, 
  onError 
}: GreetingCardGenerationProps) {
  const [error, setError] = useState<string | null>(null)
  const hasPlayedStartLineRef = useRef(false)
  const hasStartedGenerationRef = useRef(false) // Prevent duplicate API calls
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Prevent duplicate generation (React StrictMode or dependency changes)
    if (hasStartedGenerationRef.current) {
      console.log('⚠️ Generation already started, skipping duplicate call')
      return
    }
    hasStartedGenerationRef.current = true

    const generateCard = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')

        // Build request body - use conversation history if available
        const messageRequestBody = conversationHistory 
          ? { senderName, conversationHistory }
          : { senderName, recipientName, relationship, specialAboutThem, funnyStory }

        console.log('🎄 Starting card generation (message + image in parallel)')
        console.log('📝 Conversation history being sent:', conversationHistory)
        console.log('📝 Request body:', JSON.stringify(messageRequestBody, null, 2))

        // Start message generation
        const messagePromise = fetch(`${API_BASE_URL}/api/generate-greeting-card-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageRequestBody)
        })

        // For image, we need to extract info or use conversation
        const imageRequestBody = conversationHistory
          ? { conversationHistory }
          : { recipientName, specialAboutThem: specialAboutThem || '', funnyStory }

        // Only generate image if no uploaded image is provided
        const imagePromise = uploadedImageUrl 
          ? Promise.resolve({ ok: true, json: async () => ({ imageUrl: uploadedImageUrl }) })
          : fetch(`${API_BASE_URL}/api/generate-greeting-card-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(imageRequestBody)
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

        console.log('✅ Card generation complete')
        // Callback with results
        onCardGenerated(cardMessage, finalImageUrl)
      } catch (err: any) {
        console.error('Error generating greeting card:', err)
        setError(err.message || 'Failed to generate greeting card')
        onError()
      }
    }

    generateCard()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount only - ref guards against StrictMode double-mount

  // Speak the “Let me generate…” line while generating in the background.
  useEffect(() => {
    if (hasPlayedStartLineRef.current) return
    hasPlayedStartLineRef.current = true

    const play = async () => {
      try {
        const line = 'Let me generate a Christmas card for you...'
        const audio = await synthesizeSpeech(line, {
          voiceId: 'christmas_story_generator__female_elf_narrator',
        })
        audioRef.current = audio
        await audio.play()
      } catch (e) {
        console.warn('Could not play generation start line:', e)
      }
    }

    // allow UI paint first
    const t = setTimeout(() => void play(), 250)
    return () => {
      clearTimeout(t)
      audioRef.current?.pause()
    }
  }, [])

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

