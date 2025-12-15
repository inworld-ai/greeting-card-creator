// Backend API URL - use relative URLs in production (Vercel), localhost in development
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')

/**
 * Creates a WAV header for PCM float32 audio data
 */
function createWavHeader(dataLength: number, sampleRate: number = 24000): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 32
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize)
  const view = new DataView(buffer)
  
  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')
  
  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 3, true) // audio format (3 = IEEE float)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  
  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)
  
  return buffer
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

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
 * Creates a WAV audio element from PCM data
 */
function createAudioFromPCM(pcmData: Uint8Array): Promise<HTMLAudioElement> {
  const wavHeader = createWavHeader(pcmData.length, 24000)
  const wavFile = new Uint8Array(wavHeader.byteLength + pcmData.length)
  wavFile.set(new Uint8Array(wavHeader), 0)
  wavFile.set(pcmData, wavHeader.byteLength)

  const blob = new Blob([wavFile], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.preload = 'auto'

  // Clean up URL when audio ends or on error
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
  audio.addEventListener('error', () => URL.revokeObjectURL(url), { once: true })

  return new Promise<HTMLAudioElement>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Audio loading timeout')), 10000)
    audio.addEventListener('canplaythrough', () => {
      clearTimeout(timeout)
      resolve(audio)
    }, { once: true })
    audio.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('Failed to load audio'))
    }, { once: true })
    audio.load()
  })
}

/**
 * Creates an HTMLAudioElement from PCM audio stream
 * Receives newline-delimited JSON with base64-encoded raw PCM float32 data
 * 
 * PROGRESSIVE: Fires onFirstChunkReady after ~3 seconds of audio data is received,
 * allowing playback to start while the rest of the audio continues generating.
 */
async function createAudioFromWAVStream(
  response: Response,
  onFirstChunkReady?: (firstAudio: HTMLAudioElement) => void,
  _onAllChunksCreated?: (allChunks: HTMLAudioElement[]) => void
): Promise<HTMLAudioElement> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const textDecoder = new TextDecoder()
  let buffer = ''
  const pcmChunks: Uint8Array[] = []
  let totalBytes = 0
  
  // At 24kHz, 32-bit float, mono: 96KB per second
  // We want ~3 seconds of audio before triggering first chunk = ~288KB
  const FIRST_CHUNK_THRESHOLD = 288000 // ~3 seconds of audio
  let firstChunkFired = false
  let firstChunkAudio: HTMLAudioElement | null = null
  
  console.log('🎵 Starting TTS audio stream...')

  // Read stream and parse newline-delimited JSON
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    
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
            console.log(`✅ TTS stream complete, total PCM data: ${totalBytes} bytes`)
            break
          }
          
          // Decode base64 PCM data
          const pcmData = Uint8Array.from(atob(chunkData.data), c => c.charCodeAt(0))
          pcmChunks.push(pcmData)
          totalBytes += pcmData.length
          
          // Fire first chunk callback when we have enough audio data (~3 seconds)
          if (!firstChunkFired && totalBytes >= FIRST_CHUNK_THRESHOLD && onFirstChunkReady) {
            firstChunkFired = true
            console.log(`🎵 First ${(totalBytes / 1024).toFixed(1)}KB of audio ready (~${(totalBytes / 96000).toFixed(1)}s) - firing callback!`)
            
            // Create audio from accumulated chunks so far
            const combinedPCM = new Uint8Array(totalBytes)
            let offset = 0
            for (const chunk of pcmChunks) {
              combinedPCM.set(chunk, offset)
              offset += chunk.length
            }
            
            // Create and fire callback asynchronously (don't block stream reading)
            createAudioFromPCM(combinedPCM).then(audio => {
              firstChunkAudio = audio
              console.log(`✅ First chunk audio ready: ${audio.duration?.toFixed(1)}s`)
              onFirstChunkReady(audio)
            }).catch(err => {
              console.error('Error creating first chunk audio:', err)
            })
          }
          
        } catch (err) {
          // Silently skip malformed chunks
        }
      }
    }
  }

  if (totalBytes === 0) {
    throw new Error('No audio data received from server')
  }

  // Combine all PCM chunks for the full audio
  const combinedPCM = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of pcmChunks) {
    combinedPCM.set(chunk, offset)
    offset += chunk.length
  }

  // Create full audio element
  const audio = await createAudioFromPCM(combinedPCM)
  console.log(`✅ Full audio ready: ${(totalBytes / 1024).toFixed(1)}KB, duration: ${audio.duration?.toFixed(1)}s`)
  
  // If we never fired the first chunk callback (audio was shorter than threshold), fire it now
  if (!firstChunkFired && onFirstChunkReady) {
    console.log('🎵 Audio shorter than threshold, firing first chunk callback with full audio')
    onFirstChunkReady(audio)
  }

  // Store reference to first chunk audio for potential chaining
  if (firstChunkAudio) {
    (audio as any).__firstChunkAudio = firstChunkAudio
  }

  return audio
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
