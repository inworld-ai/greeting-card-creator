import { useState } from 'react'
import './Questionnaire.css'

interface WishListQuestionnaireProps {
  onSubmit: (answers: {
    dreamGift: string
    experience: string
    practicalNeed: string
  }) => void
  onBack: () => void
}

function WishListQuestionnaire({ onSubmit, onBack }: WishListQuestionnaireProps) {
  const [dreamGift, setDreamGift] = useState('')
  const [experience, setExperience] = useState('')
  const [practicalNeed, setPracticalNeed] = useState('')

  const handleSubmit = () => {
    if (dreamGift.trim() && experience.trim() && practicalNeed.trim()) {
      onSubmit({
        dreamGift: dreamGift.trim(),
        experience: experience.trim(),
        practicalNeed: practicalNeed.trim()
      })
    }
  }

  const isFormValid = dreamGift.trim().length > 0 && 
                      experience.trim().length > 0 && 
                      practicalNeed.trim().length > 0

  return (
    <div className="questionnaire">
      <p className="questionnaire-intro">
        Tell us what you want for Christmas, and we'll create a personalized wish list in your own voice!
      </p>

      <div className="questionnaire-form">
        <div className="question-group">
          <label className="question-label">
            What's the one gift you've been thinking about all year, and why does it matter to you?
          </label>
          <textarea
            value={dreamGift}
            onChange={(e) => setDreamGift(e.target.value)}
            placeholder="Describe your dream gift..."
            className="question-input question-textarea"
            rows={4}
          />
        </div>

        <div className="question-group">
          <label className="question-label">
            Is there something you'd love to experience rather than receive? (like a trip, concert, or special dinner)
          </label>
          <textarea
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="Share an experience you'd love to have..."
            className="question-input question-textarea"
            rows={4}
          />
        </div>

        <div className="question-group">
          <label className="question-label">
            What's something practical you actually need but wouldn't buy for yourself?
          </label>
          <textarea
            value={practicalNeed}
            onChange={(e) => setPracticalNeed(e.target.value)}
            placeholder="Tell us about something practical you need..."
            className="question-input question-textarea"
            rows={4}
          />
        </div>

        <div className="questionnaire-actions">
          <button 
            className="btn btn-secondary"
            onClick={onBack}
          >
            ← Back
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!isFormValid}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  )
}

export default WishListQuestionnaire

