import { useState } from 'react'
import './Questionnaire.css'

interface YearInReviewQuestionnaireProps {
  onSubmit: (answers: {
    favoriteMemory: string
    newThing: string
    lookingForward: string
  }) => void
  onBack: () => void
}

function YearInReviewQuestionnaire({ onSubmit, onBack }: YearInReviewQuestionnaireProps) {
  const [favoriteMemory, setFavoriteMemory] = useState('')
  const [newThing, setNewThing] = useState('')
  const [lookingForward, setLookingForward] = useState('')

  const handleSubmit = () => {
    if (favoriteMemory.trim() && newThing.trim() && lookingForward.trim()) {
      onSubmit({
        favoriteMemory: favoriteMemory.trim(),
        newThing: newThing.trim(),
        lookingForward: lookingForward.trim()
      })
    }
  }

  const isFormValid = favoriteMemory.trim().length > 0 && 
                      newThing.trim().length > 0 && 
                      lookingForward.trim().length > 0

  return (
    <div className="questionnaire">
      <p className="questionnaire-intro">
        Tell us about your year, and we'll create a personalized story in your own voice!
      </p>

      <div className="questionnaire-form">
        <div className="question-group">
          <label className="question-label">
            What was your favorite memory or adventure from 2025?
          </label>
          <textarea
            value={favoriteMemory}
            onChange={(e) => setFavoriteMemory(e.target.value)}
            placeholder="Share your favorite memory..."
            className="question-input question-textarea"
            rows={4}
          />
        </div>

        <div className="question-group">
          <label className="question-label">
            What's something new you tried or learned in 2025?
          </label>
          <textarea
            value={newThing}
            onChange={(e) => setNewThing(e.target.value)}
            placeholder="Tell us about something new you tried..."
            className="question-input question-textarea"
            rows={4}
          />
        </div>

        <div className="question-group">
          <label className="question-label">
            What are you most looking forward to or hoping for in 2026?
          </label>
          <textarea
            value={lookingForward}
            onChange={(e) => setLookingForward(e.target.value)}
            placeholder="Share your hopes and dreams for the new year..."
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

export default YearInReviewQuestionnaire

