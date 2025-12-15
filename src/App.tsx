import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import StoryTypeSelection from './components/StoryTypeSelection'
import NameInput from './components/NameInput'
import SimpleNameInput from './components/SimpleNameInput'
import VoiceSelection from './components/VoiceSelection'
import QuestionnaireTypeSelection from './components/QuestionnaireTypeSelection'
import VoiceConversation from './components/VoiceConversation'
import YearInReviewQuestionnaire from './components/YearInReviewQuestionnaire'
import WishListQuestionnaire from './components/WishListQuestionnaire'
import CustomNarrator from './components/CustomNarrator'
import ImageUpload from './components/ImageUpload'
import StoryGeneration from './components/StoryGeneration'
import YearInReviewGeneration from './components/YearInReviewGeneration'
import WishListGeneration from './components/WishListGeneration'
import StoryNarration from './components/StoryNarration'
import GreetingCardGeneration from './components/GreetingCardGeneration'
import GreetingCardDisplay from './components/GreetingCardDisplay'
import TextBasedChristmasCard from './components/TextBasedChristmasCard'
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
    conversationHistory?: Array<{ role: string; content: string }>
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
  
  // Update document title based on current path
  useEffect(() => {
    if (path === '/storyteller') {
      document.title = 'Christmas Story Creator'
    } else if (path === '/greetingcard') {
      document.title = 'Christmas Card Creator'
    } else if (path === '/christmascard') {
      document.title = 'Christmas Card Creator'
    } else {
      document.title = 'Inworld Christmas Creations'
    }
  }, [path])
  
  const [step, setStep] = useState<Step>(() => {
    if (experienceFromPath === 'story') return 'type-selection'
    if (experienceFromPath === 'greeting-card') return 'greeting-card-questionnaire-voice'
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
  const [preloadedAudio, setPreloadedAudio] = useState<HTMLAudioElement | null>(null)
  const [fullFirstChunkAudio, setFullFirstChunkAudio] = useState<HTMLAudioElement | null>(null)

  // Update experience type when path changes
  useEffect(() => {
    const newExperience = getExperienceFromPath()
    if (newExperience && newExperience !== storyData.experienceType) {
      setStoryData(prev => ({ ...prev, experienceType: newExperience }))
      if (newExperience === 'story') {
        setStep('type-selection')
      } else if (newExperience === 'greeting-card') {
        setStep('greeting-card-questionnaire-voice')
      }
    } else if (!newExperience && path === '/') {
      setStep('landing')
    }
  }, [path, storyData.experienceType])

  // Check backend connectivity on app load (for debugging)
  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://inworld-christmas-story-production.up.railway.app'
    console.log('🔗 App loaded - API URL:', API_BASE_URL)
    console.log('🔗 Environment:', import.meta.env.PROD ? 'Production' : 'Development')
    
    // Quick health check
    fetch(`${API_BASE_URL}/health`)
      .then(res => {
        if (res.ok) {
          console.log('✅ Backend connectivity: OK')
        } else {
          console.warn('⚠️ Backend returned non-OK status:', res.status)
        }
      })
      .catch(err => {
        console.error('❌ Backend connectivity FAILED:', err.message)
        console.error('❌ This may indicate Railway is down or unreachable')
      })
  }, [])

  // Text-based Christmas Card route (simple form, no voice agent)
  // This must come AFTER all hooks to comply with React's rules of hooks
  if (path === '/christmascard') {
    return <TextBasedChristmasCard />
  }

  const handleExperienceSelected = (experience: ExperienceType) => {
    setStoryData(prev => ({ ...prev, experienceType: experience }))
    if (experience === 'story') {
      setStep('type-selection')
    } else if (experience === 'greeting-card') {
      setStep('greeting-card-questionnaire-voice')
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
      // Go directly to generating (image will be auto-generated)
      setStep('generating')
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
      // Show image upload for Year In Review (Christmas Story now auto-generates images)
      if (storyData.experienceType === 'year-review') {
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
    // Show image upload for Year In Review (Christmas Story now auto-generates images)
    if (storyData.experienceType === 'year-review') {
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

  const handleGreetingCardQuestionnaireSubmitted = (answers: {
    recipientName?: string
    relationship?: string
    specialAboutThem?: string
    funnyStory?: string
    conversationHistory?: Array<{ role: string; content: string }>
  }) => {
    // If we have conversation history (from voice), use it directly
    if (answers.conversationHistory) {
      const senderName = storyData.greetingCardData?.senderName || 'Friend'
      setStoryData(prev => ({
        ...prev,
        greetingCardData: {
          senderName,
          recipientName: 'Friend', // Will be extracted by Claude
          relationship: '',
          specialAboutThem: '',
          funnyStory: '',
          conversationHistory: answers.conversationHistory
        }
      }))
      setStep('greeting-card-generating')
      return
    }
    
    // Legacy path - individual answers
    if (!answers.recipientName || !answers.funnyStory) {
      alert('Please answer all questions before continuing.')
      return
    }
    const senderName = storyData.greetingCardData?.senderName || 'Friend'
    
    setStoryData(prev => ({
      ...prev,
      greetingCardData: {
        senderName,
        recipientName: answers.recipientName!,
        relationship: answers.relationship || '',
        specialAboutThem: answers.specialAboutThem || '',
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

  const handleFirstAudioReady = (chunkText: string, audio: HTMLAudioElement) => {
    console.log('🎵 First audio ready, transitioning to narration...')
    setFirstChunkText(chunkText)
    setPreloadedAudio(audio)
    setStep('narration')
  }

  const handleFullFirstChunkAudioReady = (fullAudio: HTMLAudioElement, chunkText: string) => {
    console.log('🎵 Full first chunk audio ready, storing for seamless playback...')
    setFullFirstChunkAudio(fullAudio)
    // Also update firstChunkText if not already set (shouldn't happen, but safety)
    if (!firstChunkText) {
      setFirstChunkText(chunkText)
    }
  }

  // Legacy handler for year-review and wish-list (text-only, no audio preload)
  const handleFirstChunkReady = (chunkText: string) => {
    setFirstChunkText(chunkText)
    setStep('narration')
  }

  const handleStoryGenerated = (storyText: string, generatedImageUrl?: string | null) => {
    console.log('📖 handleStoryGenerated called:', { 
      storyTextLength: storyText.length, 
      generatedImageUrl,
      hasImageUrl: !!generatedImageUrl,
      currentStep: step
    })
    
    // For story experience, only transition to narration when both story AND image are ready
    // This prevents showing the default "Merry Christmas" image before the generated image is ready
    // generatedImageUrl !== undefined means image generation is complete (even if null)
    // generatedImageUrl === undefined means image generation hasn't completed yet
    const isStoryExperience = storyData.experienceType === 'story'
    const imageReady = generatedImageUrl !== undefined
    
    // Only update state if we're still in the generating step (prevent updates from StoryNarration callbacks)
    if (step === 'generating') {
      setStoryData(prev => {
        // Only update imageUrl if generatedImageUrl was explicitly provided (not undefined)
        const newImageUrl = generatedImageUrl !== undefined ? generatedImageUrl : prev.imageUrl
        console.log('📖 Setting storyData with imageUrl:', newImageUrl ? 'present' : 'null')
        return { 
          ...prev, 
          storyText,
          imageUrl: newImageUrl
        }
      })
      
      // Only transition if both story and image are ready (for story experience)
      const shouldTransition = !isStoryExperience || imageReady
      
      if (shouldTransition) {
        console.log('📖 Transitioning to narration step (story and image ready)')
        setStep('narration')
      } else if (isStoryExperience && !imageReady) {
        console.log('📖 Waiting for image generation to complete before transitioning...')
      }
    } else {
      // If we're already past the generating step, just update the story data without transitioning
      // This handles callbacks from StoryNarration that don't include the image
      console.log('📖 Already past generating step, updating story data only (no transition)')
      setStoryData(prev => {
        // Only update storyText, don't overwrite imageUrl if it's already set
        const newImageUrl = generatedImageUrl !== undefined ? generatedImageUrl : prev.imageUrl
        return { 
          ...prev, 
          storyText,
          imageUrl: newImageUrl
        }
      })
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
      if (storyData.experienceType === 'greeting-card') return 'greeting-card-display'
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
      return 'Inworld Christmas Creations'
    } else if (step === 'image-upload') {
      if (storyData.experienceType === 'story') return 'Christmas Story Creator'
      return 'Year In Review'
    } else if (step === 'type-selection' || step === 'name-input') {
      return 'Christmas Story Creator'
    } else if (step === 'custom-narrator' || step === 'generating' || step === 'narration') {
      // Check experience type for these steps
      if (storyData.experienceType === 'year-review') return 'Year In Review'
      if (storyData.experienceType === 'wish-list') return 'Christmas Wish List'
      if (storyData.experienceType === 'greeting-card') return 'Christmas Card Creator'
      // Hide title for story during generating and narration steps
      return ''
    } else if (step.startsWith('year-review')) {
      return 'Year In Review'
    } else if (step.startsWith('wish-list')) {
      return 'Christmas Wish List'
    } else if (step.startsWith('greeting-card')) {
      return 'Christmas Card Creator'
    }
    return 'Inworld Christmas Creations'
  }

  const title = getTitle()
  
  return (
    <div className="app">
      <div className="app-container">
        {title && <h1 className="app-title"><span className="app-title-content">{title}</span></h1>}
        
        {step === 'landing' && (
          <LandingPage onSelectExperience={handleExperienceSelected} />
        )}
        
        {step === 'type-selection' && (
          <StoryTypeSelection 
            onSelect={handleStoryTypeSelected}
          />
        )}
        
        {step === 'name-input' && (
          <NameInput 
            storyType={storyData.type!} 
            onSubmit={handleNameSubmitted}
            onBack={() => setStep('type-selection')}
          />
        )}

        {step === 'greeting-card-questionnaire-voice' && (
          <VoiceConversation
            experienceType="greeting-card"
            userName="Friend"
            onSubmit={handleGreetingCardQuestionnaireSubmitted}
            onBack={() => experienceFromPath ? navigate('/') : setStep('landing')}
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
            conversationHistory={storyData.greetingCardData.conversationHistory}
            onCardGenerated={handleGreetingCardGenerated}
            onError={handleGreetingCardGenerationError}
          />
        )}

        {step === 'greeting-card-display' && storyData.greetingCardData && (
          <GreetingCardDisplay
            coverImageUrl={storyData.imageUrl || storyData.greetingCardData.generatedImageUrl || null}
            message={storyData.greetingCardData.cardMessage || ''}
            recipientName={storyData.greetingCardData.recipientName}
            onAddNarration={() => setStep('custom-narrator')}
            onShareAsIs={async () => {
              try {
                const apiUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://inworld-christmas-story-production.up.railway.app'
                const response = await fetch(`${apiUrl}/api/share-story`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    storyText: storyData.greetingCardData?.cardMessage || '',
                    childName: storyData.greetingCardData?.recipientName || '',
                    voiceId: storyData.voiceId || 'christmas_story_generator__male_elf_narrator',
                    storyType: 'greeting-card',
                    imageUrl: storyData.imageUrl || storyData.greetingCardData?.generatedImageUrl || null,
                    customApiKey: storyData.customApiKey,
                    customVoiceId: storyData.customVoiceId,
                    experienceType: 'greeting-card',
                    senderName: storyData.greetingCardData?.senderName,
                    relationship: storyData.greetingCardData?.relationship
                  })
                })
                if (!response.ok) {
                  throw new Error('Failed to create shareable link')
                }
                const result = await response.json()
                // Construct share URL if not provided
                const shareUrlValue = result.shareUrl || `${window.location.origin}/share/${result.storyId}`
                // Use Web Share API (mobile) or clipboard (desktop)
                const { shareUrl: shareUrlHelper } = await import('./services/shareService')
                await shareUrlHelper(
                  shareUrlValue,
                  'Christmas Card Creator',
                  `Check out this personalized Christmas card for ${storyData.greetingCardData?.recipientName || 'someone special'}!`
                )
              } catch (error: any) {
                console.error('Error sharing card:', error)
                alert('Failed to create shareable link. Please try again.')
              }
            }}
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
          <VoiceConversation
            experienceType="year-review"
            userName="Friend"
            onSubmit={handleYearReviewSubmitted}
            onBack={() => setStep('year-review-questionnaire-type')}
          />
        )}

        {step === 'wish-list-questionnaire-voice' && (
          <VoiceConversation
            experienceType="wish-list"
            userName="Friend"
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

        {step === 'image-upload' && storyData.experienceType === 'year-review' && (
          <ImageUpload
            onImageSelected={handleImageSelected}
            onSkip={handleImageSkipped}
            onBack={() => setStep(getBackStep())}
            experienceType="story"
            context={undefined}
          />
        )}
        
        {step === 'generating' && (
          <>
            {storyData.experienceType === 'story' && (
              <StoryGeneration 
                storyType={storyData.type!}
                childName={storyData.childName}
                voiceId={storyData.voiceId}
                customVoiceId={storyData.customVoiceId}
                onStoryGenerated={handleStoryGenerated}
                onFirstAudioReady={handleFirstAudioReady}
                onFullFirstChunkAudioReady={handleFullFirstChunkAudioReady}
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
            preloadedAudio={preloadedAudio}
            preloadedText={firstChunkText}
            fullFirstChunkAudio={fullFirstChunkAudio}
          />
        )}
      </div>
      
      <footer className="inworld-footer">
        <span style={{ color: '#888', fontSize: '0.9rem' }}>
          🎁 A gift from{' '}
          <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline' }}>
            Inworld AI
          </a>
        </span>
      </footer>
    </div>
  )
}

export default App
