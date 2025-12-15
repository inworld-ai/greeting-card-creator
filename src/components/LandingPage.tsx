import { useNavigate } from 'react-router-dom'
import './LandingPage.css'

interface LandingPageProps {
  onSelectExperience: (experience: 'story' | 'greeting-card') => void
}

function LandingPage({ onSelectExperience }: LandingPageProps) {
  const navigate = useNavigate()

  const handleStoryClick = () => {
    navigate('/storyteller')
    onSelectExperience('story')
  }

  const handleGreetingCardClick = () => {
    navigate('/christmascard')
    onSelectExperience('greeting-card')
  }

  return (
    <div className="landing-page">
      <div className="landing-options">
        <div 
          className="landing-option"
          onClick={handleStoryClick}
        >
          <div className="landing-option-icon">📖</div>
          <h2 className="landing-option-title">Christmas Story Creator</h2>
          <p className="landing-option-description">
            Create a personalized Christmas story with your own voice as the narrator
          </p>
        </div>

        <div 
          className="landing-option"
          onClick={handleGreetingCardClick}
        >
          <div className="landing-option-icon">💌</div>
          <h2 className="landing-option-title">Christmas Card Creator</h2>
          <p className="landing-option-description">
            Create a personalized Christmas card with your own voice as the narrator
          </p>
        </div>
      </div>
    </div>
  )
}

export default LandingPage

