# URL-Based Routing for Separate Experiences

This guide explains how the app uses URL-based routing to provide separate experiences while maintaining a single Vercel deployment.

## Overview

- **Single Vercel Project**: One deployment handles all routes
- **URL Structure**:
  - `/` - Landing page with both options
  - `/storyteller` - Christmas Story Generator experience
  - `/greetingcard` - Personalized Greeting Card experience
  - `/share/:storyId` - Shared story/card view
- **Backend**: Single Railway instance handles both experiences

## URL Structure

### Main Domain
- **Root URL**: `https://inworld-christmas.vercel.app/`
  - Shows landing page with both experience options

### Story Generator
- **URL**: `https://inworld-christmas.vercel.app/storyteller`
  - Directly starts the Christmas Story Generator flow
  - Skips landing page, goes straight to story type selection

### Greeting Card
- **URL**: `https://inworld-christmas.vercel.app/greetingcard`
  - Directly starts the Personalized Greeting Card flow
  - Skips landing page, goes straight to name entry

### Shared Links
- **URL**: `https://inworld-christmas.vercel.app/share/:storyId`
  - Displays shared stories or greeting cards

## How It Works

The app uses React Router to detect the current path and automatically:
1. Determines which experience to show based on the URL
2. Sets the initial step (skips landing page for specific paths)
3. Updates the experience type in state

## Vercel Configuration

### Custom Domain Setup

1. Go to your Vercel project settings
2. Navigate to "Domains"
3. Add your custom domain: `inworld-christmas.vercel.app` (or your preferred domain)
4. Vercel will automatically handle all routes including `/storyteller` and `/greetingcard`

### Environment Variables

Set these in Vercel project settings:

```
VITE_API_URL=https://inworld-christmas-story-production.up.railway.app
```

No need for `VITE_EXPERIENCE_TYPE` - routing is handled by URL paths.

## Backend Configuration

The Railway backend doesn't need any changes - it already handles both experiences through the same endpoints. All routes use the same backend URL.

## Benefits

- ✅ Single deployment to manage
- ✅ Clean, shareable URLs for each experience
- ✅ Easy to bookmark specific experiences
- ✅ SEO-friendly URLs
- ✅ No environment variable management needed
