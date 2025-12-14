import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { parse } from 'url';
import { RawData, WebSocketServer } from 'ws';
import { query, body } from 'express-validator';

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
      'https://inworld-christmas.vercel.app',
      'https://christmas-personalized-storyteller.vercel.app',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    if (/^https:\/\/christmas-personalized-storyteller.*\.vercel\.app$/.test(origin) ||
        /^https:\/\/inworld-christmas.*\.vercel\.app$/.test(origin)) {
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

// In-memory storage for shared stories
const sharedStories = new Map();

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
// REST API Endpoints (for non-realtime operations)
// ============================================================================

// Greeting card message generation using Claude
app.post('/api/generate-greeting-card-message', async (req, res) => {
  console.log('\n💌 GREETING CARD MESSAGE GENERATION');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { senderName, conversationHistory, recipientName, relationship, specialAboutThem, funnyStory } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: ANTHROPIC_API_KEY not set' 
      });
    }

    let prompt: string;

    // If we have conversation history, extract info and generate from it
    if (conversationHistory && Array.isArray(conversationHistory)) {
      console.log('📝 Using conversation history path');
      console.log('📝 Conversation messages count:', conversationHistory.length);
      
      const conversationText = conversationHistory
        .map((msg: any) => `${msg.role === 'assistant' ? 'Elf' : 'User'}: ${msg.content}`)
        .join('\n');
      
      console.log('📝 Formatted conversation:\n', conversationText);

      prompt = `Based on this conversation between an Elf and a user, create a personalized Christmas card message.

CONVERSATION:
${conversationText}

TASK:
1. First, extract from the conversation:
   - Who the card is for (recipient name)
   - WHO IS SENDING THE CARD (the user!) - look for phrases like "I'm her dad", "I'm his mom", "she's my wife", "my best friend", etc.
   - The funny story, quirk, obsession, or special thing mentioned about them

2. Then write a Christmas card message in this EXACT FORMAT:

Dear {name},

{First paragraph: A warm Christmas greeting that cleverly references their quirk/obsession. Make puns or movie/hobby references. 2-3 sentences.}

{Second paragraph: Continue the joke/reference and end with something heartfelt. 2-3 sentences.}

{REQUIRED SIGN-OFF LINE - see rules below}

SIGN-OFF RULES (THIS IS MANDATORY - NEVER SKIP):
- Extract the sender's relationship from the conversation (e.g., "I'm her dad" → sign off as "Love, Dad")
- Common mappings:
  * "I'm her/his dad" or "my daughter/son" → "Love, Dad" or "Love always, Dad"
  * "I'm her/his mom" → "Love, Mom" or "With all my love, Mom"  
  * "my wife" or "I'm her husband" → "Your loving husband" or "Forever yours"
  * "my husband" or "I'm his wife" → "Your loving wife" or "All my love"
  * "my best friend" → "Your best friend forever" or "Love ya!"
  * "my sister/brother" → "Love, your [brother/sister]"
- If relationship is unclear, use: "Wishing you a Merry Christmas!" or "With love and holiday cheer!"

EXAMPLE (for daughter Willa, sent by her Dad, who loves Stranger Things):

Dear Willa,

Merry Christmas to my amazing daughter! I've been thinking - if the Demogorgon tried to ruin Christmas, you'd probably handle it like Eleven, no problem. Just don't go opening any gates to the Upside Down under the tree!

Your dedication to all things Hawkins is legendary, and watching you geek out over every episode is one of my favorite things. Here's to more binge-watching adventures together in the new year!

Love always,
Dad

STYLE GUIDELINES:
- Make specific puns or references to their quirk/obsession
- Be witty, warm, and personal - like an inside joke between loved ones
- Aim for 500-700 characters total

CRITICAL OUTPUT RULES:
- DO NOT include any "EXTRACTED INFORMATION" section
- DO NOT include any asterisks, bold text, or formatting markers
- DO NOT include character counts
- ONLY output the card message itself: "Dear [name]," + two paragraphs + sign-off
- Start your response DIRECTLY with "Dear"
- The message MUST end with a sign-off line (THIS IS REQUIRED - NEVER OMIT)
- The sign-off MUST be on its own line after the second paragraph`;
    } else {
      // Legacy path with individual fields
      if (!recipientName || !funnyStory) {
        return res.status(400).json({ 
          error: 'Missing required fields: recipientName, funnyStory' 
        });
      }

      prompt = `Create a personalized Christmas card message.

Recipient: ${recipientName}
${relationship ? `Sender's relationship to recipient: ${relationship}` : 'Relationship: friend'}
Funny/special thing about them: ${funnyStory}

Write a Christmas card message in this EXACT FORMAT:

Dear ${recipientName},

{First paragraph: A warm Christmas greeting that cleverly references their quirk/obsession. Make puns or references. 2-3 sentences.}

{Second paragraph: Continue the joke/reference and end with something heartfelt. 2-3 sentences.}

{REQUIRED SIGN-OFF LINE based on relationship}

SIGN-OFF RULES (MANDATORY - NEVER SKIP):
- If relationship provided, use appropriate sign-off (e.g., "Love, Dad", "Your loving wife", etc.)
- If no clear relationship, use: "Wishing you a Merry Christmas!" or "With love and holiday cheer!"

STYLE GUIDELINES:
- Make specific puns or references to their quirk/obsession
- Be witty, warm, and personal - like an inside joke between loved ones
- Aim for 500-700 characters total

CRITICAL OUTPUT RULES:
- DO NOT include any headers or labels
- DO NOT include any asterisks, bold text, or formatting markers  
- ONLY output the card message itself: "Dear [name]," + two paragraphs + sign-off
- Start your response DIRECTLY with "Dear"
- The message MUST end with a sign-off line on its own line (THIS IS REQUIRED - NEVER OMIT)`;
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
        max_tokens: 400,
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

    // Enforce 500 character limit
    if (cardMessage.length > 500) {
      const truncated = cardMessage.substring(0, 497);
      const lastSentence = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      );
      cardMessage = lastSentence > 400 
        ? truncated.substring(0, lastSentence + 1) 
        : truncated + '...';
    }

    console.log(`✅ Generated greeting card message (${cardMessage.length} chars)`);
    return res.status(200).json({ cardMessage });
  } catch (error: any) {
    console.error('❌ Error generating greeting card message:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate message' });
  }
});

// Greeting card image generation using Gemini
app.post('/api/generate-greeting-card-image', async (req, res) => {
  console.log('\n🎨 GREETING CARD IMAGE GENERATION');
  
  try {
    const { conversationHistory, recipientName, specialAboutThem, funnyStory } = req.body;

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_API_KEY not set' 
      });
    }

    let imagePrompt: string;

    // If we have conversation history, extract info for the image
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const conversationText = conversationHistory
        .map((msg: any) => `${msg.role === 'assistant' ? 'Elf' : 'User'}: ${msg.content}`)
        .join('\n');

      // Use a simple extraction prompt
      imagePrompt = `Based on this conversation, create a festive Christmas card image:

CONVERSATION:
${conversationText}

Create a beautiful Christmas greeting card illustration that:
- Is in square 1:1 aspect ratio
- Displays "Merry Christmas" prominently
- Includes festive Christmas elements (snow, ornaments, presents, etc.)
- References any specific things mentioned about the recipient (hobbies, interests, funny stories)
- Style: cheerful, festive, humorous, cartoon-like
- CRITICAL: Do NOT show any people, faces, or human figures - only objects and decorations`;
    } else {
      // Legacy path
      if (!recipientName || !funnyStory) {
        return res.status(400).json({ 
          error: 'Missing required fields: recipientName, funnyStory' 
        });
      }

      imagePrompt = `A beautiful, personalized Christmas greeting card illustration in square 1:1 aspect ratio. The card should display the text "Merry Christmas ${recipientName}" prominently. `;
      if (specialAboutThem) {
        imagePrompt += `The image should reflect: ${specialAboutThem}. `;
      }
      imagePrompt += `Include items, objects, and elements that reference: ${funnyStory}. `;
      imagePrompt += `Style: cheerful, festive, humorous, cartoon-like. CRITICAL: Do NOT show any people, faces, or human figures.`;
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

// Rewrite greeting card for elf narrator
app.post('/api/rewrite-greeting-card-for-elf', async (req, res) => {
  console.log('\n🎄 REWRITE FOR ELF NARRATOR');
  
  try {
    const { originalMessage, senderName, recipientName } = req.body;

    if (!originalMessage || !senderName || !recipientName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    }

    const prompt = `Rewrite this greeting card message in third-person, as if one of Santa's elves is sharing a message that ${senderName} asked them to deliver to ${recipientName}.

Original message:
${originalMessage}

Requirements:
- Write in third person (use "${senderName}", "their", "they" instead of "I", "my", "me")
- Add a brief opening explaining that ${senderName} asked Santa's elves to share this message
- Keep the same warm, humorous tone
- End with a warm closing like "Happy holidays from Santa's Elves!"
- Keep under 700 characters total`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    let rewrittenMessage = data.content[0].text.trim();

    if (rewrittenMessage.length > 700) {
      rewrittenMessage = rewrittenMessage.substring(0, 697) + '...';
    }

    console.log('✅ Rewritten for elf narrator');
    return res.status(200).json({ rewrittenMessage });
  } catch (error: any) {
    console.error('❌ Error rewriting:', error);
    return res.status(500).json({ error: error.message });
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

    const workspace = 'christmas_story_generator';
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

    const selectedVoiceId = voiceId || 'christmas_story_generator__male_elf_narrator';
    console.log(`🎵 TTS - Voice: "${selectedVoiceId}", Text length: ${text.length}`);

    const { RemoteTTSNode, SequentialGraphBuilder } = await import('@inworld/runtime/graph');

    const graphBuilder = new SequentialGraphBuilder({
      id: `tts-${Date.now()}`,
      apiKey: process.env.INWORLD_API_KEY,
      enableRemoteConfig: false,
      nodes: [
        new RemoteTTSNode({
          speakerId: selectedVoiceId,
          modelId: process.env.INWORLD_MODEL_ID || 'inworld-tts-1',
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

            // Send as newline-delimited JSON (for WAV chunk streaming)
            const chunkData = {
              index: chunkIndex++,
              data: audioBuffer.toString('base64'),
              samples: audioBuffer.byteLength / 4, // Float32 = 4 bytes per sample
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

// Share story endpoint
app.post('/api/share-story', async (req, res) => {
  try {
    const { storyText, childName, voiceId, storyType, imageUrl, experienceType, senderName, relationship } = req.body;

    if (!storyText) {
      return res.status(400).json({ error: 'Missing storyText' });
    }

    const storyId = `story_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    sharedStories.set(storyId, {
      storyText,
      childName,
      voiceId,
      storyType,
      imageUrl: imageUrl || null,
      experienceType: experienceType || 'story',
      senderName,
      relationship,
      createdAt: new Date().toISOString()
    });

    const shareUrl = `${req.headers.origin || 'https://inworld-christmas.vercel.app'}/share/${storyId}`;
    res.json({ storyId, shareUrl });
  } catch (error: any) {
    console.error('Error sharing story:', error);
    res.status(500).json({ error: 'Failed to share story' });
  }
});

// Get shared story
app.get('/api/story/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const story = sharedStories.get(id);

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json(story);
  } catch (error: any) {
    console.error('Error retrieving story:', error);
    res.status(500).json({ error: 'Failed to retrieve story' });
  }
});

// Story generation endpoint - uses inline graph creation
app.post('/api/generate-story', async (req, res) => {
  console.log('\n📖 STORY GENERATION ENDPOINT');
  
  try {
    const { storyType, childName, apiKey } = req.body;

    if (!storyType || !childName) {
      return res.status(400).json({ 
        error: 'Missing required fields: storyType and childName' 
      });
    }

    const selectedApiKey = apiKey || process.env.INWORLD_API_KEY;
    if (!selectedApiKey) {
      return res.status(500).json({ 
        error: 'INWORLD_API_KEY not set' 
      });
    }

    console.log(`📖 Generating story for "${childName}" about "${storyType}"`);

    // Import and create graph inline (avoid path issues with graph.js)
    const { RemoteLLMChatNode, SequentialGraphBuilder } = await import('@inworld/runtime/graph');
    
    const graphBuilder = new SequentialGraphBuilder({
      id: 'storyteller-llm-text-only',
      apiKey: selectedApiKey,
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
                template: `You are a creative and playful Christmas storyteller who writes fun, energetic stories in the style of Robert Munsch. You MUST follow the user's story topic requirements exactly. All stories should have a Christmas theme and end with the child having a wonderful Christmas filled with joy, magic, and happiness.`,
              },
            },
            {
              role: 'user',
              content: {
                type: 'template',
                template: `You are writing a personalized Christmas story for a child named {{childName}}.

CRITICAL REQUIREMENT - THE STORY MUST BE ABOUT THIS EXACT TOPIC:
"{{storyType}}"

Story Requirements:
- Start with a title on the first line in the format: "Title: [Story Title]"
- The main character is {{childName}}
- {{childName}} is the hero of the story
- The story is specifically about: {{storyType}}
- Include classic Christmas elements: Santa Claus, reindeer, elves, Christmas trees, presents, snow, the North Pole, Christmas magic
- Write in the style of Robert Munsch: playful, energetic, silly, and full of fun
- Keep it to about 200-250 words
- The story MUST end with {{childName}} having a wonderful Christmas
- DO NOT use onomatopoeia or ALL-CAPS
- DO NOT end with the child falling asleep`,
              },
            },
          ],
        }),
      ],
    });

    const graph = graphBuilder.build();

    const { outputStream } = await graph.start({
      childName,
      storyType,
    });

    // Set headers for streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    let storyText = '';
    let firstChunkSent = false;
    let done = false;

    while (!done) {
      const result = await outputStream.next();
      
      await result.processResponse({
        ContentStream: async (contentStream: AsyncIterable<{ text?: string }>) => {
          for await (const chunk of contentStream) {
            if (chunk.text) {
              storyText += chunk.text;
              
              if (!firstChunkSent && storyText.length >= 100) {
                const sentenceEnd = storyText.search(/[.!?]\s+/);
                const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.6 
                  ? storyText.substring(0, sentenceEnd + 1).trim()
                  : storyText.substring(0, Math.min(200, storyText.length)).trim();
                
                if (firstChunk.length >= 80) {
                  res.write(JSON.stringify({ 
                    chunkIndex: 0, 
                    text: firstChunk, 
                    isFirst: true,
                    isComplete: false 
                  }) + '\n');
                  firstChunkSent = true;
                }
              }
            }
          }
        },
        string: (text: string) => {
          storyText += text;
          
          if (!firstChunkSent && storyText.length >= 100) {
            const sentenceEnd = storyText.search(/[.!?]\s+/);
            const firstChunk = sentenceEnd > 0 && sentenceEnd < storyText.length * 0.6 
              ? storyText.substring(0, sentenceEnd + 1).trim()
              : storyText.substring(0, Math.min(200, storyText.length)).trim();
            
            if (firstChunk.length >= 80) {
              res.write(JSON.stringify({ 
                chunkIndex: 0, 
                text: firstChunk, 
                isFirst: true,
                isComplete: false 
              }) + '\n');
              firstChunkSent = true;
            }
          }
        },
        default: (data: any) => {
          if (data?.text) {
            storyText += data.text;
          }
        },
      });

      done = result.done;
    }

    await graph.stop();

    if (!storyText || storyText.trim().length === 0) {
      console.error('❌ No story text generated');
      return res.status(500).json({ error: 'No story generated' });
    }

    console.log(`✅ Generated story: ${storyText.substring(0, 100)}...`);

    // Send final chunk
    if (firstChunkSent) {
      res.write(JSON.stringify({ 
        chunkIndex: 1, 
        text: storyText.trim(),
        isFirst: false,
        isComplete: true 
      }) + '\n');
    } else {
      // Story was short, send it all at once
      res.write(JSON.stringify({ 
        chunkIndex: 0, 
        text: storyText.trim(), 
        isFirst: true,
        isComplete: true 
      }) + '\n');
    }
    
    res.end();
  } catch (error: any) {
    console.error('❌ Story generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Story generation failed' });
    } else {
      res.end();
    }
  }
});

// Story image generation using Gemini
app.post('/api/generate-story-image', async (req, res) => {
  console.log('\n🎨 STORY IMAGE GENERATION');
  
  try {
    const { storyType, childName, storyText } = req.body;

    // storyType and childName are required; storyText is optional
    if (!storyType || !childName) {
      return res.status(400).json({ 
        error: 'Missing required fields: storyType, childName' 
      });
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'GOOGLE_API_KEY not set' 
      });
    }

    console.log(`🎨 Child name: ${childName}`);
    console.log(`🎨 Story type: ${storyType}`);

    // Build image prompt based on story type and character name
    let imagePrompt = `Create a beautiful children's Christmas story book cover illustration. `;
    imagePrompt += `Story theme: ${storyType}. `;
    imagePrompt += `The illustration should be related to the story plot and theme, but do NOT include the story title as text on the cover. `;
    imagePrompt += `Include the name "${childName}" somewhere naturally in the image (for example, on a letter, name tag, or sign), but NOT as a large title. `;
    imagePrompt += `CRITICAL: Do NOT depict or show the main character ${childName} in the image. `;
    imagePrompt += `It is okay to include Santa Claus, elves, reindeer, Christmas decorations, magical elements, and other story-related items, but absolutely NO depiction of the main character. `;
    imagePrompt += `The image should be a scene related to the ${storyType} story theme, showing the setting, magical elements, and supporting characters (like Santa or elves), but never the main character. `;
    imagePrompt += `Style: warm, whimsical, hand-drawn children's book illustration with soft colors, friendly characters, magical Christmas atmosphere, classic children's storybook art style. `;
    imagePrompt += `The illustration should look like the cover of a beloved children's Christmas storybook. `;
    imagePrompt += `Make it visually appealing and related to the story theme without showing any human main character.`;

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
          console.log(`✅ Generated story image (${imageUrl.length} chars)`);
          break;
        }
      }
    }

    if (!imageUrl) {
      console.warn('⚠️ No image data in response');
    }
    
    return res.status(200).json({ imageUrl });
  } catch (error: any) {
    console.error('❌ Error generating story image:', error);
    return res.status(200).json({ imageUrl: null, error: error.message });
  }
});

// Start server
server.listen(WS_APP_PORT, async () => {
  try {
    await inworldApp.initialize();
  } catch (error) {
    console.error(error);
  }

  console.log(`🚀 Server running on port ${WS_APP_PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${WS_APP_PORT}/session`);
  console.log(`🔌 REST API endpoints:`);
  console.log(`   POST /load - Create session`);
  console.log(`   POST /unload - End session`);
  console.log(`   POST /api/generate-story`);
  console.log(`   POST /api/generate-story-image`);
  console.log(`   POST /api/generate-greeting-card-message`);
  console.log(`   POST /api/generate-greeting-card-image`);
  console.log(`   POST /api/clone-voice`);
  console.log(`   POST /api/share-story`);
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
