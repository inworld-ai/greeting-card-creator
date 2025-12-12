import { useState, useEffect, useRef } from 'react'
import { synthesizeSpeech } from '../services/ttsService'
import './GreetingCardDisplay.css'

interface GreetingCardDisplayProps {
  coverImageUrl: string | null
  message: string
  recipientName: string
  onAddNarration: () => void
  onShareAsIs: () => Promise<void>
}

function GreetingCardDisplay({ coverImageUrl, message, recipientName, onAddNarration, onShareAsIs }: GreetingCardDisplayProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [_isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)
  const [_isAudioReady, setIsAudioReady] = useState(false)
  
  // Suppress unused variable warnings (values tracked for future UI enhancements)
  void _isPlayingAudio
  void _isAudioReady
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedFollowUpRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedRef = useRef(false)
  const hasAskedPersonalizeRef = useRef(false)
  const isPreloadingRef = useRef(false)

  // Preload audio when component mounts (while user looks at cover)
  useEffect(() => {
    if (!message || isPreloadingRef.current) return
    isPreloadingRef.current = true

    const preloadAudio = async () => {
      try {
        console.log('🎵 Preloading card message audio...')
        
        // Preload main message audio
        const audio = await synthesizeSpeech(message, {
          voiceId: 'Craig'
        })
        preloadedAudioRef.current = audio
        setIsAudioReady(true)
        console.log('✅ Card message audio preloaded and ready!')

        // Also preload the follow-up question
        const question = 'Want to customize this Christmas card with your own voice? Tap the Add Custom Narrator button.'
        const followUpAudio = await synthesizeSpeech(question, {
          voiceId: 'christmas_story_generator__female_elf_narrator'
        })
        preloadedFollowUpRef.current = followUpAudio
        console.log('✅ Follow-up audio preloaded!')
      } catch (error) {
        console.error('Error preloading audio:', error)
        isPreloadingRef.current = false // Allow retry
      }
    }

    preloadAudio()
  }, [message])

  // Handle share with loading state
  const handleShare = async () => {
    setIsSharing(true)
    setShareSuccess(false)
    try {
      await onShareAsIs()
      setShareSuccess(true)
      // Reset success message after 3 seconds
      setTimeout(() => setShareSuccess(false), 3000)
    } catch (error) {
      console.error('Share failed:', error)
    } finally {
      setIsSharing(false)
    }
  }

  // Play message audio when user clicks to see the message
  const playMessageAudio = async () => {
    if (!message || hasPlayedRef.current) return
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
        audio = await synthesizeSpeech(message, {
          voiceId: 'Craig'
        })
      }
      
      audioRef.current = audio

      const askToPersonalize = async () => {
        if (hasAskedPersonalizeRef.current) return
        hasAskedPersonalizeRef.current = true
        try {
          setIsPlayingAudio(true)
          
          // Use preloaded follow-up if available
          let qAudio: HTMLAudioElement
          if (preloadedFollowUpRef.current) {
            console.log('🎵 Playing preloaded follow-up audio...')
            qAudio = preloadedFollowUpRef.current
          } else {
            const question = 'Want to customize this Christmas card with your own voice? Tap the Add Custom Narrator button.'
            qAudio = await synthesizeSpeech(question, {
              voiceId: 'christmas_story_generator__female_elf_narrator'
            })
          }
          audioRef.current = qAudio
          await qAudio.play()
        } catch (e) {
          console.error('Error playing personalize question audio:', e)
        } finally {
          setIsPlayingAudio(false)
        }
      }
      
      // Handle audio end
      audio.addEventListener('ended', () => {
        setIsPlayingAudio(false)
        console.log('🎵 Card message audio finished')
        setTimeout(() => {
          void askToPersonalize()
        }, 250)
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

  return (
    <div className="greeting-card-display-container">
      <div className="greeting-card-display-wrapper">
        <div 
          className={`greeting-card-flip-container ${isFlipped ? 'flipped' : ''}`}
        >
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
                <p className="greeting-card-placeholder-text">To: {recipientName}</p>
              </div>
            )}
          </div>

          {/* Back - Message */}
          <div className="greeting-card-flip-back">
            <div className="greeting-card-message-container">
              <div className="greeting-card-message-content">
                {message.split('\n\n').map((paragraph, index) => (
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
      
      <div style={{ textAlign: 'center', marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={onAddNarration}
          style={{ fontSize: '1.2rem', padding: '12px 24px' }}
        >
          Add Custom Narrator →
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleShare}
          disabled={isSharing}
          style={{ fontSize: '1.2rem', padding: '12px 24px', minWidth: '140px' }}
        >
          {isSharing ? '📤 Sharing...' : shareSuccess ? '✅ Shared!' : '📤 Share Card'}
        </button>
      </div>
    </div>
  )
}

export default GreetingCardDisplay
