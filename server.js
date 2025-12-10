import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createGraph, createTTSOnlyGraph, createTextOnlyGraph, createYearInReviewGraph, createWishListGraph } from './graph.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const wavEncoder = require('wav-encoder')

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
// CORS configuration - allow requests from Vercel frontend
app.use(cors({
  origin: [
    'https://christmas-personalized-storyteller.vercel.app',
    'https://christmas-personalized-storyteller-gjgi38e7e.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' })) // Increase limit for audio uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// In-memory storage for shared stories (in production, use a database)
const sharedStories = new Map()

// Inworld Voice Clone API endpoint
app.post('/api/clone-voice', async (req, res) => {
  try {
    const { audioData, displayName, transcription, langCode = 'EN_US' } = req.body

    if (!audioData) {
      return res.status(400).json({ 
        error: 'Missing required field: audioData (base64-encoded audio)' 
      })
    }

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ 
        error: 'Missing required field: displayName' 
      })
    }

    // Use Portal API key for voice cloning, or fall back to standard API key if Portal key not set
    // If Unleash flags are enabled for the workspace, the standard API key may work
    const portalApiKey = process.env.INWORLD_PORTAL_API_KEY || process.env.INWORLD_API_KEY
    if (!portalApiKey) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_PORTAL_API_KEY or INWORLD_API_KEY not set. Voice cloning requires an API key with Portal access.' 
      })
    }
    
    const usingStandardKey = !process.env.INWORLD_PORTAL_API_KEY && process.env.INWORLD_API_KEY
    if (usingStandardKey) {
      console.log('⚠️ Using INWORLD_API_KEY for voice cloning (Portal key not set). Ensure Unleash flags are enabled for Portal API access.')
    }

    // Use the christmas_story_generator workspace
    const workspace = 'christmas_story_generator'
    const parent = `workspaces/${workspace}`

    console.log(`🎤 Voice clone request - Display name: "${displayName}", Lang: ${langCode}, Workspace: ${workspace}`)

    // Call Inworld Voice Clone API
    const cloneResponse = await fetch(`https://api.inworld.ai/voices/v1/${parent}/voices:clone`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${portalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: displayName.trim(),
        langCode: langCode,
        voiceSamples: [
          {
            audioData: audioData, // Already base64-encoded from frontend
            transcription: transcription || undefined,
          }
        ],
        audioProcessingConfig: {
          removeBackgroundNoise: false,
        },
      }),
    })

    if (!cloneResponse.ok) {
      const errorData = await cloneResponse.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || errorData.message || `HTTP ${cloneResponse.status}: ${cloneResponse.statusText}`
      
      console.error(`❌ Voice clone failed: ${errorMessage}`)
      
      if (cloneResponse.status === 401) {
        return res.status(401).json({ 
          error: 'Invalid Portal API key. Please check INWORLD_PORTAL_API_KEY in server configuration.' 
        })
      } else if (cloneResponse.status === 403) {
        return res.status(403).json({ 
          error: 'Access denied. Voice cloning requires preview access. Please contact support@inworld.ai.' 
        })
      } else {
        return res.status(cloneResponse.status).json({ 
          error: `Voice cloning failed: ${errorMessage}` 
        })
      }
    }

    const cloneData = await cloneResponse.json()
    
    console.log(`✅ Voice cloned successfully - Voice ID: ${cloneData.voice?.voiceId}, Name: ${cloneData.voice?.name}`)

    // Return the voiceId and validation results
    res.json({
      voiceId: cloneData.voice?.voiceId,
      voiceName: cloneData.voice?.name,
      displayName: cloneData.voice?.displayName,
      warnings: cloneData.audioSamplesValidated?.[0]?.warnings || [],
      errors: cloneData.audioSamplesValidated?.[0]?.errors || [],
      transcription: cloneData.audioSamplesValidated?.[0]?.transcription,
    })

  } catch (error) {
    console.error('❌ Error cloning voice:', error)
    res.status(500).json({ 
      error: `Server error: ${error.message || 'Failed to clone voice'}. Make sure the backend server is running and INWORLD_PORTAL_API_KEY is set.` 
    })
  }
})

// Inworld TTS endpoint using Runtime (for progressive chunks)
app.post('/api/tts', async (req, res) => {
  // Declare variables outside try block so they're accessible in catch
  let selectedVoiceId = null
  
  try {
    const { text, voiceId, apiKey } = req.body

    if (!text) {
      return res.status(400).json({ 
        error: 'Missing required field: text' 
      })
    }

    // Use custom API key if provided, otherwise use server's default
    const selectedApiKey = apiKey || process.env.INWORLD_API_KEY
    if (!selectedApiKey) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set and no custom API key provided' 
      })
    }

    // Use voice ID from request, env variable, or default to female voice
    selectedVoiceId = voiceId || process.env.INWORLD_VOICE_ID || 'Wendy'

    // Log the request details for debugging
    const ttsStartTime = Date.now()
    console.log(`🎵 Runtime TTS request - Request voiceId: "${voiceId}", Selected: "${selectedVoiceId}", Text length: ${text.length}, Using ${apiKey ? 'custom' : 'default'} API key`)
    console.log(`🎵 Voice ID details - Full: "${selectedVoiceId}", Length: ${selectedVoiceId.length}`)

    // Create TTS-only graph with the selected voice ID (Text → TTS, no TextChunking for speed)
    const graphCreateStart = Date.now()
    const graph = createTTSOnlyGraph(selectedApiKey, selectedVoiceId)
    console.log(`⏱️ TTS Graph created in ${Date.now() - graphCreateStart}ms`)

    // Execute the Runtime graph with text input
    const graphStartTime = Date.now()
    const { outputStream } = await graph.start(text)
    console.log(`⏱️ TTS Graph started in ${Date.now() - graphStartTime}ms`)

    // Progressive WAV chunking - encode and stream chunks as they're ready
    const SAMPLE_RATE = 24000 // Audio sample rate from Inworld
    const CHUNK_DURATION_SECONDS = 5.0 // Encode chunks every 5 seconds (reduced chunk count, less mid-sentence cuts)
    const SAMPLES_PER_CHUNK = Math.floor(SAMPLE_RATE * CHUNK_DURATION_SECONDS)
    
    res.setHeader('Content-Type', 'application/json') // Send JSON array of WAV chunks
    res.setHeader('Transfer-Encoding', 'chunked')
    
    let currentSamples = []
    let totalSamples = 0
    let firstChunkTime = null
    let chunkIndex = 0
    
    // Helper to encode and send a WAV chunk
    const encodeAndSendChunk = async (samples) => {
      if (samples.length === 0) return
      
      // Calculate total number of samples first
      const totalSamples = samples.reduce((sum, arr) => sum + arr.length, 0)
      if (totalSamples === 0) return
      
      // Create combined array with correct size
      const combinedSamples = new Float32Array(totalSamples)
      let offset = 0
      for (const sampleArray of samples) {
        combinedSamples.set(sampleArray, offset)
        offset += sampleArray.length
      }
      
      const wavData = {
        sampleRate: SAMPLE_RATE,
        channelData: [combinedSamples]
      }
      
      const wavBuffer = await wavEncoder.encode(wavData)
      const buffer = Buffer.from(wavBuffer)
      
      // Send chunk as base64-encoded WAV
      const chunkData = {
        index: chunkIndex++,
        data: buffer.toString('base64'),
        samples: combinedSamples.length
      }
      
      res.write(JSON.stringify(chunkData) + '\n') // Newline-delimited JSON
      console.log(`🎵 Sent WAV chunk ${chunkData.index}: ${buffer.length} bytes (${combinedSamples.length} samples, ~${(combinedSamples.length / SAMPLE_RATE).toFixed(2)}s)`)
    }

    // Stream audio chunks as they arrive
    let done = false
    while (!done) {
      const result = await outputStream.next()
      
      await result.processResponse({
        TTSOutputStream: async (ttsStream) => {
          // TTS node outputs TTSOutputStream with audio.data (base64 encoded)
          
          for await (const chunk of ttsStream) {
            if (chunk.audio?.data) {
              // Audio data is base64-encoded PCM float32 samples
              const base64Data = chunk.audio.data
              const audioBuffer = Buffer.from(base64Data, 'base64')
              
              if (audioBuffer.length > 0) {
                if (firstChunkTime === null) {
                  firstChunkTime = Date.now()
                  console.log(`⏱️ First audio chunk received in ${firstChunkTime - ttsStartTime}ms`)
                }
                
                // Convert buffer to Float32Array (4 bytes per float32 sample)
                const sampleCount = Math.floor(audioBuffer.length / 4)
                if (sampleCount > 0) {
                  // Create a properly aligned Float32Array
                  const float32Samples = new Float32Array(sampleCount)
                  const dataView = new DataView(audioBuffer.buffer, audioBuffer.byteOffset, sampleCount * 4)
                  for (let i = 0; i < sampleCount; i++) {
                    float32Samples[i] = dataView.getFloat32(i * 4, true) // little-endian
                  }
                  
                  // Add to current chunk
                  currentSamples.push(float32Samples)
                  totalSamples += float32Samples.length
                  
                  // Check if we have enough samples for a chunk
                  const currentChunkSamples = currentSamples.reduce((sum, arr) => sum + arr.length, 0)
                  if (currentChunkSamples >= SAMPLES_PER_CHUNK) {
                    // Encode and send this chunk
                    await encodeAndSendChunk(currentSamples)
                    currentSamples = []
                  }
                }
              }
            }
            if (chunk.text) {
              // Log text for debugging (optional)
              console.log(`📝 TTS text: ${chunk.text.substring(0, 50)}...`)
            }
          }
          
          if (firstChunkTime) {
            console.log(`⏱️ Total TTS time: ${Date.now() - ttsStartTime}ms, First chunk: ${firstChunkTime - ttsStartTime}ms`)
          }
        },
        AudioStream: async (audioStream) => {
          // Fallback: handle AudioStream if TTSOutputStream doesn't work
          for await (const audioChunk of audioStream) {
            if (audioChunk.data) {
              const audioData = audioChunk.data
              let audioBuffer
              
              if (Array.isArray(audioData)) {
                audioBuffer = Buffer.from(audioData)
              } else if (typeof audioData === 'string') {
                // If it's base64 encoded
                audioBuffer = Buffer.from(audioData, 'base64')
              } else if (Buffer.isBuffer(audioData)) {
                audioBuffer = audioData
              } else {
                // Try to convert to buffer
                audioBuffer = Buffer.from(audioData)
              }
              
              if (audioBuffer && audioBuffer.length > 0) {
                res.write(audioBuffer)
                console.log(`🎵 Sent audio chunk (AudioStream): ${audioBuffer.length} bytes`)
              }
            }
          }
        },
        TextStream: async (textStream) => {
          // Text chunks from TextChunkingNode (shouldn't happen in TTS-only, but handle it)
          console.log('📝 Received text stream in TTS endpoint (unexpected)')
          for await (const textChunk of textStream) {
            console.log('Text chunk:', textChunk.text?.substring(0, 50))
          }
        },
        default: (data) => {
          // Handle other data types
          console.log('Received non-audio data:', typeof data, Object.keys(data || {}))
        },
      })

      done = result.done
    }

    // Clean up
    await graph.stop()
    
    // Send any remaining samples as final chunk
    if (currentSamples.length > 0) {
      await encodeAndSendChunk(currentSamples)
    }
    
    // Send end marker
    res.write(JSON.stringify({ index: -1, end: true }) + '\n')
    res.end()
    
    console.log(`✅ Sent ${chunkIndex} WAV chunks (${totalSamples} total samples, ~${(totalSamples / SAMPLE_RATE).toFixed(2)}s)`)

  } catch (error) {
    console.error('❌ Error generating TTS with Runtime:', error)
    console.error('Error stack:', error.stack)
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      cause: error.cause,
    })
    
    const voiceIdUsed = selectedVoiceId || 'unknown'
    
    if (!res.headersSent) {
      // Check for specific error types
      if (error.message?.includes('Unknown voice') || error.message?.includes('voice') || error.message?.includes('Voice')) {
        res.status(400).json({ 
          error: `Invalid request: Voice not found: ${error.message}. Please verify that: 1) Your API key has access to this voice, 2) The voice ID is correct, and 3) The voice exists in your Inworld workspace. Voice ID used: "${voiceIdUsed}". This may indicate that custom voice clones may not be available through Inworld Runtime API. Try using a standard Inworld voice (like "Alex") instead of a custom clone.`
        })
      } else if (error.message?.includes('API key') || error.message?.includes('authentication') || error.message?.includes('401')) {
        res.status(401).json({ 
          error: 'Invalid API key. Please check your INWORLD_API_KEY in the server .env file or verify your custom API key is correct.'
        })
      } else {
        res.status(500).json({ 
          error: `Server error: ${error.message || 'Failed to generate TTS'}. Make sure the backend server is running and INWORLD_API_KEY is set.`
        })
      }
    }
  }
})

// Story generation endpoint using Inworld Runtime
app.post('/api/generate-story', async (req, res) => {
  console.log('\n\n📖 ==========================================')
  console.log('📖 STORY GENERATION ENDPOINT CALLED (Inworld Runtime)')
  console.log('📖 ==========================================')
  
  try {
    const { storyType, childName, apiKey } = req.body

    if (!storyType || !childName) {
      return res.status(400).json({ 
        error: 'Missing required fields: storyType and childName' 
      })
    }

    // Use custom API key if provided, otherwise use server's default
    const selectedApiKey = apiKey || process.env.INWORLD_API_KEY
    if (!selectedApiKey) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set and no custom API key provided' 
      })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      })
    }

    const startTime = Date.now()
    console.log(`📖 Generating story for "${childName}" about "${storyType}"`)
    console.log(`📖 Using ${apiKey ? 'custom' : 'default'} API key`)

    // Create text-only graph (LLM only, no TTS)
    const graphCreateTime = Date.now()
    const graph = createTextOnlyGraph(selectedApiKey)
    console.log(`⏱️ Graph created in ${Date.now() - graphCreateTime}ms`)

    // Execute the Inworld Runtime graph
    const { outputStream } = await graph.start({
      childName,
      storyType,
    })
    const graphStartTime = Date.now()
    console.log(`⏱️ Graph started in ${graphStartTime - graphCreateTime}ms`)

    // Always stream for faster TTS start - set headers immediately
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Transfer-Encoding', 'chunked')
    
    let storyText = ''
    let firstChunkSent = false
    let done = false

    // Iterate through execution results using the proper pattern
    while (!done) {
      const result = await outputStream.next()
      
      await result.processResponse({
        ContentStream: async (contentStream) => {
          // Process LLM streaming content
          for await (const chunk of contentStream) {
            if (chunk.text) {
              storyText += chunk.text
              console.log(`📝 Received LLM text chunk: ${chunk.text.substring(0, 50)}...`)
              
              // Send first chunk immediately when we have enough text (first sentence or ~100 chars)
              // This allows TTS to start while the rest of the story is still being generated
              if (!firstChunkSent && storyText.length >= 100) {
                // Try to find a sentence boundary
                const sentenceEnd = storyText.search(/[.!?]\s+/)
                const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.6 
                  ? storyText.substring(0, sentenceEnd + 1).trim()
                  : storyText.substring(0, Math.min(200, storyText.length)).trim()
                
                // Only send if we have a meaningful chunk (at least 80 chars - lower threshold for faster start)
                if (firstChunk.length >= 80) {
                  res.write(JSON.stringify({ 
                    chunkIndex: 0, 
                    text: firstChunk, 
                    isFirst: true,
                    isComplete: false 
                  }) + '\n')
                  firstChunkSent = true
                  console.log(`📖 Sent first chunk from ContentStream (${firstChunk.length} chars) for early TTS start`)
                }
              }
            }
          }
        },
        TextStream: async (textStream) => {
          // Text chunks from TextChunkingNode
          for await (const textChunk of textStream) {
            if (textChunk.text) {
              storyText += textChunk.text
              console.log(`📝 Received text chunk: ${textChunk.text.substring(0, 50)}...`)
            }
          }
        },
        string: (text) => {
          // Final aggregated text - might come all at once
          storyText += text
          console.log(`📝 Received aggregated text: ${text.substring(0, 50)}...`)
          
          // If we haven't sent first chunk yet and we have enough text, send it now
          if (!firstChunkSent && storyText.length >= 100) {
            const sentenceEnd = storyText.search(/[.!?]\s+/)
            const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.6 
              ? storyText.substring(0, sentenceEnd + 1).trim()
              : storyText.substring(0, Math.min(200, storyText.length)).trim()
            
            if (firstChunk.length >= 80) {
              res.write(JSON.stringify({ 
                chunkIndex: 0, 
                text: firstChunk, 
                isFirst: true,
                isComplete: false 
              }) + '\n')
              firstChunkSent = true
              console.log(`📖 Sent first chunk from aggregated text (${firstChunk.length} chars) for early TTS start`)
            }
          }
        },
        AudioStream: async (audioStream) => {
          // Audio chunks - shouldn't happen in text-only graph, but handle it
          console.log('🎵 Received audio chunk (unexpected in text-only graph)')
        },
        default: (data) => {
          // Handle other data types
          if (data?.text) {
            storyText += data.text
            console.log(`📝 Received text: ${data.text.substring(0, 50)}...`)
          } else {
            console.log('Received unknown data type:', typeof data, Object.keys(data || {}))
          }
        },
      })

      done = result.done
    }

    // Clean up
    await graph.stop()

    if (!storyText || storyText.trim().length === 0) {
      console.error('❌ No story text generated from Runtime')
      return res.status(500).json({ error: 'No story generated from Runtime' })
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime
    console.log(`✅ Generated story (first 200 chars): ${storyText.substring(0, 200)}...`)
    console.log(`Story mentions "${storyType}": ${storyText.toLowerCase().includes(storyType.toLowerCase())}`)
    console.log(`⏱️ Total story generation time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`)

    // Always send final chunk (we're always streaming now)
    if (firstChunkSent) {
      // Send remaining text (everything after the first chunk) as final chunk
      // Find where the first chunk ended in the full story
      const firstChunkEnd = storyText.search(/[.!?]\s+/)
      const firstChunkLength = firstChunkEnd > 0 && firstChunkEnd < storyText.length * 0.6 
        ? firstChunkEnd + 1
        : Math.min(200, storyText.length)
      
      const remainingText = storyText.substring(firstChunkLength).trim()
      if (remainingText) {
        res.write(JSON.stringify({ 
          chunkIndex: 1, 
          text: storyText.trim(), // Send full story for second chunk (frontend will handle splitting)
          isFirst: false,
          isComplete: true 
        }) + '\n')
      } else {
        // No remaining text, just mark as complete
        res.write(JSON.stringify({ 
          chunkIndex: 1, 
          text: '', 
          isFirst: false,
          isComplete: true 
        }) + '\n')
      }
    } else {
      // If we never sent first chunk (story was too short), send full story but mark as first chunk
      // Try to send a partial chunk anyway for early TTS start
      if (storyText.length >= 100) {
        const sentenceEnd = storyText.search(/[.!?]\s+/)
        const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.6 
          ? storyText.substring(0, sentenceEnd + 1).trim()
          : storyText.substring(0, Math.min(200, storyText.length)).trim()
        
        if (firstChunk.length >= 80) {
          res.write(JSON.stringify({ 
            chunkIndex: 0, 
            text: firstChunk, 
            isFirst: true,
            isComplete: false 
          }) + '\n')
          firstChunkSent = true
          // Then send full story as second chunk
          res.write(JSON.stringify({ 
            chunkIndex: 1, 
            text: storyText.trim(), 
            isFirst: false,
            isComplete: true 
          }) + '\n')
        } else {
          // Too short, just send full story
          res.write(JSON.stringify({ 
            chunkIndex: 0, 
            text: storyText.trim(), 
            isFirst: true,
            isComplete: true 
          }) + '\n')
        }
      } else {
        // Story too short, just send it
        res.write(JSON.stringify({ 
          chunkIndex: 0, 
          text: storyText.trim(), 
          isFirst: true,
          isComplete: true 
        }) + '\n')
      }
    }
    res.end()
  } catch (error) {
    console.error('❌ Error generating story with Inworld Runtime:', error)
    
    let statusCode = 500
    let errorMessage = 'Failed to generate story'

    // Check for authorization/authentication errors
    if (error.message?.includes('Invalid authorization') || 
        error.message?.includes('authorization credentials') ||
        error.message?.includes('API key') || 
        error.message?.includes('authentication') ||
        error.message?.includes('401')) {
      statusCode = 401
      // Check if this is a custom API key (from request body)
      if (req.body?.apiKey) {
        errorMessage = 'Invalid authorization credentials. Please double-check your Inworld API Key. Make sure it\'s the correct Base64-encoded key copied from your Inworld workspace (API Keys → Copy the "Basic (Base64) key").'
      } else {
        errorMessage = 'Invalid API key. Please check your GOOGLE_API_KEY and INWORLD_API_KEY in the .env file.'
      }
    } else if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
      statusCode = 429
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
    } else if (error.message) {
      errorMessage = error.message
    }

    res.status(statusCode).json({ error: errorMessage })
  }
})

// Conversational question endpoint - generates a conversational question using LLM
app.post('/api/conversational-question', async (req, res) => {
  console.log('\n\n💬 ==========================================')
  console.log('💬 CONVERSATIONAL QUESTION ENDPOINT CALLED')
  console.log('💬 ==========================================')
  
  try {
    const { questionPrompt, conversationHistory } = req.body

    if (!questionPrompt) {
      return res.status(400).json({ 
        error: 'Missing required field: questionPrompt' 
      })
    }

    if (!process.env.INWORLD_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set' 
      })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      })
    }

    const { createTextOnlyGraph } = require('./graph.js')
    const graph = createTextOnlyGraph(process.env.INWORLD_API_KEY)

    // Build conversation context
    let conversationContext = ''
    if (conversationHistory && conversationHistory.length > 0) {
      conversationContext = '\n\nPrevious conversation:\n'
      conversationHistory.forEach((item, index) => {
        conversationContext += `${index + 1}. Question: ${item.question}\n   Answer: ${item.answer}\n\n`
      })
    }

    const userPrompt = `You are a warm, friendly AI assistant conducting a conversational interview. ${questionPrompt}

${conversationContext}

Generate a single, natural, conversational question that asks about this topic. Make it sound like a friendly conversation, not a formal interview. Keep it to one sentence. Do not include any prefixes like "Question:" or numbering. Just return the question itself.`

    const { outputStream } = await graph.start(userPrompt)

    let questionText = ''
    let done = false

    while (!done) {
      const result = await outputStream.next()
      
      await result.processResponse({
        ContentStream: async (contentStream) => {
          for await (const chunk of contentStream) {
            if (chunk.text) {
              questionText += chunk.text
            }
          }
        },
        default: (data) => {
          if (data?.text) {
            questionText += data.text
          }
        },
      })

      done = result.done
    }

    await graph.stop()

    if (!questionText || questionText.trim().length === 0) {
      return res.status(500).json({ error: 'No question generated' })
    }

    // Clean up the question text (remove any prefixes, extra whitespace)
    const cleanQuestion = questionText.trim().replace(/^(Question:\s*|Q:\s*|\d+\.\s*)/i, '').trim()

    console.log(`✅ Generated conversational question: ${cleanQuestion}`)

    return res.status(200).json({ question: cleanQuestion })
  } catch (error) {
    console.error('❌ Error generating conversational question:', error)
    const statusCode = error.statusCode || 500
    let errorMessage = 'Internal server error'
    
    if (error.message) {
      errorMessage = error.message
    }

    res.status(statusCode).json({ error: errorMessage })
  }
})

// Conversational chat endpoint - maintains conversation state and handles back-and-forth dialogue
app.post('/api/conversational-chat', async (req, res) => {
  console.log('\n\n💬 ==========================================')
  console.log('💬 CONVERSATIONAL CHAT ENDPOINT CALLED')
  console.log('💬 ==========================================')
  
  try {
    const { 
      experienceType, 
      userMessage, 
      conversationHistory = [],
      answeredQuestions = {}
    } = req.body

    if (!experienceType) {
      return res.status(400).json({ 
        error: 'Missing required field: experienceType' 
      })
    }

    if (!process.env.INWORLD_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set' 
      })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      })
    }

    // Create a custom graph for conversational chat
    const {
      RemoteLLMChatNode,
      SequentialGraphBuilder,
    } = require('@inworld/runtime/graph');

    const graphBuilder = new SequentialGraphBuilder({
      id: 'conversational-chat',
      apiKey: process.env.INWORLD_API_KEY,
      enableRemoteConfig: false,
      nodes: [
        new RemoteLLMChatNode({
          provider: 'google',
          modelName: 'gemini-2.5-flash-lite',
          stream: true,
          messageTemplates: [
            {
              role: 'system',
              content: {
                type: 'template',
                template: '{{systemPrompt}}',
              },
            },
            {
              role: 'user',
              content: {
                type: 'template',
                template: '{{userMessage}}',
              },
            },
          ],
        }),
      ],
    });

    const graph = graphBuilder.build()

    // Define the questions based on experience type
    const questions = experienceType === 'year-review'
      ? [
          { key: 'favoriteMemory', question: "What was your favorite memory or adventure from 2025?" },
          { key: 'newThing', question: "What's something new you tried or learned in 2025?" },
          { key: 'lookingForward', question: "What are you most looking forward to or hoping for in 2026?" }
        ]
      : experienceType === 'greeting-card'
      ? [
          { key: 'specialAboutThem', question: "What's something special about them that you love?" },
          { key: 'funnyStory', question: "What's something funny about them or a story that you love to joke with them about?" }
        ]
      : [
          { key: 'dreamGift', question: "What's the one gift you've been thinking about all year?" },
          { key: 'experience', question: "Is there something you'd love to experience rather than receive? (like a trip, concert, or special dinner)" },
          { key: 'practicalNeed', question: "What's something practical you actually need but wouldn't buy for yourself?" }
        ]

    // Build conversation context
    let conversationContext = ''
    if (conversationHistory && conversationHistory.length > 0) {
      conversationContext = '\n\nConversation so far:\n'
      conversationHistory.forEach((item, index) => {
        conversationContext += `${index + 1}. ${item.role === 'assistant' ? 'You' : 'User'}: ${item.content}\n`
      })
    }

    // Build answered questions context
    let answeredContext = ''
    const answeredKeys = Object.keys(answeredQuestions)
    if (answeredKeys.length > 0) {
      answeredContext = '\n\nQuestions already answered:\n'
      answeredKeys.forEach(key => {
        const question = questions.find(q => q.key === key)
        if (question) {
          answeredContext += `- ${question.question}: ${answeredQuestions[key]}\n`
        }
      })
    }

    // Determine which questions still need to be answered
    const remainingQuestions = questions.filter(q => !answeredQuestions[q.key])
    const nextQuestion = remainingQuestions[0]

    // Determine the experience name for the prompt
    const experienceName = experienceType === 'year-review' ? 'Year In Review' : 'Christmas Wish List'

    // Check which questions have already been ASKED (not just answered) in conversation history
    const askedQuestions = new Set()
    if (conversationHistory && conversationHistory.length > 0) {
      questions.forEach(q => {
        // Check if this question appears in any assistant message
        const questionAsked = conversationHistory.some(msg => {
          if (msg.role === 'assistant') {
            const msgLower = msg.content.toLowerCase()
            const questionStart = q.question.substring(0, 30).toLowerCase()
            // Check if the question text appears in the assistant message
            if (msgLower.includes(questionStart)) {
              // Make sure it's not matching another question
              const otherQuestions = questions.filter(otherQ => otherQ.key !== q.key)
              return !otherQuestions.some(otherQ => msgLower.includes(otherQ.question.substring(0, 20).toLowerCase()))
            }
          }
          return false
        })
        if (questionAsked) {
          askedQuestions.add(q.key)
        }
      })
    }

    // Build explicit list of questions that have been asked
    const askedQuestionsList = Array.from(askedQuestions).map(key => {
      const q = questions.find(q => q.key === key)
      return q ? q.question : null
    }).filter(Boolean)

    // Build system prompt
    const systemPrompt = `You are Olivia - a genuine, curious, and empathetic person who loves hearing people's stories. You're not a chatbot or assistant - you're a real person having a friendly chat. Think of yourself as that warm friend who asks great questions and actually listens.

Your personality:
- You're genuinely curious about people and their experiences
- You react naturally to what they share (show excitement, interest, empathy)
- You use casual, natural language - like you're texting a friend
- You're warm but not overly formal or robotic
- You might use phrases like "Oh, that sounds amazing!" or "I love that!" or "Tell me more about that!"
- You're conversational, not interrogative - this is a chat, not an interview

Your goal is to naturally learn about three things through friendly conversation:
${questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}

IMPORTANT CONVERSATION FLOW RULES:
- You can ask ONE follow-up question per topic maximum - then move on
- If someone gives a detailed answer (especially preset options like "laptop", "concert", "shoes"), that's complete - skip the follow-up and move to the next topic
- NEVER repeat a question that's already been asked - check the list below
- If you've already asked a follow-up about something, immediately move to the next topic

${askedQuestionsList.length > 0 ? `\nQuestions already asked (don't ask these again):\n${askedQuestionsList.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n` : ''}

HOW TO BE MORE HUMAN:
- React authentically to what they share - show real interest
- Use natural transitions like "Oh cool!" or "That's awesome!" or "I love hearing about that"
- Keep it short and sweet - 1-2 sentences usually
- Sound like you're genuinely interested, not just collecting data
- If they give a brief answer, you can ask ONE gentle follow-up to learn more, then move on
- If they ask you something, answer naturally like a friend would, then continue
- Use casual language - contractions, natural phrases, real reactions
- Don't sound scripted or robotic - be spontaneous and genuine

${nextQuestion ? `\nNext thing to ask about: "${nextQuestion.question}"\n\nRemember: If you've already asked this question (check the list above), don't ask it again - move to the next topic instead.` : '\nAll questions answered! Wrap up warmly.\n'}

${answeredContext}

${conversationContext}

Final note: Be yourself - warm, curious, and genuinely interested. This should feel like chatting with a friend, not filling out a form. If you've already asked a question, don't repeat it. Move forward naturally.

If all three questions have been answered, wrap up warmly and say: "Thank you so much for sharing! I'll take your answers and create your ${experienceName} now." Make sure to include the exact phrase "I'll take your answers and create your ${experienceName} now" in your closing message.`

    // For the first message, use a default greeting prompt
    const userPrompt = userMessage || "Hello, let's start the conversation!"

    console.log(`💬 Starting conversation with userMessage: "${userPrompt}"`)
    console.log(`💬 System prompt length: ${systemPrompt.length}`)
    console.log(`💬 Conversation history length: ${conversationHistory.length}`)

    const { outputStream } = await graph.start({
      systemPrompt: systemPrompt,
      userMessage: userPrompt
    })

    let responseText = ''
    let done = false
    let hasContent = false

    while (!done) {
      const result = await outputStream.next()
      
      await result.processResponse({
        ContentStream: async (contentStream) => {
          hasContent = true
          for await (const chunk of contentStream) {
            if (chunk.text) {
              responseText += chunk.text
              console.log(`💬 Received text chunk: ${chunk.text.substring(0, 50)}...`)
            }
          }
        },
        Content: (content) => {
          hasContent = true
          if (content.content) {
            responseText += content.content
            console.log(`💬 Received content: ${content.content.substring(0, 50)}...`)
          }
        },
        default: (data) => {
          if (data?.text) {
            hasContent = true
            responseText += data.text
            console.log(`💬 Received default text: ${data.text.substring(0, 50)}...`)
          } else if (typeof data === 'string') {
            hasContent = true
            responseText += data
            console.log(`💬 Received string: ${data.substring(0, 50)}...`)
          } else {
            console.log(`💬 Received unknown data type:`, typeof data, data)
          }
        },
        error: (error) => {
          console.error('❌ Graph error:', error)
          throw error
        }
      })

      done = result.done
    }

    await graph.stop()

    console.log(`💬 Final response text length: ${responseText.length}`)
    console.log(`💬 Has content: ${hasContent}`)

    if (!hasContent || !responseText || responseText.trim().length === 0) {
      console.error('❌ No response generated from graph')
      return res.status(500).json({ error: 'No response generated from AI' })
    }

    const cleanResponse = responseText.trim()

    // Determine if a question was answered based on the conversation flow
    // More sophisticated detection: check if we have enough information about the current topic
    let detectedAnswer = null
    let detectedQuestionKey = null
    
    if (userMessage && userMessage.trim().length > 10 && nextQuestion) {
      const responseLower = cleanResponse.toLowerCase()
      const userMessageLower = userMessage.toLowerCase()
      
      // Check if AI is asking a follow-up about the SAME topic (not moving on)
      const isFollowUp = responseLower.includes('what was') || 
                        responseLower.includes('tell me more') ||
                        responseLower.includes('can you tell me') ||
                        responseLower.includes('what made') ||
                        responseLower.includes('specific') ||
                        responseLower.includes('particular') ||
                        (responseLower.includes('?') && !responseLower.includes('next') && !responseLower.includes('another'))
      
      // Check if AI is moving to the next topic - be more aggressive in detection
      const movesToNext = responseLower.includes('next') ||
                          responseLower.includes('another') ||
                          responseLower.includes('also') ||
                          responseLower.includes('what\'s something new') ||
                          responseLower.includes('what are you looking forward') ||
                          responseLower.includes('anything new') ||
                          responseLower.includes('something new') ||
                          responseLower.includes('tried or learned') ||
                          responseLower.includes('looking forward') ||
                          responseLower.includes('hoping for') ||
                          responseLower.includes('one gift') ||
                          responseLower.includes('something you\'d love') ||
                          responseLower.includes('something practical') ||
                          (answeredKeys.length > 0 && !isFollowUp && !responseLower.includes('?'))
      
      // Check if AI is acknowledging and wrapping up the current topic
      const acknowledgesAndWraps = (responseLower.includes('thank') || 
                                    responseLower.includes('great') ||
                                    responseLower.includes('wonderful') ||
                                    responseLower.includes('lovely') ||
                                    responseLower.includes('sounds') ||
                                    responseLower.includes('perfect') ||
                                    responseLower.includes('amazing')) &&
                                   !isFollowUp
      
      // Check if user message looks like a preset option (complete, detailed answer)
      const looksLikePreset = userMessage.length > 20 && 
                              (userMessage.includes('laptop') || 
                               userMessage.includes('tablet') ||
                               userMessage.includes('camera') ||
                               userMessage.includes('subscription') ||
                               userMessage.includes('getaway') ||
                               userMessage.includes('concert') ||
                               userMessage.includes('cooking class') ||
                               userMessage.includes('wine tasting') ||
                               userMessage.includes('shoes') ||
                               userMessage.includes('boots') ||
                               userMessage.includes('coffee maker') ||
                               userMessage.includes('appliance') ||
                               userMessage.includes('organizer'))
      
      // Count user responses about the current topic
      // Find when the current question was first asked
      const questionFirstAskedIndex = conversationHistory.findIndex(msg => 
        msg.role === 'assistant' && 
        msg.content.toLowerCase().includes(nextQuestion.question.substring(0, 20).toLowerCase())
      )
      
      let userResponseCount = 0
      if (questionFirstAskedIndex >= 0) {
        // Count user responses after this question was asked, but before next question
        const nextQuestionIndex = conversationHistory.findIndex((msg, idx) => 
          idx > questionFirstAskedIndex &&
          msg.role === 'assistant' &&
          questions.some(q => q.key !== nextQuestion.key && msg.content.toLowerCase().includes(q.question.substring(0, 20).toLowerCase()))
        )
        
        const endIndex = nextQuestionIndex >= 0 ? nextQuestionIndex : conversationHistory.length
        userResponseCount = conversationHistory
          .slice(questionFirstAskedIndex + 1, endIndex)
          .filter(msg => msg.role === 'user').length
      }
      // Add current response
      userResponseCount += 1
      
      console.log(`🔍 Detection check: userMessage length=${userMessage.length}, looksLikePreset=${looksLikePreset}, movesToNext=${movesToNext}, isFollowUp=${isFollowUp}, userResponseCount=${userResponseCount}, acknowledgesAndWraps=${acknowledgesAndWraps}`)
      
      // More aggressive detection: if AI moves to next question OR user has given 2+ responses OR it looks like a preset, mark as answered
      if (userMessage.length > 10 && (movesToNext || looksLikePreset || (acknowledgesAndWraps && userResponseCount >= 2))) {
        // Determine which question was actually answered
        // CRITICAL: If Olivia moved to the next question, the answer is for the PREVIOUS question
        // Otherwise, find which question was most recently asked
        let questionToAnswer = nextQuestion // Default fallback
        
        if (movesToNext) {
          // Olivia moved to the next question, so the user's answer was for the PREVIOUS question
          // Find which question Olivia just asked in the CURRENT response
          const matchingNewQuestion = questions.find(q => {
            if (answeredQuestions[q.key]) return false // Already answered
            const questionStart = q.question.substring(0, 30).toLowerCase()
            return cleanResponse.toLowerCase().includes(questionStart)
          })
          
          if (matchingNewQuestion) {
            // Find the question that was asked BEFORE this new one
            // Look through all questions to find which one comes before matchingNewQuestion
            const questionIndex = questions.findIndex(q => q.key === matchingNewQuestion.key)
            if (questionIndex > 0) {
              // The previous question in the list
              questionToAnswer = questions[questionIndex - 1]
              console.log(`🔍 AI moved to "${matchingNewQuestion.key}", so answer is for previous question: "${questionToAnswer.key}"`)
            } else {
              // Fallback: look at conversation history to find what was asked before
              questionToAnswer = nextQuestion
              console.log(`🔍 AI moved to "${matchingNewQuestion.key}", using nextQuestion as fallback: "${questionToAnswer.key}"`)
            }
          } else {
            // Couldn't find the new question, use nextQuestion
            questionToAnswer = nextQuestion
            console.log(`🔍 AI moved to next question but couldn't identify it, using nextQuestion: "${questionToAnswer.key}"`)
          }
        } else {
          // Olivia didn't move to next question, so find which question was most recently asked
          // Check the CURRENT response first (it might contain the question)
          const responseLower = cleanResponse.toLowerCase()
          for (const q of questions) {
            if (answeredQuestions[q.key]) continue // Skip already answered questions
            const questionStart = q.question.substring(0, 30).toLowerCase()
            if (responseLower.includes(questionStart)) {
              // Make sure it doesn't match other questions
              const otherQuestions = questions.filter(otherQ => otherQ.key !== q.key)
              const isOtherQuestion = otherQuestions.some(otherQ => 
                responseLower.includes(otherQ.question.substring(0, 20).toLowerCase())
              )
              if (!isOtherQuestion) {
                questionToAnswer = q
                console.log(`🔍 Found question in current response: "${q.key}"`)
                break
              }
            }
          }
          
          // If not found in current response, check conversation history
          if (questionToAnswer === nextQuestion) {
            const recentAssistantMessages = conversationHistory
              .slice()
              .reverse()
              .filter(msg => msg.role === 'assistant')
            
            for (const msg of recentAssistantMessages) {
              const msgLower = msg.content.toLowerCase()
              // Check each question to see if it was asked in this message
              for (const q of questions) {
                if (answeredQuestions[q.key]) continue // Skip already answered questions
                
                const questionStart = q.question.substring(0, 30).toLowerCase()
                if (msgLower.includes(questionStart)) {
                  // Make sure it doesn't match other questions
                  const otherQuestions = questions.filter(otherQ => otherQ.key !== q.key)
                  const isOtherQuestion = otherQuestions.some(otherQ => 
                    msgLower.includes(otherQ.question.substring(0, 20).toLowerCase())
                  )
                  
                  if (!isOtherQuestion) {
                    // This is the question that was most recently asked
                    questionToAnswer = q
                    console.log(`🔍 Found most recently asked question in history: "${q.key}"`)
                    break
                  }
                }
              }
              if (questionToAnswer !== nextQuestion) break // Found it, stop looking
            }
          }
        }
        
        // Collect all user responses about this topic
        const topicResponses = []
        // Find when this specific question was first asked (not just any question)
        const specificQuestionIndex = conversationHistory.findIndex(msg => {
          if (msg.role !== 'assistant') return false
          const msgLower = msg.content.toLowerCase()
          const questionStart = questionToAnswer.question.substring(0, 25).toLowerCase()
          if (msgLower.includes(questionStart)) {
            // Make sure it doesn't match other questions
            const otherQuestions = questions.filter(q => q.key !== questionToAnswer.key)
            return !otherQuestions.some(q => msgLower.includes(q.question.substring(0, 20).toLowerCase()))
          }
          return false
        })
        
        if (specificQuestionIndex >= 0) {
          // Find when the next question was asked (to stop collecting responses)
          const nextQuestionIndex = conversationHistory.findIndex((msg, idx) => 
            idx > specificQuestionIndex &&
            msg.role === 'assistant' &&
            questions.some(q => q.key !== questionToAnswer.key && msg.content.toLowerCase().includes(q.question.substring(0, 20).toLowerCase()))
          )
          const endIndex = nextQuestionIndex >= 0 ? nextQuestionIndex : conversationHistory.length
          conversationHistory
            .slice(specificQuestionIndex + 1, endIndex)
            .filter(msg => msg.role === 'user')
            .forEach(msg => topicResponses.push(msg.content))
        }
        topicResponses.push(userMessage)
        
        detectedAnswer = topicResponses.join(' ')
        detectedQuestionKey = questionToAnswer.key
        console.log(`✅ Detected answer for ${detectedQuestionKey} after ${userResponseCount} responses (movesToNext: ${movesToNext})`)
        console.log(`📝 Answer text: ${detectedAnswer.substring(0, 100)}...`)
      }
    }

    console.log(`✅ Generated conversational response: ${cleanResponse.substring(0, 100)}...`)
    if (detectedAnswer) {
      console.log(`✅ Detected answer for question: ${detectedQuestionKey}`)
    }

    return res.status(200).json({ 
      response: cleanResponse,
      detectedAnswer: detectedAnswer,
      detectedQuestionKey: detectedQuestionKey
    })
  } catch (error) {
    console.error('❌ Error in conversational chat:', error)
    const statusCode = error.statusCode || 500
    let errorMessage = 'Internal server error'
    
    if (error.message) {
      errorMessage = error.message
    }

    res.status(statusCode).json({ error: errorMessage })
  }
})

// Year in Review generation endpoint
app.post('/api/generate-year-review', async (req, res) => {
  console.log('\n\n📝 ==========================================')
  console.log('📝 YEAR IN REVIEW GENERATION ENDPOINT CALLED')
  console.log('📝 ==========================================')
  
  try {
    const { favoriteMemory, newThing, lookingForward, name, apiKey, isCustomVoice } = req.body

    if (!favoriteMemory || !newThing || !lookingForward || !name) {
      return res.status(400).json({ 
        error: 'Missing required fields: favoriteMemory, newThing, lookingForward, name' 
      })
    }

    const selectedApiKey = apiKey || process.env.INWORLD_API_KEY
    if (!selectedApiKey) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set and no custom API key provided' 
      })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      })
    }

    // Determine if custom voice (first person) or preset voice (third person)
    const useCustomVoice = isCustomVoice === true || isCustomVoice === 'true'
    
    const startTime = Date.now()
    console.log(`📝 Generating year in review for ${name}`)
    console.log(`📝 Using ${apiKey ? 'custom' : 'default'} API key`)
    console.log(`📝 Perspective: ${useCustomVoice ? 'First person (custom voice)' : 'Third person (preset voice)'}`)

    const graph = createYearInReviewGraph(selectedApiKey, useCustomVoice)
    const { outputStream } = await graph.start({
      name,
      favoriteMemory,
      newThing,
      lookingForward,
    })

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Transfer-Encoding', 'chunked')
    
    let storyText = ''
    let firstChunkSent = false
    let done = false

    while (!done) {
      const result = await outputStream.next()
      
      await result.processResponse({
        ContentStream: async (contentStream) => {
          for await (const chunk of contentStream) {
            if (chunk.text) {
              storyText += chunk.text
              
              if (!firstChunkSent && storyText.length >= 100) {
                const sentenceEnd = storyText.search(/[.!?]\s+/)
                const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.6 
                  ? storyText.substring(0, sentenceEnd + 1).trim()
                  : storyText.substring(0, Math.min(200, storyText.length)).trim()
                
                if (firstChunk.length >= 80) {
                  res.write(JSON.stringify({ 
                    chunkIndex: 0, 
                    text: firstChunk, 
                    isFirst: true,
                    isComplete: false 
                  }) + '\n')
                  firstChunkSent = true
                }
              }
            }
          }
        },
        default: (data) => {
          if (data?.text) {
            storyText += data.text
          }
        },
      })

      done = result.done
    }

    await graph.stop()

    if (!storyText || storyText.trim().length === 0) {
      return res.status(500).json({ error: 'No story generated' })
    }

    if (firstChunkSent) {
      res.write(JSON.stringify({ 
        chunkIndex: 1, 
        text: storyText.trim(),
        isFirst: false,
        isComplete: true 
      }) + '\n')
    } else {
      if (storyText.length >= 100) {
        const sentenceEnd = storyText.search(/[.!?]\s+/)
        const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.6 
          ? storyText.substring(0, sentenceEnd + 1).trim()
          : storyText.substring(0, Math.min(200, storyText.length)).trim()
        
        if (firstChunk.length >= 80) {
          res.write(JSON.stringify({ 
            chunkIndex: 0, 
            text: firstChunk, 
            isFirst: true,
            isComplete: false 
          }) + '\n')
          res.write(JSON.stringify({ 
            chunkIndex: 1, 
            text: storyText.trim(),
            isFirst: false,
            isComplete: true 
          }) + '\n')
        } else {
          res.write(JSON.stringify({ 
            chunkIndex: 0, 
            text: storyText.trim(), 
            isFirst: true,
            isComplete: true 
          }) + '\n')
        }
      } else {
        res.write(JSON.stringify({ 
          chunkIndex: 0, 
          text: storyText.trim(), 
          isFirst: true,
          isComplete: true 
        }) + '\n')
      }
    }
    res.end()
  } catch (error) {
    console.error('❌ Error generating year in review:', error)
    
    let statusCode = 500
    let errorMessage = 'Failed to generate year in review'

    if (error.message?.includes('Invalid authorization') || 
        error.message?.includes('authorization credentials') ||
        error.message?.includes('API key') || 
        error.message?.includes('authentication') ||
        error.message?.includes('401')) {
      statusCode = 401
      if (req.body?.apiKey) {
        errorMessage = 'Invalid authorization credentials. Please double-check your Inworld API Key.'
      } else {
        errorMessage = 'Invalid API key. Please check your GOOGLE_API_KEY and INWORLD_API_KEY in the .env file.'
      }
    } else if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
      statusCode = 429
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
    } else if (error.message) {
      errorMessage = error.message
    }

    res.status(statusCode).json({ error: errorMessage })
  }
})

// Wish List generation endpoint
app.post('/api/generate-wish-list', async (req, res) => {
  console.log('\n\n🎁 ==========================================')
  console.log('🎁 WISH LIST GENERATION ENDPOINT CALLED')
  console.log('🎁 ==========================================')
  
  try {
    const { dreamGift, experience, practicalNeed, name, apiKey, isCustomVoice } = req.body

    if (!dreamGift || !experience || !practicalNeed || !name) {
      return res.status(400).json({ 
        error: 'Missing required fields: dreamGift, experience, practicalNeed, name' 
      })
    }

    const selectedApiKey = apiKey || process.env.INWORLD_API_KEY
    if (!selectedApiKey) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set and no custom API key provided' 
      })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      })
    }

    // Determine if custom voice (first person) or preset voice (third person)
    const useCustomVoice = isCustomVoice === true || isCustomVoice === 'true'
    
    const startTime = Date.now()
    console.log(`🎁 Generating wish list for ${name}`)
    console.log(`🎁 Using ${apiKey ? 'custom' : 'default'} API key`)
    console.log(`🎁 Perspective: ${useCustomVoice ? 'First person (custom voice)' : 'Third person (preset voice)'}`)

    const graph = createWishListGraph(selectedApiKey, useCustomVoice)
    const { outputStream } = await graph.start({
      name,
      dreamGift,
      experience,
      practicalNeed,
    })

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Transfer-Encoding', 'chunked')
    
    let listText = ''
    let firstChunkSent = false
    let done = false

    while (!done) {
      const result = await outputStream.next()
      
      await result.processResponse({
        ContentStream: async (contentStream) => {
          for await (const chunk of contentStream) {
            if (chunk.text) {
              listText += chunk.text
              
              if (!firstChunkSent && listText.length >= 100) {
                const sentenceEnd = listText.search(/[.!?]\s+/)
                const firstChunk = sentenceEnd > 0 && sentenceEnd < listText.length * 0.6 
                  ? listText.substring(0, sentenceEnd + 1).trim()
                  : listText.substring(0, Math.min(200, listText.length)).trim()
                
                if (firstChunk.length >= 80) {
                  res.write(JSON.stringify({ 
                    chunkIndex: 0, 
                    text: firstChunk, 
                    isFirst: true,
                    isComplete: false 
                  }) + '\n')
                  firstChunkSent = true
                }
              }
            }
          }
        },
        default: (data) => {
          if (data?.text) {
            listText += data.text
          }
        },
      })

      done = result.done
    }

    await graph.stop()

    if (!listText || listText.trim().length === 0) {
      return res.status(500).json({ error: 'No wish list generated' })
    }

    if (firstChunkSent) {
      res.write(JSON.stringify({ 
        chunkIndex: 1, 
        text: listText.trim(),
        isFirst: false,
        isComplete: true 
      }) + '\n')
    } else {
      if (listText.length >= 100) {
        const sentenceEnd = listText.search(/[.!?]\s+/)
        const firstChunk = sentenceEnd > 0 && sentenceEnd < listText.length * 0.6 
          ? listText.substring(0, sentenceEnd + 1).trim()
          : listText.substring(0, Math.min(200, listText.length)).trim()
        
        if (firstChunk.length >= 80) {
          res.write(JSON.stringify({ 
            chunkIndex: 0, 
            text: firstChunk, 
            isFirst: true,
            isComplete: false 
          }) + '\n')
          res.write(JSON.stringify({ 
            chunkIndex: 1, 
            text: listText.trim(),
            isFirst: false,
            isComplete: true 
          }) + '\n')
        } else {
          res.write(JSON.stringify({ 
            chunkIndex: 0, 
            text: listText.trim(), 
            isFirst: true,
            isComplete: true 
          }) + '\n')
        }
      } else {
        res.write(JSON.stringify({ 
          chunkIndex: 0, 
          text: listText.trim(), 
          isFirst: true,
          isComplete: true 
        }) + '\n')
      }
    }
    res.end()
  } catch (error) {
    console.error('❌ Error generating wish list:', error)
    
    let statusCode = 500
    let errorMessage = 'Failed to generate wish list'

    if (error.message?.includes('Invalid authorization') || 
        error.message?.includes('authorization credentials') ||
        error.message?.includes('API key') || 
        error.message?.includes('authentication') ||
        error.message?.includes('401')) {
      statusCode = 401
      if (req.body?.apiKey) {
        errorMessage = 'Invalid authorization credentials. Please double-check your Inworld API Key.'
      } else {
        errorMessage = 'Invalid API key. Please check your GOOGLE_API_KEY and INWORLD_API_KEY in the .env file.'
      }
    } else if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
      statusCode = 429
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
    } else if (error.message) {
      errorMessage = error.message
    }

    res.status(statusCode).json({ error: errorMessage })
  }
})

// New endpoint: Generate story with audio using Inworld Runtime
app.post('/api/generate-story-audio', async (req, res) => {
  console.log('\n\n🎵 ==========================================')
  console.log('🎵 STORY + AUDIO GENERATION ENDPOINT CALLED (Inworld Runtime)')
  console.log('🎵 ==========================================')
  
  try {
    const { storyType, childName, voiceId } = req.body

    if (!storyType || !childName) {
      return res.status(400).json({ 
        error: 'Missing required fields: storyType and childName' 
      })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      })
    }

    if (!process.env.INWORLD_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set' 
      })
    }

    // Use voice ID from request, env variable, or default
    const selectedVoiceId = voiceId || process.env.INWORLD_VOICE_ID || 'Wendy'

    console.log(`🎵 Generating story with audio for "${childName}" about "${storyType}"`)
    console.log(`🎵 Voice ID - Request: "${voiceId}", Selected: "${selectedVoiceId}", Env: "${process.env.INWORLD_VOICE_ID}"`)

    // Create graph with API key and voice ID
    const graph = createGraph(process.env.INWORLD_API_KEY, selectedVoiceId)

    // Execute the Inworld Runtime graph
    const { outputStream } = await graph.start({
      childName,
      storyType,
    })

    // Collect audio chunks
    let storyText = ''

    // Collect all PCM samples first, then encode to WAV
    const SAMPLE_RATE = 24000
    let allFloat32Samples = []
    let firstChunkTime = null

    // Iterate through execution results using the proper pattern
    let done = false
    while (!done) {
      const result = await outputStream.next()
      
      await result.processResponse({
        ContentStream: async (contentStream) => {
          // Process LLM streaming content (collect text for logging)
          for await (const chunk of contentStream) {
            if (chunk.text) {
              storyText += chunk.text
            }
          }
        },
        TTSOutputStream: async (ttsStream) => {
          // TTS node outputs TTSOutputStream with audio.data (base64 encoded)
          for await (const chunk of ttsStream) {
            if (chunk.audio?.data) {
              // Audio data is base64-encoded PCM float32 samples
              const base64Data = chunk.audio.data
              const audioBuffer = Buffer.from(base64Data, 'base64')
              
              if (audioBuffer.length > 0) {
                if (firstChunkTime === null) {
                  firstChunkTime = Date.now()
                  console.log(`⏱️ First audio chunk received`)
                }
                
                // Convert buffer to Float32Array (4 bytes per float32 sample)
                const sampleCount = Math.floor(audioBuffer.length / 4)
                if (sampleCount > 0) {
                  // Create a properly aligned Float32Array
                  const float32Samples = new Float32Array(sampleCount)
                  const dataView = new DataView(audioBuffer.buffer, audioBuffer.byteOffset, sampleCount * 4)
                  for (let i = 0; i < sampleCount; i++) {
                    float32Samples[i] = dataView.getFloat32(i * 4, true) // little-endian
                  }
                  
                  // Collect samples
                  allFloat32Samples.push(float32Samples)
                }
              }
            }
          }
        },
        AudioStream: async (audioStream) => {
          // Fallback: handle AudioStream if TTSOutputStream doesn't work
          for await (const audioChunk of audioStream) {
            if (audioChunk.data) {
              const audioData = audioChunk.data
              let audioBuffer
              
              if (Array.isArray(audioData)) {
                audioBuffer = Buffer.from(audioData)
              } else if (typeof audioData === 'string') {
                // If it's base64 encoded
                audioBuffer = Buffer.from(audioData, 'base64')
              } else if (Buffer.isBuffer(audioData)) {
                audioBuffer = audioData
              } else {
                // Try to convert to buffer
                audioBuffer = Buffer.from(audioData)
              }
              
              if (audioBuffer && audioBuffer.length > 0) {
                res.write(audioBuffer)
                console.log(`🎵 Sent audio chunk (AudioStream): ${audioBuffer.length} bytes`)
              }
            }
          }
        },
        default: (data) => {
          // Handle other data types
          if (data?.text) {
            storyText += data.text
          }
        },
      })

      done = result.done
    }

    // Clean up
    await graph.stop()
    
    // Encode all collected samples to WAV
    if (allFloat32Samples.length > 0) {
      // Combine all Float32Arrays into one
      const totalSamples = allFloat32Samples.reduce((sum, arr) => sum + arr.length, 0)
      const combinedSamples = new Float32Array(totalSamples)
      let offset = 0
      for (const samples of allFloat32Samples) {
        combinedSamples.set(samples, offset)
        offset += samples.length
      }
      
      // Encode to WAV
      const wavData = {
        sampleRate: SAMPLE_RATE,
        channelData: [combinedSamples]
      }
      
      const wavBuffer = await wavEncoder.encode(wavData)
      
      if (!wavBuffer) {
        throw new Error('WAV encoding returned null or undefined')
      }
      
      // wav-encoder returns ArrayBuffer, convert to Buffer
      // ArrayBuffer has byteLength, not length
      const buffer = Buffer.from(wavBuffer)
      
      if (!buffer || buffer.length === 0) {
        throw new Error('WAV encoding returned empty buffer')
      }
      
      res.setHeader('Content-Type', 'audio/wav')
      res.setHeader('Content-Length', buffer.length.toString())
      res.write(buffer)
      console.log(`🎵 Sent WAV audio: ${buffer.length} bytes (${totalSamples} samples)`)
    }
    
    res.end()

    console.log(`✅ Story generated: ${storyText.length} characters`)
  } catch (error) {
    console.error('❌ Error generating story with audio:', error)
    
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to generate story with audio' })
    }
  }
})

// Share story endpoint
app.post('/api/share-story', async (req, res) => {
  try {
    const { storyText, childName, voiceId, storyType, imageUrl, customApiKey, customVoiceId } = req.body

    if (!storyText) {
      return res.status(400).json({ error: 'Missing required field: storyText' })
    }

    // Generate a unique ID for this story
    const storyId = `story_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Store the story in memory
    sharedStories.set(storyId, {
      storyText,
      childName,
      voiceId,
      storyType,
      imageUrl: imageUrl || null,
      customApiKey,
      customVoiceId,
      createdAt: new Date().toISOString()
    })

    // Return just the storyId - frontend will construct the full URL from window.location.origin
    // This is the most stable approach as it doesn't require environment variables
    // and automatically works with any frontend URL (Vercel, localhost, etc.)
    res.json({ storyId })
  } catch (error) {
    console.error('Error sharing story:', error)
    res.status(500).json({ error: 'Failed to share story' })
  }
})

// Get shared story endpoint
app.get('/api/story/:id', async (req, res) => {
  try {
    const { id } = req.params
    const story = sharedStories.get(id)

    if (!story) {
      return res.status(404).json({ error: 'Story not found' })
    }

    res.json(story)
  } catch (error) {
    console.error('Error retrieving story:', error)
    res.status(500).json({ error: 'Failed to retrieve story' })
  }
})

// Greeting card message generation using Claude Sonnet 4.5
app.post('/api/generate-greeting-card-message', async (req, res) => {
  console.log('\n\n💌 ==========================================')
  console.log('💌 GREETING CARD MESSAGE GENERATION ENDPOINT CALLED')
  console.log('💌 ==========================================')
  
  try {
    const { senderName, recipientName, specialAboutThem, funnyStory } = req.body

    if (!senderName || !recipientName || !specialAboutThem || !funnyStory) {
      return res.status(400).json({ 
        error: 'Missing required fields: senderName, recipientName, specialAboutThem, funnyStory' 
      })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: ANTHROPIC_API_KEY not set' 
      })
    }

    const prompt = `Create a short, fun, and comical personalized greeting card message. 

Sender: ${senderName}
Recipient: ${recipientName}
What's special about them: ${specialAboutThem}
Funny story/joke: ${funnyStory}

Write a warm, humorous greeting card message (2-3 short paragraphs max) that:
- Is fun and comical in tone
- References the special thing about them
- Includes the funny story or joke in a lighthearted way
- Feels personal and heartfelt
- Is appropriate for a greeting card (not too long)
- Ends with a warm closing from ${senderName}

Make it feel genuine and fun, like something a friend would write.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Claude API error:', errorText)
      throw new Error(`Claude API error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const cardMessage = data.content[0].text.trim()

    console.log(`✅ Generated greeting card message (${cardMessage.length} chars)`)
    
    return res.status(200).json({ cardMessage })
  } catch (error) {
    console.error('❌ Error generating greeting card message:', error)
    const statusCode = error.statusCode || 500
    const errorMessage = error.message || 'Failed to generate greeting card message'
    return res.status(statusCode).json({ error: errorMessage })
  }
})

// Greeting card image generation using Google Nano Banana (Gemini 2.5 Flash Image)
app.post('/api/generate-greeting-card-image', async (req, res) => {
  console.log('\n\n🎨 ==========================================')
  console.log('🎨 GREETING CARD IMAGE GENERATION ENDPOINT CALLED')
  console.log('🎨 ==========================================')
  
  try {
    const { recipientName, specialAboutThem, funnyStory, uploadedImageUrl } = req.body

    if (!recipientName || !specialAboutThem || !funnyStory) {
      return res.status(400).json({ 
        error: 'Missing required fields: recipientName, specialAboutThem, funnyStory' 
      })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      })
    }

    // Build image prompt based on details
    let imagePrompt = `A fun, comical, personalized Christmas greeting card illustration featuring ${recipientName}. `
    imagePrompt += `The image should reflect: ${specialAboutThem}. `
    imagePrompt += `Include elements that reference: ${funnyStory}. `
    imagePrompt += `Style: cheerful, festive, humorous, cartoon-like, suitable for a greeting card. `
    imagePrompt += `Christmas theme with warm colors.`

    // Prepare request body - if uploadedImageUrl is provided, use image editing mode
    let requestBody
    if (uploadedImageUrl) {
      // Image editing mode: convert uploaded image to base64
      // Note: uploadedImageUrl might be a data URL or blob URL, we'll need to handle it
      // For now, we'll use text-to-image, but this can be enhanced to support image editing
      requestBody = {
        contents: [{
          parts: [
            { text: imagePrompt }
          ]
        }]
      }
    } else {
      // Text-to-image mode
      requestBody = {
        contents: [{
          parts: [
            { text: imagePrompt }
          ]
        }]
      }
    }

    // Use Google's Gemini 2.5 Flash Image API (Nano Banana)
    // Reference: https://ai.google.dev/gemini-api/docs/image-generation
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Google Gemini Image API error:', errorText)
      return res.status(200).json({ 
        imageUrl: null,
        error: 'Image generation temporarily unavailable'
      })
    }

    const data = await response.json()
    
    // Extract image from response
    // The response contains parts with inlineData (base64 encoded image)
    let imageUrl = null
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          // Convert base64 to data URL
          const mimeType = part.inlineData.mimeType || 'image/png'
          imageUrl = `data:${mimeType};base64,${part.inlineData.data}`
          break
        }
      }
    }

    if (!imageUrl) {
      console.warn('⚠️ No image data found in response')
      return res.status(200).json({ 
        imageUrl: null,
        error: 'No image generated'
      })
    }

    console.log(`✅ Generated greeting card image (${imageUrl.length} chars data URL)`)
    
    return res.status(200).json({ imageUrl })
  } catch (error) {
    console.error('❌ Error generating greeting card image:', error)
    return res.status(200).json({ 
      imageUrl: null,
      error: error.message || 'Failed to generate image'
    })
  }
})

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📖 Story generation endpoint: http://localhost:${PORT}/api/generate-story`)
  console.log(`🎵 TTS endpoint: http://localhost:${PORT}/api/tts`)
  console.log(`🎤 Voice clone endpoint: http://localhost:${PORT}/api/clone-voice`)
})
