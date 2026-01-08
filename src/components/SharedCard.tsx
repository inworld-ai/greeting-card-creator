import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSharedStory } from '../services/shareService'
import { synthesizeSpeech } from '../services/ttsService'
import { OCCASIONS, OccasionType } from './GreetingCardCreator'
import './GreetingCardDisplay.css'

interface CardData {
  storyText: string
  childName: string
  voiceId: string
  imageUrl?: string | null
  customVoiceId?: string
  occasion?: OccasionType
}

function SharedCard() {
  const { cardId } = useParams<{ cardId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cardData, setCardData] = useState<CardData | null>(null)
  
  // Display state
  const [isFlipped, setIsFlipped] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [isReplaying, setIsReplaying] = useState(false)
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false)
  const [audioLoading, setAudioLoading] = useState(true)
  
  // Audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedRef = useRef(false)
  const isPreloadingRef = useRef(false)

  // Load card data
  useEffect(() => {
    const loadCard = async () => {
      if (!cardId) {
        setError('Invalid card ID')
        setLoading(false)
        return
      }

      try {
        const data = await getSharedStory(cardId) as any
        setCardData({
          storyText: data.storyText,
          childName: data.childName,
          voiceId: data.voiceId,
          imageUrl: data.imageUrl,
          customVoiceId: data.customVoiceId,
          occasion: data.occasion || 'birthday',
        })
      } catch (err: any) {
        setError(err.message || 'Failed to load card')
      } finally {
        setLoading(false)
      }
    }

    loadCard()
  }, [cardId])

  // Preload audio
  useEffect(() => {
    if (!cardData || !cardData.storyText || isPreloadingRef.current) return
    isPreloadingRef.current = true
    
    console.log('🎵 Preloading card audio...')

    const preloadAudio = async () => {
      try {
        const audio = await synthesizeSpeech('[happy] ' + cardData.storyText, {
          voiceId: cardData.customVoiceId || 'Craig'
        })
        preloadedAudioRef.current = audio
        console.log('✅ Card audio preloaded!')
        setAudioLoading(false)
      } catch (error) {
        console.error('Error preloading audio:', error)
        setAudioLoading(false)
      }
    }

    preloadAudio()
  }, [cardData])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (preloadedAudioRef.current) {
        preloadedAudioRef.current.pause()
      }
    }
  }, [])

  // Play audio when card is flipped
  const playMessageAudio = async () => {
    if (!cardData?.storyText || hasPlayedRef.current) return
    hasPlayedRef.current = true
    setHasPlayedOnce(true)

    try {
      setIsPlayingAudio(true)
      
      let audio: HTMLAudioElement
      if (preloadedAudioRef.current) {
        audio = preloadedAudioRef.current
      } else {
        audio = await synthesizeSpeech('[happy] ' + cardData.storyText, {
          voiceId: cardData.customVoiceId || 'Craig'
        })
      }
      
      audioRef.current = audio
      audio.onended = () => {
        setIsPlayingAudio(false)
      }
      await audio.play()
    } catch (error) {
      console.error('Error playing audio:', error)
      setIsPlayingAudio(false)
    }
  }

  // Replay card audio
  const handleReplay = async () => {
    if (!preloadedAudioRef.current) return
    setIsReplaying(true)
    setIsPlayingAudio(true)
    try {
      preloadedAudioRef.current.pause()
      preloadedAudioRef.current.currentTime = 0
      preloadedAudioRef.current.onended = () => {
        setIsPlayingAudio(false)
        setIsReplaying(false)
      }
      await preloadedAudioRef.current.play()
    } catch (error) {
      console.error('Error replaying audio:', error)
      setIsPlayingAudio(false)
      setIsReplaying(false)
    }
  }

  const handleFlipToMessage = () => {
    setIsFlipped(true)
    playMessageAudio()
  }

  const handleCreateOwn = () => {
    navigate('/')
  }

  // Get occasion config
  const occasion = OCCASIONS.find(o => o.value === cardData?.occasion) || OCCASIONS[0]

  // Show loading
  if (loading || audioLoading) {
    return (
      <div style={{ 
        background: '#faf7f5', 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{
            fontFamily: "'FeatureDeck', serif",
            fontSize: '1.8rem',
            color: '#333',
            marginBottom: '1rem',
          }}>
            Preparing your card...
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: '#333',
              animation: 'pulse 1.4s infinite ease-in-out both',
              animationDelay: '-0.32s',
            }}></span>
            <span style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: '#333',
              animation: 'pulse 1.4s infinite ease-in-out both',
              animationDelay: '-0.16s',
            }}></span>
            <span style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: '#333',
              animation: 'pulse 1.4s infinite ease-in-out both',
            }}></span>
          </div>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // Show error
  if (error || !cardData) {
    return (
      <div style={{ 
        background: '#faf7f5', 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>Oops!</h2>
          <p style={{ color: '#666', marginBottom: '2rem' }}>{error || 'Card not found'}</p>
          <button
            onClick={handleCreateOwn}
            style={{
              padding: '1rem 2rem',
              fontSize: '1.1rem',
              fontWeight: '600',
              color: 'white',
              background: '#333',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
            }}
          >
            Create Your Own Card
          </button>
        </div>
      </div>
    )
  }

  // Display card
  return (
    <div style={{ background: '#faf7f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <div className="greeting-card-display-container">
          <div className="greeting-card-display-wrapper">
            <div className={`greeting-card-flip-container ${isFlipped ? 'flipped' : ''}`}>
              {/* Front - Cover Image */}
              <div className="greeting-card-flip-front">
                {cardData.imageUrl ? (
                  <div className="greeting-card-cover-image-wrapper">
                    <img 
                      src={cardData.imageUrl} 
                      alt="Card cover" 
                      className="greeting-card-cover-image"
                    />
                  </div>
                ) : (
                  <div className="greeting-card-cover-placeholder" style={{ background: 'linear-gradient(135deg, #333 0%, #55555599 100%)' }}>
                    <div className="greeting-card-placeholder-icon">{occasion.emoji}</div>
                    <p className="greeting-card-placeholder-text">To: {cardData.childName}</p>
                  </div>
                )}
              </div>

              {/* Back - Message */}
              <div className="greeting-card-flip-back">
                <div className="greeting-card-message-container">
                  <div className="greeting-card-message-content">
                    {cardData.storyText.split('\n\n').map((paragraph, index) => (
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
                style={{ borderColor: '#333', color: '#333' }}
              >
                Click to hear message
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
            {isFlipped && hasPlayedOnce && (
              <button
                onClick={handleReplay}
                disabled={isReplaying || isPlayingAudio}
                style={{
                  fontSize: '1rem',
                  padding: '12px 14px',
                  background: '#333',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                {isReplaying ? 'Replaying...' : 'Replay'}
              </button>
            )}
            <button
              onClick={handleCreateOwn}
              style={{
                fontSize: '1rem',
                padding: '12px 14px',
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Create Your Own Card
            </button>
          </div>
        </div>
      </div>
      
      <p style={{
        textAlign: 'center',
        marginTop: '2rem',
        paddingBottom: '2rem',
        fontSize: '0.9rem',
        color: '#888',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
      }}>
        Powered by{' '}
        <a 
          href="https://inworld.ai" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#333', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          Inworld AI
          <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
        </a>
      </p>
    </div>
  )
}

export default SharedCard

