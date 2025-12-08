# Quick Deployment Guide

## The Problem
Inworld Runtime + all dependencies exceeds Vercel's 250MB serverless function limit. Solution: Deploy backend separately.

## 3-Step Solution

### Step 1: Deploy Backend to Railway (2 minutes)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Deploy
cd "/Users/clintmclean/Christmas Personalized Storyteller"
railway login
railway init
railway up
```

### Step 2: Set Environment Variables in Railway

```bash
railway variables set GOOGLE_API_KEY=your_google_api_key
railway variables set INWORLD_API_KEY=your_base64_inworld_api_key
railway variables set INWORLD_VOICE_ID=Wendy
railway variables set INWORLD_MODEL_ID=inworld-tts-1-max
```

### Step 3: Get Backend URL and Configure Vercel

```bash
# Get your backend URL
railway domain
# Example output: https://your-app.railway.app
```

Then in Vercel Dashboard:
1. Go to your project → Settings → Environment Variables
2. Add: `VITE_API_URL` = `https://your-app.railway.app` (from railway domain command)
3. Redeploy frontend

## That's It!

- Frontend: Vercel (already deployed ✅)
- Backend: Railway (deploy with commands above)
- Connection: Set `VITE_API_URL` in Vercel

## Test

1. Backend health: `https://your-backend.railway.app/health` → should return `{"status":"ok"}`
2. Frontend: Visit your Vercel URL and create a story

## Alternative: Render.com

If you prefer Render:
1. Go to render.com → New Web Service
2. Connect GitHub repo
3. Start Command: `node server.js`
4. Add same environment variables
5. Deploy
6. Use Render URL as `VITE_API_URL` in Vercel

