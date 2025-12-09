// Backend API URL - use relative URLs in production (Vercel), localhost in development
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')

export interface ShareStoryData {
  storyText: string
  childName: string
  voiceId: string
  storyType: string | null
  imageUrl?: string | null
  customApiKey?: string
  customVoiceId?: string
}

export interface ShareStoryResponse {
  storyId: string
  shareUrl: string
}

export async function shareStory(data: ShareStoryData): Promise<ShareStoryResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/share-story`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(`Failed to share story: ${errorMessage}`)
    }

    const result = await response.json()
    
    // Backend now only returns storyId - construct the full URL from frontend origin
    // This ensures we always use the correct frontend URL (Vercel, not Railway)
    const baseUrl = window.location.origin
    const absoluteShareUrl = `${baseUrl}/share/${result.storyId}`
    
    return {
      storyId: result.storyId,
      shareUrl: absoluteShareUrl
    }
  } catch (error: any) {
    console.error('Error sharing story:', error)
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new Error('Cannot connect to the server. Make sure the backend server is running.')
    }
    
    throw error
  }
}

export async function getSharedStory(storyId: string): Promise<ShareStoryData & { createdAt?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/story/${storyId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Story not found')
      }
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(`Failed to retrieve story: ${errorMessage}`)
    }

    return await response.json()
  } catch (error: any) {
    console.error('Error retrieving shared story:', error)
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new Error('Cannot connect to the server. Make sure the backend server is running.')
    }
    
    throw error
  }
}

