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

/**
 * Check if we're on a mobile device
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * Share a URL using the Web Share API (mobile) or copy to clipboard (desktop)
 * Returns 'shared' if native share was used, 'copied' if clipboard was used, or 'cancelled' if user cancelled
 */
export async function shareUrl(url: string, title?: string, text?: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const shareTitle = title || 'Check this out!'
  const shareText = text || ''
  
  // Check if we're on mobile and Web Share API is available
  if (isMobileDevice() && typeof navigator !== 'undefined' && 'share' in navigator && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: url
      })
      return 'shared' // Successfully shared via native share
    } catch (error: any) {
      // User cancelled or share failed
      if (error.name === 'AbortError') {
        return 'cancelled' // User cancelled
      }
      console.warn('Web Share API failed, falling back to clipboard:', error)
    }
  }
  
  // Desktop fallback: just copy to clipboard
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch (error) {
    console.error('Clipboard failed:', error)
    // Last resort: prompt user to copy
    prompt('Copy this link:', url)
    return 'copied'
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

