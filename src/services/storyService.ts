import type { StoryType } from '../App'

// Backend API URL - use relative URLs in production (Vercel), localhost in development
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')

export interface StoryChunk {
  text: string
  chunkIndex: number
  isComplete: boolean
}

/**
 * Generates a single story chunk (simplified - no streaming for now)
 * Optimized to be as fast as possible
 */
async function generateStoryChunk(
  storyType: StoryType, 
  childName: string, 
  chunkIndex: number,
  retryCount: number = 0,
  apiKey?: string,
  onFirstChunk?: (chunk: StoryChunk) => void
): Promise<StoryChunk> {
  const maxRetries = 3
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-story`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storyType,
        childName,
        chunkIndex,
        apiKey,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
      const errorLower = errorMessage.toLowerCase()
      
      // Check if this is an authorization error FIRST (before status code checks)
      // This is important because authorization errors can come as 500 status codes
      // We check for these patterns even if they're part of a longer error message
      const isAuthorizationError = errorLower.includes('invalid authorization') || 
                                   errorLower.includes('authorization credentials') ||
                                   errorLower.includes('grpc read failed') ||
                                   errorLower.includes('failed to read content stream') ||
                                   (errorLower.includes('authentication') && !errorLower.includes('google')) ||
                                   (errorLower.includes('server error') && errorLower.includes('authorization'))
      
      // If we have a custom API key and see any of these errors, it's definitely an Inworld API key issue
      // This check happens BEFORE we look at status codes, so we catch it early
      if (apiKey && isAuthorizationError) {
        throw new Error(`Invalid authorization credentials. Please double-check your Inworld API Key and Voice ID.`)
      }
      
      // Also check if we have a custom API key and the error mentions "content stream" or "grpc"
      // These are common patterns for Inworld API authorization failures
      if (apiKey && (errorLower.includes('content stream') || errorLower.includes('grpc'))) {
        throw new Error(`Invalid authorization credentials. Please double-check your Inworld API Key and Voice ID.`)
      }
      
      // Retry on rate limit errors
      if (response.status === 429 && retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount + 1) * 1000 // 2s, 4s, 8s
        console.log(`🟡 Rate limit hit, retrying in ${waitTime}ms (frontend retry ${retryCount + 1}/${maxRetries})...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        return generateStoryChunk(storyType, childName, chunkIndex, retryCount + 1, apiKey, onFirstChunk)
      }
      
      if (response.status === 401) {
        // Check if this is about Inworld API key (custom narrator) or Google API key
        if (errorLower.includes('inworld') || errorLower.includes('authorization credentials') || errorLower.includes('invalid authorization')) {
          throw new Error(`Invalid authorization credentials. Please double-check your Inworld API Key.`)
        } else {
          throw new Error('Invalid API key. Please check your GOOGLE_API_KEY in the server .env file.')
        }
      } else if (response.status === 400) {
        throw new Error(`Invalid request: ${errorMessage}`)
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.')
      } else if (response.status === 500) {
        // Check if this is an authorization error wrapped in a 500
        if (isAuthorizationError) {
          // If we have a custom API key, this is definitely an Inworld API key error
          if (apiKey) {
            throw new Error(`Invalid authorization credentials. Please double-check your Inworld API Key and Voice ID.`)
          } else {
            throw new Error(`Invalid authorization credentials. Please double-check your Inworld API Key.`)
          }
        } else {
          throw new Error(`Server error: ${errorMessage}. Make sure the backend server is running and GOOGLE_API_KEY is set.`)
        }
      } else {
        throw new Error(`API Error (${response.status}): ${errorMessage}`)
      }
    }

    // Check if response is streaming
    // Try to detect streaming by checking if body is readable and content-type suggests streaming
    // Railway/proxies may strip transfer-encoding header, so we need to try parsing as stream first
    const transferEncoding = response.headers.get('transfer-encoding')
    const contentType = response.headers.get('content-type')
    const hasChunkedEncoding = transferEncoding === 'chunked'
    
    // Try streaming if we have a body and it might be chunked, or if content-type suggests it
    // We'll attempt to read as stream and fall back if it fails
    const shouldTryStreaming = response.body && (hasChunkedEncoding || contentType?.includes('application/json'))
    
    console.log('📖 Response headers:', { 
      transferEncoding, 
      contentType,
      hasBody: !!response.body,
      shouldTryStreaming
    })
    
    if (shouldTryStreaming) {
      // Parse streaming newline-delimited JSON
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullStory = ''
      let firstChunkReceived = false
      
      console.log('📖 Parsing streaming response...')
      
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          console.log('📖 Stream ended, final fullStory length:', fullStory.length)
          break
        }
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (!line.trim()) continue
          
          try {
            const data = JSON.parse(line)
            console.log('📖 Received chunk:', { 
              isFirst: data.isFirst, 
              isComplete: data.isComplete, 
              textLength: data.text?.length || 0,
              chunkIndex: data.chunkIndex 
            })
            
            if (data.isFirst && !firstChunkReceived && onFirstChunk) {
              // First chunk received - notify immediately for early TTS start
              onFirstChunk({
                text: data.text?.trim() || '',
                chunkIndex: data.chunkIndex || 0,
                isComplete: data.isComplete || false,
              })
              firstChunkReceived = true
              console.log(`📖 Received first chunk (${data.text?.length || 0} chars) - starting TTS early!`)
            }
            
            // Always update fullStory if text is provided
            if (data.text) {
              fullStory = data.text.trim()
            }
            
            // If this is the complete story, use it
            if (data.isComplete && data.text) {
              fullStory = data.text.trim()
              console.log(`📖 Received complete story (${fullStory.length} chars)`)
            }
          } catch (err) {
            console.error('Error parsing streaming JSON:', err, 'Line:', line.substring(0, 100))
          }
        }
      }
      
      if (!fullStory) {
        console.error('❌ No story text received from streaming response')
        // The body has been consumed, so we can't fallback to JSON parsing
        // This shouldn't happen if backend is working correctly
        throw new Error('No story text received from server (streaming response had no data)')
      }
      
      return {
        text: fullStory,
        chunkIndex: chunkIndex,
        isComplete: true,
      }
    } else {
      // Non-streaming response (or streaming was buffered)
      console.log('📖 Using non-streaming response')
      const data = await response.json()
      console.log('📖 Received non-streaming data:', { 
        hasText: !!data.text, 
        hasStoryText: !!data.storyText,
        textLength: data.text?.length || data.storyText?.length || 0
      })
      const storyText = data.text?.trim() || data.storyText?.trim() || ''
      if (!storyText) {
        throw new Error('No story text received from server (non-streaming response had no data)')
      }
      
      // Even if not streaming, try to send first chunk early for faster TTS start
      // Split the story and send first part immediately
      if (onFirstChunk && storyText.length >= 100) {
        const sentenceEnd = storyText.search(/[.!?]\s+/)
        const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.5 
          ? storyText.substring(0, sentenceEnd + 1).trim()
          : storyText.substring(0, Math.min(200, storyText.length)).trim()
        
        if (firstChunk.length >= 80) {
          console.log(`📖 Sending first chunk early (${firstChunk.length} chars) for faster TTS start`)
          onFirstChunk({
            text: firstChunk,
            chunkIndex: 0,
            isComplete: false,
          })
        }
      }
      
      return {
        text: storyText,
        chunkIndex: data.chunkIndex || chunkIndex,
        isComplete: data.isComplete !== false,
      }
    }
  } catch (error: any) {
    // If it's a network error and we haven't exhausted retries, try again
    if (retryCount < maxRetries && 
        (error.message?.includes('Failed to fetch') || 
         error.message?.includes('NetworkError') ||
         error.message?.includes('Rate limit'))) {
      const waitTime = Math.pow(2, retryCount + 1) * 1000
      console.log(`🟡 Network/rate limit error, retrying in ${waitTime}ms (frontend retry ${retryCount + 1}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      return generateStoryChunk(storyType, childName, chunkIndex, retryCount + 1, apiKey, onFirstChunk)
    }
    throw error
  }
}

/**
 * Generates story progressively (optimized for speed)
 * Generates full story quickly, then splits for progressive display
 */
export async function generateStoryProgressive(
  storyType: StoryType,
  childName: string,
  onChunkGenerated: (chunk: StoryChunk) => void,
  apiKey?: string
): Promise<string> {
  try {
    console.log('🟡 Starting story generation (optimized with streaming)...')
    
    let firstChunkNotified = false
    
    // Generate full story with streaming - first chunk will trigger TTS early
    const fullChunk = await generateStoryChunk(storyType, childName, 0, 0, apiKey, (firstChunk) => {
      // First chunk received - notify immediately for early TTS start (only once)
      if (!firstChunkNotified && firstChunk.text.length >= 150) {
        firstChunkNotified = true
        onChunkGenerated(firstChunk)
      }
    })
    const fullStory = fullChunk.text
    
    // Split story into two "pages" for progressive display
    const storyLength = fullStory.length
    const midpoint = Math.floor(storyLength / 2)
    
    // Try to find a good split point (sentence boundary)
    let splitPoint = midpoint
    const sentences = fullStory.match(/[.!?]+\s+/g)
    if (sentences) {
      let currentPos = 0
      for (const sentence of sentences) {
        const sentenceEnd = fullStory.indexOf(sentence, currentPos) + sentence.length
        if (sentenceEnd >= midpoint && sentenceEnd < storyLength * 0.7) {
          splitPoint = sentenceEnd
          break
        }
        currentPos = sentenceEnd
      }
    }
    
    // Create two "chunks" for progressive display
    const firstChunkText = fullStory.substring(0, splitPoint).trim()
    const secondChunkText = fullStory.substring(splitPoint).trim()
    
    // Notify about first chunk immediately (for early TTS start)
    if (firstChunkText) {
      onChunkGenerated({
        text: firstChunkText,
        chunkIndex: 0,
        isComplete: false
      })
    }
    
    // Small delay to simulate progressive generation
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Notify about second chunk
    if (secondChunkText) {
      onChunkGenerated({
        text: secondChunkText,
        chunkIndex: 1,
        isComplete: true
      })
    }
    
    console.log('🟡 Full story generated, length:', fullStory.length)
    
    return fullStory
  } catch (error: any) {
    console.error('Error calling story generation API:', error)
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new Error('Cannot connect to the server. Make sure the backend server is running on port 3001.')
    }
    
    if (error instanceof Error) {
      throw error
    }
    
    throw new Error(`Failed to generate story: ${error?.toString() || 'Unknown error'}`)
  }
}

/**
 * Legacy function for backwards compatibility - generates full story at once
 */
export async function generateStory(storyType: StoryType, childName: string): Promise<string> {
  // Use progressive generation but wait for full story
  let fullStory = ''
  await generateStoryProgressive(storyType, childName, (chunk) => {
    if (chunk.chunkIndex === 0) {
      fullStory = chunk.text
    } else {
      fullStory = `${fullStory}\n\n${chunk.text}`.trim()
    }
  })
  return fullStory
}

/**
 * Generates a Year in Review story based on questionnaire answers
 */
export async function generateYearInReview(
  answers: {
    favoriteMemory: string
    newThing: string
    lookingForward: string
  },
  onChunkGenerated: (chunk: StoryChunk) => void,
  apiKey?: string,
  name?: string
): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-year-review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name || 'You',
        favoriteMemory: answers.favoriteMemory,
        newThing: answers.newThing,
        lookingForward: answers.lookingForward,
        apiKey,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    // Parse streaming response (same pattern as generateStoryChunk)
    const transferEncoding = response.headers.get('transfer-encoding')
    const contentType = response.headers.get('content-type')
    const hasChunkedEncoding = transferEncoding === 'chunked'
    const shouldTryStreaming = response.body && (hasChunkedEncoding || contentType?.includes('application/json'))
    
    if (shouldTryStreaming) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullStory = ''
      let firstChunkReceived = false
      
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (!line.trim()) continue
          
          try {
            const data = JSON.parse(line)
            
            if (data.isFirst && !firstChunkReceived && data.text) {
              onChunkGenerated({
                text: data.text.trim(),
                chunkIndex: data.chunkIndex || 0,
                isComplete: data.isComplete || false,
              })
              firstChunkReceived = true
            }
            
            if (data.text) {
              fullStory = data.text.trim()
            }
            
            if (data.isComplete && data.text) {
              fullStory = data.text.trim()
            }
          } catch (err) {
            console.error('Error parsing streaming JSON:', err)
          }
        }
      }
      
      if (!fullStory) {
        throw new Error('No story text received from server')
      }
      
      return fullStory
    } else {
      const data = await response.json()
      const storyText = data.text?.trim() || data.storyText?.trim() || ''
      if (!storyText) {
        throw new Error('No story text received from server')
      }
      
      if (onChunkGenerated && storyText.length >= 100) {
        const sentenceEnd = storyText.search(/[.!?]\s+/)
        const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.5 
          ? storyText.substring(0, sentenceEnd + 1).trim()
          : storyText.substring(0, Math.min(200, storyText.length)).trim()
        
        if (firstChunk.length >= 80) {
          onChunkGenerated({
            text: firstChunk,
            chunkIndex: 0,
            isComplete: false,
          })
        }
      }
      
      return storyText
    }
  } catch (error: any) {
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new Error('Cannot connect to the server. Make sure the backend server is running on port 3001.')
    }
    throw error
  }
}

/**
 * Generates a Wish List based on questionnaire answers
 */
export async function generateWishList(
  answers: {
    dreamGift: string
    experience: string
    practicalNeed: string
  },
  onChunkGenerated: (chunk: StoryChunk) => void,
  apiKey?: string,
  name?: string
): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-wish-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name || 'You',
        dreamGift: answers.dreamGift,
        experience: answers.experience,
        practicalNeed: answers.practicalNeed,
        apiKey,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    // Parse streaming response (same pattern as generateStoryChunk)
    const transferEncoding = response.headers.get('transfer-encoding')
    const contentType = response.headers.get('content-type')
    const hasChunkedEncoding = transferEncoding === 'chunked'
    const shouldTryStreaming = response.body && (hasChunkedEncoding || contentType?.includes('application/json'))
    
    if (shouldTryStreaming) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullList = ''
      let firstChunkReceived = false
      
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (!line.trim()) continue
          
          try {
            const data = JSON.parse(line)
            
            if (data.isFirst && !firstChunkReceived && data.text) {
              onChunkGenerated({
                text: data.text.trim(),
                chunkIndex: data.chunkIndex || 0,
                isComplete: data.isComplete || false,
              })
              firstChunkReceived = true
            }
            
            if (data.text) {
              fullList = data.text.trim()
            }
            
            if (data.isComplete && data.text) {
              fullList = data.text.trim()
            }
          } catch (err) {
            console.error('Error parsing streaming JSON:', err)
          }
        }
      }
      
      if (!fullList) {
        throw new Error('No wish list text received from server')
      }
      
      return fullList
    } else {
      const data = await response.json()
      const listText = data.text?.trim() || data.listText?.trim() || ''
      if (!listText) {
        throw new Error('No wish list text received from server')
      }
      
      if (onChunkGenerated && listText.length >= 100) {
        const sentenceEnd = listText.search(/[.!?]\s+/)
        const firstChunk = sentenceEnd > 0 && sentenceEnd < listText.length * 0.5 
          ? listText.substring(0, sentenceEnd + 1).trim()
          : listText.substring(0, Math.min(200, listText.length)).trim()
        
        if (firstChunk.length >= 80) {
          onChunkGenerated({
            text: firstChunk,
            chunkIndex: 0,
            isComplete: false,
          })
        }
      }
      
      return listText
    }
  } catch (error: any) {
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new Error('Cannot connect to the server. Make sure the backend server is running on port 3001.')
    }
    throw error
  }
}

