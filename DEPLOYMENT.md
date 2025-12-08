# Deployment Guide

Due to Vercel's 250MB serverless function size limit, the backend must be deployed separately from the frontend.

## Architecture

- **Frontend**: Deployed on Vercel (static site)
- **Backend**: Deployed separately (Railway, Render, Fly.io, etc.)

## Frontend Deployment (Vercel)

1. **Deploy to Vercel**:
   ```bash
   cd "/Users/clintmclean/Christmas Personalized Storyteller"
   vercel --prod
   ```

2. **Set Environment Variable in Vercel Dashboard**:
   - Go to your Vercel project settings
   - Navigate to "Environment Variables"
   - Add: `VITE_API_URL` = `https://your-backend-url.com`
   - Apply to: Production, Preview, Development

3. **Redeploy** to apply the environment variable:
   ```bash
   vercel --prod
   ```

## Backend Deployment

### Option 1: Railway (Recommended)

1. **Install Railway CLI**:
   ```bash
   npm i -g @railway/cli
   ```

2. **Login and Initialize**:
   ```bash
   railway login
   cd "/Users/clintmclean/Christmas Personalized Storyteller"
   railway init
   ```

3. **Set Environment Variables**:
   ```bash
   railway variables set GOOGLE_API_KEY=your_key
   railway variables set INWORLD_API_KEY=your_key
   railway variables set INWORLD_VOICE_ID=Wendy  # optional
   railway variables set INWORLD_MODEL_ID=inworld-tts-1-max  # optional
   railway variables set PORT=3001
   ```

4. **Deploy**:
   ```bash
   railway up
   ```

5. **Get the URL**:
   ```bash
   railway domain
   ```
   Use this URL as your `VITE_API_URL` in Vercel.

### Option 2: Render

1. **Create a new Web Service** on Render
2. **Connect your repository**
3. **Configure**:
   - Build Command: (leave empty - backend doesn't need build)
   - Start Command: `node server.js`
   - Environment: Node
4. **Set Environment Variables**:
   - `GOOGLE_API_KEY`
   - `INWORLD_API_KEY`
   - `INWORLD_VOICE_ID` (optional)
   - `INWORLD_MODEL_ID` (optional)
   - `PORT` (optional, defaults to 3001)
5. **Deploy** and use the provided URL as `VITE_API_URL`

### Option 3: Fly.io

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and Initialize**:
   ```bash
   fly auth login
   cd "/Users/clintmclean/Christmas Personalized Storyteller"
   fly launch
   ```

3. **Set Secrets**:
   ```bash
   fly secrets set GOOGLE_API_KEY=your_key
   fly secrets set INWORLD_API_KEY=your_key
   fly secrets set INWORLD_VOICE_ID=Wendy
   fly secrets set INWORLD_MODEL_ID=inworld-tts-1-max
   ```

4. **Deploy**:
   ```bash
   fly deploy
   ```

## Local Development

For local development, both frontend and backend run together:

```bash
npm run dev:all
```

This starts:
- Backend server on `http://localhost:3001`
- Frontend dev server (automatically uses `http://localhost:3001`)

## Environment Variables Summary

### Frontend (Vercel)
- `VITE_API_URL` - Backend API URL (e.g., `https://your-backend.railway.app`)

### Backend (Railway/Render/Fly.io)
- `GOOGLE_API_KEY` - Google AI API key for story generation
- `INWORLD_API_KEY` - Inworld API key (Base64-encoded) for TTS
- `INWORLD_VOICE_ID` - Voice ID (optional, defaults to 'Wendy')
- `INWORLD_MODEL_ID` - TTS model ID (optional, defaults to 'inworld-tts-1-max')
- `PORT` - Server port (optional, defaults to 3001)

## Troubleshooting

### CORS Errors
Make sure your backend URL is correctly set in `VITE_API_URL` and that the backend CORS configuration allows requests from your Vercel domain.

### API Not Found
- Verify `VITE_API_URL` is set in Vercel environment variables
- Check that the backend is running and accessible
- Ensure the backend URL doesn't have a trailing slash

### Build Errors
- Make sure `api/` and `graph.js` are excluded from Vercel (they're in `.vercelignore`)
- The frontend build only needs `src/`, `tsconfig.json`, `vite.config.ts`, and `index.html`

