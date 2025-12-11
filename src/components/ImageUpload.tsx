import { useState, useRef } from 'react'
import './ImageUpload.css'

interface ImageUploadProps {
  onImageSelected: (imageFile: File, imageUrl: string) => void
  onSkip: () => void
  onBack: () => void
  experienceType?: 'story' | 'greeting-card'
  context?: string // Optional context for story experience
}

function ImageUpload({ onImageSelected, onSkip, onBack, experienceType, context }: ImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isTransforming, setIsTransforming] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB')
        return
      }

      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    }
  }

  const handleContinue = async () => {
    if (selectedFile && previewUrl) {
      setIsTransforming(true)
      try {
        // Convert blob URL to data URL
        const response = await fetch(previewUrl)
        const blob = await response.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })

        // Transform image to Christmas story drawing style using Nano Banana
        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')
          const transformResponse = await fetch(`${API_BASE_URL}/api/transform-image-to-drawing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imageDataUrl: dataUrl,
              experienceType: experienceType || 'story',
              context: context
            })
          })

          if (transformResponse.ok) {
            const transformData = await transformResponse.json()
            if (transformData.imageUrl) {
              // Use transformed image
              onImageSelected(selectedFile, transformData.imageUrl)
              setIsTransforming(false)
              return
            }
          }
          
          // If transformation fails, fall back to original image
          console.warn('Image transformation failed, using original image')
          onImageSelected(selectedFile, dataUrl)
        } catch (transformError) {
          console.error('Error transforming image:', transformError)
          // Fall back to original image if transformation fails
          onImageSelected(selectedFile, dataUrl)
        }
      } catch (error) {
        console.error('Error converting image to data URL:', error)
        // Fallback to blob URL if conversion fails
        onImageSelected(selectedFile, previewUrl)
      } finally {
        setIsTransforming(false)
      }
    }
  }

  const handleRemove = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="image-upload">
      <p className="image-upload-intro">
        Add a photo to your Christmas card! 📸<br />
        This will appear on the front cover of your personalized story.
      </p>

      <div className="image-upload-area">
        {isTransforming ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
            <p style={{ fontSize: '1.1rem', color: '#666' }}>Transforming your image into a Christmas story drawing...</p>
          </div>
        ) : previewUrl ? (
          <div className="image-preview-container">
            <img src={previewUrl} alt="Preview" className="image-preview" />
            <button
              className="btn-remove-image"
              onClick={handleRemove}
              type="button"
            >
              ✕ Remove
            </button>
          </div>
        ) : (
          <div className="image-upload-dropzone" onClick={handleClickUpload}>
            <div className="upload-icon">📷</div>
            <p className="upload-text">Click to upload an image</p>
            <p className="upload-hint">or drag and drop</p>
            <p className="upload-requirements">PNG, JPG, GIF up to 5MB</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      <div className="image-upload-actions">
        <button 
          className="btn btn-secondary"
          onClick={onBack}
        >
          ← Back
        </button>
        <button 
          className="btn btn-secondary"
          onClick={onSkip}
        >
          Skip
        </button>
        {previewUrl && (
          <button 
            className="btn btn-primary"
            onClick={handleContinue}
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  )
}

export default ImageUpload

