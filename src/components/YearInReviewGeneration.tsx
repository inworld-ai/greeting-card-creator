import { useEffect } from 'react'
import { generateYearInReview } from '../services/storyService'
import './StoryGeneration.css'

interface YearInReviewGenerationProps {
  answers: {
    favoriteMemory: string
    newThing: string
    lookingForward: string
  }
  name: string
  isCustomVoice: boolean
  onStoryGenerated: (storyText: string) => void
  onFirstChunkReady?: (chunkText: string) => void
  customApiKey?: string
  onError?: () => void
}

function YearInReviewGeneration({ answers, name, isCustomVoice, onStoryGenerated, onFirstChunkReady, customApiKey, onError }: YearInReviewGenerationProps) {
  useEffect(() => {
    const generate = async () => {
      try {
        const fullStory = await generateYearInReview(answers, (chunk) => {
          if (chunk.chunkIndex === 0 && onFirstChunkReady) {
            onFirstChunkReady(chunk.text)
          }
        }, customApiKey, name, isCustomVoice)
        
        onStoryGenerated(fullStory)
      } catch (error: any) {
        console.error('Error generating year in review:', error)
        const errorMessage = error?.message || error?.toString() || 'Unknown error'
        
        const errorLower = errorMessage.toLowerCase()
        const isApiKeyError = customApiKey && (
          errorLower.includes('invalid authorization') || 
          errorLower.includes('authorization credentials') ||
          errorLower.includes('failed to read content stream') ||
          errorLower.includes('grpc read failed')
        )
        
        if (isApiKeyError) {
          alert(`Oops! There was an error creating your year in review:\n\nPlease double-check your Inworld API Key and Voice ID.`)
          if (onError) {
            onError()
          }
          return
        } else {
          alert(`Oops! There was an error creating your year in review: ${errorMessage}`)
          if (onError) {
            onError()
          }
          return
        }
      }
    }

    generate()
  }, [answers, name, isCustomVoice, onStoryGenerated, onFirstChunkReady, customApiKey, onError])

  return (
    <div className="story-generation">
      <div className="loading-container">
        <h2 className="loading-title">CREATING YOUR YEAR IN REVIEW...</h2>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  )
}

export default YearInReviewGeneration

