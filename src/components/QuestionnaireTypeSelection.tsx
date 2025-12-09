import './QuestionnaireTypeSelection.css'

interface QuestionnaireTypeSelectionProps {
  experienceType: 'year-review' | 'wish-list'
  onSelect: (type: 'voice' | 'text') => void
  onBack: () => void
}

function QuestionnaireTypeSelection({ experienceType, onSelect, onBack }: QuestionnaireTypeSelectionProps) {
  const title = experienceType === 'year-review' 
    ? 'How would you like to share your year?' 
    : 'How would you like to share your wish list?'

  const description = experienceType === 'year-review'
    ? 'Choose between a conversational voice interview or a traditional text form.'
    : 'Choose between a conversational voice interview or a traditional text form.'

  return (
    <div className="questionnaire-type-selection">
      <h2 className="questionnaire-type-title">{title}</h2>
      <p className="questionnaire-type-description">{description}</p>

      <div className="questionnaire-type-options">
        <button
          className="questionnaire-type-button voice-button"
          onClick={() => onSelect('voice')}
        >
          <span className="button-emoji">🎤</span>
          <span className="button-title">Voice Questionnaire</span>
          <span className="button-description">Have a conversation with an AI that asks you questions</span>
        </button>

        <button
          className="questionnaire-type-button text-button"
          onClick={() => onSelect('text')}
        >
          <span className="button-emoji">✍️</span>
          <span className="button-title">Text Questionnaire</span>
          <span className="button-description">Fill out a traditional form with text responses</span>
        </button>
      </div>

      <div className="questionnaire-type-actions">
        <button 
          className="btn btn-secondary"
          onClick={onBack}
        >
          ← Back
        </button>
      </div>
    </div>
  )
}

export default QuestionnaireTypeSelection

