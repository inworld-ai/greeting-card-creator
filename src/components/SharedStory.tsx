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

  // Preload audio for greeting cards
  useEffect(() => {
    if (!storyData || storyData.experienceType !== 'greeting-card' || !storyData.storyText || isPreloadingRef.current) return
    isPreloadingRef.current = true

    const preloadAudio = async () => {
      try {
        const audio = await synthesizeSpeech('[happy] ' + storyData.storyText, {
          voiceId: storyData.customVoiceId || 'Craig'
        })
        preloadedAudioRef.current = audio
      } catch (error) {
        console.error('Error preloading audio:', error)
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
        
        // Generate TTS for first chunk - wait for FULL audio (not just first WAV chunk)
        // This eliminates the pause between first chunk and rest
        const audio = await synthesizeSpeech(firstPartText, {
          voiceId: storyData.customVoiceId || storyData.voiceId || 'Craig'
        })
        
        console.log(`🎵 SharedStory: Full first chunk audio ready (${audio.duration?.toFixed(1)}s)! Showing story...`)
        setStoryPreloadedAudio(audio)
        setAudioLoading(false)
        
        // Start generating rest of audio in background (will be passed to StoryNarration)
        if (restPartText && restPartText.length > 10) {
          console.log(`🎵 SharedStory: Starting TTS for remaining ${restPartText.length} chars in background...`)
          // Don't await - let it generate in background
          synthesizeSpeech(restPartText, {
            voiceId: storyData.customVoiceId || storyData.voiceId || 'Craig'
          }).then(restAudio => {
            console.log(`🎵 SharedStory: Background TTS for rest complete (${restAudio.duration?.toFixed(1)}s)`)
            // Store in state so it can be passed to StoryNarration
            setStoryRemainingAudio([restAudio])
          }).catch(err => {
            console.error('Error generating rest audio in background:', err)
          })
        }
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
        audio = preloadedAudioRef.current
      } else {
        audio = await synthesizeSpeech('[happy] ' + storyData.storyText, {
          voiceId: storyData.customVoiceId || 'Craig'
        })
      }
      audioRef.current = audio
      await audio.play()
    } catch (error) {
      console.error('Error playing audio:', error)
    }
  }

  const handleFlipToMessage = () => {
    setIsFlipped(true)
    playMessageAudio()
  }

  const handleRestart = () => {
    navigate('/')
  }

  // Determine if this is a story type that needs audio preloading
  const isStoryExperience = storyData?.experienceType === 'story' || 
                            (storyData?.storyType && storyData?.experienceType !== 'greeting-card')
  
  // Show loading if data is loading OR if story audio is still preloading
  const showLoading = loading || (isStoryExperience && audioLoading)

  if (showLoading) {
    return (
      <div className="app" style={{ background: '#faf7f5', minHeight: '100vh' }}>
        <div className="app-container">
          <div className="story-narration">
            <div className="loading-container">
              <h2 className="loading-title" style={{ display: 'none' }}>Loading...</h2>
              <p className="loading-status">
                {loading ? 'Loading...' : 'Preparing your story...'}
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
            
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleRestart}
                style={{ fontSize: '1.2rem', padding: '12px 24px' }}
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

