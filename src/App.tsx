import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import GreetingCardNames from './components/GreetingCardNames'
import GreetingCardGeneration from './components/GreetingCardGeneration'
import GreetingCardDisplay from './components/GreetingCardDisplay'
import './App.css'

export type StoryType = string | null
export type ExperienceType = 'story' | 'greeting-card' | 'year-review' | 'wish-list'

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
  // For greeting-card
  greetingCardData?: {
    senderName: string
    recipientName: string
    relationship: string
    specialAboutThem: string
    funnyStory: string
    cardMessage?: string
    generatedImageUrl?: string | null
  }
  // Legacy support for year-review and wish-list (kept for backward compatibility)
  yearReviewAnswers?: {
    favoriteMemory: string
    newThing: string
    lookingForward: string
  }
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
  | 'greeting-card-names'
  | 'greeting-card-photo'
  | 'greeting-card-questionnaire-voice'
  | 'greeting-card-generating'
  | 'greeting-card-display'
  | 'greeting-card-rewriting'
  | 'greeting-card-voice-selection'
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
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  
  // Determine experience type from URL path
  const getExperienceFromPath = (): ExperienceType | null => {
    if (path === '/storyteller') return 'story'
    if (path === '/greetingcard') return 'greeting-card'
    return null // Root path shows landing page
  }
  
  const experienceFromPath = getExperienceFromPath()
  
  const [step, setStep] = useState<Step>(() => {
    if (experienceFromPath === 'story') return 'type-selection'
    if (experienceFromPath === 'greeting-card') return 'greeting-card-names'
    return 'landing'
  })
  const [storyData, setStoryData] = useState<StoryData>({
    experienceType: experienceFromPath || 'story',
    type: null,
    childName: '',
    voiceId: 'christmas_story_generator__male_elf_narrator',
    storyText: ''
  })
  const [firstChunkText, setFirstChunkText] = useState<string>('')

  // Update experience type when path changes
  useEffect(() => {
    const newExperience = getExperienceFromPath()
    if (newExperience && newExperience !== storyData.experienceType) {
      setStoryData(prev => ({ ...prev, experienceType: newExperience }))
      if (newExperience === 'story') {
        setStep('type-selection')
      } else if (newExperience === 'greeting-card') {
        setStep('greeting-card-names')
      }
    } else if (!newExperience && path === '/') {
      setStep('landing')
    }
  }, [path, storyData.experienceType])

  const handleExperienceSelected = (experience: ExperienceType) => {
    setStoryData(prev => ({ ...prev, experienceType: experience }))
    if (experience === 'story') {
      setStep('type-selection')
    } else if (experience === 'greeting-card') {
      setStep('greeting-card-names')
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
      // Add image upload step for Christmas Story Generator
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
      // Show image upload for Year In Review and Christmas Story
      if (storyData.experienceType === 'year-review' || storyData.experienceType === 'story') {
        setStep('image-upload')
      } else {
        setStep('generating')
      }
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
    // Show image upload for Year In Review and Christmas Story
    if (storyData.experienceType === 'year-review' || storyData.experienceType === 'story') {
      setStep('image-upload')
    } else if (storyData.experienceType === 'greeting-card') {
      // For greeting cards, go directly to narration since the card is already generated
      setStep('narration')
    } else {
      setStep('generating')
    }
  }

  const handleImageSelected = (_imageFile: File, imageUrl: string) => {
    setStoryData(prev => ({ ...prev, imageUrl }))
    if (storyData.experienceType === 'greeting-card') {
      setStep('greeting-card-questionnaire-voice')
    } else {
      setStep('generating')
    }
  }

  const handleImageSkipped = () => {
    setStoryData(prev => ({ ...prev, imageUrl: null }))
    if (storyData.experienceType === 'greeting-card') {
      setStep('greeting-card-questionnaire-voice')
    } else {
      setStep('generating')
    }
  }

  const handleGreetingCardNamesSubmitted = (senderName: string, recipientName: string, relationship: string) => {
    setStoryData(prev => ({
      ...prev,
      greetingCardData: {
        senderName,
        recipientName,
        relationship,
        specialAboutThem: '',
        funnyStory: ''
      }
    }))
    setStep('greeting-card-photo')
  }

  const handleGreetingCardQuestionnaireSubmitted = (answers: {
    specialAboutThem?: string
    funnyStory?: string
  }) => {
    if (!answers.specialAboutThem || !answers.funnyStory) {
      alert('Please answer all questions before continuing.')
      return
    }
    setStoryData(prev => ({
      ...prev,
      greetingCardData: {
        ...prev.greetingCardData!,
        specialAboutThem: answers.specialAboutThem!,
        funnyStory: answers.funnyStory!
      }
    }))
    setStep('greeting-card-generating')
  }

  const handleGreetingCardGenerated = (cardMessage: string, generatedImageUrl: string | null) => {
    setStoryData(prev => ({
      ...prev,
      greetingCardData: {
        ...prev.greetingCardData!,
        cardMessage,
        generatedImageUrl
      },
      storyText: cardMessage // Store in storyText for narration
    }))
    setStep('greeting-card-display')
  }

  const handleGreetingCardVoiceSelected = async (voiceId: VoiceId | 'custom') => {
    if (voiceId === 'custom') {
      setStep('custom-narrator')
    } else {
      // If Holly or Clark is selected, rewrite the message in third-person
      const isElfNarrator = voiceId === 'christmas_story_generator__female_elf_narrator' || 
                           voiceId === 'christmas_story_generator__male_elf_narrator'
      
      if (isElfNarrator && storyData.greetingCardData?.cardMessage) {
        // Show rewriting progress page
        setStoryData(prev => ({ 
          ...prev, 
          voiceId,
          customVoiceId: undefined,
          customApiKey: undefined
        }))
        setStep('greeting-card-rewriting')
        
        try {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://inworld-christmas-story-production.up.railway.app'
          const rewriteResponse = await fetch(`${API_BASE_URL}/api/rewrite-greeting-card-for-elf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              originalMessage: storyData.greetingCardData.cardMessage,
              senderName: storyData.greetingCardData.senderName,
              recipientName: storyData.greetingCardData.recipientName
            })
          })
          
          if (rewriteResponse.ok) {
            const rewriteData = await rewriteResponse.json()
            setStoryData(prev => ({
              ...prev,
              greetingCardData: {
                ...prev.greetingCardData!,
                cardMessage: rewriteData.rewrittenMessage
              },
              storyText: rewriteData.rewrittenMessage
            }))
          }
        } catch (error) {
          console.error('Error rewriting message for elf narrator:', error)
          // Continue with original message if rewrite fails
        }
        
        // Move to narration after rewrite completes
        setStep('narration')
      } else {
        setStoryData(prev => ({ 
          ...prev, 
          voiceId,
          customVoiceId: undefined,
          customApiKey: undefined
        }))
        setStep('narration')
      }
    }
  }

  const handleGreetingCardGenerationError = () => {
    setStep('greeting-card-questionnaire-voice')
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
      // Fallback
      return 'name-input'
    }
    return 'landing'
  }

  // Determine the title based on the current step
  const getTitle = (): string => {
    if (step === 'landing') {
      return 'The Voice Before Christmas'
    } else if (step === 'image-upload') {
      if (storyData.experienceType === 'story') return 'Christmas Story Generator'
      return 'Year In Review'
    } else if (step === 'type-selection' || step === 'name-input') {
      return 'Christmas Story Generator'
    } else if (step === 'custom-narrator' || step === 'generating' || step === 'narration') {
      // Check experience type for these steps
      if (storyData.experienceType === 'year-review') return 'Year In Review'
      if (storyData.experienceType === 'wish-list') return 'Christmas Wish List'
      if (storyData.experienceType === 'greeting-card') return 'Personalized Christmas Card'
      return 'Christmas Story Generator'
    } else if (step.startsWith('year-review')) {
      return 'Year In Review'
    } else if (step.startsWith('wish-list')) {
      return 'Christmas Wish List'
    } else if (step.startsWith('greeting-card')) {
      return 'Personalized Christmas Card'
    }
    return 'The Voice Before Christmas'
  }

  return (
    <div className="app">
      <div className="app-container">
        <h1 className="app-title"><span className="app-title-content">{getTitle()}</span></h1>
        
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

        {step === 'greeting-card-names' && (
          <GreetingCardNames
            onSubmit={handleGreetingCardNamesSubmitted}
            onBack={() => experienceFromPath ? navigate('/') : setStep('landing')}
          />
        )}

        {step === 'greeting-card-photo' && (
          <ImageUpload
            onImageSelected={handleImageSelected}
            onSkip={handleImageSkipped}
            onBack={() => setStep('greeting-card-names')}
            experienceType="greeting-card"
          />
        )}

        {step === 'greeting-card-questionnaire-voice' && storyData.greetingCardData && (
          <ConversationalQuestionnaire
            experienceType="greeting-card"
            recipientName={storyData.greetingCardData.recipientName}
            relationship={storyData.greetingCardData.relationship}
            onSubmit={handleGreetingCardQuestionnaireSubmitted}
            onBack={() => setStep('greeting-card-photo')}
          />
        )}

        {step === 'greeting-card-generating' && storyData.greetingCardData && (
          <GreetingCardGeneration
            senderName={storyData.greetingCardData.senderName}
            recipientName={storyData.greetingCardData.recipientName}
            relationship={storyData.greetingCardData.relationship}
            specialAboutThem={storyData.greetingCardData.specialAboutThem}
            funnyStory={storyData.greetingCardData.funnyStory}
            uploadedImageUrl={storyData.imageUrl || null}
            onCardGenerated={handleGreetingCardGenerated}
            onError={handleGreetingCardGenerationError}
          />
        )}

        {step === 'greeting-card-display' && storyData.greetingCardData && (
          <GreetingCardDisplay
            coverImageUrl={storyData.imageUrl || storyData.greetingCardData.generatedImageUrl || null}
            message={storyData.greetingCardData.cardMessage || ''}
            recipientName={storyData.greetingCardData.recipientName}
            onAddNarration={() => setStep('greeting-card-voice-selection')}
            onStartOver={() => setStep('greeting-card-names')}
          />
        )}

        {step === 'greeting-card-rewriting' && (
          <div className="story-generation">
            <div className="generation-status">
              <div className="loading-spinner"></div>
              <p className="status-text" style={{ fontSize: '2rem', fontWeight: '600' }}>
                The elves are rewriting...
              </p>
            </div>
          </div>
        )}

        {step === 'greeting-card-voice-selection' && (
          <VoiceSelection
            onSubmit={handleGreetingCardVoiceSelected}
            onBack={() => setStep('greeting-card-display')}
            title="Choose a narrator voice for your greeting card!"
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
            experienceType="story"
            context={storyData.type ? `Story type: ${storyData.type}` : undefined}
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
            storyText={storyData.experienceType === 'greeting-card' && storyData.greetingCardData?.cardMessage 
              ? storyData.greetingCardData.cardMessage 
              : storyData.storyText || firstChunkText}
            childName={storyData.experienceType === 'greeting-card' && storyData.greetingCardData?.recipientName
              ? storyData.greetingCardData.recipientName
              : storyData.childName}
            voiceId={storyData.voiceId}
            storyType={storyData.type}
            imageUrl={storyData.experienceType === 'greeting-card' 
              ? (storyData.imageUrl || storyData.greetingCardData?.generatedImageUrl || null)
              : storyData.imageUrl}
            onRestart={handleRestart}
            isProgressive={!!firstChunkText && !storyData.storyText}
            onFullStoryReady={handleStoryGenerated}
            customApiKey={storyData.customApiKey}
            customVoiceId={storyData.customVoiceId}
            experienceType={storyData.experienceType}
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
