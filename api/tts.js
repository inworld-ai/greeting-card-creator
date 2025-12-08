import { createTTSOnlyGraph } from '../graph.js'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { text, voiceId } = req.body

    if (!text) {
      return res.status(400).json({ 
        error: 'Missing required field: text' 
      })
    }

    if (!process.env.INWORLD_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set' 
      })
    }

    // Use voice ID from request, env variable, or default to female voice
    const selectedVoiceId = voiceId || process.env.INWORLD_VOICE_ID || 'Wendy'

    // Log the request details for debugging
    console.log(`🎵 Runtime TTS request - Voice ID: ${selectedVoiceId}, Text length: ${text.length}`)

    // Create TTS-only graph (Text → TextChunking → TTS)
    const graph = createTTSOnlyGraph(process.env.INWORLD_API_KEY)

    // Execute the Runtime graph with text input
    const { outputStream } = await graph.start(text)

    // Set response headers for streaming audio
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')

    // Stream audio chunks as they arrive
    let done = false
    while (!done) {
      const result = await outputStream.next()
      
      await result.processResponse({
        AudioStream: async (audioStream) => {
          // Stream audio chunks as they arrive
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
                console.log(`🎵 Sent audio chunk: ${audioBuffer.length} bytes`)
              }
            }
          }
        },
        default: (data) => {
          // Handle other data types if needed
          console.log('Received non-audio data:', typeof data)
        },
      })

      done = result.done
    }

    // Clean up
    await graph.stop()
    return res.end()
  } catch (error) {
    console.error('❌ Error generating TTS with Runtime:', error)
    
    if (!res.headersSent) {
      let statusCode = 500
      let errorMessage = 'Failed to generate speech'

      if (error.message?.includes('API key') || error.message?.includes('authentication')) {
        statusCode = 401
        errorMessage = 'Invalid API key. Please check your INWORLD_API_KEY in the .env file.'
      } else if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
        statusCode = 429
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
      } else if (error.message) {
        errorMessage = error.message
      }

      return res.status(statusCode).json({ error: errorMessage })
    } else {
      return res.end()
    }
  }
}
