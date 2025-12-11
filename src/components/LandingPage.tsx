import './LandingPage.css'

interface LandingPageProps {
  onSelectExperience: (experience: 'story' | 'greeting-card') => void
}

function LandingPage({ onSelectExperience }: LandingPageProps) {
  // Check if we're in single-experience mode
  const experienceTypeFromEnv = import.meta.env.VITE_EXPERIENCE_TYPE as 'story' | 'greeting-card' | 'both' | undefined
  const showBoth = !experienceTypeFromEnv || experienceTypeFromEnv === 'both'
  
  // If single experience mode, auto-select and don't show landing page
  if (!showBoth) {
    if (experienceTypeFromEnv === 'story') {
      onSelectExperience('story')
      return null
    } else if (experienceTypeFromEnv === 'greeting-card') {
      onSelectExperience('greeting-card')
      return null
    }
  }
  
  return (
    <div className="landing-page">
      <div className="landing-options">
        <div 
          className="landing-option"
          onClick={() => onSelectExperience('story')}
        >
          <div className="landing-option-icon">📖</div>
          <h2 className="landing-option-title">Christmas Story Generator</h2>
          <p className="landing-option-description">
            Create a personalized Christmas story with your own voice as the narrator
          </p>
        </div>

        <div 
          className="landing-option"
          onClick={() => onSelectExperience('greeting-card')}
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

