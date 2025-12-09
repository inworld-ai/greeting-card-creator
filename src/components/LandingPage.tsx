import './LandingPage.css'

interface LandingPageProps {
  onSelectExperience: (experience: 'story' | 'year-review' | 'wish-list') => void
}

function LandingPage({ onSelectExperience }: LandingPageProps) {
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
          onClick={() => onSelectExperience('year-review')}
        >
          <div className="landing-option-icon">📝</div>
          <h2 className="landing-option-title">Year in Review</h2>
          <p className="landing-option-description">
            Share your favorite memories from 2025 and hear your voice tell your story
          </p>
        </div>

        <div 
          className="landing-option"
          onClick={() => onSelectExperience('wish-list')}
        >
          <div className="landing-option-icon">🎁</div>
          <h2 className="landing-option-title">Christmas Wish List</h2>
          <p className="landing-option-description">
            Tell us what you want for Christmas and hear your voice read your wish list
          </p>
        </div>
      </div>
    </div>
  )
}

export default LandingPage

