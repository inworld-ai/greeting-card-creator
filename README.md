# Personalized Greeting Card Creator

Create personalized greeting cards with AI-generated messages, images, and voice narration powered by Inworld AI.

## Features

- **Multiple Occasions**: Birthday, Wedding, Thank You, Congratulations, Get Well, Anniversary, New Baby, Graduation, Thinking of You, or Custom
- **AI-Generated Messages**: Uses Claude to create personalized, funny, heartfelt messages
- **AI-Generated Images**: Uses Gemini to create custom card cover art
- **Custom Voice Narration**: Uses Inworld to narrate the card's message or add your own voice
- **Shareable Cards**: Share your creations via link

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **AI Services**:
  - Anthropic Claude (message generation)
  - Google Gemini (image generation)
  - Inworld Runtime (TTS & voice cloning)
- **Storage**: Redis (optional, for persistent card sharing)

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Environment Variables

Create a `.env` file in the `server/` directory:

```env
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_API_KEY=your_google_api_key
INWORLD_API_KEY=your_inworld_api_key

# Optional
INWORLD_PORTAL_API_KEY=your_inworld_portal_key  # For voice cloning
INWORLD_WORKSPACE=greeting_card_creator         # Your Inworld workspace
REDIS_URL=redis://localhost:6379                # For persistent storage
```

### Development

1. Install dependencies:
```bash
npm install
cd server && npm install
```

2. Start both frontend and backend:
```bash
npm run dev:all
```

Or start them separately:
```bash
# Terminal 1 - Backend
npm run dev:server

# Terminal 2 - Frontend
npm run dev
```

3. Open http://localhost:5173

### Build for Production

```bash
npm run build
```

## Deployment

### Frontend (Vercel)

1. Create a new Vercel project
2. Set environment variable:
   - `VITE_API_URL`: Your Railway backend URL

### Backend (Railway)

1. Create a new Railway project
2. Set environment variables:
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_API_KEY`
   - `INWORLD_API_KEY`
   - `REDIS_URL` (optional)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate-greeting-card-message` | POST | Generate card message |
| `/api/generate-greeting-card-image` | POST | Generate card cover image |
| `/api/clone-voice` | POST | Clone voice from audio sample |
| `/api/tts` | POST | Text-to-speech synthesis |
| `/api/share-story` | POST | Create shareable card link |
| `/api/story/:id` | GET | Retrieve shared card |
