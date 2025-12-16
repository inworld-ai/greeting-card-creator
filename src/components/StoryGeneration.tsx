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
  onFullFirstChunkAudioReady?: (fullAudio: HTMLAudioElement, chunkText: string) => void  // Full audio when TTS completes
  onRemainingAudioReady?: (remainingAudios: HTMLAudioElement[]) => void  // Pre-generated remaining audio
  customApiKey?: string
  onError?: () => void // Callback to handle errors (e.g., navigate back)
}

function StoryGeneration({ storyType, childName, voiceId, customVoiceId, onStoryGenerated, onFirstAudioReady, onFullFirstChunkAudioReady, onRemainingAudioReady, customApiKey, onError }: StoryGenerationProps) {
  const hasStartedTTSRef = useRef(false)
  const hasTransitionedRef = useRef(false) // Prevent double transition
  const hasPassedFullAudioRef = useRef(false) // Prevent passing full audio multiple times
  const hasStartedRestTTSRef = useRef(false) // Prevent generating rest audio multiple times
  const firstChunkTextRef = useRef<string | null>(null)
  
  useEffect(() => {
    // Log what we're about to send
    console.log('StoryGeneration - About to generate story progressively:', { storyType, childName })
    
    const generate = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://inworld-christmas-story-production.up.railway.app'
        
        // Play the female elf announcement (TTS for personalized part + MP3 for static ending)
        try {
          // Pre-load the static ending MP3
          const staticEnding = new Audio('/audio/story-status-ending.mp3')
          
          // Generate TTS for personalized part only
          const announcement = await synthesizeSpeech(`[happy] The Inworld elves are creating your Christmas story for ${childName} right now.`, {
            voiceId: 'christmas_story_generator__female_elf_narrator'
          })
          
          // Chain: when TTS finishes, play the static MP3 ending
          announcement.onended = () => {
            staticEnding.play().catch(err => console.log('Static ending play error:', err))
          }
          
          announcement.play().catch(err => console.log('Announcement autoplay prevented:', err))
        } catch (err) {
          console.log('Could not play announcement:', err)
        }
        
        // Start story generation
        const storyPromise = generateStoryProgressive(storyType, childName, async (chunk) => {
          console.log(`🟡 Chunk ${chunk.chunkIndex} generated, length: ${chunk.text.length}`)
          
          // When first text chunk is ready, start TTS generation
          if (chunk.chunkIndex === 0 && !hasStartedTTSRef.current && onFirstAudioReady) {
            hasStartedTTSRef.current = true
            console.log('🟡 First text chunk ready, starting TTS generation...')
            
            try {
              // Strip "Title:" prefix if present (we want to speak the title, not the word "Title")
              let textForTTS = chunk.text
              const titleMatch = textForTTS.match(/^Title:\s*(.+?)(?:\n\n|\n)/i)
              if (titleMatch) {
                // Replace "Title: X" with just "X" at the beginning
                textForTTS = titleMatch[1].trim() + '. ' + textForTTS.substring(titleMatch[0].length).trim()
              }
              
              // CRITICAL: Limit first TTS to ~100 words for fast generation
              // This ensures full audio is ready before the ~4s preloaded chunk finishes playing
              const words = textForTTS.split(/\s+/)
              const MAX_FIRST_PART_WORDS = 100
              const firstPartText = words.slice(0, MAX_FIRST_PART_WORDS).join(' ')
              const restPartText = words.slice(MAX_FIRST_PART_WORDS).join(' ')
              
              console.log(`🟡 Splitting TTS: first ${MAX_FIRST_PART_WORDS} words (${firstPartText.length} chars), rest: ${restPartText.length} chars`)
              
              // Store only the first part as the "first chunk" text
              firstChunkTextRef.current = firstPartText
              
              // Generate TTS for the FIRST PART only (fast - should complete in ~5-10s)
              const fullAudio = await synthesizeSpeech('[happy] ' + firstPartText, {
                voiceId: customVoiceId || voiceId,
                onFirstChunkReady: (preloadedAudio) => {
                  // Only transition once - when first ~3 seconds of audio is ready
                  if (!hasTransitionedRef.current) {
                    hasTransitionedRef.current = true
                    console.log('🎵 First audio chunk (~3s) ready! Transitioning to narration...')
                    onFirstAudioReady(firstPartText, preloadedAudio)
                  }
                }
              })
              
              // Pass the full audio when TTS completes (for seamless chaining)
              if (fullAudio && onFullFirstChunkAudioReady && !hasPassedFullAudioRef.current) {
                hasPassedFullAudioRef.current = true
                console.log(`🎵 Full first part audio ready (${fullAudio.duration?.toFixed(1)}s)! Passing to narration...`)
                onFullFirstChunkAudioReady(fullAudio, firstPartText)
              }
              
              // Start generating TTS for the REST immediately (in parallel, don't await)
              if (restPartText && restPartText.length > 10 && onRemainingAudioReady && !hasStartedRestTTSRef.current) {
                hasStartedRestTTSRef.current = true
                console.log(`🎵 Starting TTS for rest of text (${restPartText.length} chars) in parallel...`)
                synthesizeSpeech('[happy] ' + restPartText, {
                  voiceId: customVoiceId || voiceId
                }).then(restAudio => {
                  console.log(`✅ Rest audio ready: ${restAudio.duration?.toFixed(1)}s`)
                  onRemainingAudioReady([restAudio])
                }).catch(err => {
                  console.error('Error generating rest audio:', err)
                })
              }
            } catch (ttsError) {
              console.error('❌ TTS generation failed:', ttsError)
              // Fall back to transitioning without audio
              if (firstChunkTextRef.current && !hasTransitionedRef.current) {
                hasTransitionedRef.current = true
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
        
        // Generate TTS for remaining text (text that wasn't covered by first chunk TTS)
        // This handles the case where the first chunk is small but full story is much longer
        if (firstChunkTextRef.current && onRemainingAudioReady && !hasStartedRestTTSRef.current) {
          const firstPartText = firstChunkTextRef.current
          
          // Find where firstPartText ends in the full story
          const firstPartIndex = fullStory.indexOf(firstPartText)
          let remainingText = ''
          if (firstPartIndex !== -1) {
            remainingText = fullStory.substring(firstPartIndex + firstPartText.length).trim()
          } else {
            // Fallback: try matching last few words
            const lastWords = firstPartText.split(/\s+/).slice(-5).join(' ')
            const lastWordsIndex = fullStory.indexOf(lastWords)
            if (lastWordsIndex !== -1) {
              remainingText = fullStory.substring(lastWordsIndex + lastWords.length).trim()
            }
          }
          
          if (remainingText && remainingText.length > 10) {
            hasStartedRestTTSRef.current = true
            console.log(`🎵 Full story has additional text (${remainingText.length} chars) - generating TTS...`)
            
            synthesizeSpeech('[happy] ' + remainingText, {
              voiceId: customVoiceId || voiceId
            }).then(remainingAudio => {
              console.log(`✅ Additional story audio ready: ${remainingAudio.duration?.toFixed(1)}s`)
              onRemainingAudioReady([remainingAudio])
            }).catch(err => {
              console.error('Error generating remaining audio:', err)
            })
          } else {
            console.log('🎵 First part covers entire story, no additional audio needed')
          }
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
  }, [storyType, childName, voiceId, customVoiceId, onStoryGenerated, onFirstAudioReady, customApiKey, onError])

  return (
    <div className="story-generation">
      <div className="loading-container">
        <h2 className="loading-title">Creating your Christmas story...</h2>
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

