import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import StoryTypeSelection from './components/StoryTypeSelection'
import NameInput from './components/NameInput'
import VoiceSelection from './components/VoiceSelection'
import VoiceConversation from './components/VoiceConversation'
import CustomNarrator from './components/CustomNarrator'
import StoryGeneration from './components/StoryGeneration'
import StoryNarration from './components/StoryNarration'
import GreetingCardGeneration from './components/GreetingCardGeneration'
import GreetingCardDisplay from './components/GreetingCardDisplay'
import TextBasedChristmasCard from './components/TextBasedChristmasCard'
import './App.css'

export type StoryType = string | null
export type ExperienceType = 'story' | 'greeting-card'

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
  | 'custom-narrator'
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
  const [preloadedRemainingAudio, setPreloadedRemainingAudio] = useState<HTMLAudioElement[] | null>(null)

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

  const handleCustomNarratorSubmitted = (apiKey: string, voiceId: string) => {
    setStoryData(prev => ({ 
      ...prev, 
      voiceId, 
      customApiKey: apiKey || undefined,
      customVoiceId: voiceId 
    }))
    setFirstChunkText('')
    if (storyData.experienceType === 'greeting-card') {
      // For greeting cards, go directly to narration since the card is already generated
      setStep('narration')
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
      setStep('name-input')
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

  const handleRemainingAudioReady = (remainingAudios: HTMLAudioElement[]) => {
    console.log(`🎵 Remaining audio ready early! ${remainingAudios.length} chunks, ${remainingAudios[0]?.duration?.toFixed(1)}s`)
    setPreloadedRemainingAudio(remainingAudios)
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
    if (step === 'custom-narrator') {
      if (storyData.experienceType === 'story') return 'name-input'
      if (storyData.experienceType === 'greeting-card') return 'greeting-card-display'
    }
    return 'landing'
  }

  // Determine the title based on the current step
  const getTitle = (): string => {
    if (step === 'landing') {
      return 'Inworld Christmas Creations'
    } else if (step === 'type-selection' || step === 'name-input') {
      return 'Christmas Story Creator'
    } else if (step === 'custom-narrator' || step === 'generating' || step === 'narration') {
      // Check experience type for these steps
      if (storyData.experienceType === 'greeting-card') return 'Christmas Card Creator'
      // Hide title for story during generating and narration steps
      return ''
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
        
        {step === 'custom-narrator' && (
          <CustomNarrator
            childName={storyData.childName || 'You'}
            onSubmit={handleCustomNarratorSubmitted}
            onBack={() => setStep(getBackStep())}
          />
        )}
        
        {step === 'generating' && (
          <StoryGeneration 
            storyType={storyData.type!}
            childName={storyData.childName}
            voiceId={storyData.voiceId}
            customVoiceId={storyData.customVoiceId}
            onStoryGenerated={handleStoryGenerated}
            onFirstAudioReady={handleFirstAudioReady}
            onFullFirstChunkAudioReady={handleFullFirstChunkAudioReady}
            onRemainingAudioReady={handleRemainingAudioReady}
            customApiKey={storyData.customApiKey}
            onError={handleStoryGenerationError}
          />
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
            preloadedRemainingAudio={preloadedRemainingAudio}
          />
        )}
      </div>
      
      <footer className="inworld-footer">
        <span style={{ color: '#888', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          A gift from{' '}
          <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#166534', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Inworld AI
            <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
          </a>
        </span>
      </footer>
    </div>
  )
}

export default App
