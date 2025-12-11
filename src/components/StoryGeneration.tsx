import { useEffect } from 'react'
import { generateStoryProgressive } from '../services/storyService'
import './StoryGeneration.css'
import type { StoryType } from '../App'

interface StoryGenerationProps {
  storyType: StoryType
  childName: string
  onStoryGenerated: (storyText: string, generatedImageUrl?: string | null) => void
  onFirstChunkReady?: (chunkText: string) => void
  customApiKey?: string
  onError?: () => void // Callback to handle errors (e.g., navigate back)
}

function StoryGeneration({ storyType, childName, onStoryGenerated, onFirstChunkReady, customApiKey, onError }: StoryGenerationProps) {
  useEffect(() => {
    // Log what we're about to send
    console.log('StoryGeneration - About to generate story progressively:', { storyType, childName })
    
    const generate = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://inworld-christmas-story-production.up.railway.app'
        
        // Start story generation
        const storyPromise = generateStoryProgressive(storyType, childName, (chunk) => {
          console.log(`🟡 Chunk ${chunk.chunkIndex} generated, length: ${chunk.text.length}`)
          
          // When first chunk is ready, notify parent to start TTS
          if (chunk.chunkIndex === 0 && onFirstChunkReady) {
            console.log('🟡 First chunk ready, starting TTS...')
            onFirstChunkReady(chunk.text)
          }
        }, customApiKey)
        
        // Wait for story to complete first
        const fullStory = await storyPromise
        console.log('✅ Full story generated, length:', fullStory.length)
        
        // Now generate image with full story (matching greeting card approach)
        console.log('🎨 Starting image generation with full story...')
        let finalImageUrl: string | null = null
        
        try {
          const imageResponse = await fetch(`${API_BASE_URL}/api/generate-story-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              storyType,
              childName,
              storyText: fullStory, // Full story with title
              uploadedImageUrl: null // No uploaded images for auto-generated covers
            })
          })
          
          if (imageResponse.ok) {
            const imageData = await imageResponse.json()
            finalImageUrl = imageData.imageUrl || null
            console.log('✅ Story image generated:', finalImageUrl ? 'Success' : 'Failed - no imageUrl in response')
            if (finalImageUrl) {
              console.log('✅ Image URL length:', finalImageUrl.length)
            }
          } else {
            const errorText = await imageResponse.text()
            console.error('❌ Failed to generate story image:', imageResponse.status, errorText)
          }
        } catch (imageError) {
          console.error('❌ Error generating story image:', imageError)
        }
        
        console.log('✅ Story generation complete, calling onStoryGenerated with imageUrl:', finalImageUrl ? 'present' : 'null')
        onStoryGenerated(fullStory, finalImageUrl)
      } catch (error: any) {
        console.error('Error generating story:', error)
        const errorMessage = error?.message || error?.toString() || 'Unknown error'
        console.error('Full error details:', error)
        
        // Check if this is an API key or Voice ID error (case-insensitive)
        const errorLower = errorMessage.toLowerCase()
        // If we have a custom API key, any authorization/content stream error is likely an Inworld API key issue
        const isApiKeyError = customApiKey && (
                             errorLower.includes('invalid authorization') || 
                             errorLower.includes('invalid api key') ||
                             errorLower.includes('authentication') ||
                             errorLower.includes('401') ||
                             errorLower.includes('authorization credentials') ||
                             errorLower.includes('failed to read content stream') ||
                             errorLower.includes('grpc read failed') ||
                             (errorLower.includes('server error') && errorLower.includes('authorization'))
                           ) || (
                             errorLower.includes('invalid authorization') || 
                             errorLower.includes('invalid api key') ||
                             errorLower.includes('authentication') ||
                             errorLower.includes('401') ||
                             errorLower.includes('authorization credentials')
                           )
        
        const isVoiceIdError = errorLower.includes('unknown voice') ||
                              errorLower.includes('voice not found') ||
                              (errorLower.includes('voice') && errorLower.includes('not found'))
        
        if (isApiKeyError || isVoiceIdError) {
          // Show user-friendly error message
          const userMessage = isApiKeyError && isVoiceIdError
            ? 'Please double-check your Inworld API Key and Voice ID. Make sure your API Key is the correct Base64-encoded key from your Inworld workspace, and that your Voice ID matches exactly what appears in your Select Voice list.'
            : isApiKeyError
            ? 'Please double-check your Inworld API Key. Make sure it\'s the correct Base64-encoded key copied from your Inworld workspace (API Keys → Copy the "Basic (Base64) key").'
            : 'Please double-check your Inworld Voice ID. Make sure it matches exactly what appears in your Select Voice list in Inworld Studio.'
          
          alert(`Oops! There was an error creating your story:\n\n${userMessage}`)
          
          // Navigate back instead of generating fallback story
          if (onError) {
            onError()
          }
          return // Exit early to prevent any fallback story generation
        } else {
          // For other errors, show the original error message
          alert(`Oops! There was an error creating your story: ${errorMessage}\n\nPlease check the browser console for more details.`)
          
          // Navigate back instead of generating fallback story
          if (onError) {
            onError()
          }
          return // Exit early to prevent any fallback story generation
        }
      }
    }

    generate()
  }, [storyType, childName, onStoryGenerated, onFirstChunkReady, customApiKey, onError])

  return (
    <div className="story-generation">
      <div className="loading-container">
        <h2 className="loading-title">CREATING YOUR CHRISTMAS STORY...</h2>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  )
}

export default StoryGeneration

