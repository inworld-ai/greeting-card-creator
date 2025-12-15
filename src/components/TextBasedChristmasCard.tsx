import { useState, useRef, useEffect } from 'react'
import { synthesizeSpeech } from '../services/ttsService'
import { shareUrl } from '../services/shareService'
import CustomNarrator from './CustomNarrator'
import MicrophoneButton from './MicrophoneButton'
import './GreetingCardDisplay.css'
import './StoryGeneration.css'
import './MicrophoneButton.css'

type Step = 'form' | 'generating' | 'display' | 'custom-narrator'

function TextBasedChristmasCard() {
  const [step, setStep] = useState<Step>('form')
  const [recipientInfo, setRecipientInfo] = useState('')
  const [funnyStory, setFunnyStory] = useState('')
  const [signoff, setSignoff] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  // Generated card data
  const [cardMessage, setCardMessage] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('') // Parsed name for display (e.g., "Mac" from "my son Mac")
  const [customVoiceId, setCustomVoiceId] = useState<string | null>(null)
  
  // Display state
  const [isFlipped, setIsFlipped] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareSuccess, setShareSuccess] = useState<'copied' | 'shared' | false>(false)
  const [_isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [_isAudioReady, setIsAudioReady] = useState(false)
  
  // Suppress unused variable warnings (values tracked for future UI enhancements)
  void _isPlayingAudio
  void _isAudioReady
  
  // Audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedFollowUpRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedRef = useRef(false)
  const hasAskedFollowUpRef = useRef(false)
  const isPreloadingRef = useRef(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!recipientInfo.trim() || !funnyStory.trim()) {
      setError('Please fill in the recipient and story fields')
      return
    }
    
    setError(null)
    setStep('generating')
    
    // Extract a simple name from recipientInfo for the announcement
    // e.g., "my son Mac" -> "Mac", "Dad" -> "Dad"
    const words = recipientInfo.trim().split(/\s+/)
    const announceName = words.length > 0 ? words[words.length - 1] : recipientInfo
    
    // Play the female elf announcement
    try {
      const announcement = await synthesizeSpeech(`[happy] The Inworld elves are creating your Christmas card for ${announceName}!`, {
        voiceId: 'christmas_story_generator__female_elf_narrator'
      })
      announcement.play().catch(err => console.log('Announcement autoplay prevented:', err))
    } catch (err) {
      console.log('Could not play announcement:', err)
    }
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://inworld-christmas-story-production.up.railway.app'
      
      console.log('🎄 Starting card generation...')
      console.log('🔗 API URL:', API_BASE_URL)
      
      // Generate message and image in parallel
      const [messageResponse, imageResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/generate-greeting-card-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientName: recipientInfo,
            funnyStory: funnyStory,
            signoff: signoff.trim() || undefined,
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
      // Use the parsed name from the API, or fall back to the original input
      setDisplayName(messageData.parsedRecipientName || recipientInfo)
      
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

  // Preload audio when card is generated (while user looks at cover)
  useEffect(() => {
    if (step !== 'display' || !cardMessage || isPreloadingRef.current) return
    isPreloadingRef.current = true

    const preloadAudio = async () => {
      try {
        console.log('🎵 Preloading card message audio...')
        
        // Preload main message audio with [happy] emotion tag for TTS
        // The tag influences voice tone but won't be verbalized
        // Use custom voice if available, otherwise use default Craig voice
        const audio = await synthesizeSpeech('[happy] ' + cardMessage, {
          voiceId: customVoiceId || 'Craig'
        })
        preloadedAudioRef.current = audio
        setIsAudioReady(true)
        console.log('✅ Card message audio preloaded and ready!')

        // Only preload follow-up prompt if no custom voice (user hasn't created one yet)
        if (!customVoiceId) {
          const followUpText = 'Click Create Custom Narrator to add your own voice to the Christmas Card message.'
          const followUpAudio = await synthesizeSpeech(followUpText, {
            voiceId: 'christmas_story_generator__female_elf_narrator'
          })
          preloadedFollowUpRef.current = followUpAudio
          console.log('✅ Follow-up audio preloaded!')
        }
      } catch (error) {
        console.error('Error preloading audio:', error)
        isPreloadingRef.current = false // Allow retry
      }
    }

    preloadAudio()
  }, [step, cardMessage, customVoiceId])

  // Play message audio when user clicks to see the message
  const playMessageAudio = async () => {
    if (!cardMessage || hasPlayedRef.current) return
    hasPlayedRef.current = true

    try {
      setIsPlayingAudio(true)
      
      // Use preloaded audio if available, otherwise generate on-demand
      let audio: HTMLAudioElement
      if (preloadedAudioRef.current) {
        console.log('🎵 Playing preloaded card message audio (instant!)...')
        audio = preloadedAudioRef.current
      } else {
        console.log('🎵 Generating card message audio on-demand...')
        // Add [happy] emotion tag for TTS - influences voice tone but won't be verbalized
        // Use custom voice if available, otherwise use default Craig voice
        audio = await synthesizeSpeech('[happy] ' + cardMessage, {
          voiceId: customVoiceId || 'Craig'
        })
      }
      
      audioRef.current = audio

      const playFollowUp = async () => {
        if (hasAskedFollowUpRef.current) return
        hasAskedFollowUpRef.current = true
        try {
          setIsPlayingAudio(true)
          
          // Use preloaded follow-up if available
          let followUpAudio: HTMLAudioElement
          if (preloadedFollowUpRef.current) {
            console.log('🎵 Playing preloaded follow-up audio...')
            followUpAudio = preloadedFollowUpRef.current
          } else {
            const followUpText = 'Click Create Custom Narrator to add your own voice to the Christmas Card message.'
            followUpAudio = await synthesizeSpeech(followUpText, {
              voiceId: 'christmas_story_generator__female_elf_narrator'
            })
          }
          audioRef.current = followUpAudio
          await followUpAudio.play()
        } catch (e) {
          console.error('Error playing follow-up audio:', e)
        } finally {
          setIsPlayingAudio(false)
        }
      }
      
      // Handle audio end - play follow-up after message finishes (only if no custom voice)
      audio.addEventListener('ended', () => {
        setIsPlayingAudio(false)
        console.log('🎵 Card message audio finished')
        // Only play follow-up if user hasn't created a custom voice yet
        if (!customVoiceId) {
          setTimeout(() => {
            void playFollowUp()
          }, 250)
        }
      }, { once: true })
      
      await audio.play()
    } catch (error) {
      console.error('Error playing audio:', error)
      setIsPlayingAudio(false)
    }
  }

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (preloadedAudioRef.current) {
        preloadedAudioRef.current.pause()
      }
      if (preloadedFollowUpRef.current) {
        preloadedFollowUpRef.current.pause()
      }
    }
  }, [])

  // Handle flip and play audio immediately
  const handleFlipToMessage = () => {
    setIsFlipped(true)
    // Start playing audio immediately when card is flipped
    playMessageAudio()
  }

  const handleShare = async () => {
    setIsSharing(true)
    setShareSuccess(false)
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://inworld-christmas-story-production.up.railway.app'
      
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
        const url = data.shareUrl
        
        // Use the shareUrl helper - native share on mobile, clipboard on desktop
        const result = await shareUrl(
          url,
          `Christmas Card for ${displayName || recipientInfo}`,
          `Check out this personalized Christmas card! 🎄`
        )
        
        if (result !== 'cancelled') {
          setShareSuccess(result) // 'shared' or 'copied'
          // Reset success message after 3 seconds
          setTimeout(() => setShareSuccess(false), 3000)
        }
      }
    } catch (error) {
      console.error('Share failed:', error)
    } finally {
      setIsSharing(false)
    }
  }

  const handleAddNarration = () => {
    // Stop any playing audio
    audioRef.current?.pause()
    preloadedAudioRef.current?.pause()
    preloadedFollowUpRef.current?.pause()
    
    // Navigate to custom narrator step
    setStep('custom-narrator')
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
            Christmas Card Creator
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={recipientInfo}
                  onChange={(e) => setRecipientInfo(e.target.value)}
                  placeholder="e.g., My dad Ed, My best friend Sarah"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    fontSize: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '12px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#166534'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
                <MicrophoneButton onTranscript={(text) => setRecipientInfo(text)} />
              </div>
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <textarea
                  value={funnyStory}
                  onChange={(e) => setFunnyStory(e.target.value)}
                  placeholder="e.g., He's obsessed with golf and talks about his handicap at every family dinner"
                  rows={4}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    fontSize: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '12px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#166534'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
                <MicrophoneButton onTranscript={(text) => setFunnyStory(prev => prev ? `${prev} ${text}` : text)} />
              </div>
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                How would you like to sign off?
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={signoff}
                  onChange={(e) => setSignoff(e.target.value)}
                  placeholder="e.g., Love, Dad | Your favorite son | The whole family"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    fontSize: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '12px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#166534'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
                <MicrophoneButton onTranscript={(text) => setSignoff(text)} />
              </div>
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
                fontFamily: "'FeatureDeck', serif",
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
              Create My Card
            </button>
          </form>
          
          <p style={{
            marginTop: '2rem',
            fontSize: '0.9rem',
            color: '#888',
          }}>
            🎁 A gift from{' '}
            <a 
              href="https://inworld.ai" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#166534', textDecoration: 'underline' }}
            >
              Inworld AI
            </a>
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
          <h2 className="loading-title">
            CREATING YOUR CHRISTMAS CARD...
          </h2>
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <p style={{
          position: 'absolute',
          bottom: '2rem',
          fontSize: '0.9rem',
          color: '#888',
        }}>
          🎁 A gift from{' '}
          <a 
            href="https://inworld.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: '#166534', textDecoration: 'underline' }}
          >
            Inworld AI
          </a>
        </p>
      </div>
    )
  }

  // Custom narrator step - matches Story Creator's centered layout
  if (step === 'custom-narrator') {
    return (
      <div style={{ 
        background: '#faf7f5', 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{ width: '100%', maxWidth: '600px' }}>
          <CustomNarrator
            childName={displayName || recipientInfo}
            onSubmit={(_apiKey: string, voiceId: string) => {
              setCustomVoiceId(voiceId)
              // Reset audio refs so we can replay with custom voice
              hasPlayedRef.current = false
              hasAskedFollowUpRef.current = false
              isPreloadingRef.current = false
              preloadedAudioRef.current = null
              preloadedFollowUpRef.current = null
              setStep('display')
            }}
            onBack={() => setStep('display')}
          />
        </div>
        <p style={{
          textAlign: 'center',
          padding: '2rem',
          fontSize: '0.9rem',
          color: '#888',
          marginTop: '1rem'
        }}>
          🎁 A gift from{' '}
          <a 
            href="https://inworld.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: '#166534', textDecoration: 'underline' }}
          >
            Inworld AI
          </a>
        </p>
      </div>
    )
  }

  // Display step - matching GreetingCardDisplay structure exactly
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
                <div className="greeting-card-placeholder-icon">💌</div>
                <p className="greeting-card-placeholder-text">To: {displayName}</p>
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
            onClick={handleFlipToMessage}
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
      
      <div style={{ textAlign: 'center', marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* Only show Create Custom Narrator button if user hasn't created one yet */}
        {!customVoiceId && (
          <button
            className="btn btn-primary"
            onClick={handleAddNarration}
            style={{ fontSize: '0.9rem', padding: '12px 14px', flex: 'none', width: 'auto' }}
          >
            Create Custom Narrator
          </button>
        )}
        <button
          className={customVoiceId ? "btn btn-primary" : "btn btn-secondary"}
          onClick={handleShare}
          disabled={isSharing}
          style={{ fontSize: '0.9rem', padding: '12px 14px', flex: 'none', width: 'auto' }}
        >
          {isSharing ? 'Sharing...' : shareSuccess === 'copied' ? '✅ Link Copied!' : shareSuccess === 'shared' ? '✅ Shared!' : 'Share Card'}
        </button>
      </div>
      
      <p style={{
        textAlign: 'center',
        marginTop: '2rem',
        paddingBottom: '2rem',
        fontSize: '0.9rem',
        color: '#888',
      }}>
        🎁 A gift from{' '}
        <a 
          href="https://inworld.ai" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#166534', textDecoration: 'underline' }}
        >
          Inworld AI
        </a>
      </p>
    </div>
  )
}

export default TextBasedChristmasCard
