// Backend API URL - use relative URLs in production (Vercel), localhost in development
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')

export interface TTSOptions {
  voiceId?: string
  apiKey?: string
  onFirstChunkReady?: (firstAudio: HTMLAudioElement) => void
  onAllChunksCreated?: (allChunks: HTMLAudioElement[]) => void
}

/**
 * Cleans text for TTS by removing markdown formatting and other elements
 * that don't read well when spoken
 */
function cleanTextForTTS(text: string): string {
  return text
    // Remove hashtags at the start of lines
    .replace(/^#+\s*/gm, '')
    // Remove markdown bold/italic formatting
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*]+)\*/g, '$1') // *italic*
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/_([^_]+)_/g, '$1') // _italic_
    // Remove markdown links but keep the text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove extra whitespace and normalize line breaks
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim()
}

/**
 * Splits text into chunks that are safe for TTS (under 2000 characters)
 * Tries to split at sentence boundaries when possible
 */
function splitTextIntoChunks(text: string, maxLength: number = 1900): string[] {
  if (text.length <= maxLength) {
    return [text]
  }

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }

    // Try to find a good break point (sentence ending)
    let chunk = remaining.substring(0, maxLength)
    const lastPeriod = chunk.lastIndexOf('.')
    const lastExclamation = chunk.lastIndexOf('!')
    const lastQuestion = chunk.lastIndexOf('?')
    const lastNewline = chunk.lastIndexOf('\n')

    // Find the best break point
    const breakPoints = [lastPeriod, lastExclamation, lastQuestion, lastNewline].filter(p => p > maxLength * 0.7) // Only use if it's in the last 30%
    const breakPoint = breakPoints.length > 0 ? Math.max(...breakPoints) + 1 : maxLength

    chunk = remaining.substring(0, breakPoint).trim()
    chunks.push(chunk)
    remaining = remaining.substring(breakPoint).trim()
  }

  return chunks
}

/**
 * Creates an HTMLAudioElement from progressive WAV chunks
 * Receives newline-delimited JSON with base64-encoded WAV chunks
 * Chains chunks together for seamless playback with low latency
 * 
 * @param onFirstChunkReady Optional callback that fires when the first WAV chunk is ready
 */
async function createAudioFromWAVStream(
  response: Response,
  onFirstChunkReady?: (firstAudio: HTMLAudioElement) => void,
  onAllChunksCreated?: (allChunks: HTMLAudioElement[]) => void
): Promise<HTMLAudioElement> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const textDecoder = new TextDecoder()
  let buffer = ''
  const audioChunks: HTMLAudioElement[] = []
  let firstChunkTime: number | null = null
  let isStreamComplete = false

  // Store handler references so we can remove them when re-chaining
  const handlerMap = new Map<HTMLAudioElement, () => void>()
  
  // Helper to chain a chunk to the previous one
  const chainChunk = (currentAudio: HTMLAudioElement, nextAudio: HTMLAudioElement, index: number) => {
    // Remove any existing ended handlers to prevent conflicts
    // First, remove the stored handler if it exists
    const existingHandler = handlerMap.get(currentAudio)
    if (existingHandler) {
      currentAudio.removeEventListener('ended', existingHandler)
      handlerMap.delete(currentAudio)
    }
    
    // Clear the onended property (for handlers set via property)
    currentAudio.onended = null
    
    // Create new handler
    const handler = () => {
      console.log(`🟡 Chunk ${index} ended, attempting to play chunk ${index + 1}...`)
      console.log(`   Next chunk readyState: ${nextAudio.readyState}, paused: ${nextAudio.paused}, src exists: ${!!nextAudio.src}`)
      
      // Validate nextAudio is still valid
      if (!nextAudio || !nextAudio.src) {
        console.error(`❌ Chunk ${index + 1} is invalid or missing src`)
        return
      }
      
      // Function to attempt playing the next chunk
      const tryPlayNext = () => {
        if (nextAudio.readyState >= 2) { // HAVE_CURRENT_DATA or higher
          const playPromise = nextAudio.play()
          if (playPromise !== undefined) {
            playPromise.then(() => {
              console.log(`✅ Chunk ${index + 1} started playing successfully`)
            }).catch(err => {
              console.error(`❌ Error playing chunk ${index + 1}:`, err)
              // Retry after a short delay
              setTimeout(() => {
                console.log(`🔄 Retrying chunk ${index + 1}...`)
                nextAudio.play().catch(e => {
                  console.error(`❌ Retry failed for chunk ${index + 1}:`, e)
                })
              }, 200)
            })
          } else {
            console.log(`✅ Chunk ${index + 1} play() returned undefined (may already be playing)`)
          }
        } else {
          // Wait for next chunk to be ready
          console.log(`⏳ Chunk ${index + 1} not ready yet (readyState: ${nextAudio.readyState}), waiting...`)
          const onCanPlay = () => {
            nextAudio.removeEventListener('canplay', onCanPlay)
            nextAudio.removeEventListener('loadeddata', onCanPlay)
            nextAudio.removeEventListener('canplaythrough', onCanPlay)
            console.log(`✅ Chunk ${index + 1} is now ready (readyState: ${nextAudio.readyState}), playing...`)
            nextAudio.play().then(() => {
              console.log(`✅ Chunk ${index + 1} started playing after waiting`)
            }).catch(err => {
              console.error(`❌ Error playing chunk ${index + 1} after waiting:`, err)
            })
          }
          nextAudio.addEventListener('canplay', onCanPlay, { once: true })
          nextAudio.addEventListener('loadeddata', onCanPlay, { once: true })
          nextAudio.addEventListener('canplaythrough', onCanPlay, { once: true })
          
          // Fallback: try to play anyway after a delay
          setTimeout(() => {
            if (nextAudio.paused && nextAudio.readyState >= 1) {
              console.log(`🔄 Fallback: attempting to play chunk ${index + 1} (readyState: ${nextAudio.readyState})...`)
              nextAudio.play().catch(err => {
                console.error(`❌ Error playing chunk ${index + 1} (fallback):`, err)
              })
            }
          }, 500)
        }
      }
      
      tryPlayNext()
    }
    
    // Store handler reference and add listener
    handlerMap.set(currentAudio, handler)
    currentAudio.addEventListener('ended', handler, { once: true })
    console.log(`🔗 Chained chunk ${index} → ${index + 1}`)
  }

  // Read stream and parse newline-delimited JSON
  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      isStreamComplete = true
      break
    }
    
    if (value) {
      buffer += textDecoder.decode(value, { stream: true })
      
      // Process complete lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.trim()) continue
        
        try {
          const chunkData = JSON.parse(line)
          
          // Check for end marker
          if (chunkData.end === true) {
            console.log(`✅ Received end marker, total chunks: ${audioChunks.length}`)
            isStreamComplete = true
            break
          }
          
          // Decode base64 WAV data
          const wavData = Uint8Array.from(atob(chunkData.data), c => c.charCodeAt(0))
          
          if (firstChunkTime === null) {
            firstChunkTime = Date.now()
            console.log(`⏱️ First WAV chunk received in ${Date.now()}ms`)
          }
          
          // Create audio element from WAV blob
          const blob = new Blob([wavData], { type: 'audio/wav' })
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          
          // Preload the audio
          audio.preload = 'auto'
          
          // Wait for metadata to load
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Audio chunk metadata loading timeout'))
            }, 5000)
            
            const onLoadedMetadata = () => {
              clearTimeout(timeout)
              audio.removeEventListener('error', onError)
              resolve(undefined)
            }
            
            const onError = () => {
              clearTimeout(timeout)
              reject(new Error('Failed to load audio chunk'))
            }
            
            audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
            audio.addEventListener('error', onError, { once: true })
          })
          
          const chunkIndex = audioChunks.length
          audioChunks.push(audio)
          console.log(`🎵 Loaded WAV chunk ${chunkData.index}: ${wavData.length} bytes (${chunkData.samples} samples)`)
          
          // If this is the first chunk and we have a callback, notify immediately
          // This allows chaining to start before all chunks are received
          if (chunkIndex === 0 && onFirstChunkReady) {
            onFirstChunkReady(audio)
          }
          
          // Chain to previous chunk immediately (progressive chaining for low latency)
          // This ensures chunks can start playing as soon as they're ready
          if (chunkIndex > 0) {
            chainChunk(audioChunks[chunkIndex - 1], audio, chunkIndex - 1)
          }
          
          // Clean up URL when chunk ends
          audio.addEventListener('ended', () => {
            URL.revokeObjectURL(url)
          }, { once: true })
          
        } catch (err) {
          console.error('Error parsing chunk:', err, 'Line:', line.substring(0, 100))
        }
      }
    }
  }

  if (audioChunks.length === 0) {
    throw new Error('No audio chunks received from server')
  }

  // Re-chain all chunks at the end to ensure everything is properly connected
  // This handles cases where chunks arrived after initial chaining or if progressive chaining failed
  console.log(`🔗 Re-chaining all ${audioChunks.length} chunks to ensure proper connection...`)
  for (let i = 0; i < audioChunks.length - 1; i++) {
    const currentAudio = audioChunks[i]
    const nextAudio = audioChunks[i + 1]
    
    // Validate both chunks exist and are valid
    if (!currentAudio || !nextAudio) {
      console.error(`❌ Invalid chunks at index ${i}: current=${!!currentAudio}, next=${!!nextAudio}`)
      continue
    }
    
    if (!currentAudio.src || !nextAudio.src) {
      console.error(`❌ Chunks at index ${i} missing src: current=${!!currentAudio.src}, next=${!!nextAudio.src}`)
      continue
    }
    
    // Always re-chain (chainChunk removes old handlers first)
    chainChunk(currentAudio, nextAudio, i)
  }
  
  // Set up ended handler on the LAST chunk to detect when all audio has finished
  // This will be used by StoryNarration to update state
  if (audioChunks.length > 0) {
    const lastChunk = audioChunks[audioChunks.length - 1]
    // Mark this as the last chunk so StoryNarration can set up a handler
    ;(lastChunk as any).__isLastWavChunk = true
    console.log(`🟡 Marked chunk ${audioChunks.length - 1} as last WAV chunk`)
  }
  
  console.log(`✅ Re-chained all ${audioChunks.length} chunks`)

  console.log(`✅ Created ${audioChunks.length} chained WAV chunks (stream complete: ${isStreamComplete})`)
  
  // Notify callback with all chunks so they can be tracked
  if (onAllChunksCreated) {
    onAllChunksCreated(audioChunks)
  }
  
  // Return first audio element (will trigger chain)
  // Also attach a reference to the last chunk for chaining between text chunks
  const firstAudio = audioChunks[0]
  const lastAudio = audioChunks[audioChunks.length - 1]
  
  // Attach lastAudio as a property so we can access it when chaining text chunks
  ;(firstAudio as any).__lastChunk = lastAudio
  // Also attach all chunks for tracking
  ;(firstAudio as any).__allChunks = audioChunks
  
  // Don't autoplay here - let StoryNarration handle it to avoid conflicts
  // The first chunk will be played by StoryNarration when ready
  
  return firstAudio
}

export async function synthesizeSpeech(text: string, options: TTSOptions = {}): Promise<HTMLAudioElement> {
  try {
    // Clean the text before sending to TTS
    const cleanedText = cleanTextForTTS(text)
    
    // Split into chunks if text is too long (Inworld limit is 2000 characters)
    const chunks = splitTextIntoChunks(cleanedText, 1900) // Use 1900 to be safe
    
    if (chunks.length === 1) {
      // Single chunk - stream and play immediately
      const response = await fetch(`${API_BASE_URL}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanedText,
          voiceId: options.voiceId,
          ...(options.apiKey && { apiKey: options.apiKey }), // Only include apiKey if provided
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
        
        if (response.status === 401) {
          throw new Error('Invalid Inworld API key. Please check your INWORLD_API_KEY in the server .env file.')
        } else if (response.status === 400) {
          throw new Error(`Invalid request: ${errorMessage}`)
        } else if (response.status === 500) {
          throw new Error(`Server error: ${errorMessage}. Make sure the backend server is running and INWORLD_API_KEY is set.`)
        } else {
          throw new Error(`TTS API Error (${response.status}): ${errorMessage}`)
        }
      }

      // Use HTML5 Audio for WAV playback (much simpler!)
      return await createAudioFromWAVStream(response, options.onFirstChunkReady, options.onAllChunksCreated)
    } else {
      // Multiple chunks - generate audio for each and chain them using Web Audio API
      console.log(`Text is ${cleanedText.length} characters, splitting into ${chunks.length} chunks`)
      const audioChunks: HTMLAudioElement[] = []
      
      for (let i = 0; i < chunks.length; i++) {
        const response = await fetch(`${API_BASE_URL}/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: chunks[i],
            voiceId: options.voiceId,
            ...(options.apiKey && { apiKey: options.apiKey }), // Only include apiKey if provided
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
          
          if (response.status === 401) {
            throw new Error('Invalid Inworld API key. Please check your INWORLD_API_KEY in the server .env file.')
          } else if (response.status === 400) {
            throw new Error(`Invalid request: ${errorMessage}`)
          } else if (response.status === 500) {
            throw new Error(`Server error: ${errorMessage}. Make sure the backend server is running and INWORLD_API_KEY is set.`)
          } else {
            throw new Error(`TTS API Error (${response.status}): ${errorMessage}`)
          }
        }

        // Use HTML5 Audio for WAV playback (much simpler!)
        const audio = await createAudioFromWAVStream(response, options.onFirstChunkReady, options.onAllChunksCreated)
        audioChunks.push(audio)
      }

      // Chain the audio chunks to play sequentially
      for (let i = 0; i < audioChunks.length - 1; i++) {
        const currentAudio = audioChunks[i]
        const nextAudio = audioChunks[i + 1]
        
        currentAudio.addEventListener('ended', () => {
          nextAudio.play().catch(err => {
            console.error('Error playing next audio chunk:', err)
          })
        }, { once: true })
      }

      // Return the first audio element (it will trigger the chain)
      return audioChunks[0]
    }
  } catch (error: any) {
    console.error('Error calling TTS API:', error)

    // Check if it's a network error (backend not running)
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new Error('Cannot connect to the server. Make sure the backend server is running on port 3001.')
    }

    // Re-throw with more context if it's already an Error with a message
    if (error instanceof Error) {
      throw error
    }

    // Otherwise create a new error
    throw new Error(`Failed to synthesize speech: ${error?.toString() || 'Unknown error'}`)
  }
}
