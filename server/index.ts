import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { parse } from 'url';
import { RawData, WebSocketServer } from 'ws';
import { query, body } from 'express-validator';
import { createClient, RedisClientType } from 'redis';

// Import InworldError dynamically (may not be available in all environments)
let InworldError: any = class extends Error { context?: any; };
try {
  const runtime = await import('@inworld/runtime/common');
  if (runtime.InworldError) {
    InworldError = runtime.InworldError;
  }
} catch {
  // Use fallback class defined above
}

import { WS_APP_PORT } from './constants';
import { InworldApp } from './components/app';
import { MessageHandler } from './components/message_handler';

const app = express();
const server = createServer(app);
const webSocket = new WebSocketServer({ noServer: true });

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      // Add your production Vercel URLs here after deployment
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow any Vercel preview deployments
    if (/^https:\/\/.*\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    
    console.log(`⚠️ CORS: Blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('frontend'));

const inworldApp = new InworldApp();

// In-memory storage for shared cards (fallback if Redis unavailable)
const sharedCardsMap = new Map();

// Redis client for persistent storage
let redisClient: RedisClientType | null = null;
let redisConnected = false;

// Initialize Redis if REDIS_URL is available
async function initRedis() {
  if (!process.env.REDIS_URL) {
    console.log('⚠️ REDIS_URL not set - using in-memory storage (cards will be lost on restart)');
    return;
  }
  
  try {
    redisClient = createClient({ url: process.env.REDIS_URL });
    
    redisClient.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
      redisConnected = false;
    });
    
    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
      redisConnected = true;
    });
    
    await redisClient.connect();
    console.log('🗄️ Redis initialized for persistent card storage');
  } catch (error: any) {
    console.error('❌ Failed to connect to Redis:', error.message);
    console.log('⚠️ Falling back to in-memory storage');
    redisClient = null;
    redisConnected = false;
  }
}

// Initialize Redis on startup
initRedis();

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// WebSocket connection handler
webSocket.on('connection', (ws, request) => {
  const { query } = parse(request.url!, true);
  const sessionId = query.sessionId?.toString();

  if (!inworldApp.connections?.[sessionId!]) {
    console.log(`Session not found: ${sessionId}`);
    ws.close(1008, 'Session not found');
    return;
  }

  const connection = inworldApp.connections[sessionId!];
  connection.ws = connection.ws ?? ws;

  const send = (data: any) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  ws.on('error', console.error);

  const messageHandler = new MessageHandler(inworldApp, send);

  ws.on('message', (data: RawData) =>
    messageHandler.handleMessage(data, sessionId!),
  );

  ws.on('close', (code, reason) => {
    console.log(
      `[Session ${sessionId}] WebSocket closed: code=${code}, reason=${reason.toString()}`,
    );

    if (connection?.audioStreamManager) {
      console.log(`[Session ${sessionId}] Ending audio stream due to WebSocket close`);
      connection.audioStreamManager.end();
      connection.audioStreamManager = undefined;
    }

    connection.unloaded = true;
    if (inworldApp.connections[sessionId!]) {
      console.log(`[Session ${sessionId}] 🧹 Deleting session from connections`);
      delete inworldApp.connections[sessionId!];
    }
  });

  console.log(`[Session ${sessionId}] WebSocket connected`);
});

// Session management endpoints
app.post(
  '/load',
  query('sessionId').trim().isLength({ min: 1 }),
  body('agent').isObject(),
  body('userName').trim().isLength({ min: 1 }),
  inworldApp.load.bind(inworldApp),
);

app.post(
  '/unload',
  query('sessionId').trim().isLength({ min: 1 }),
  inworldApp.unload.bind(inworldApp),
);

// WebSocket upgrade handler
server.on('upgrade', async (request, socket, head) => {
  const { pathname } = parse(request.url!);

  if (pathname === '/session') {
    webSocket.handleUpgrade(request, socket, head, (ws) => {
      webSocket.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ============================================================================
// REST API Endpoints
// ============================================================================

// Occasion type labels for prompts
const OCCASION_LABELS: Record<string, { greeting: string; tone: string }> = {
  'birthday': { greeting: 'Happy Birthday', tone: 'celebratory and fun' },
  'thank-you': { greeting: 'Thank You', tone: 'warm and grateful' },
  'congratulations': { greeting: 'Congratulations', tone: 'excited and proud' },
  'wedding': { greeting: 'Happy Wedding', tone: 'romantic and heartfelt' },
  'get-well': { greeting: 'Get Well Soon', tone: 'caring and supportive' },
  'anniversary': { greeting: 'Happy Anniversary', tone: 'loving and nostalgic' },
  'new-baby': { greeting: 'Congratulations on Your New Baby', tone: 'joyful and sweet' },
  'graduation': { greeting: 'Congratulations Graduate', tone: 'proud and inspiring' },
  'thinking-of-you': { greeting: 'Thinking of You', tone: 'warm and thoughtful' },
};

// Helper function to get occasion config - handles custom occasions
function getOccasionConfig(occasion: string): { greeting: string; tone: string } {
  if (OCCASION_LABELS[occasion]) {
    return OCCASION_LABELS[occasion];
  }
  // Custom occasion - use the text as-is (properly capitalized)
  // This allows users to type "Merry Christmas", "Happy Retirement", "Good Luck", etc.
  const capitalizedOccasion = occasion
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return {
    greeting: capitalizedOccasion,
    tone: 'warm and heartfelt'
  };
}

// Greeting card message generation using Claude
app.post('/api/generate-greeting-card-message', async (req, res) => {
  console.log('\n💌 GREETING CARD MESSAGE GENERATION');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { senderName, conversationHistory, recipientName, relationship, specialAboutThem, funnyStory, signoff, occasion = 'birthday' } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: ANTHROPIC_API_KEY not set' 
      });
    }

    const occasionConfig = getOccasionConfig(occasion);
    let prompt: string;
    let parsedRecipientName: string | null = null;

    // If we have conversation history, extract info and generate from it
    if (conversationHistory && Array.isArray(conversationHistory)) {
      console.log('📝 Using conversation history path');
      
      const conversationText = conversationHistory
        .map((msg: any) => `${msg.role === 'assistant' ? 'Assistant' : 'User'}: ${msg.content}`)
        .join('\n');

      prompt = `Based on this conversation, write a SHORT ${occasion} card (under 300 characters).

CONVERSATION:
${conversationText}

Extract: recipient name, sender relationship, and their quirk/story.

FORMAT (follow EXACTLY):
Dear [Name],

[3 short, ${occasionConfig.tone} sentences that reference the quirk and wish them ${occasionConfig.greeting}]

[Sign-off based on relationship]

RULES:
- Exactly 3 sentences in body
- Total under 300 characters
- Keep punchy and ${occasionConfig.tone}
- Start DIRECTLY with "Dear"
- End with sign-off on its own line`;
    } else {
      // Standard path with individual fields
      if (!recipientName || !funnyStory) {
        return res.status(400).json({ 
          error: 'Missing required fields: recipientName, funnyStory' 
        });
      }

      // Parse the recipientName field to extract name and relationship
      let extractedName = recipientName;
      let extractedRelationship = relationship || '';
      
      const relationshipWords = 'son|daughter|dad|father|mom|mother|wife|husband|brother|sister|friend|best friend|grandma|grandmother|grandpa|grandfather|aunt|uncle|cousin|nephew|niece|boyfriend|girlfriend|partner|kid|child|baby|bro|sis|coworker|colleague|boss|teacher|mentor';
      const relationshipPatterns = [
        new RegExp(`^(?:my|our)\\s+(${relationshipWords})\\s+(.+)$`, 'i'),
        new RegExp(`^(.+?),?\\s+(?:my|our)\\s+(${relationshipWords})$`, 'i'),
      ];
      
      for (const pattern of relationshipPatterns) {
        const match = recipientName.match(pattern);
        if (match) {
          if (pattern === relationshipPatterns[0]) {
            extractedRelationship = match[1];
            extractedName = match[2].trim();
          } else {
            extractedName = match[1].trim();
            extractedRelationship = match[2];
          }
          break;
        }
      }
      
      extractedName = extractedName.replace(/[.,!?]+$/, '').trim();
      parsedRecipientName = extractedName;

      prompt = `Write a SHORT ${occasion} card message (under 300 characters total).

Recipient: ${extractedName}
Anecdote: ${funnyStory}
Sign-off: ${signoff || (extractedRelationship ? `Love, [appropriate for ${extractedRelationship}]` : 'With love')}
Occasion: ${occasionConfig.greeting}

FORMAT (follow EXACTLY):
Dear ${extractedName},

[3 short, ${occasionConfig.tone} sentences that reference the anecdote and wish them ${occasionConfig.greeting}]

${signoff || (extractedRelationship ? `[Sign-off for ${extractedRelationship}]` : 'With love')}

CRITICAL RULES:
- Exactly 3 sentences in the body
- Total message under 300 characters
- Keep it punchy and ${occasionConfig.tone}
- Do NOT write multiple paragraphs`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Claude API error:', errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    let cardMessage = data.content[0].text.trim();

    console.log(`💌 Generated card message - Characters: ${cardMessage.length}`);
    
    // Enforce 400 character limit
    if (cardMessage.length > 400) {
      console.log(`⚠️ Message exceeded 400 characters (${cardMessage.length} chars), truncating...`);
      const truncated = cardMessage.substring(0, 397);
      const lastSentence = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      );
      cardMessage = lastSentence > 250 
        ? truncated.substring(0, lastSentence + 1) 
        : truncated + '...';
    }

    console.log(`✅ Generated greeting card message (${cardMessage.length} chars)`);
    
    const responseBody: { cardMessage: string; parsedRecipientName?: string } = { cardMessage };
    if (parsedRecipientName) {
      responseBody.parsedRecipientName = parsedRecipientName;
    }
    return res.status(200).json(responseBody);
  } catch (error: any) {
    console.error('❌ Error generating greeting card message:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate message' });
  }
});

// Greeting card image generation using Gemini
app.post('/api/generate-greeting-card-image', async (req, res) => {
  console.log('\n🎨 GREETING CARD IMAGE GENERATION');
  
  try {
    const { conversationHistory, recipientName, specialAboutThem, funnyStory, occasion = 'birthday' } = req.body;

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      });
    }

    const occasionConfig = getOccasionConfig(occasion);
    let imagePrompt: string;

    // If we have conversation history, extract info for the image
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const conversationText = conversationHistory
        .map((msg: any) => `${msg.role === 'assistant' ? 'Assistant' : 'User'}: ${msg.content}`)
        .join('\n');

      imagePrompt = `Based on this conversation, create a festive ${occasion} greeting card image:

CONVERSATION:
${conversationText}

Create a beautiful ${occasion} greeting card illustration that:
- Is in square 1:1 aspect ratio
- Displays "${occasionConfig.greeting}" prominently
- Includes festive ${occasion} elements and decorations
- References any specific things mentioned about the recipient (hobbies, interests, stories)
- Style: cheerful, festive, ${occasionConfig.tone}, cartoon-like
- CRITICAL: Do NOT show any people, faces, or human figures - only objects and decorations`;
    } else {
      if (!recipientName || !funnyStory) {
        return res.status(400).json({ 
          error: 'Missing required fields: recipientName, funnyStory' 
        });
      }

      // Parse the recipientName field to extract just the name
      let displayName = recipientName.trim();
      const relationshipWords = 'son|daughter|dad|father|mom|mother|wife|husband|brother|sister|friend|best friend|grandma|grandmother|grandpa|grandfather|aunt|uncle|cousin|nephew|niece|boyfriend|girlfriend|partner|kid|child|baby|bro|sis|coworker|colleague|boss|teacher|mentor';
      const imageRelationshipPatterns = [
        new RegExp(`^(?:my|our)\\s+(?:${relationshipWords})\\s+(.+)$`, 'i'),
        new RegExp(`^(.+?),?\\s+(?:my|our)\\s+(?:${relationshipWords})$`, 'i'),
      ];
      
      let matched = false;
      for (const pattern of imageRelationshipPatterns) {
        const match = displayName.match(pattern);
        if (match) {
          displayName = match[1].trim().replace(/[.,!?]+$/, '');
          matched = true;
          break;
        }
      }
      
      // Fallback: if no pattern matched, try to extract just the name
      // Remove common prefixes and relationship words
      if (!matched && displayName.toLowerCase() !== displayName) {
        const fallbackName = displayName
          .replace(/^(?:my|our|to my|to our|for my|for our)\s+/i, '')
          .replace(/^(?:son|daughter|dad|father|mom|mother|wife|husband|brother|sister|friend|best friend|grandma|grandmother|grandpa|grandfather|aunt|uncle|cousin|nephew|niece|boyfriend|girlfriend|partner|kid|child|baby|bro|sis|coworker|colleague|boss|teacher|mentor)[,\s]+/i, '')
          .trim()
          .replace(/[.,!?]+$/, '');
        if (fallbackName) {
          displayName = fallbackName;
        }
      }

      imagePrompt = `A beautiful, personalized ${occasion} greeting card illustration in square 1:1 aspect ratio. The card should display the text "${occasionConfig.greeting} ${displayName}" prominently. `;
      if (specialAboutThem) {
        imagePrompt += `The image should reflect: ${specialAboutThem}. `;
      }
      imagePrompt += `Include items, objects, and elements that reference: ${funnyStory}. `;
      imagePrompt += `Style: cheerful, festive, ${occasionConfig.tone}, cartoon-like. CRITICAL: Do NOT show any people, faces, or human figures.`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error:', errorText);
      return res.status(200).json({ imageUrl: null, error: 'Image generation unavailable' });
    }

    const data = await response.json() as { 
      candidates?: Array<{ 
        content?: { 
          parts?: Array<{ 
            inlineData?: { data: string; mimeType?: string } 
          }> 
        } 
      }> 
    };
    let imageUrl: string | null = null;
    
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          imageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (imageUrl) {
      console.log('✅ Generated greeting card image');
    } else {
      console.warn('⚠️ No image data in response');
    }
    
    return res.status(200).json({ imageUrl });
  } catch (error: any) {
    console.error('❌ Error generating image:', error);
    return res.status(200).json({ imageUrl: null, error: error.message });
  }
});

// Voice cloning endpoint
app.post('/api/clone-voice', async (req, res) => {
  console.log('\n🎤 VOICE CLONING');
  
  try {
    const { audioData, displayName, transcription, langCode = 'EN_US' } = req.body;

    if (!audioData || !displayName?.trim()) {
      return res.status(400).json({ error: 'Missing audioData or displayName' });
    }

    const portalApiKey = process.env.INWORLD_PORTAL_API_KEY || process.env.INWORLD_API_KEY;
    if (!portalApiKey) {
      return res.status(500).json({ error: 'INWORLD_PORTAL_API_KEY not set' });
    }

    const workspace = process.env.INWORLD_WORKSPACE || 'greeting_card_creator';
    const parent = `workspaces/${workspace}`;

    const cloneResponse = await fetch(`https://api.inworld.ai/voices/v1/${parent}/voices:clone`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${portalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: displayName.trim(),
        langCode,
        voiceSamples: [{
          audioData,
          transcription: transcription || undefined,
        }],
        audioProcessingConfig: { removeBackgroundNoise: false },
      }),
    });

    if (!cloneResponse.ok) {
      const errorData = await cloneResponse.json().catch(() => ({})) as { error?: { message?: string } };
      console.error('❌ Voice clone failed:', errorData);
      return res.status(cloneResponse.status).json({ 
        error: errorData.error?.message || 'Voice cloning failed' 
      });
    }

    const cloneData = await cloneResponse.json() as { 
      voice?: { voiceId?: string; name?: string; displayName?: string };
      audioSamplesValidated?: Array<{ warnings?: string[] }>;
    };
    console.log(`✅ Voice cloned: ${cloneData.voice?.voiceId}`);

    res.json({
      voiceId: cloneData.voice?.voiceId,
      voiceName: cloneData.voice?.name,
      displayName: cloneData.voice?.displayName,
      warnings: cloneData.audioSamplesValidated?.[0]?.warnings || [],
    });
  } catch (error: any) {
    console.error('❌ Error cloning voice:', error);
    res.status(500).json({ error: error.message || 'Failed to clone voice' });
  }
});

// TTS endpoint for card message playback
app.post('/api/tts', async (req, res) => {
  console.log('\n🎵 TTS REQUEST');
  
  try {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing text' });
    }

    if (!process.env.INWORLD_API_KEY) {
      return res.status(500).json({ error: 'INWORLD_API_KEY not set' });
    }

    const selectedVoiceId = voiceId || 'Craig';
    console.log(`🎵 TTS - Voice: "${selectedVoiceId}", Text length: ${text.length}`);

    const { RemoteTTSNode, SequentialGraphBuilder } = await import('@inworld/runtime/graph');

    const graphBuilder = new SequentialGraphBuilder({
      id: `tts-${Date.now()}`,
      apiKey: process.env.INWORLD_API_KEY,
      enableRemoteConfig: false,
      nodes: [
        new RemoteTTSNode({
          speakerId: selectedVoiceId,
          modelId: process.env.INWORLD_MODEL_ID || 'inworld-tts-1-max',
          sampleRate: 24000,
          temperature: 1.1,
        }),
      ],
    });

    const graph = graphBuilder.build();
    const { outputStream } = await graph.start(text);

    // Set headers for streaming
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Transfer-Encoding', 'chunked');

    let chunkIndex = 0;
    let done = false;

    while (!done) {
      const result = await outputStream.next();
      
      await result.processResponse({
        TTSOutputStream: async (ttsStream: AsyncIterable<{ audio?: { data?: any } }>) => {
          for await (const chunk of ttsStream) {
            if (!chunk.audio?.data) continue;

            let audioBuffer: Buffer;
            if (Array.isArray(chunk.audio.data)) {
              audioBuffer = Buffer.from(chunk.audio.data);
            } else if (typeof chunk.audio.data === 'string') {
              audioBuffer = Buffer.from(chunk.audio.data, 'base64');
            } else if (Buffer.isBuffer(chunk.audio.data)) {
              audioBuffer = chunk.audio.data;
            } else {
              continue;
            }

            if (audioBuffer.byteLength === 0) continue;

            const chunkData = {
              index: chunkIndex++,
              data: audioBuffer.toString('base64'),
              samples: audioBuffer.byteLength / 4,
            };
            res.write(JSON.stringify(chunkData) + '\n');
          }
        },
        error: async (error: { message?: string }) => {
          console.error('❌ TTS error:', error.message);
        },
        default: () => {
          done = true;
        },
      });

      if (result.done) done = true;
    }

    // Send end marker
    res.write(JSON.stringify({ end: true }) + '\n');
    console.log(`✅ TTS complete: ${chunkIndex} chunks`);
    res.end();
  } catch (error: any) {
    console.error('❌ TTS error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'TTS failed' });
    } else {
      res.end();
    }
  }
});

// Share card endpoint
app.post('/api/share-story', async (req, res) => {
  console.log('📨 SHARE-CARD ENDPOINT HIT');
  try {
    const { storyText, childName, voiceId, imageUrl, customApiKey, customVoiceId, experienceType, occasion } = req.body;
    
    console.log('📤 Share card request - occasion:', occasion, 'customVoiceId:', customVoiceId);

    if (!storyText) {
      return res.status(400).json({ error: 'Missing storyText' });
    }

    const cardId = `card_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const cardData = {
      storyText,
      childName,
      voiceId,
      imageUrl: imageUrl || null,
      customApiKey,
      customVoiceId,
      experienceType: experienceType || 'greeting-card',
      occasion: occasion || 'birthday',
      createdAt: new Date().toISOString()
    };

    // Try Redis first, fall back to in-memory Map
    if (redisClient && redisConnected) {
      try {
        // Store in Redis with 30-day TTL (2592000 seconds)
        await redisClient.set(`card:${cardId}`, JSON.stringify(cardData), { EX: 2592000 });
        console.log('📤 Card stored in Redis with ID:', cardId);
      } catch (redisError: any) {
        console.error('⚠️ Redis store failed, using in-memory fallback:', redisError.message);
        sharedCardsMap.set(cardId, cardData);
        console.log('📤 Card stored in memory with ID:', cardId);
      }
    } else {
      // Fallback to in-memory storage
      sharedCardsMap.set(cardId, cardData);
      console.log('📤 Card stored in memory with ID:', cardId);
    }

    const shareUrl = `${req.headers.origin || 'http://localhost:5173'}/share/${cardId}`;
    res.json({ storyId: cardId, shareUrl });
  } catch (error: any) {
    console.error('Error sharing card:', error);
    res.status(500).json({ error: 'Failed to share card' });
  }
});

// Get shared card
app.get('/api/story/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let card = null;

    // Try Redis first, fall back to in-memory Map
    if (redisClient && redisConnected) {
      try {
        const redisData = await redisClient.get(`card:${id}`);
        if (redisData) {
          card = JSON.parse(redisData);
          console.log('📥 Retrieved card from Redis:', id);
        }
      } catch (redisError: any) {
        console.error('⚠️ Redis retrieve failed:', redisError.message);
      }
    }
    
    // Fallback to in-memory if not found in Redis
    if (!card) {
      card = sharedCardsMap.get(id);
      if (card) {
        console.log('📥 Retrieved card from memory:', id);
      }
    }

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    console.log('📥 Retrieved card:', id, 'occasion:', card.occasion);

    res.json(card);
  } catch (error: any) {
    console.error('Error retrieving card:', error);
    res.status(500).json({ error: 'Failed to retrieve card' });
  }
});

// Start server
server.listen(WS_APP_PORT, async () => {
  try {
    await inworldApp.initialize();
  } catch (error) {
    console.error(error);
  }

  console.log(`🚀 Greeting Card Server running on port ${WS_APP_PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${WS_APP_PORT}/session`);
  console.log(`🔌 REST API endpoints:`);
  console.log(`   POST /load - Create session`);
  console.log(`   POST /unload - End session`);
  console.log(`   POST /api/generate-greeting-card-message`);
  console.log(`   POST /api/generate-greeting-card-image`);
  console.log(`   POST /api/clone-voice`);
  console.log(`   POST /api/tts`);
  console.log(`   POST /api/share-story`);
  console.log(`   GET  /api/story/:id`);
});

// Graceful shutdown
function done() {
  console.log('Server is closing');
  inworldApp.shutdown();
  process.exit(0);
}

process.on('SIGINT', done);
process.on('SIGTERM', done);
process.on('SIGUSR2', done);
process.on('unhandledRejection', (err: any) => {
  if (InworldError && err instanceof InworldError) {
    console.error('Inworld Error:', {
      message: err.message,
      context: err.context || {},
    });
  } else if (err instanceof Error) {
    console.error('Unhandled rejection:', err.message);
  } else {
    console.error('Unhandled rejection:', err);
  }
  process.exit(1);
});
