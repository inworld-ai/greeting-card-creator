# Railway Backend Setup - Quick Fix

## Your Backend URL
**Use this in Vercel:**
```
https://inworld-christmas-story-production.up.railway.app
```

## Fix the Deployment

The deployment failed because the build tried to run `npm run build` (which builds the frontend), but the backend doesn't need that.

### Option 1: Set Environment Variables via Railway Dashboard (Easiest)

1. Go to: https://railway.com/project/fef14a24-c98a-40d7-8623-29d738d46ea9
2. Click on your service
3. Go to **Variables** tab
4. Add these environment variables:
   - `GOOGLE_API_KEY` = your Google API key
   - `INWORLD_API_KEY` = your Base64 Inworld API key
   - `INWORLD_VOICE_ID` = `Wendy` (optional)
   - `INWORLD_MODEL_ID` = `inworld-tts-1-max` (optional)
   - `PORT` = `3001` (optional)

5. Go to **Settings** tab
6. Under **Deploy**, set:
   - **Build Command**: (leave empty or delete it)
   - **Start Command**: `node server.js`

7. Click **Redeploy** or push a new commit

### Option 2: Fix via Railway CLI

The correct Railway CLI syntax is different. Try:

```bash
railway variables
```

This will open an interactive prompt. Or use:

```bash
railway link  # Make sure you're linked to the project
railway variables --help  # See available commands
```

## Test Your Backend

Once deployed, test:
```bash
curl https://inworld-christmas-story-production.up.railway.app/health
```

Should return: `{"status":"ok"}`

## Configure Vercel

Once backend is working:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - Name: `VITE_API_URL`
   - Value: `https://inworld-christmas-story-production.up.railway.app`
   - Environments: Production, Preview, Development
3. Save
4. Redeploy frontend

## Troubleshooting

If backend still fails:
- Check Railway logs: https://railway.com/project/fef14a24-c98a-40d7-8623-29d738d46ea9
- Make sure `server.js` exists in the root
- Verify all environment variables are set
- Check that `@inworld/runtime` is in package.json dependencies

