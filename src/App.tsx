import { useState } from 'react'
import StoryTypeSelection from './components/StoryTypeSelection'
import NameInput from './components/NameInput'
import CustomNarrator from './components/CustomNarrator'
import StoryGeneration from './components/StoryGeneration'
import StoryNarration from './components/StoryNarration'
import './App.css'

export type StoryType = string | null

export type VoiceId = 'christmas_story_generator__male_elf_narrator' | 'christmas_story_generator__female_elf_narrator' | string

export interface StoryData {
  type: StoryType
  childName: string
  voiceId: VoiceId
  storyText: string
  customApiKey?: string
  customVoiceId?: string
}

function App() {
  const [step, setStep] = useState<'type-selection' | 'name-input' | 'custom-narrator' | 'generating' | 'narration'>('type-selection')
  const [storyData, setStoryData] = useState<StoryData>({
    type: null,
    childName: '',
    voiceId: 'christmas_story_generator__male_elf_narrator',
    storyText: ''
  })
  const [firstChunkText, setFirstChunkText] = useState<string>('')

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
      setFirstChunkText('') // Reset first chunk
      setStep('generating')
    }
  }

  const handleCustomNarratorSubmitted = (apiKey: string, voiceId: string) => {
    // If apiKey is empty, it means voice was cloned via API (no user API key needed)
    // If apiKey is provided, it's the manual entry flow
    setStoryData(prev => ({ 
      ...prev, 
      voiceId, 
      customApiKey: apiKey || undefined, // Only set if provided
      customVoiceId: voiceId 
    }))
    setFirstChunkText('') // Reset first chunk
    setStep('generating')
  }

  const handleStoryGenerationError = () => {
    // If we have a custom API key, go back to custom narrator page
    // Otherwise, go back to name input
    if (storyData.customApiKey) {
      setStep('custom-narrator')
    } else {
      setStep('name-input')
    }
  }

  const handleFirstChunkReady = (chunkText: string) => {
    console.log('🟡 App: First chunk ready, moving to narration to start TTS early')
    setFirstChunkText(chunkText)
    // Move to narration step early so TTS can start on first chunk
    setStep('narration')
  }

  const handleStoryGenerated = (storyText: string) => {
    setStoryData(prev => ({ ...prev, storyText }))
    // If we're not already in narration (shouldn't happen, but safety check)
    if (step === 'generating') {
      setStep('narration')
    }
  }

  const handleRestart = () => {
    setStep('type-selection')
    setStoryData({
      type: null,
      childName: '',
      voiceId: 'christmas_story_generator__male_elf_narrator',
      storyText: ''
    })
    setFirstChunkText('')
  }

  return (
    <div className="app">
      <div className="app-container">
        <h1 className="app-title"><span className="app-title-content">A Christmas Story For You</span></h1>
        
        {step === 'type-selection' && (
          <StoryTypeSelection onSelect={handleStoryTypeSelected} />
        )}
        
        {step === 'name-input' && (
          <NameInput 
            storyType={storyData.type!} 
            onSubmit={handleNameSubmitted}
            onBack={() => setStep('type-selection')}
          />
        )}
        
        {step === 'custom-narrator' && (
          <CustomNarrator
            childName={storyData.childName}
            onSubmit={handleCustomNarratorSubmitted}
            onBack={() => setStep('name-input')}
          />
        )}
        
        {step === 'generating' && (
          <StoryGeneration 
            storyType={storyData.type!}
            childName={storyData.childName}
            onStoryGenerated={handleStoryGenerated}
            onFirstChunkReady={handleFirstChunkReady}
            customApiKey={storyData.customApiKey}
            onError={handleStoryGenerationError}
          />
        )}
        
        {step === 'narration' && (
          <StoryNarration 
            storyText={storyData.storyText || firstChunkText}
            childName={storyData.childName}
            voiceId={storyData.voiceId}
            storyType={storyData.type}
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

