import { useState, useRef, useEffect } from 'react'
import { synthesizeSpeech } from '../services/ttsService'
import './GreetingCardDisplay.css'

type Step = 'form' | 'generating' | 'display'

function TextBasedChristmasCard() {
  const [step, setStep] = useState<Step>('form')
  const [recipientInfo, setRecipientInfo] = useState('')
  const [funnyStory, setFunnyStory] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  // Generated card data
  const [cardMessage, setCardMessage] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  
  // Display state
  const [isFlipped, setIsFlipped] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)
  
  // Audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedRef = useRef(false)
  const isPreloadingRef = useRef(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!recipientInfo.trim() || !funnyStory.trim()) {
      setError('Please fill in both fields')
      return
    }
    
    setError(null)
    setStep('generating')
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')
      
      console.log('🎄 Starting card generation...')
      
      // Generate message and image in parallel
      const [messageResponse, imageResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/generate-greeting-card-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientName: recipientInfo,
            funnyStory: funnyStory,
          })
        }),
        fetch(`${API_BASE_URL}/api/generate-greeting-card-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientName: recipientInfo,
            funnyStory: funnyStory,
          })
        })
      ])
      
      if (!messageResponse.ok) {
        throw new Error('Failed to generate card message')
      }
      
      const messageData = await messageResponse.json()
      setCardMessage(messageData.cardMessage)
      
      if (imageResponse.ok) {
        const imageData = await imageResponse.json()
        setCoverImageUrl(imageData.imageUrl || null)
      }
      
      console.log('✅ Card generation complete!')
      setStep('display')
      
    } catch (err: any) {
      console.error('Error generating card:', err)
      setError(err.message || 'Failed to generate card. Please try again.')
      setStep('form')
    }
  }

  // Preload audio when card is generated
  useEffect(() => {
    if (step !== 'display' || !cardMessage || isPreloadingRef.current) return
    isPreloadingRef.current = true

    const preloadAudio = async () => {
      try {
        console.log('🎵 Preloading card message audio...')
        const audio = await synthesizeSpeech('[happy] ' + cardMessage, {
          voiceId: 'Craig'
        })
        preloadedAudioRef.current = audio
        console.log('✅ Card message audio preloaded!')
      } catch (error) {
        console.error('Error preloading audio:', error)
      }
    }

    preloadAudio()
  }, [step, cardMessage])

  // Play audio when flipped to message
  const playMessageAudio = async () => {
    if (!cardMessage || hasPlayedRef.current) return
    hasPlayedRef.current = true

    try {
      let audio: HTMLAudioElement
      if (preloadedAudioRef.current) {
        audio = preloadedAudioRef.current
      } else {
        audio = await synthesizeSpeech('[happy] ' + cardMessage, {
          voiceId: 'Craig'
        })
      }
      
      audioRef.current = audio
      await audio.play()
    } catch (error) {
      console.error('Error playing audio:', error)
    }
  }

  const handleFlip = () => {
    if (!isFlipped) {
      setIsFlipped(true)
      playMessageAudio()
    } else {
      setIsFlipped(false)
    }
  }

  const handleShare = async () => {
    setIsSharing(true)
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')
      
      const response = await fetch(`${API_BASE_URL}/api/share-story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyText: cardMessage,
          childName: recipientInfo,
          experienceType: 'greeting-card',
          imageUrl: coverImageUrl,
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        await navigator.clipboard.writeText(data.shareUrl)
        setShareSuccess(true)
        setTimeout(() => setShareSuccess(false), 3000)
      }
    } catch (error) {
      console.error('Share failed:', error)
    } finally {
      setIsSharing(false)
    }
  }

  const handleStartOver = () => {
    // Stop any playing audio
    audioRef.current?.pause()
    
    // Reset all state
    setStep('form')
    setRecipientInfo('')
    setFunnyStory('')
    setCardMessage('')
    setCoverImageUrl(null)
    setIsFlipped(false)
    setError(null)
    hasPlayedRef.current = false
    isPreloadingRef.current = false
    preloadedAudioRef.current = null
  }

  // Form step
  if (step === 'form') {
    return (
      <div className="text-based-card-form" style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#faf7f5',
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontFamily: "'FeatureDeck', serif",
            fontSize: '2.5rem',
            color: '#166534',
            marginBottom: '0.5rem',
          }}>
            🎄 Christmas Card Creator
          </h1>
          <p style={{
            color: '#666',
            marginBottom: '2rem',
            fontSize: '1.1rem',
          }}>
            Create a personalized Christmas card in seconds!
          </p>
          
          <form onSubmit={handleSubmit} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                Who is this card for?
              </label>
              <input
                type="text"
                value={recipientInfo}
                onChange={(e) => setRecipientInfo(e.target.value)}
                placeholder="e.g., My dad Ed, My best friend Sarah"
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  border: '2px solid #ddd',
                  borderRadius: '12px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#166534'}
                onBlur={(e) => e.target.style.borderColor = '#ddd'}
              />
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                Share something funny or sweet about them
              </label>
              <textarea
                value={funnyStory}
                onChange={(e) => setFunnyStory(e.target.value)}
                placeholder="e.g., He's obsessed with golf and talks about his handicap at every family dinner"
                rows={4}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  border: '2px solid #ddd',
                  borderRadius: '12px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#166534'}
                onBlur={(e) => e.target.style.borderColor = '#ddd'}
              />
            </div>
            
            {error && (
              <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
            )}
            
            <button
              type="submit"
              style={{
                padding: '1rem 2rem',
                fontSize: '1.2rem',
                fontWeight: '600',
                color: 'white',
                background: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(22, 101, 52, 0.3)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              🎁 Create My Card
            </button>
          </form>
          
          <p style={{
            marginTop: '2rem',
            fontSize: '0.9rem',
            color: '#888',
          }}>
            Powered by AI magic ✨
          </p>
        </div>
      </div>
    )
  }

  // Generating step
  if (step === 'generating') {
    return (
      <div className="story-generation" style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#faf7f5',
      }}>
        <div className="loading-container">
          <h2 className="loading-title" style={{ color: '#166534' }}>
            CREATING YOUR CHRISTMAS CARD...
          </h2>
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    )
  }

  // Display step - use exact same structure as GreetingCardDisplay
  return (
    <div className="greeting-card-display-container" style={{ background: '#faf7f5', minHeight: '100vh', paddingTop: '2rem' }}>
      <div className="greeting-card-display-wrapper">
        <div className={`greeting-card-flip-container ${isFlipped ? 'flipped' : ''}`}>
          {/* Front - Cover Image */}
          <div className="greeting-card-flip-front">
            {coverImageUrl ? (
              <div className="greeting-card-cover-image-wrapper">
                <img 
                  src={coverImageUrl} 
                  alt="Greeting card cover" 
                  className="greeting-card-cover-image"
                />
              </div>
            ) : (
              <div className="greeting-card-cover-placeholder">
                <div className="greeting-card-placeholder-icon">🎄</div>
                <p className="greeting-card-placeholder-text">To: {recipientInfo}</p>
              </div>
            )}
          </div>

          {/* Back - Message */}
          <div className="greeting-card-flip-back">
            <div className="greeting-card-message-container">
              <div className="greeting-card-message-content">
                {cardMessage.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="greeting-card-message-paragraph">
                    {paragraph.trim()}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {!isFlipped && (
          <button
            className="btn btn-secondary greeting-card-view-message-button"
            onClick={handleFlip}
          >
            Click to see the message
          </button>
        )}
        
        {isFlipped && (
          <button
            className="btn btn-secondary greeting-card-back-button"
            onClick={() => setIsFlipped(false)}
          >
            ← Back to Cover
          </button>
        )}
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={handleShare}
          disabled={isSharing}
          style={{ fontSize: '1.2rem', padding: '12px 24px', minWidth: '140px' }}
        >
          {isSharing ? '📤 Sharing...' : shareSuccess ? '✅ Link Copied!' : '📤 Share Card'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleStartOver}
          style={{ fontSize: '1.2rem', padding: '12px 24px' }}
        >
          Create Another
        </button>
      </div>
    </div>
  )
}

export default TextBasedChristmasCard
