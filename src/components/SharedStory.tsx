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
  const hasPlayedRef = useRef(false)
  const isPreloadingRef = useRef(false)

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

  if (loading) {
    return (
      <div className="app" style={{ background: '#faf7f5', minHeight: '100vh' }}>
        <div className="app-container">
          <div className="story-narration">
            <div className="loading-container">
              <h2 className="loading-title">Loading...</h2>
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        </div>
        <footer className="inworld-footer">
          <span style={{ color: '#888', fontSize: '0.9rem' }}>
            🎁 A gift from{' '}
            <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline' }}>
              Inworld AI
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
          <span style={{ color: '#888', fontSize: '0.9rem' }}>
            🎁 A gift from{' '}
            <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline' }}>
              Inworld AI
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
          <span style={{ color: '#888', fontSize: '0.9rem' }}>
            🎁 A gift from{' '}
            <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline' }}>
              Inworld AI
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
          experienceType={storyData.imageUrl ? 'year-review' : (storyData.storyType ? 'story' : 'wish-list')}
        />
      </div>
      <footer className="inworld-footer">
        <span style={{ color: '#888', fontSize: '0.9rem' }}>
          🎁 A gift from{' '}
          <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline' }}>
            Inworld AI
          </a>
        </span>
      </footer>
    </div>
  )
}

export default SharedStory

