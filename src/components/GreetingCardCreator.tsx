import { useState, useRef, useEffect } from 'react'
import { synthesizeSpeech } from '../services/ttsService'
import { shareUrl } from '../services/shareService'
import CustomNarrator from './CustomNarrator'
import MicrophoneButton from './MicrophoneButton'
import './GreetingCardDisplay.css'
import './MicrophoneButton.css'

// Occasion types with their emoji, label, and theme color
export const OCCASIONS = [
  { value: 'birthday', label: 'Birthday', emoji: '🎂', color: '#9333ea', placeholder: "They're obsessed with their cat Mr. Whiskers" },
  { value: 'thank-you', label: 'Thank You', emoji: '🙏', color: '#0ea5e9', placeholder: "They helped me move last weekend and refused to take any money" },
  { value: 'congratulations', label: 'Congrats', emoji: '🎉', color: '#f59e0b', placeholder: "They finally finished their novel after 5 years of working on it" },
  { value: 'wedding', label: 'Wedding', emoji: '💒', color: '#ec4899', placeholder: "They met at a coffee shop when she spilled latte on his laptop" },
  { value: 'get-well', label: 'Get Well', emoji: '💐', color: '#22c55e', placeholder: "They're the strongest person I know and hate being stuck in bed" },
  { value: 'anniversary', label: 'Anniversary', emoji: '💕', color: '#f43f5e', placeholder: "We still argue about who burned dinner on our first date" },
  { value: 'new-baby', label: 'New Baby', emoji: '👶', color: '#a855f7', placeholder: "The baby has dad's nose and mom's inability to sleep" },
  { value: 'graduation', label: 'Graduation', emoji: '🎓', color: '#3b82f6', placeholder: "They pulled all-nighters for exams but never missed a party" },
  { value: 'thinking-of-you', label: 'Thinking of You', emoji: '💭', color: '#14b8a6', placeholder: "We haven't talked in months but I saw something that reminded me of them" },
  { value: 'custom', label: 'Custom', emoji: '✨', color: '#6366f1', placeholder: "Share something special about them" },
] as const

export type OccasionType = typeof OCCASIONS[number]['value']

type Step = 'landing' | 'form' | 'generating' | 'display' | 'custom-narrator'

function GreetingCardCreator() {
  const [step, setStep] = useState<Step>('landing')
  const [occasion, setOccasion] = useState<OccasionType>('birthday')
  const [customOccasion, setCustomOccasion] = useState('')
  const [recipientInfo, setRecipientInfo] = useState('')
  const [funnyStory, setFunnyStory] = useState('')
  const [signoff, setSignoff] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Generated card data
  const [cardMessage, setCardMessage] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [customVoiceId, setCustomVoiceId] = useState<string | null>(null)
  
  // Display state
  const [isFlipped, setIsFlipped] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareSuccess, setShareSuccess] = useState<'copied' | 'shared' | false>(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [_isAudioReady, setIsAudioReady] = useState(false)
  const [isReplaying, setIsReplaying] = useState(false)
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false)
  
  void _isAudioReady
  
  // Audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null)
  const preloadedFollowUpRef = useRef<HTMLAudioElement | null>(null)
  const statusAudioRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedRef = useRef(false)
  const hasAskedFollowUpRef = useRef(false)
  const isPreloadingRef = useRef(false)

  // Handle logo file upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo file must be less than 2MB')
      return
    }
    
    const reader = new FileReader()
    reader.onload = (event) => {
      setCompanyLogo(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  // Composite logo onto card image
  const compositeLogoOnImage = (imageUrl: string, logoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      const cardImage = new Image()
      cardImage.crossOrigin = 'anonymous'
      
      cardImage.onload = () => {
        // Set canvas to card image size
        canvas.width = cardImage.width
        canvas.height = cardImage.height
        
        // Draw the card image
        ctx.drawImage(cardImage, 0, 0)
        
        // Load and draw the logo
        const logoImage = new Image()
        logoImage.crossOrigin = 'anonymous'
        
        logoImage.onload = () => {
          // Calculate logo size (15% of card width, maintaining aspect ratio)
          const maxLogoWidth = canvas.width * 0.15
          const maxLogoHeight = canvas.height * 0.15
          
          let logoWidth = logoImage.width
          let logoHeight = logoImage.height
          
          // Scale down if needed
          if (logoWidth > maxLogoWidth) {
            const scale = maxLogoWidth / logoWidth
            logoWidth = maxLogoWidth
            logoHeight = logoHeight * scale
          }
          if (logoHeight > maxLogoHeight) {
            const scale = maxLogoHeight / logoHeight
            logoHeight = maxLogoHeight
            logoWidth = logoWidth * scale
          }
          
          // Position in bottom-right corner with padding
          const padding = canvas.width * 0.03
          const x = canvas.width - logoWidth - padding
          const y = canvas.height - logoHeight - padding
          
          // Draw semi-transparent white background for logo visibility
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
          const bgPadding = 8
          ctx.beginPath()
          ctx.roundRect(x - bgPadding, y - bgPadding, logoWidth + bgPadding * 2, logoHeight + bgPadding * 2, 8)
          ctx.fill()
          
          // Draw the logo
          ctx.drawImage(logoImage, x, y, logoWidth, logoHeight)
          
          // Return the composited image as data URL
          resolve(canvas.toDataURL('image/png'))
        }
        
        logoImage.onerror = () => {
          // If logo fails to load, just return the original image
          resolve(imageUrl)
        }
        
        logoImage.src = logoUrl
      }
      
      cardImage.onerror = () => {
        reject(new Error('Failed to load card image'))
      }
      
      cardImage.src = imageUrl
    })
  }

  // Play status audio when generating
  useEffect(() => {
    if (step === 'generating') {
      const statusAudio = new Audio('/audio/card-status.mp3')
      statusAudioRef.current = statusAudio
      statusAudio.play().catch(err => console.log('Status audio play failed:', err))
    } else {
      // Stop status audio when leaving generating step
      if (statusAudioRef.current) {
        statusAudioRef.current.pause()
        statusAudioRef.current = null
      }
    }
    
    return () => {
      if (statusAudioRef.current) {
        statusAudioRef.current.pause()
        statusAudioRef.current = null
      }
    }
  }, [step])

  // Get current occasion config
  const currentOccasion = OCCASIONS.find(o => o.value === occasion) || OCCASIONS[0]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!recipientInfo.trim() || !funnyStory.trim()) {
      setError('Please fill in the recipient and story fields')
      return
    }
    
    if (occasion === 'custom' && !customOccasion.trim()) {
      setError('Please enter your custom card type')
      return
    }
    
    setError(null)
    setStep('generating')
    
    // Use custom occasion text if selected, otherwise use the predefined occasion
    const occasionToSend = occasion === 'custom' ? customOccasion : occasion
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
      
      console.log('🎉 Starting card generation for occasion:', occasionToSend)
      
      // Start message and image generation in parallel
      const messagePromise = fetch(`${API_BASE_URL}/api/generate-greeting-card-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: recipientInfo,
          funnyStory: funnyStory,
          signoff: signoff.trim() || undefined,
          occasion: occasionToSend,
        })
      })
      
      const imagePromise = fetch(`${API_BASE_URL}/api/generate-greeting-card-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: recipientInfo,
          funnyStory: funnyStory,
          occasion: occasionToSend,
        })
      })
      
      // Wait for message first (faster), then start TTS immediately
      const messageResponse = await messagePromise
      if (!messageResponse.ok) {
        throw new Error('Failed to generate card message')
      }
      
      const messageData = await messageResponse.json()
      const cardMessageText = messageData.cardMessage
      setCardMessage(cardMessageText)
      setDisplayName(messageData.parsedRecipientName || recipientInfo)
      
      // Start TTS generation IMMEDIATELY while image is still generating
      console.log('🎵 Message ready! Starting TTS in parallel with image generation...')
      const ttsPromise = synthesizeSpeech('[happy] ' + cardMessageText, {
        voiceId: 'Craig'
      }).then(audio => {
        console.log('✅ Card audio ready!')
        preloadedAudioRef.current = audio
        setIsAudioReady(true)
        isPreloadingRef.current = true
        
        // Preload the follow-up audio
        const followUpAudio = new Audio('/audio/click-custom-narrator.mp3')
        preloadedFollowUpRef.current = followUpAudio
        
        return audio
      }).catch(err => {
        console.error('Error generating card audio:', err)
        return null
      })
      
      // Wait for image
      const imageResponse = await imagePromise
      if (imageResponse.ok) {
        const imageData = await imageResponse.json()
        let finalImageUrl = imageData.imageUrl || null
        
        // If we have a company logo, composite it onto the card
        if (finalImageUrl && companyLogo) {
          try {
            finalImageUrl = await compositeLogoOnImage(finalImageUrl, companyLogo)
          } catch (err) {
            console.error('Error compositing logo:', err)
            // Continue with original image if compositing fails
          }
        }
        
        setCoverImageUrl(finalImageUrl)
      }
      
      // Wait for TTS to complete before showing card
      await ttsPromise
      
      console.log('✅ Card generation complete!')
      setStep('display')
      
    } catch (err: any) {
      console.error('Error generating card:', err)
      setError(err.message || 'Failed to generate card. Please try again.')
      setStep('form')
    }
  }

  // Play message audio when user clicks to see the message
  const playMessageAudio = async () => {
    if (!cardMessage || hasPlayedRef.current) return
    hasPlayedRef.current = true
    setHasPlayedOnce(true)

    try {
      setIsPlayingAudio(true)
      
      let audio: HTMLAudioElement
      if (preloadedAudioRef.current) {
        console.log('🎵 Playing preloaded card message audio...')
        audio = preloadedAudioRef.current
      } else {
        console.log('🎵 Generating card message audio on-demand...')
        audio = await synthesizeSpeech('[happy] ' + cardMessage, {
          voiceId: customVoiceId || 'Craig'
        })
      }
      
      audioRef.current = audio

      const playFollowUp = async () => {
        if (hasAskedFollowUpRef.current) return
        hasAskedFollowUpRef.current = true
        try {
          setIsPlayingAudio(true)
          
          let followUpAudio: HTMLAudioElement
          if (preloadedFollowUpRef.current) {
            followUpAudio = preloadedFollowUpRef.current
          } else {
            followUpAudio = new Audio('/audio/click-custom-narrator.mp3')
          }
          audioRef.current = followUpAudio
          await followUpAudio.play()
        } catch (e) {
          console.error('Error playing follow-up audio:', e)
        } finally {
          setIsPlayingAudio(false)
        }
      }
      
      audio.addEventListener('ended', () => {
        setIsPlayingAudio(false)
        if (!customVoiceId) {
          setTimeout(() => {
            void playFollowUp()
          }, 250)
        }
      }, { once: true })
      
      await audio.play()
    } catch (error) {
      console.error('Error playing audio:', error)
      setIsPlayingAudio(false)
    }
  }

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (preloadedAudioRef.current) {
        preloadedAudioRef.current.pause()
      }
      if (preloadedFollowUpRef.current) {
        preloadedFollowUpRef.current.pause()
      }
    }
  }, [])

  // Handle flip and play audio immediately
  const handleFlipToMessage = () => {
    setIsFlipped(true)
    playMessageAudio()
  }

  // Replay the card message audio
  const handleReplay = async () => {
    if (!preloadedAudioRef.current || isReplaying || isPlayingAudio) return
    
    setIsReplaying(true)
    setIsPlayingAudio(true)
    
    try {
      const audio = preloadedAudioRef.current
      audio.pause()
      audio.currentTime = 0
      
      audio.onended = null
      audio.addEventListener('ended', () => {
        setIsPlayingAudio(false)
        setIsReplaying(false)
      }, { once: true })
      
      await audio.play()
    } catch (error) {
      console.error('Error replaying audio:', error)
      setIsPlayingAudio(false)
      setIsReplaying(false)
    }
  }

  const handleShare = async () => {
    setIsSharing(true)
    setShareSuccess(false)
    
    // Use custom occasion text if selected, otherwise use the predefined occasion
    const occasionToShare = occasion === 'custom' ? customOccasion : occasion
    const shareLabel = occasion === 'custom' ? customOccasion : currentOccasion.label
    const shareEmoji = currentOccasion.emoji
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
      
      const response = await fetch(`${API_BASE_URL}/api/share-story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyText: cardMessage,
          childName: recipientInfo,
          experienceType: 'greeting-card',
          imageUrl: coverImageUrl,
          customVoiceId: customVoiceId || undefined,
          occasion: occasionToShare,
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        const url = data.shareUrl
        
        const result = await shareUrl(
          url,
          `${shareLabel} Card for ${displayName || recipientInfo}`,
          `Check out this personalized ${shareLabel.toLowerCase()} card! ${shareEmoji}`
        )
        
        if (result !== 'cancelled') {
          setShareSuccess(result)
          setTimeout(() => setShareSuccess(false), 3000)
        }
      }
    } catch (error) {
      console.error('Share failed:', error)
    } finally {
      setIsSharing(false)
    }
  }

  const handleAddNarration = () => {
    audioRef.current?.pause()
    preloadedAudioRef.current?.pause()
    preloadedFollowUpRef.current?.pause()
    setStep('custom-narrator')
  }

  // Landing step
  if (step === 'landing') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#faf7f5',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '12px', 
            marginBottom: '2rem' 
          }}>
            <img 
              src="/inworld-favicon.ico" 
              alt="Inworld AI" 
              style={{ width: '48px', height: '48px' }}
            />
            <span style={{
              fontFamily: "'FeatureDeck', serif",
              fontSize: '1.5rem',
              fontWeight: 400,
              color: '#333',
            }}>
              Inworld
            </span>
          </div>
          <h1 style={{
            fontFamily: "'FeatureDeck', serif",
            fontSize: '2.8rem',
            fontWeight: 400,
            color: '#333',
            marginBottom: '1rem',
          }}>
            Greeting Card Creator
          </h1>
          <p style={{
            fontSize: '1.1rem',
            color: '#666',
            marginBottom: '2.5rem',
            lineHeight: 1.6,
          }}>
            Create personalized cards with AI-generated artwork and messages
          </p>
          <button
            onClick={() => {
              const welcomeAudio = new Audio('/audio/welcome-card-creator.mp3')
              welcomeAudio.play().catch(err => console.log('Welcome audio failed:', err))
              setStep('form')
            }}
            style={{
              padding: '1rem 2.5rem',
              fontSize: '1.2rem',
              fontWeight: '600',
              color: 'white',
              background: '#333',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            Create Your Card
          </button>
        </div>
      </div>
    )
  }

  // Form step
  if (step === 'form') {
    return (
      <div className="greeting-card-form" style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#faf7f5',
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontFamily: "'FeatureDeck', serif",
            fontSize: '2.5rem',
            fontWeight: 400,
            color: '#333',
            marginBottom: '0.5rem',
          }}>
            Greeting Card Creator
          </h1>
          <p style={{
            color: '#666',
            marginBottom: '1.5rem',
            fontSize: '1.1rem',
          }}>
            Create a personalized card in seconds!
          </p>
          
          <form onSubmit={handleSubmit} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}>
            {/* Occasion Selector Dropdown */}
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                What type of card?
              </label>
              <select
                value={occasion}
                onChange={(e) => setOccasion(e.target.value as OccasionType)}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  border: '2px solid #ddd',
                  borderRadius: '12px',
                  outline: 'none',
                  background: 'white',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                  backgroundSize: '1.5rem',
                  paddingRight: '3rem',
                }}
                onFocus={(e) => e.target.style.borderColor = '#333'}
                onBlur={(e) => e.target.style.borderColor = '#ddd'}
              >
                {OCCASIONS.map((occ) => (
                  <option key={occ.value} value={occ.value}>
                    {occ.emoji} {occ.label}
                  </option>
                ))}
              </select>
              
              {/* Custom occasion text input */}
              {occasion === 'custom' && (
                <input
                  type="text"
                  value={customOccasion}
                  onChange={(e) => setCustomOccasion(e.target.value)}
                  placeholder="e.g., Housewarming, Retirement, Good Luck..."
                  style={{
                    width: '100%',
                    marginTop: '0.75rem',
                    padding: '1rem',
                    fontSize: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '12px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#333'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
              )}
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                Who is this card for?
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={recipientInfo}
                  onChange={(e) => setRecipientInfo(e.target.value)}
                  placeholder="e.g., Sarah"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    fontSize: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '12px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#333'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
                <MicrophoneButton onTranscript={(text) => setRecipientInfo(text)} />
              </div>
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                Share something fun or meaningful about them
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <textarea
                  value={funnyStory}
                  onChange={(e) => setFunnyStory(e.target.value)}
                  placeholder={currentOccasion.placeholder}
                  rows={4}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    fontSize: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '12px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#333'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
                <MicrophoneButton onTranscript={(text) => setFunnyStory(prev => prev ? `${prev} ${text}` : text)} />
              </div>
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                How would you like to sign off?
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={signoff}
                  onChange={(e) => setSignoff(e.target.value)}
                  placeholder="e.g., Love, Alex"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    fontSize: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '12px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#333'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
                <MicrophoneButton onTranscript={(text) => setSignoff(text)} />
              </div>
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                Company Logo (optional)
              </label>
              <p style={{ 
                fontSize: '0.85rem', 
                color: '#666', 
                margin: '0 0 0.5rem 0' 
              }}>
                Upload a logo to display on the card
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#333',
                    background: 'white',
                    border: '2px solid #ddd',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = '#333'}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = '#ddd'}
                >
                  {companyLogo ? 'Change Logo' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {companyLogo && (
                  <>
                    <img 
                      src={companyLogo} 
                      alt="Company logo preview" 
                      style={{ 
                        height: '40px', 
                        maxWidth: '100px', 
                        objectFit: 'contain',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }} 
                    />
                    <button
                      type="button"
                      onClick={() => setCompanyLogo(null)}
                      style={{
                        padding: '0.5rem',
                        fontSize: '0.85rem',
                        color: '#666',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {error && (
              <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
            )}
            
            <button
              type="submit"
              style={{
                padding: '1rem 2rem',
                fontSize: '1.2rem',
                fontWeight: '600',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                color: 'white',
                background: '#333',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              Create My Card
            </button>
          </form>
          
          <p style={{
            marginTop: '2rem',
            fontSize: '0.9rem',
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}>
            Powered by{' '}
            <a 
              href="https://inworld.ai" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#333', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              Inworld AI
              <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
            </a>
          </p>
        </div>
      </div>
    )
  }

  // Generating step
  if (step === 'generating') {
    const generatingLabel = occasion === 'custom' ? customOccasion.toLowerCase() : currentOccasion.label.toLowerCase()
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#faf7f5',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{
            fontFamily: "'FeatureDeck', serif",
            fontSize: '1.8rem',
            color: '#333',
            marginBottom: '1rem',
          }}>
            Creating your {generatingLabel} card...
          </h2>
          <div className="loading-dots" style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: '#333',
              animation: 'pulse 1.4s infinite ease-in-out both',
              animationDelay: '-0.32s',
            }}></span>
            <span style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: '#333',
              animation: 'pulse 1.4s infinite ease-in-out both',
              animationDelay: '-0.16s',
            }}></span>
            <span style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: '#333',
              animation: 'pulse 1.4s infinite ease-in-out both',
            }}></span>
          </div>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // Custom narrator step
  if (step === 'custom-narrator') {
    return (
      <div style={{ 
        background: '#faf7f5', 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{ width: '100%', maxWidth: '600px' }}>
          <CustomNarrator
            childName={displayName || recipientInfo}
            onSubmit={async (_apiKey: string, voiceId: string) => {
              setCustomVoiceId(voiceId)
              hasPlayedRef.current = false
              hasAskedFollowUpRef.current = true
              preloadedFollowUpRef.current = null
              
              console.log('🎵 Generating card audio with custom voice...')
              try {
                const audio = await synthesizeSpeech('[happy] ' + cardMessage, {
                  voiceId: voiceId
                })
                preloadedAudioRef.current = audio
                isPreloadingRef.current = true
                setIsAudioReady(true)
              } catch (error) {
                console.error('Error generating custom voice audio:', error)
                preloadedAudioRef.current = null
                isPreloadingRef.current = false
              }
              
              setIsFlipped(false)
              setStep('display')
            }}
            onBack={() => setStep('display')}
          />
        </div>
        <p style={{
          textAlign: 'center',
          padding: '2rem',
          fontSize: '0.9rem',
          color: '#888',
          marginTop: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
        }}>
          Powered by{' '}
          <a 
            href="https://inworld.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: '#333', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            Inworld AI
            <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
          </a>
        </p>
      </div>
    )
  }

  // Display step
  return (
    <div className="greeting-card-display-container" style={{ background: '#faf7f5', minHeight: '100vh', paddingTop: '2rem' }}>
      <div className="greeting-card-display-wrapper">
        <div className={`greeting-card-flip-container ${isFlipped ? 'flipped' : ''}`}>
          {/* Front - Cover Image */}
          <div className="greeting-card-flip-front">
            {coverImageUrl ? (
              <div className="greeting-card-cover-image-wrapper">
                <img 
                  src={coverImageUrl} 
                  alt="Greeting card cover" 
                  className="greeting-card-cover-image"
                />
              </div>
            ) : (
              <div className="greeting-card-cover-placeholder" style={{ background: 'linear-gradient(135deg, #333 0%, #55555599 100%)' }}>
                <div className="greeting-card-placeholder-icon">{currentOccasion.emoji}</div>
                <p className="greeting-card-placeholder-text">To: {displayName}</p>
              </div>
            )}
          </div>

          {/* Back - Message */}
          <div className="greeting-card-flip-back">
            <div className="greeting-card-message-container">
              <div className="greeting-card-message-content">
                {cardMessage.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="greeting-card-message-paragraph">
                    {paragraph.trim()}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {!isFlipped && (
          <button
            className="btn btn-secondary greeting-card-view-message-button"
            onClick={handleFlipToMessage}
            style={{ borderColor: '#333', color: '#333' }}
          >
            Click to hear message
          </button>
        )}
        
        {isFlipped && (
          <button
            className="btn btn-secondary greeting-card-back-button"
            onClick={() => setIsFlipped(false)}
          >
            ← Back to Cover
          </button>
        )}
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {isFlipped && hasPlayedOnce && (
          <button
            className="btn btn-primary"
            onClick={handleReplay}
            disabled={isReplaying || isPlayingAudio}
            style={{ fontSize: '1rem', padding: '12px 14px', flex: 'none', width: 'auto', background: '#333' }}
          >
            {isReplaying ? 'Replaying...' : 'Replay'}
          </button>
        )}
        {!customVoiceId && (
          <button
            className="btn btn-primary"
            onClick={handleAddNarration}
            style={{ fontSize: '1rem', padding: '12px 14px', flex: 'none', width: 'auto', background: '#333' }}
          >
            Create Custom Narrator
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handleShare}
          disabled={isSharing}
          style={{ fontSize: '1rem', padding: '12px 14px', flex: 'none', width: 'auto', background: '#333' }}
        >
          {isSharing ? 'Sharing...' : shareSuccess === 'copied' ? 'Link Copied!' : shareSuccess === 'shared' ? 'Shared!' : 'Share Card'}
        </button>
      </div>
      
      <p style={{
        textAlign: 'center',
        marginTop: '2rem',
        paddingBottom: '2rem',
        fontSize: '0.9rem',
        color: '#888',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
      }}>
        Powered by{' '}
        <a 
          href="https://inworld.ai" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#333', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          Inworld AI
          <img src="/inworld-favicon.ico" alt="" style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
        </a>
      </p>
    </div>
  )
}

export default GreetingCardCreator

