# Backend Deployment Guide (Inworld Runtime)

Your backend is now configured to use **Inworld Runtime**. Deploy it to Railway, Render, or Fly.io.

## Quick Start: Railway (Recommended)

### 1. Install Railway CLI
```bash
npm i -g @railway/cli
```

### 2. Login and Deploy
```bash
cd "/Users/clintmclean/Christmas Personalized Storyteller"
railway login
railway init
railway up
```

### 3. Set Environment Variables
```bash
railway variables set GOOGLE_API_KEY=your_google_api_key
railway variables set INWORLD_API_KEY=your_base64_inworld_api_key
railway variables set INWORLD_VOICE_ID=Wendy  # optional
railway variables set INWORLD_MODEL_ID=inworld-tts-1-max  # optional
railway variables set PORT=3001
```

### 4. Get Your Backend URL
```bash
railway domain
```
This will give you a URL like: `https://your-app.railway.app`

### 5. Configure Frontend (Vercel)
1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add: `VITE_API_URL` = `https://your-app.railway.app`
4. Redeploy your frontend

## Alternative: Render

1. Go to [render.com](https://render.com) and create a new **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: (leave empty)
   - **Start Command**: `node server.js`
   - **Environment**: Node
4. Set environment variables:
   - `GOOGLE_API_KEY`
   - `INWORLD_API_KEY`
   - `INWORLD_VOICE_ID` (optional)
   - `INWORLD_MODEL_ID` (optional)
   - `PORT` (optional, defaults to 3001)
5. Deploy and use the provided URL as `VITE_API_URL` in Vercel

## Alternative: Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login and initialize
fly auth login
cd "/Users/clintmclean/Christmas Personalized Storyteller"
fly launch

# Set secrets
fly secrets set GOOGLE_API_KEY=your_key
fly secrets set INWORLD_API_KEY=your_key
fly secrets set INWORLD_VOICE_ID=Wendy
fly secrets set INWORLD_MODEL_ID=inworld-tts-1-max

# Deploy
fly deploy
```

## Environment Variables Required

| Variable | Required | Description |
|---------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ Yes | Google AI API key (for LLM via Inworld Runtime) |
| `INWORLD_API_KEY` | ✅ Yes | Inworld API key (Base64-encoded) |
| `INWORLD_VOICE_ID` | ❌ No | Default: 'Wendy' |
| `INWORLD_MODEL_ID` | ❌ No | Default: 'inworld-tts-1-max' |
| `PORT` | ❌ No | Default: 3001 |

## Testing Locally

Before deploying, test locally:
```bash
npm run dev:server
```

The server should start on `http://localhost:3001` and show:
```
🚀 Server running on http://localhost:3001
📝 API Keys configured:
   - Google (for LLM): ✓
   - Inworld (for TTS): ✓
🔄 Using Inworld Runtime for story generation
```

## Troubleshooting

### CORS Errors
The backend includes CORS headers. If you see CORS errors:
- Make sure your backend URL is correct in `VITE_API_URL`
- Check that the backend is running and accessible
- Verify CORS is enabled in `server.js` (it should be)

### API Key Errors
- Verify all environment variables are set correctly
- Check that `GOOGLE_API_KEY` is valid (not Base64-encoded)
- Check that `INWORLD_API_KEY` is Base64-encoded

### Connection Errors
- Test the backend health endpoint: `https://your-backend-url.com/health`
- Should return: `{"status":"ok"}`
- If it fails, check backend logs

