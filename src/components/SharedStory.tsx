import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSharedStory } from '../services/shareService'
import StoryNarration from './StoryNarration'
import '../App.css'
import './StoryNarration.css'
import './StoryGeneration.css'
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
  } | null>(null)

  useEffect(() => {
    const loadStory = async () => {
      if (!storyId) {
        setError('Invalid story ID')
        setLoading(false)
        return
      }

      try {
        const data = await getSharedStory(storyId)
        setStoryData({
          storyText: data.storyText,
          childName: data.childName,
          voiceId: data.voiceId as VoiceId,
          storyType: data.storyType,
          imageUrl: data.imageUrl,
          customApiKey: data.customApiKey,
          customVoiceId: data.customVoiceId
        })
      } catch (err: any) {
        setError(err.message || 'Failed to load story')
      } finally {
        setLoading(false)
      }
    }

    loadStory()
  }, [storyId])

  const handleRestart = () => {
    navigate('/')
  }

  if (loading) {
    return (
      <div className="app">
        <div className="app-container">
          <h1 className="app-title"><span className="app-title-content">The Voice Before Christmas</span></h1>
          <div className="story-narration">
            <div className="loading-container">
              <h2 className="loading-title">Loading Story...</h2>
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        </div>
        <footer className="inworld-footer">
          <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" className="inworld-footer-link">
            A gift from Inworld AI
          </a>
        </footer>
      </div>
    )
  }

  if (error || !storyData) {
    return (
      <div className="app">
        <div className="app-container">
          <h1 className="app-title"><span className="app-title-content">The Voice Before Christmas</span></h1>
          <div className="story-narration">
            <div className="error-message" style={{ color: '#f5576c', textAlign: 'center', padding: '40px' }}>
              <h2>Oops!</h2>
              <p>{error || 'Story not found'}</p>
              <button onClick={handleRestart} className="restart-button" style={{ marginTop: '20px' }}>
                Create Your Own Story
              </button>
            </div>
          </div>
        </div>
        <footer className="inworld-footer">
          <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" className="inworld-footer-link">
            A gift from Inworld AI
          </a>
        </footer>
      </div>
    )
  }

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
        <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" className="inworld-footer-link">
          A gift from Inworld AI
        </a>
      </footer>
    </div>
  )
}

export default SharedStory

