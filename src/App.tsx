import { useState } from 'react'
import LandingPage from './components/LandingPage'
import StoryTypeSelection from './components/StoryTypeSelection'
import NameInput from './components/NameInput'
import SimpleNameInput from './components/SimpleNameInput'
import VoiceSelection from './components/VoiceSelection'
import QuestionnaireTypeSelection from './components/QuestionnaireTypeSelection'
import ConversationalQuestionnaire from './components/ConversationalQuestionnaire'
import YearInReviewQuestionnaire from './components/YearInReviewQuestionnaire'
import WishListQuestionnaire from './components/WishListQuestionnaire'
import CustomNarrator from './components/CustomNarrator'
import ImageUpload from './components/ImageUpload'
import StoryGeneration from './components/StoryGeneration'
import YearInReviewGeneration from './components/YearInReviewGeneration'
import WishListGeneration from './components/WishListGeneration'
import StoryNarration from './components/StoryNarration'
import './App.css'

export type StoryType = string | null
export type ExperienceType = 'story' | 'year-review' | 'wish-list'

export type VoiceId = 'christmas_story_generator__male_elf_narrator' | 'christmas_story_generator__female_elf_narrator' | string

export interface StoryData {
  experienceType: ExperienceType
  type: StoryType
  childName: string
  voiceId: VoiceId
  storyText: string
  imageUrl?: string | null
  customApiKey?: string
  customVoiceId?: string
  // For year-review
  yearReviewAnswers?: {
    favoriteMemory: string
    newThing: string
    lookingForward: string
  }
  // For wish-list
  wishListAnswers?: {
    dreamGift: string
    experience: string
    practicalNeed: string
  }
}

type Step = 
  | 'landing' 
  | 'type-selection' 
  | 'name-input' 
  | 'year-review-questionnaire-type'
  | 'year-review-questionnaire'
  | 'year-review-questionnaire-voice'
  | 'wish-list-questionnaire-type'
  | 'wish-list-questionnaire'
  | 'wish-list-questionnaire-voice'
  | 'year-review-name-input'
  | 'wish-list-name-input'
  | 'year-review-voice-selection'
  | 'wish-list-voice-selection'
  | 'custom-narrator' 
  | 'image-upload'
  | 'generating' 
  | 'narration'

function App() {
  const [step, setStep] = useState<Step>('landing')
  const [storyData, setStoryData] = useState<StoryData>({
    experienceType: 'story',
    type: null,
    childName: '',
    voiceId: 'christmas_story_generator__male_elf_narrator',
    storyText: ''
  })
  const [firstChunkText, setFirstChunkText] = useState<string>('')

  const handleExperienceSelected = (experience: ExperienceType) => {
    setStoryData(prev => ({ ...prev, experienceType: experience }))
    if (experience === 'story') {
      setStep('type-selection')
    } else if (experience === 'year-review') {
      setStep('year-review-questionnaire-type')
    } else if (experience === 'wish-list') {
      setStep('wish-list-questionnaire-type')
    }
  }

  const handleQuestionnaireTypeSelected = (type: 'voice' | 'text') => {
    if (storyData.experienceType === 'year-review') {
      if (type === 'voice') {
        setStep('year-review-questionnaire-voice')
      } else {
        setStep('year-review-questionnaire')
      }
    } else if (storyData.experienceType === 'wish-list') {
      if (type === 'voice') {
        setStep('wish-list-questionnaire-voice')
      } else {
        setStep('wish-list-questionnaire')
      }
    }
  }

  const handleStoryTypeSelected = (type: StoryType) => {
    setStoryData(prev => ({ ...prev, type }))
    setStep('name-input')
  }

  const handleNameSubmitted = (name: string, voiceId: VoiceId | 'custom') => {
    if (voiceId === 'custom') {
      setStoryData(prev => ({ ...prev, childName: name }))
      setStep('custom-narrator')
    } else {
      setStoryData(prev => ({ ...prev, childName: name, voiceId }))
      setFirstChunkText('')
      setStep('image-upload')
    }
  }

  const handleYearReviewSubmitted = (answers: {
    favoriteMemory?: string
    newThing?: string
    lookingForward?: string
    dreamGift?: string
    experience?: string
    practicalNeed?: string
  }) => {
    // Ensure all required fields are present
    if (!answers.favoriteMemory || !answers.newThing || !answers.lookingForward) {
      alert('Please answer all questions before continuing.')
      return
    }
    setStoryData(prev => ({ 
      ...prev, 
      yearReviewAnswers: {
        favoriteMemory: answers.favoriteMemory!,
        newThing: answers.newThing!,
        lookingForward: answers.lookingForward!
      }
    }))
    setStep('year-review-name-input')
  }

  const handleWishListSubmitted = (answers: {
    favoriteMemory?: string
    newThing?: string
    lookingForward?: string
    dreamGift?: string
    experience?: string
    practicalNeed?: string
  }) => {
    // Ensure all required fields are present
    if (!answers.dreamGift || !answers.experience || !answers.practicalNeed) {
      alert('Please answer all questions before continuing.')
      return
    }
    setStoryData(prev => ({ 
      ...prev, 
      wishListAnswers: {
        dreamGift: answers.dreamGift!,
        experience: answers.experience!,
        practicalNeed: answers.practicalNeed!
      }
    }))
    setStep('wish-list-name-input')
  }

  const handleYearReviewNameSubmitted = (name: string) => {
    setStoryData(prev => ({ ...prev, childName: name }))
    setStep('year-review-voice-selection')
  }

  const handleWishListNameSubmitted = (name: string) => {
    setStoryData(prev => ({ ...prev, childName: name }))
    setStep('wish-list-voice-selection')
  }

  const handleVoiceSelected = (voiceId: VoiceId | 'custom') => {
    if (voiceId === 'custom') {
      setStep('custom-narrator')
    } else {
      setStoryData(prev => ({ 
        ...prev, 
        voiceId,
        customVoiceId: undefined, // Clear custom voice when preset is selected
        customApiKey: undefined   // Clear custom API key when preset is selected
      }))
      setFirstChunkText('')
      setStep('image-upload')
    }
  }

  const handleCustomNarratorSubmitted = (apiKey: string, voiceId: string) => {
    setStoryData(prev => ({ 
      ...prev, 
      voiceId, 
      customApiKey: apiKey || undefined,
      customVoiceId: voiceId 
    }))
    setFirstChunkText('')
    setStep('image-upload')
  }

  const handleImageSelected = (_imageFile: File, imageUrl: string) => {
    setStoryData(prev => ({ ...prev, imageUrl }))
    setStep('generating')
  }

  const handleImageSkipped = () => {
    setStoryData(prev => ({ ...prev, imageUrl: null }))
    setStep('generating')
  }

  const handleStoryGenerationError = () => {
    if (storyData.customApiKey) {
      setStep('custom-narrator')
    } else {
      if (storyData.experienceType === 'story') {
        setStep('name-input')
      } else if (storyData.experienceType === 'year-review') {
        setStep('year-review-questionnaire')
      } else if (storyData.experienceType === 'wish-list') {
        setStep('wish-list-questionnaire')
      }
    }
  }

  const handleFirstChunkReady = (chunkText: string) => {
    setFirstChunkText(chunkText)
    setStep('narration')
  }

  const handleStoryGenerated = (storyText: string) => {
    setStoryData(prev => ({ ...prev, storyText }))
    if (step === 'generating') {
      setStep('narration')
    }
  }

  const handleRestart = () => {
    setStep('landing')
    setStoryData({
      experienceType: 'story',
      type: null,
      childName: '',
      voiceId: 'christmas_story_generator__male_elf_narrator',
      storyText: '',
      imageUrl: null
    })
    setFirstChunkText('')
  }

  const getBackStep = (): Step => {
    if (step === 'name-input') return 'type-selection'
    if (step === 'year-review-questionnaire') return 'landing'
    if (step === 'wish-list-questionnaire') return 'landing'
    if (step === 'year-review-name-input') return 'year-review-questionnaire'
    if (step === 'wish-list-name-input') return 'wish-list-questionnaire'
    if (step === 'year-review-voice-selection') return 'year-review-name-input'
    if (step === 'wish-list-voice-selection') return 'wish-list-name-input'
    if (step === 'custom-narrator') {
      if (storyData.experienceType === 'story') return 'name-input'
      if (storyData.experienceType === 'year-review') return 'year-review-voice-selection'
      if (storyData.experienceType === 'wish-list') return 'wish-list-voice-selection'
    }
    if (step === 'image-upload') {
      if (storyData.customApiKey || storyData.customVoiceId) return 'custom-narrator'
      if (storyData.experienceType === 'story') return 'name-input'
      if (storyData.experienceType === 'year-review') return 'year-review-voice-selection'
      if (storyData.experienceType === 'wish-list') return 'wish-list-voice-selection'
    }
    return 'landing'
  }

  return (
    <div className="app">
      <div className="app-container">
        <h1 className="app-title"><span className="app-title-content">The Voice Before Christmas</span></h1>
        
        {step === 'landing' && (
          <LandingPage onSelectExperience={handleExperienceSelected} />
        )}
        
        {step === 'type-selection' && (
          <StoryTypeSelection 
            onSelect={handleStoryTypeSelected}
            onBack={() => setStep('landing')}
          />
        )}
        
        {step === 'name-input' && (
          <NameInput 
            storyType={storyData.type!} 
            onSubmit={handleNameSubmitted}
            onBack={() => setStep('type-selection')}
          />
        )}

        {step === 'year-review-questionnaire-type' && (
          <QuestionnaireTypeSelection
            experienceType="year-review"
            onSelect={handleQuestionnaireTypeSelected}
            onBack={() => setStep('landing')}
          />
        )}

        {step === 'wish-list-questionnaire-type' && (
          <QuestionnaireTypeSelection
            experienceType="wish-list"
            onSelect={handleQuestionnaireTypeSelected}
            onBack={() => setStep('landing')}
          />
        )}

        {step === 'year-review-questionnaire-voice' && (
          <ConversationalQuestionnaire
            experienceType="year-review"
            onSubmit={handleYearReviewSubmitted}
            onBack={() => setStep('year-review-questionnaire-type')}
          />
        )}

        {step === 'wish-list-questionnaire-voice' && (
          <ConversationalQuestionnaire
            experienceType="wish-list"
            onSubmit={handleWishListSubmitted}
            onBack={() => setStep('wish-list-questionnaire-type')}
          />
        )}

        {step === 'year-review-questionnaire' && (
          <YearInReviewQuestionnaire
            onSubmit={handleYearReviewSubmitted}
            onBack={() => setStep('year-review-questionnaire-type')}
          />
        )}

        {step === 'wish-list-questionnaire' && (
          <WishListQuestionnaire
            onSubmit={handleWishListSubmitted}
            onBack={() => setStep('wish-list-questionnaire-type')}
          />
        )}

        {step === 'year-review-name-input' && (
          <SimpleNameInput
            onSubmit={handleYearReviewNameSubmitted}
            onBack={() => {
              // Go back to the appropriate questionnaire type
              const questionnaireType = storyData.yearReviewAnswers ? 'year-review-questionnaire-voice' : 'year-review-questionnaire'
              setStep(questionnaireType as Step)
            }}
            title="Great! Now let's personalize your year in review! 🌟"
            prompt="What's your name?"
          />
        )}

        {step === 'wish-list-name-input' && (
          <SimpleNameInput
            onSubmit={handleWishListNameSubmitted}
            onBack={() => {
              // Go back to the appropriate questionnaire type
              const questionnaireType = storyData.wishListAnswers ? 'wish-list-questionnaire-voice' : 'wish-list-questionnaire'
              setStep(questionnaireType as Step)
            }}
            title="Great! Now let's personalize your wish list! 🌟"
            prompt="What's your name?"
          />
        )}

        {step === 'year-review-voice-selection' && (
          <VoiceSelection
            onSubmit={handleVoiceSelected}
            onBack={() => setStep('year-review-name-input')}
            title="Choose a narrator voice for your year in review!"
          />
        )}

        {step === 'wish-list-voice-selection' && (
          <VoiceSelection
            onSubmit={handleVoiceSelected}
            onBack={() => setStep('wish-list-name-input')}
            title="Choose a narrator voice for your wish list!"
          />
        )}
        
        {step === 'custom-narrator' && (
          <CustomNarrator
            childName={storyData.childName || 'You'}
            onSubmit={handleCustomNarratorSubmitted}
            onBack={() => setStep(getBackStep())}
          />
        )}

        {step === 'image-upload' && (
          <ImageUpload
            onImageSelected={handleImageSelected}
            onSkip={handleImageSkipped}
            onBack={() => setStep(getBackStep())}
          />
        )}
        
        {step === 'generating' && (
          <>
            {storyData.experienceType === 'story' && (
              <StoryGeneration 
                storyType={storyData.type!}
                childName={storyData.childName}
                onStoryGenerated={handleStoryGenerated}
                onFirstChunkReady={handleFirstChunkReady}
                customApiKey={storyData.customApiKey}
                onError={handleStoryGenerationError}
              />
            )}
            {storyData.experienceType === 'year-review' && storyData.yearReviewAnswers && (
              <YearInReviewGeneration
                answers={storyData.yearReviewAnswers}
                name={storyData.childName || 'You'}
                isCustomVoice={!!storyData.customVoiceId}
                onStoryGenerated={handleStoryGenerated}
                onFirstChunkReady={handleFirstChunkReady}
                customApiKey={storyData.customApiKey}
                onError={handleStoryGenerationError}
              />
            )}
            {storyData.experienceType === 'wish-list' && storyData.wishListAnswers && (
              <WishListGeneration
                answers={storyData.wishListAnswers}
                name={storyData.childName || 'You'}
                isCustomVoice={!!storyData.customVoiceId}
                onListGenerated={handleStoryGenerated}
                onFirstChunkReady={handleFirstChunkReady}
                customApiKey={storyData.customApiKey}
                onError={handleStoryGenerationError}
              />
            )}
          </>
        )}
        
        {step === 'narration' && (
          <StoryNarration 
            storyText={storyData.storyText || firstChunkText}
            childName={storyData.childName}
            voiceId={storyData.voiceId}
            storyType={storyData.type}
            imageUrl={storyData.imageUrl}
            onRestart={handleRestart}
            isProgressive={!!firstChunkText && !storyData.storyText}
            onFullStoryReady={handleStoryGenerated}
            customApiKey={storyData.customApiKey}
            customVoiceId={storyData.customVoiceId}
          />
        )}
      </div>
      
      <footer className="inworld-footer">
        <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" className="inworld-footer-link">
          A gift from Inworld AI
        </a>
      </footer>
    </div>
  )
}

export default App
