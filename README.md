# 🎄 Personalized Christmas Storyteller
A delightful web application powered by Inworld AI that creates personalized Christmas stories for children. Using Inworld's Runtime technology, the AI storyteller generates custom stories and narrates them with Inworld's high-quality TTS voices, including support for custom voice clones.


## ✨ Features
- 🎭 **Personalized Stories**: AI generates unique Christmas stories featuring the child as the main character
- 🎙️ **Multiple Narrator Options**: Choose from preset elf narrators (Holly and Clark) or create your own custom narrator
- 🎨 **Custom Voice Clones**: Support for Inworld Voice Clone technology - users can bring their own voices
- ⚡ **Ultra-Fast Generation**: Progressive story generation with TTS starting in 2-3 seconds
- 🔊 **High-Quality Narration**: Powered by Inworld TTS with temperature control for expressive voices
- 📱 **Responsive Design**: Beautiful, child-friendly interface that works on all devices
- 🔗 **Story Sharing**: Share generated stories via unique links
- 🎄 **Christmas Themed**: Fully themed with Christmas colors, characters, and story types

## 🚀 Quick Start

### Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- A Google AI API key ([Get one here](https://aistudio.google.com/app/apikey))
- An Inworld API key ([Get one here](https://studio.inworld.ai/))

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/inworld-ai/personalized-christmas-storyteller.git
   cd personalized-christmas-storyteller
   ```
   
   Or if you prefer SSH:
   ```bash
   git clone git@github.com:inworld-ai/personalized-christmas-storyteller.git
   cd personalized-christmas-storyteller
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   
   Create a `.env` file in the root directory:
   ```env
   GOOGLE_API_KEY=your_google_api_key_here
   INWORLD_API_KEY=your_base64_inworld_api_key_here
   INWORLD_VOICE_ID=christmas_story_generator__holly_the_elf
   INWORLD_MODEL_ID=inworld-tts-1-max
   ```

   **Important Notes:**
   - **Google AI API Key**: Get from [Google AI Studio](https://aistudio.google.com/app/apikey) - used for story generation
   - **Inworld API Key**: Get from [Inworld Studio](https://studio.inworld.ai/) → Settings → API Keys. Must be the **Base64-encoded** key
   - **Inworld Voice ID**: Default voice to use. The app includes preset voices for "Holly the Elf" and "Clark the Elf"
   - **Inworld Model ID**: Use `inworld-tts-1-max` (default, better quality) or `inworld-tts-1` (faster)

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

1. **Story Type Selection**: Choose from preset Christmas story types (Meeting Santa Claus, Christmas Eve Adventure, Elf Workshop Visit) or create a custom story idea
2. **Character Name**: Enter the child's name (or any name) to personalize the story
3. **Narrator Selection**: Choose from preset narrators or create a custom narrator with your own Inworld API key and Voice ID
4. **Story Generation**: AI generates a personalized Christmas story using Google's Gemini Flash Lite
5. **Progressive TTS**: Text-to-speech starts playing as soon as the first chunk is ready (2-3 seconds)
6. **Story Narration**: High-quality narration with Inworld TTS, with support for custom voice clones
7. **Sharing**: Share stories via unique links that preserve the story text and narrator choice

## 🏗️ Architecture

This application uses **Inworld Runtime** to create an AI workflow that combines:

- **LLM Node** (Google Gemini Flash Lite): Generates personalized Christmas stories
- **TTS Node** (Inworld TTS): Converts story text to high-quality speech
- **Progressive Streaming**: Story text streams from LLM while TTS generates audio in parallel

### Technology Stack

**Frontend:**
- React 18 + TypeScript
- Vite for build tooling
- React Router for navigation
- Web Audio API for audio playback

**Backend:**
- Node.js + Express
- Inworld Runtime SDK
- Google Gemini Flash Lite API
- Progressive WAV chunking for low-latency audio

## 🎤 Custom Narrator Support

Users can create their own narrator by:

1. Logging into [Inworld Studio](https://studio.inworld.ai/)
2. Creating a Voice Clone (TTS → Clone Voice)
3. Getting their API Key (API Keys → Copy Base64 key)
4. Getting their Voice ID (TTS → Select Voice list)
5. Entering these in the "Create Your Own Narrator" page

The app supports both standard Inworld voices and custom voice clones.

## 📦 Deployment

### Vercel (Frontend)

```bash
npm i -g vercel
vercel
vercel env add GOOGLE_API_KEY
vercel env add INWORLD_API_KEY
vercel --prod
```

### Railway (Backend)

See `RAILWAY_SETUP.md` for detailed instructions.

The backend requires a persistent Node.js process, so Railway or similar platforms work best.

## 🎨 Customization

### Story Types

Edit `src/components/StoryTypeSelection.tsx` to add or modify preset story options.

### Story Prompts

Modify the system and user prompts in `graph.js` to change story style, length, or theme.

### TTS Settings

Adjust TTS temperature, sample rate, or model in `graph.js`:
```javascript
new RemoteTTSNode({
  speakerId: selectedVoiceId,
  modelId: 'inworld-tts-1-max',
  sampleRate: 24000,
  temperature: 1.1, // Adjust for more/less expressive voice
})
```

### UI Theme

Modify colors and styling in:
- `src/index.css` - Global styles
- `src/components/*.css` - Component-specific styles

## 📚 API Endpoints

- `POST /api/generate-story` - Generate a personalized story
- `POST /api/tts` - Convert text to speech
- `POST /api/share-story` - Share a story and get a shareable link
- `GET /api/story/:id` - Retrieve a shared story

## 🔒 Security

- All API keys are stored server-side only
- Frontend never directly accesses Google AI or Inworld APIs
- Custom API keys for custom narrators are only used for that user's requests

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request


## 🙏 Acknowledgments

- Built with [Inworld Runtime](https://github.com/inworld-ai/inworld-runtime)
- Story generation powered by [Google Gemini](https://ai.google.dev/)
- TTS powered by [Inworld AI](https://www.inworld.ai/)

## 📧 Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check the [Inworld Documentation](https://docs.inworld.ai/)
- Visit [Inworld Community](https://community.inworld.ai/)

---

Made with ❤️ using Inworld Runtime
