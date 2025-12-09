import { useEffect } from 'react'
import { generateWishList } from '../services/storyService'
import './StoryGeneration.css'

interface WishListGenerationProps {
  answers: {
    dreamGift: string
    experience: string
    practicalNeed: string
  }
  name: string
  isCustomVoice: boolean
  onListGenerated: (listText: string) => void
  onFirstChunkReady?: (chunkText: string) => void
  customApiKey?: string
  onError?: () => void
}

function WishListGeneration({ answers, name, isCustomVoice, onListGenerated, onFirstChunkReady, customApiKey, onError }: WishListGenerationProps) {
  useEffect(() => {
    const generate = async () => {
      try {
        const fullList = await generateWishList(answers, (chunk) => {
          if (chunk.chunkIndex === 0 && onFirstChunkReady) {
            onFirstChunkReady(chunk.text)
          }
        }, customApiKey, name, isCustomVoice)
        
        onListGenerated(fullList)
      } catch (error: any) {
        console.error('Error generating wish list:', error)
        const errorMessage = error?.message || error?.toString() || 'Unknown error'
        
        const errorLower = errorMessage.toLowerCase()
        const isApiKeyError = customApiKey && (
          errorLower.includes('invalid authorization') || 
          errorLower.includes('authorization credentials') ||
          errorLower.includes('failed to read content stream') ||
          errorLower.includes('grpc read failed')
        )
        
        if (isApiKeyError) {
          alert(`Oops! There was an error creating your wish list:\n\nPlease double-check your Inworld API Key and Voice ID.`)
          if (onError) {
            onError()
          }
          return
        } else {
          alert(`Oops! There was an error creating your wish list: ${errorMessage}`)
          if (onError) {
            onError()
          }
          return
        }
      }
    }

    generate()
  }, [answers, name, isCustomVoice, onListGenerated, onFirstChunkReady, customApiKey, onError])

  return (
    <div className="story-generation">
      <div className="loading-container">
        <h2 className="loading-title">CREATING YOUR WISH LIST...</h2>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  )
}

export default WishListGeneration

