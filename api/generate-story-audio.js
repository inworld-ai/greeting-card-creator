import { createGraph } from '../graph.js'

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

  console.log('\n\n🎵 ==========================================')
  console.log('🎵 STORY + AUDIO GENERATION ENDPOINT CALLED (Inworld Runtime)')
  console.log('🎵 ==========================================')
  
  try {
    const { storyType, childName } = req.body

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

    console.log(`🎵 Generating story with audio for "${childName}" about "${storyType}"`)

    // Create graph with API key
    const graph = createGraph(process.env.INWORLD_API_KEY)

    // Execute the Inworld Runtime graph
    const { outputStream } = await graph.start({
      childName,
      storyType,
    })

    // Collect audio chunks
    let storyText = ''

    // Set response headers for streaming audio
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')

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
    res.end()

    console.log(`✅ Story generated: ${storyText.length} characters`)
  } catch (error) {
    console.error('❌ Error generating story with audio:', error)
    
    if (!res.headersSent) {
      let statusCode = 500
      let errorMessage = 'Failed to generate story with audio'

      if (error.message?.includes('API key') || error.message?.includes('authentication')) {
        statusCode = 401
        errorMessage = 'Invalid API key'
      } else if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
        statusCode = 429
        errorMessage = 'Rate limit exceeded'
      } else if (error.message) {
        errorMessage = error.message
      }

      return res.status(statusCode).json({ error: errorMessage })
    } else {
      return res.end()
    }
  }
}

