# Splitting into Two Separate Vercel Sites

This guide explains how to deploy the Christmas Story Generator and Personalized Greeting Card as two separate Vercel sites while sharing the same Railway backend.

## Overview

- **Backend**: Single Railway instance handles both experiences
- **Frontend**: Two separate Vercel projects
  - Site 1: Christmas Story Generator only
  - Site 2: Personalized Greeting Card only

## Setup Instructions

### Step 1: Create Two Vercel Projects

1. **Christmas Story Generator Site**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New Project"
   - Import the same GitHub repository: `inworld-ai/personalized-christmas-storyteller`
   - Project Name: `christmas-story-generator` (or your preferred name)

2. **Personalized Greeting Card Site**:
   - Click "Add New Project" again
   - Import the same GitHub repository: `inworld-ai/personalized-christmas-storyteller`
   - Project Name: `personalized-greeting-card` (or your preferred name)

### Step 2: Configure Environment Variables

For each Vercel project, set the following environment variables:

#### Christmas Story Generator Site:
```
VITE_API_URL=https://inworld-christmas-story-production.up.railway.app
VITE_EXPERIENCE_TYPE=story
```

#### Personalized Greeting Card Site:
```
VITE_API_URL=https://inworld-christmas-story-production.up.railway.app
VITE_EXPERIENCE_TYPE=greeting-card
```

**To set environment variables in Vercel:**
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add each variable for "Production", "Preview", and "Development" environments

### Step 3: Deploy Both Sites

1. Deploy the Christmas Story Generator site
2. Deploy the Personalized Greeting Card site

Both sites will use the same codebase but show different experiences based on the `VITE_EXPERIENCE_TYPE` environment variable.

## How It Works

- When `VITE_EXPERIENCE_TYPE=story`: The app automatically starts with the story experience (skips landing page)
- When `VITE_EXPERIENCE_TYPE=greeting-card`: The app automatically starts with the greeting card experience (skips landing page)
- When `VITE_EXPERIENCE_TYPE=both` or not set: Shows the landing page with both options (default behavior)

## Backend Configuration

The Railway backend doesn't need any changes - it already handles both experiences through the same endpoints. Both Vercel sites will point to the same Railway backend URL.

## Testing

1. Test the Story Generator site - should go directly to story type selection
2. Test the Greeting Card site - should go directly to name entry for greeting card
3. Both should work with the same Railway backend

