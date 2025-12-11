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
    navigate('/greetingcard')
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
          <h2 className="landing-option-title">Christmas Story Generator</h2>
          <p className="landing-option-description">
            Create a personalized Christmas story with your own voice as the narrator
          </p>
        </div>

        <div 
          className="landing-option"
          onClick={handleGreetingCardClick}
        >
          <div className="landing-option-icon">💌</div>
          <h2 className="landing-option-title">Personalized Greeting Card</h2>
          <p className="landing-option-description">
            Create a fun, comical personalized greeting card with AI-generated image and message
          </p>
        </div>
      </div>
    </div>
  )
}

export default LandingPage

