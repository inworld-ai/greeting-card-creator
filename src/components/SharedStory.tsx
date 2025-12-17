import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSharedStory } from '../services/shareService'
import { synthesizeSpeech } from '../services/ttsService'
import StoryNarration from './StoryNarration'
import '../App.css'
import './StoryNarration.css'
import './StoryGeneration.css'
import './GreetingCardDisplay.css'
import type { VoiceId } from '../App'

function SharedStory() {
  const { storyId } = useParams<{ storyId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [audioLoading, setAudioLoading] = useState(true) // Wait for audio to preload for stories
  const [error, setError] = useState<string | null>(null)
  const [storyData, setStoryData] = useState<{
    storyText: string
    childName: string
    voiceId: VoiceId
    storyType: string | null
    imageUrl?: string | null
    customApiKey?: string
    customVoiceId?: string
    experienceType?: string
  } | null>(null)
  
  // Greeting card specific state
  const [isFlipped, setIsFlipped] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null)
  const [storyPreloadedAudio, setStoryPreloadedAudio] = useState<HTMLAudioElement | null>(null) // For story experience
  const [storyRemainingAudio, setStoryRemainingAudio] = useState<HTMLAudioElement[] | null>(null) // Remaining audio for story
  const [cardAudioLoading, setCardAudioLoading] = useState(true) // Wait for card audio to preload
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [isReplaying, setIsReplaying] = useState(false)
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false)
  const hasPlayedRef = useRef(false)
  const isPreloadingRef = useRef(false)
  const isStoryPreloadingRef = useRef(false)

  useEffect(() => {
    const loadStory = async () => {
      if (!storyId) {
        setError('Invalid story ID')
        setLoading(false)
        return
      }

      try {
        const data = await getSharedStory(storyId) as any
        console.log('📥 SharedStory loaded data - experienceType:', data.experienceType, 'customVoiceId:', data.customVoiceId)
        setStoryData({
          storyText: data.storyText,
          childName: data.childName,
          voiceId: data.voiceId as VoiceId,
          storyType: data.storyType,
          imageUrl: data.imageUrl,
          customApiKey: data.customApiKey,
          customVoiceId: data.customVoiceId,
          experienceType: data.experienceType
        })
      } catch (err: any) {
        setError(err.message || 'Failed to load story')
      } finally {
        setLoading(false)
      }
    }

    loadStory()
  }, [storyId])

  // Preload audio for greeting cards - wait until audio is ready before showing card
  useEffect(() => {
    // If not a greeting card, mark audio as ready immediately
    if (storyData && storyData.experienceType !== 'greeting-card') {
      setCardAudioLoading(false)
      return
    }
    
    if (!storyData || storyData.experienceType !== 'greeting-card' || !storyData.storyText || isPreloadingRef.current) return
    isPreloadingRef.current = true
    
    console.log('🎵 SharedStory: Preloading greeting card audio...')
    console.log('🎵 SharedStory: customVoiceId from data:', storyData.customVoiceId)
    console.log('🎵 SharedStory: Using voiceId:', storyData.customVoiceId || 'Craig')

    const preloadAudio = async () => {
      try {
        const audio = await synthesizeSpeech('[happy] ' + storyData.storyText, {
          voiceId: storyData.customVoiceId || 'Craig'
        })
        preloadedAudioRef.current = audio
        console.log('✅ SharedStory: Greeting card audio preloaded and ready!')
        setCardAudioLoading(false)
      } catch (error) {
        console.error('Error preloading audio:', error)
        // Show card anyway on error
        setCardAudioLoading(false)
      }
    }

    preloadAudio()
  }, [storyData])

  // Preload audio for story experience - wait for first chunk before showing
  useEffect(() => {
    const isStoryType = storyData?.experienceType === 'story' || 
                        (storyData?.storyType && storyData?.experienceType !== 'greeting-card')
    
    if (!storyData || !isStoryType || !storyData.storyText || isStoryPreloadingRef.current) {
      // Not a story type or no data - mark audio as ready (no preload needed)
      if (storyData && !isStoryType) {
        setAudioLoading(false)
      }
      return
    }
    
    isStoryPreloadingRef.current = true
    console.log('🎵 SharedStory: Starting audio preload for story...')

    const preloadStoryAudio = async () => {
      try {
        // Strip "Title:" prefix if present (same as StoryGeneration)
        let textForTTS = storyData.storyText
        const titleMatch = textForTTS.match(/^Title:\s*(.+?)(?:\n\n|\n)/i)
        if (titleMatch) {
          // Replace "Title: X" with just "X" at the beginning
          textForTTS = titleMatch[1].trim() + '. ' + textForTTS.substring(titleMatch[0].length).trim()
          console.log('🎵 SharedStory: Stripped "Title:" prefix for TTS')
        }
        
        // Get first ~100 words for fast initial audio
        const words = textForTTS.split(/\s+/)
        const firstPartText = words.slice(0, 100).join(' ')
        const restPartText = words.slice(100).join(' ')
        
        console.log(`🎵 SharedStory: Preloading first ${Math.min(100, words.length)} words (${firstPartText.length} chars)...`)
        
        // PARALLEL TTS GENERATION: Start BOTH chunks at the same time!
        // This ensures chunk 2 is ready by the time chunk 1 finishes playing
        
        // Start TTS for REST (chunk 2) FIRST in background - don't await
        let restAudioPromise: Promise<HTMLAudioElement> | null = null
        if (restPartText && restPartText.length > 10) {
          console.log(`🎵 SharedStory: Starting TTS for chunk 2 (${restPartText.length} chars) in PARALLEL...`)
          restAudioPromise = synthesizeSpeech(restPartText, {
            voiceId: storyData.customVoiceId || storyData.voiceId || 'Craig'
          })
          // Handle completion in background
          restAudioPromise.then(restAudio => {
            console.log(`🎵 SharedStory: Chunk 2 audio ready (${restAudio.duration?.toFixed(1)}s) - was generating in parallel!`)
            setStoryRemainingAudio([restAudio])
          }).catch(err => {
            console.error('Error generating chunk 2 audio:', err)
          })
        }
        
        // Generate TTS for first chunk - wait for FULL audio
        const audio = await synthesizeSpeech(firstPartText, {
          voiceId: storyData.customVoiceId || storyData.voiceId || 'Craig'
        })
        
        console.log(`🎵 SharedStory: Full chunk 1 audio ready (${audio.duration?.toFixed(1)}s)! Chunk 2 should be almost ready...`)
        setStoryPreloadedAudio(audio)
        setAudioLoading(false)
      } catch (error) {
        console.error('Error preloading story audio:', error)
        // Show story anyway on error
        setAudioLoading(false)
      }
    }

    preloadStoryAudio()
  }, [storyData])

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

  // Play audio when greeting card is flipped
  const playMessageAudio = async () => {
    if (!storyData?.storyText || hasPlayedRef.current) return
    hasPlayedRef.current = true

    try {
      let audio: HTMLAudioElement
      if (preloadedAudioRef.current) {
        console.log('🎵 Playing preloaded card audio')
        audio = preloadedAudioRef.current
      } else {
        console.log('🎵 No preloaded audio, generating with voiceId:', storyData.customVoiceId || 'Craig')
        audio = await synthesizeSpeech('[happy] ' + storyData.storyText, {
          voiceId: storyData.customVoiceId || 'Craig'
        })
      }
      audioRef.current = audio
      setIsPlayingAudio(true)
      setHasPlayedOnce(true)
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

  const handleRestart = () => {
    navigate('/')
  }

  // Determine experience types
  const isStoryExperience = storyData?.experienceType === 'story' || 
                            (storyData?.storyType && storyData?.experienceType !== 'greeting-card')
  const isGreetingCard = storyData?.experienceType === 'greeting-card'
  
  // Show loading if data is loading OR if audio is still preloading (for either stories or cards)
  const showLoading = loading || (isStoryExperience && audioLoading) || (isGreetingCard && cardAudioLoading)

  if (showLoading) {
    return (
      <div className="app" style={{ background: '#faf7f5', minHeight: '100vh' }}>
        <div className="app-container">
          <div className="story-generation">
            <div className="loading-container">
              <p className="loading-text">
                {loading ? 'Loading...' : isGreetingCard ? 'Preparing your card...' : 'Preparing your story...'}
              </p>
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        </div>
        <footer className="inworld-footer">
          <span style={{ color: '#888', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            A gift from{' '}
            <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Inworld AI
              <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
            </a>
          </span>
        </footer>
      </div>
    )
  }

  if (error || !storyData) {
    return (
      <div className="app" style={{ background: '#faf7f5', minHeight: '100vh' }}>
        <div className="app-container">
          <h1 className="app-title"><span className="app-title-content">Oops!</span></h1>
          <div className="story-narration">
            <div className="error-message" style={{ color: '#dc2626', textAlign: 'center', padding: '40px' }}>
              <h2>Something went wrong</h2>
              <p>{error || 'Content not found'}</p>
              <button onClick={handleRestart} className="btn btn-primary" style={{ marginTop: '20px' }}>
                Create Your Own
              </button>
            </div>
          </div>
        </div>
        <footer className="inworld-footer">
          <span style={{ color: '#888', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            A gift from{' '}
            <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Inworld AI
              <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
            </a>
          </span>
        </footer>
      </div>
    )
  }

  // Greeting card display for shared cards
  if (storyData.experienceType === 'greeting-card') {
    return (
      <div className="app" style={{ background: '#faf7f5', minHeight: '100vh' }}>
        <div className="app-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
          <h1 className="app-title" style={{ marginBottom: '2rem' }}>
            <span className="app-title-content">A Christmas Card For You</span>
          </h1>
          
          <div className="greeting-card-display-container">
            <div className="greeting-card-display-wrapper">
              <div className={`greeting-card-flip-container ${isFlipped ? 'flipped' : ''}`}>
                {/* Front - Cover Image */}
                <div className="greeting-card-flip-front">
                  {storyData.imageUrl ? (
                    <div className="greeting-card-cover-image-wrapper">
                      <img 
                        src={storyData.imageUrl} 
                        alt="Christmas card cover" 
                        className="greeting-card-cover-image"
                      />
                    </div>
                  ) : (
                    <div className="greeting-card-cover-placeholder">
                      <div className="greeting-card-placeholder-icon">💌</div>
                      <p className="greeting-card-placeholder-text">To: {storyData.childName}</p>
                    </div>
                  )}
                </div>

                {/* Back - Message */}
                <div className="greeting-card-flip-back">
                  <div className="greeting-card-message-container">
                    <div className="greeting-card-message-content">
                      {storyData.storyText.split('\n\n').map((paragraph, index) => (
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
                  Click to hear the message
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
              {/* Replay button - show when message has been played */}
              {isFlipped && hasPlayedOnce && (
                <button
                  className="btn btn-primary"
                  onClick={handleReplay}
                  disabled={isReplaying || isPlayingAudio}
                  style={{ fontSize: '1rem', padding: '12px 14px', flex: 'none', width: 'auto', background: '#166534' }}
                >
                  {isReplaying ? 'Replaying...' : 'Replay'}
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={handleRestart}
                style={{ fontSize: '1rem', padding: '12px 14px', flex: 'none', width: 'auto', background: '#166534' }}
              >
                Create Your Own Card
              </button>
            </div>
          </div>
        </div>
        
        <footer className="inworld-footer">
          <span style={{ color: '#888', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            A gift from{' '}
            <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Inworld AI
              <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
            </a>
          </span>
        </footer>
      </div>
    )
  }

  // Story display (default)
  return (
    <div className="app">
      <div className="app-container">
        <h1 className="app-title"><span className="app-title-content">A Christmas Story For You</span></h1>
        <StoryNarration
          storyText={storyData.storyText}
          childName={storyData.childName}
          voiceId={storyData.voiceId}
          storyType={storyData.storyType}
          imageUrl={storyData.imageUrl}
          onRestart={handleRestart}
          isProgressive={false}
          customApiKey={storyData.customApiKey}
          customVoiceId={storyData.customVoiceId}
          isShared={true}
          experienceType={storyData.storyType ? 'story' : (storyData.imageUrl ? 'year-review' : 'wish-list')}
          preloadedAudio={storyPreloadedAudio}
          preloadedRemainingAudio={storyRemainingAudio}
        />
      </div>
      <footer className="inworld-footer">
        <span style={{ color: '#888', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          A gift from{' '}
          <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Inworld AI
            <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
          </a>
        </span>
      </footer>
    </div>
  )
}

export default SharedStory

