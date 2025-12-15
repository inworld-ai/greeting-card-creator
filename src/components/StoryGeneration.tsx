import { useEffect, useRef } from 'react'
import { generateStoryProgressive } from '../services/storyService'
import { synthesizeSpeech } from '../services/ttsService'
import './StoryGeneration.css'
import type { StoryType, VoiceId } from '../App'

interface StoryGenerationProps {
  storyType: StoryType
  childName: string
  voiceId: VoiceId
  customVoiceId?: string
  onStoryGenerated: (storyText: string, generatedImageUrl?: string | null) => void
  onFirstAudioReady?: (chunkText: string, preloadedAudio: HTMLAudioElement) => void
  customApiKey?: string
  onError?: () => void // Callback to handle errors (e.g., navigate back)
}

function StoryGeneration({ storyType, childName, voiceId, customVoiceId, onStoryGenerated, onFirstAudioReady, customApiKey, onError }: StoryGenerationProps) {
  const hasStartedTTSRef = useRef(false)
  const firstChunkTextRef = useRef<string | null>(null)
  
  useEffect(() => {
    // Log what we're about to send
    console.log('StoryGeneration - About to generate story progressively:', { storyType, childName })
    
    const generate = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://inworld-christmas-story-production.up.railway.app'
        
        // Start story generation
        const storyPromise = generateStoryProgressive(storyType, childName, async (chunk) => {
          console.log(`🟡 Chunk ${chunk.chunkIndex} generated, length: ${chunk.text.length}`)
          
          // When first text chunk is ready, start TTS generation
          if (chunk.chunkIndex === 0 && !hasStartedTTSRef.current && onFirstAudioReady) {
            hasStartedTTSRef.current = true
            firstChunkTextRef.current = chunk.text
            console.log('🟡 First text chunk ready, starting TTS generation...')
            
            try {
              // Generate TTS for the first chunk with [happy] emotion tag
              const audio = await synthesizeSpeech('[happy] ' + chunk.text, {
                voiceId: customVoiceId || voiceId,
                onFirstChunkReady: (preloadedAudio) => {
                  console.log('🎵 First audio chunk ready! Transitioning to narration...')
                  onFirstAudioReady(chunk.text, preloadedAudio)
                }
              })
              
              // If onFirstChunkReady didn't fire (older TTS path), use the completed audio
              if (audio && firstChunkTextRef.current) {
                console.log('🎵 Audio fully generated, transitioning to narration...')
                onFirstAudioReady(firstChunkTextRef.current, audio)
              }
            } catch (ttsError) {
              console.error('❌ TTS generation failed:', ttsError)
              // Fall back to transitioning without audio
              if (firstChunkTextRef.current) {
                // Create a dummy silent audio element to allow transition
                const silentAudio = new Audio()
                onFirstAudioReady(firstChunkTextRef.current, silentAudio)
              }
            }
          }
        }, customApiKey)
        
        // Start image generation in parallel (only needs storyType and childName, not full story)
        console.log('🎨 Starting image generation in parallel with story generation...')
        const imagePromise = fetch(`${API_BASE_URL}/api/generate-story-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storyType,
            childName,
            storyText: '', // Empty - image will be generated based on storyType and childName only
            uploadedImageUrl: null
          })
        }).then(async (imageResponse) => {
          if (imageResponse.ok) {
            const imageData = await imageResponse.json()
            console.log('🎨 Image response data:', { 
              hasImageUrl: !!imageData.imageUrl, 
              hasError: !!imageData.error,
              error: imageData.error 
            })
            const imageUrl = imageData.imageUrl || null
            if (imageData.error) {
              console.error('❌ Image generation error in response:', imageData.error)
            }
            console.log('✅ Story image generated:', imageUrl ? 'Success' : 'Failed - no imageUrl in response')
            if (imageUrl) {
              console.log('✅ Image URL length:', imageUrl.length)
            }
            return imageUrl
          } else {
            const errorText = await imageResponse.text()
            console.error('❌ Failed to generate story image:', imageResponse.status, errorText)
            return null
          }
        }).catch((imageError) => {
          console.error('❌ Error generating story image:', imageError)
          return null
        })
        
        // Wait for both story and image to complete in parallel
        const [fullStory, finalImageUrl] = await Promise.all([storyPromise, imagePromise])
        console.log('✅ Full story generated, length:', fullStory.length)
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
  }, [storyType, childName, voiceId, customVoiceId, onStoryGenerated, onFirstAudioReady, customApiKey, onError])

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

