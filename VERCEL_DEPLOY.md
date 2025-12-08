# Deploying to Vercel

This guide will help you deploy the Calm Personalized Storyteller to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Your API keys ready:
   - `ANTHROPIC_API_KEY` - From Anthropic Console
   - `INWORLD_API_KEY` - From Inworld Studio (Base64-encoded)
   - `INWORLD_VOICE_ID` (optional) - Default: 'Wendy'
   - `INWORLD_MODEL_ID` (optional) - Default: 'inworld-tts-1-max'

## Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Yes**
   - Which scope? (Select your account)
   - Link to existing project? **No**
   - Project name? (Press Enter for default or enter a custom name)
   - Directory? (Press Enter for `./`)
   - Override settings? **No**

4. **Set Environment Variables**:
   ```bash
   vercel env add ANTHROPIC_API_KEY
   vercel env add INWORLD_API_KEY
   vercel env add INWORLD_VOICE_ID  # Optional
   vercel env add INWORLD_MODEL_ID  # Optional
   ```
   
   For each variable, select:
   - Environment: **Production, Preview, and Development** (or just Production)
   - Value: Enter your API key

5. **Redeploy** (to apply environment variables):
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via Vercel Dashboard

1. **Push your code to GitHub** (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Import Project in Vercel**:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Vercel will auto-detect the settings

3. **Configure Environment Variables**:
   - In the Vercel project settings, go to "Environment Variables"
   - Add:
     - `ANTHROPIC_API_KEY` = your Anthropic API key
     - `INWORLD_API_KEY` = your Inworld API key (Base64-encoded)
     - `INWORLD_VOICE_ID` = 'Wendy' (optional)
     - `INWORLD_MODEL_ID` = 'inworld-tts-1-max' (optional)

4. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete
   - Your app will be live at `https://your-project-name.vercel.app`

## Project Structure

The project is configured for Vercel with:
- **Frontend**: Built with Vite, output to `dist/`
- **API Routes**: Serverless functions in `api/` directory
  - `api/generate-story.js` - Story generation endpoint
  - `api/tts.js` - Text-to-speech endpoint

## Environment Variables

Make sure to set these in Vercel:

| Variable | Required | Description |
|---------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key for story generation |
| `INWORLD_API_KEY` | Yes | Your Inworld API key (Base64-encoded) for TTS |
| `INWORLD_VOICE_ID` | No | Default voice ID (defaults to 'Wendy') |
| `INWORLD_MODEL_ID` | No | TTS model ID (defaults to 'inworld-tts-1-max') |

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Ensure Node.js version is compatible (Vercel uses Node 20.x by default)

### API Routes Not Working
- Verify environment variables are set correctly
- Check Vercel function logs in the dashboard
- Ensure API routes are in the `api/` directory

### CORS Errors
- The API routes include CORS headers, but if you see errors, check the Vercel function logs

## Local Development

For local development, the app still uses the Express server:
```bash
npm run dev:all
```

The frontend will automatically use `http://localhost:3001` in development and relative URLs in production.

## Updating After Deployment

After making changes:
```bash
git add .
git commit -m "Your changes"
git push
```

Vercel will automatically redeploy on push to your main branch.

Or manually:
```bash
vercel --prod
```

