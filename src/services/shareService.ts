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

/**
 * Shows a modal with various share options for desktop
 */
function showShareOptionsModal(url: string, title: string, text: string): void {
  // Remove any existing modal
  const existingModal = document.getElementById('share-modal-overlay')
  if (existingModal) {
    existingModal.remove()
  }
  
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(`${text} ${url}`)
  const encodedTitle = encodeURIComponent(title)
  
  // Create modal overlay
  const overlay = document.createElement('div')
  overlay.id = 'share-modal-overlay'
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease-out;
  `
  
  // Create modal content
  const modal = document.createElement('div')
  modal.style.cssText = `
    background: linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%);
    border-radius: 16px;
    padding: 24px;
    max-width: 340px;
    width: 90%;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.3s ease-out;
  `
  
  // Share options
  const shareOptions = [
    { 
      name: 'Copy Link', 
      icon: '📋', 
      action: async () => {
        try {
          await navigator.clipboard.writeText(url)
          alert('Link copied to clipboard!')
        } catch {
          prompt('Copy this link:', url)
        }
        overlay.remove()
      }
    },
    { 
      name: 'Email', 
      icon: '✉️', 
      action: () => {
        window.open(`mailto:?subject=${encodedTitle}&body=${encodedText}`, '_blank')
        overlay.remove()
      }
    },
    { 
      name: 'WhatsApp', 
      icon: '💬', 
      action: () => {
        window.open(`https://wa.me/?text=${encodedText}`, '_blank')
        overlay.remove()
      }
    },
    { 
      name: 'Facebook', 
      icon: '👤', 
      action: () => {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank', 'width=600,height=400')
        overlay.remove()
      }
    },
    { 
      name: 'X (Twitter)', 
      icon: '🐦', 
      action: () => {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodedUrl}`, '_blank', 'width=600,height=400')
        overlay.remove()
      }
    },
    { 
      name: 'SMS', 
      icon: '💬', 
      action: () => {
        // SMS link works on both mobile and desktop (if SMS app is available)
        window.open(`sms:?body=${encodedText}`, '_self')
        overlay.remove()
      }
    }
  ]
  
  modal.innerHTML = `
    <h3 style="margin: 0 0 16px 0; color: #fff; text-align: center; font-size: 1.3rem;">
      🎄 Share Your Card
    </h3>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
      ${shareOptions.map((opt, i) => `
        <button id="share-opt-${i}" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 12px 8px;
          border: none;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.85rem;
        " onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">
          <span style="font-size: 1.5rem;">${opt.icon}</span>
          <span>${opt.name}</span>
        </button>
      `).join('')}
    </div>
    <button id="share-cancel" style="
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      cursor: pointer;
      font-size: 1rem;
      transition: all 0.2s;
    " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
      Cancel
    </button>
  `
  
  // Add animation styles
  const style = document.createElement('style')
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `
  document.head.appendChild(style)
  
  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  
  // Add event listeners
  shareOptions.forEach((opt, i) => {
    document.getElementById(`share-opt-${i}`)?.addEventListener('click', opt.action)
  })
  
  document.getElementById('share-cancel')?.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })
  
  // Close on escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove()
      document.removeEventListener('keydown', handleEscape)
    }
  }
  document.addEventListener('keydown', handleEscape)
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

