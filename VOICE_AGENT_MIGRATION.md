# Voice Agent Architecture Migration

## Overview

This migration replaces the old `server.js` with a new voice agent architecture based on the Inworld Runtime templates. The new architecture uses:

- **WebSocket** for real-time audio streaming (instead of browser SpeechRecognition)
- **Assembly.AI STT** for server-side speech-to-text
- **Inworld Runtime Graph** for LLM and TTS processing
- **TypeScript** for type safety

## Directory Structure

```
/server/                    # New TypeScript server
├── index.ts               # Main server entry point
├── constants.ts           # Configuration constants
├── types.ts               # TypeScript types
├── helpers.ts             # Environment parsing
├── components/
│   ├── app.ts             # InworldApp class (session management)
│   ├── graph.ts           # Graph pipeline setup
│   ├── message_handler.ts # WebSocket message handling
│   ├── audio_stream_manager.ts
│   ├── event_factory.ts
│   └── nodes/             # Graph nodes
│       ├── assembly_ai_stt_ws_node.ts
│       ├── dialog_prompt_builder_node.ts
│       ├── text_input_node.ts
│       ├── state_update_node.ts
│       └── ...
└── models/
    └── silero_vad.onnx    # Voice Activity Detection model

/src/services/
└── voiceSessionService.ts  # Client-side WebSocket service

/src/components/
└── VoiceConversation.tsx   # New voice conversation component

/public/
└── audio-processor.worklet.js  # Audio capture worklet
```

## Running Locally

### 1. Install Server Dependencies

```bash
cd server
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the `server/` directory:

```bash
cp server/.env-sample server/.env
```

Edit `server/.env` with your API keys:

```env
INWORLD_API_KEY=your_inworld_api_key
ASSEMBLY_AI_API_KEY=your_assembly_ai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_api_key
```

### 3. Start the Server

```bash
# From root directory
npm run dev:server

# Or from server directory
cd server && npm start
```

The server runs on port 3001 by default (or PORT env variable).

### 4. Start the Frontend

In a separate terminal:

```bash
npm run dev
```

## API Endpoints

### WebSocket

- `ws://localhost:3001/session?sessionId=xxx` - Audio streaming

### REST

- `POST /load` - Create a voice session
- `POST /unload` - End a voice session
- `POST /api/generate-greeting-card-message` - Generate card message
- `POST /api/generate-greeting-card-image` - Generate card image
- `POST /api/rewrite-greeting-card-for-elf` - Rewrite for elf narrator
- `POST /api/clone-voice` - Clone a voice
- `POST /api/share-story` - Share a story
- `GET /api/story/:id` - Get shared story

## Railway Deployment

The `railway.json` and `nixpacks.toml` have been updated to use the new server:

```json
{
  "deploy": {
    "startCommand": "cd server && npm start"
  }
}
```

Make sure to set the same environment variables in Railway.

## Client Integration

The new `VoiceConversation.tsx` component uses WebSocket for audio:

1. Creates a session via POST `/load`
2. Connects WebSocket to `/session`
3. Streams audio chunks to server
4. Receives TTS audio back for playback

To use it, import and render:

```tsx
import VoiceConversation from './components/VoiceConversation'

<VoiceConversation
  experienceType="greeting-card"
  userName="User"
  onSubmit={handleSubmit}
  onBack={handleBack}
/>
```

## Migration Notes

- The old `server.js` is kept for reference but is no longer used
- The old `ConversationalQuestionnaire.tsx` uses browser SpeechRecognition (still works as fallback)
- The new `VoiceConversation.tsx` uses WebSocket audio streaming
