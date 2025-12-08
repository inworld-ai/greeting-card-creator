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

  console.log('\n\n🔵 ==========================================')
  console.log('🔵 STORY GENERATION ENDPOINT CALLED (Inworld Runtime)')
  console.log('🔵 ==========================================')
  console.log('🔵 Full request body:', JSON.stringify(req.body, null, 2))
  
  try {
    const { storyType, childName } = req.body

    console.log('🔵 Extracted storyType:', storyType)
    console.log('🔵 Extracted childName:', childName)
    console.log('🔵 storyType type:', typeof storyType)
    console.log('🔵 storyType value:', JSON.stringify(storyType))
    console.log('🔵 ==========================================\n\n')

    if (!storyType || !childName) {
      console.log('❌ ERROR: Missing required fields')
      return res.status(400).json({ 
        error: 'Missing required fields: storyType and childName' 
      })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set (required for Inworld Runtime)' 
      })
    }

    if (!process.env.INWORLD_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: INWORLD_API_KEY not set (required for Inworld Runtime)' 
      })
    }

    // Log the story type to debug
    console.log(`\n🟢 === STORY GENERATION REQUEST (Inworld Runtime) ===`)
    console.log(`🟢 Child Name: "${childName}"`)
    console.log(`🟢 Story Type Requested: "${storyType}"`)
    console.log(`🟢 ===============================\n`)

    // Create graph with API key
    const graph = createGraph(process.env.INWORLD_API_KEY)

    // Execute the Inworld Runtime graph
    const { outputStream } = await graph.start({
      childName,
      storyType,
    })

    // Collect text chunks from output
    let storyText = ''
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
            }
          }
        },
        AudioStream: async (audioStream) => {
          // Audio chunks - we'll skip these for text-only endpoint
          console.log('🎵 Received audio chunk (skipping for text endpoint)')
        },
        default: (data) => {
          // Handle other data types
          if (data?.text) {
            storyText += data.text
            console.log(`📝 Received text: ${data.text.substring(0, 50)}...`)
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

    console.log(`✅ Generated story (first 200 chars): ${storyText.substring(0, 200)}...`)
    console.log(`Story mentions "${storyType}": ${storyText.toLowerCase().includes(storyType.toLowerCase())}`)

    return res.status(200).json({ storyText: storyText.trim() })
  } catch (error) {
    console.error('❌ Error generating story with Inworld Runtime:', error)
    
    let statusCode = 500
    let errorMessage = 'Failed to generate story'

    if (error.message?.includes('API key') || error.message?.includes('authentication')) {
      statusCode = 401
      errorMessage = 'Invalid API key. Please check your GOOGLE_API_KEY and INWORLD_API_KEY in the .env file.'
    } else if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
      statusCode = 429
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
    } else if (error.message) {
      errorMessage = error.message
    }

    return res.status(statusCode).json({ error: errorMessage })
  }
}
