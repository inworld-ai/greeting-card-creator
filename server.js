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
app.use(cors())
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
          removeBackgroundNoise: true,
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
      conversationHistory.forEach((item: any, index: number) => {
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📖 Story generation endpoint: http://localhost:${PORT}/api/generate-story`)
  console.log(`🎵 TTS endpoint: http://localhost:${PORT}/api/tts`)
  console.log(`🎤 Voice clone endpoint: http://localhost:${PORT}/api/clone-voice`)
})
