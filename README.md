# 🎄 Story & Greeting Card Creator

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Powered by Inworld AI](https://img.shields.io/badge/Powered_by-Inworld_AI-orange)](https://inworld.ai/runtime)
[![Documentation](https://img.shields.io/badge/Documentation-Read_Docs-blue)](https://docs.inworld.ai/)

A delightful web application powered by Inworld AI that creates personalized Christmas stories and greeting cards. Using Inworld's Runtime technology, the AI generates custom content and narrates it with high-quality TTS voices, including support for custom voice clones.

## ✨ Features

- 🎭 **Personalized Stories**: AI generates unique Christmas stories featuring the child as the main character
- 💌 **Custom Greeting Cards**: AI-generated Christmas cards with personalized messages and images
- 🎙️ **Multiple Narrator Options**: Choose from preset elf narrators (Holly, Clark, Ralphy) or create your own
- 🎨 **Custom Voice Clones**: Record your voice directly in the browser to create a personalized narrator
- ⚡ **Ultra-Fast Generation**: Progressive story generation with TTS starting in 2-3 seconds
- 🔊 **High-Quality Narration**: Powered by Inworld TTS with expressive voices
- 📱 **Responsive Design**: Beautiful, child-friendly interface that works on all devices
- 🔗 **Easy Sharing**: Share generated stories and cards via unique links
- 🎄 **Christmas Themed**: Fully themed with Christmas colors, characters, and story types

## 🚀 Quick Start

### Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- API Keys:
  - [Inworld API Key](https://studio.inworld.ai/) (Base64-encoded)
  - [Google AI API Key](https://aistudio.google.com/app/apikey) (for story generation & images)
  - [Anthropic API Key](https://console.anthropic.com/) (for greeting card messages)
  - [Assembly.AI API Key](https://www.assemblyai.com/) (for voice input)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/inworld-ai/story-greetingcard-creator.git
   cd story-greetingcard-creator
   ```

2. **Install dependencies**:
   ```bash
   # Install frontend dependencies
   npm install
   
   # Install server dependencies
   cd server && npm install && cd ..
   ```

3. **Set up environment variables**:
   
   Copy the sample env file and add your API keys:
   ```bash
   cp server/.env-sample server/.env
   ```
   
   Edit `server/.env`:
   ```env
   INWORLD_API_KEY=your_base64_inworld_api_key
   GOOGLE_API_KEY=your_google_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ASSEMBLY_AI_API_KEY=your_assembly_ai_api_key
   ```

4. **Run the application**:
   ```bash
   # Run both frontend and backend together
   npm run dev:all
   ```
   
   Or run separately:
   ```bash
   # Terminal 1: Backend server
   npm run dev:server
   
   # Terminal 2: Frontend
   npm run dev
   ```

   - Backend: `http://localhost:3001`
   - Frontend: `http://localhost:5173`

## 🎯 How It Works

### Christmas Story Creator
1. **Story Type Selection**: Choose from preset Christmas story types or create a custom idea
2. **Character Name**: Enter the child's name to personalize the story
3. **Narrator Selection**: Choose from preset narrators or create a custom voice clone
4. **Story Generation**: AI generates a personalized Christmas story
5. **Progressive TTS**: Narration starts playing within 2-3 seconds
6. **Sharing**: Share stories via unique links

### Christmas Card Creator
1. **Recipient Info**: Enter the recipient's name and a fun fact about them
2. **Sender Info**: Add your sign-off message
3. **AI Generation**: Creates a personalized message and cover image
4. **Narration**: Card message is read aloud with chosen narrator
5. **Sharing**: Share cards via unique links

## 🏗️ Architecture

This application uses **Inworld Runtime** to create AI workflows combining:

- **LLM Node** (Google Gemini): Generates personalized stories
- **TTS Node** (Inworld TTS): Converts text to high-quality speech
- **Image Generation** (Google Imagen): Creates card cover images
- **Voice Cloning** (Inworld): Creates custom narrator voices

### Technology Stack

**Frontend:**
- React 18 + TypeScript
- Vite for build tooling
- React Router for navigation
- Web Audio API for audio playback

**Backend:**
- Node.js + Express + TypeScript
- Inworld Runtime SDK
- Redis for persistent storage
- WebSocket for real-time audio

## 📦 Deployment

### Architecture Overview

Due to the size of Inworld Runtime dependencies, the app uses a split deployment:
- **Frontend**: Vercel (static site)
- **Backend**: Railway (Node.js server with Redis)

### Step 1: Deploy Backend to Railway

1. **Create a Railway project** at [railway.app](https://railway.app)

2. **Add Redis** (for persistent story sharing):
   - Click "New" → "Database" → "Redis"

3. **Deploy from GitHub**:
   - Connect your repository
   - Railway will auto-detect the configuration

4. **Set environment variables** in Railway dashboard:
   ```
   INWORLD_API_KEY=your_base64_inworld_api_key
   GOOGLE_API_KEY=your_google_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ASSEMBLY_AI_API_KEY=your_assembly_ai_api_key
   ```

5. **Link Redis**:
   - Go to your web service → Variables
   - Click "New Variable" → "Add Reference" → Select your Redis service → Select `REDIS_URL`

6. **Get your backend URL**:
   - Go to Settings → Networking → Generate Domain
   - Copy the URL (e.g., `https://your-app.railway.app`)

### Step 2: Deploy Frontend to Vercel

1. **Deploy via CLI**:
   ```bash
   npm i -g vercel
   vercel
   ```

2. **Set environment variable** in Vercel dashboard:
   - `VITE_API_URL` = `https://your-backend.railway.app`

3. **Deploy to production**:
   ```bash
   vercel --prod
   ```

### URL Structure

- `/` - Landing page with both experience options
- `/storyteller` - Christmas Story Creator
- `/christmascard` - Christmas Card Creator  
- `/share/:id` - Shared story/card view

## 🎤 Custom Voice Clone

Users can create their own narrator by recording directly in the browser:

1. Click "Create Your Own Narrator"
2. Select "Record Voice Clone"
3. Speak for 10-15 seconds
4. Enter a name for the voice
5. Voice is cloned instantly and used for narration

Alternatively, users with existing Inworld voice clones can enter their API key and Voice ID directly.

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `INWORLD_API_KEY` | Yes | Inworld API key (Base64-encoded) |
| `GOOGLE_API_KEY` | Yes | Google AI API key (for LLM + images) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (for card messages) |
| `ASSEMBLY_AI_API_KEY` | Yes | Assembly.AI key (for speech-to-text) |
| `REDIS_URL` | Yes (prod) | Redis connection URL |
| `INWORLD_PORTAL_API_KEY` | No | For voice cloning (uses INWORLD_API_KEY if not set) |
| `TTS_MODEL_ID` | No | Default: `inworld-tts-1-max` |

### Customization

**Story Types**: Edit `src/components/StoryTypeSelection.tsx`

**TTS Settings**: Adjust in `server/components/graph.ts`:
```typescript
new RemoteTTSNode({
  speakerId: selectedVoiceId,
  modelId: 'inworld-tts-1-max',
  sampleRate: 24000,
  temperature: 1.1,
})
```

**UI Theme**: Modify styles in `src/index.css` and component CSS files

## 📚 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate-story` | POST | Generate a personalized story |
| `/api/tts` | POST | Convert text to speech |
| `/api/generate-greeting-card-message` | POST | Generate card message |
| `/api/generate-greeting-card-image` | POST | Generate card cover image |
| `/api/clone-voice` | POST | Clone a voice from audio |
| `/api/share-story` | POST | Share a story/card |
| `/api/story/:id` | GET | Retrieve a shared story/card |
| `/health` | GET | Health check |

## 🔒 Security

- All API keys are stored server-side only
- Frontend never directly accesses external APIs
- Custom API keys for voice clones are only used for that user's requests
- Shared stories are stored with Redis TTL (30 days)

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- Built with [Inworld Runtime](https://github.com/inworld-ai/inworld-runtime)
- Story generation powered by [Google Gemini](https://ai.google.dev/)
- TTS powered by [Inworld AI](https://www.inworld.ai/)
- Card messages powered by [Anthropic Claude](https://www.anthropic.com/)

## 📧 Support

- **Bug Reports**: [GitHub Issues](https://github.com/inworld-ai/story-greetingcard-creator/issues)
- **Documentation**: [Inworld Docs](https://docs.inworld.ai/)
- **Community**: [Inworld Community](https://community.inworld.ai/)
- **Email**: support@inworld.ai

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Made with ❤️ using Inworld Runtime
