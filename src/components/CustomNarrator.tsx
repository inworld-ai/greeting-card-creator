import { useState, useRef, useEffect } from 'react'
import './NameInput.css'

interface CustomNarratorProps {
  childName: string
  onSubmit: (apiKey: string, voiceId: string) => void
  onBack: () => void
}

function CustomNarrator({ childName, onSubmit, onBack }: CustomNarratorProps) {
  const [apiKey, setApiKey] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  // Voice cloning state
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const useVoiceClone = true // Always use voice clone recording
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000, // 24kHz - good quality for voice while keeping file size reasonable
        } 
      })
      
      // Try to use a more compressed format, fallback to webm
      let mimeType = 'audio/webm;codecs=opus'
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm'
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus'
      }
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 64000, // 64kbps - good quality for voice while keeping file size reasonable
      })
      
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1
          // Auto-stop at 15 seconds (API limit)
          if (newTime >= 15) {
            stopRecording()
          }
          return newTime
        })
      }, 1000)
      
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setError('Unable to access microphone. Please check your browser permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const handleRecordAgain = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    setAudioBlob(null)
    setRecordingTime(0)
    setError(null)
  }

  const convertAudioToBase64 = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Use the original compressed WebM/Opus format (already optimized)
      // Converting to WAV would make it larger, so we keep the original
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1] // Remove data:audio/webm;base64, prefix
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const handleCloneVoice = async () => {
    if (!audioBlob) {
      setError('Please record an audio sample first')
      return
    }

    // Use the child's name for the voice name
    const voiceName = `${childName}'s Voice`

    setIsProcessing(true)
    setError(null)

    try {
      // Convert audio to base64
      const base64Audio = await convertAudioToBase64(audioBlob)
      
      // Call backend clone API
      const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001')
      const response = await fetch(`${API_BASE_URL}/api/clone-voice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioData: base64Audio,
          displayName: voiceName,
          langCode: 'EN_US',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
        throw new Error(errorMessage)
      }

      const data = await response.json()
      
      // Check for validation errors
      if (data.errors && data.errors.length > 0) {
        setError(`Voice cloning validation failed: ${data.errors.map((e: any) => e.text).join(', ')}`)
        setIsProcessing(false)
        return
      }

      // Show warnings if any
      if (data.warnings && data.warnings.length > 0) {
        console.warn('Voice clone warnings:', data.warnings)
      }

      // Use the cloned voice immediately
      // No API key needed - server uses its own Portal key
      onSubmit('', data.voiceId)
      
    } catch (err: any) {
      console.error('Error cloning voice:', err)
      setError(err.message || 'Failed to clone voice. Please try again.')
      setIsProcessing(false)
    }
  }

  const handleSubmit = () => {
    setError(null)
    // Always use voice clone flow
    handleCloneVoice()
  }

  return (
    <div className="name-input">
      <p className="prompt-text">
        Create your own narrator for the story about <strong>{childName}</strong>! 🎤
      </p>
      
      {/* Voice Clone Recording Only */}
      {useVoiceClone ? (
        // Voice Clone Flow
        <div>
          <div style={{ 
            marginTop: '10px', 
            padding: '18px', 
            backgroundColor: '#fff5f5', 
            borderRadius: '8px',
            border: '1px solid #f0d0d0',
            marginBottom: '20px'
          }}>
            <p style={{ fontSize: '1.05rem', lineHeight: '1.6', color: '#555', margin: '0 0 12px 0' }}>
              <strong>🎤 Record a 10-15 second audio sample</strong> of yourself speaking clearly. 
              An AI voice will be made instantly and ready to use! Follow this script when recording:
            </p>
            <div style={{ 
              backgroundColor: '#fff', 
              padding: '14px', 
              borderRadius: '6px', 
              border: '1px solid #d0e7ff',
              fontSize: '1rem',
              lineHeight: '1.8',
              color: '#333',
              fontStyle: 'italic'
            }}>
              "Hi! I'm excited to share my Christmas creation with you. This year has been wonderful, and I can't wait to share the magic. Thank you for listening!"
            </div>
          </div>

          {/* Recording Interface */}
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            {!audioBlob ? (
              <div>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className="submit-button"
                  style={{
                    backgroundColor: '#dc3545',
                    fontSize: '1.1rem',
                    padding: '16px 32px',
                    marginBottom: '12px'
                  }}
                >
                  {isRecording ? (
                    <>
                      ⏹️ Stop Recording ({recordingTime}s)
                    </>
                  ) : (
                    <>
                      🎙️ Start Recording
                    </>
                  )}
                </button>
                {isRecording && (
                  <p style={{ color: '#dc3545', fontSize: '0.9rem', marginTop: '8px' }}>
                    Recording... Speak clearly for 10-15 seconds
                  </p>
                )}
              </div>
            ) : (
              <div>
                <audio 
                  src={audioUrl || undefined} 
                  controls 
                  style={{ width: '100%', marginBottom: '16px' }}
                />
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
                  <button
                    onClick={handleRecordAgain}
                    className="back-button"
                    style={{ padding: '10px 20px' }}
                  >
                    🎙️ Record Again
                  </button>
                </div>
                
                <div style={{ marginTop: '20px' }}>
                  <button
                    onClick={handleCloneVoice}
                    disabled={isProcessing}
                    className="submit-button"
                    style={{ 
                      marginTop: '0',
                      opacity: isProcessing ? 0.6 : 1,
                      cursor: isProcessing ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isProcessing ? '🔄 Cloning Voice...' : '✨ Clone Voice & Create Story'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Original Manual Entry Flow
        <>
          <div style={{ 
            marginTop: '10px', 
            padding: '18px', 
            backgroundColor: '#fff5f5', 
            borderRadius: '8px',
            border: '1px solid #f0d0d0'
          }}>
            <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '14px', color: '#333' }}>
              Getting Started:
            </p>
            <ol style={{ fontSize: '0.85rem', lineHeight: '1.7', color: '#555', marginLeft: '20px', paddingLeft: '0', marginBottom: '16px' }}>
              <li style={{ marginBottom: '10px' }}>
                <strong>Log in to Inworld:</strong> Go to <a href="https://studio.inworld.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc', textDecoration: 'underline' }}>studio.inworld.ai</a> and sign in to your account
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Get your API Key:</strong> Navigate to API Keys → Copy the "Basic (Base64) key"
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Create a Voice Clone (optional):</strong> Go to TTS → Clone Voice → Upload/record audio samples to create your custom narrator voice
              </li>
              <li style={{ marginBottom: '0' }}>
                <strong>Get your Voice ID:</strong> Go to TTS → In the Select Voice list, copy the Voice ID (see format details below)
              </li>
            </ol>
            
            <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '14px', marginTop: '16px', color: '#333' }}>
              Important:
            </p>
            <ul style={{ fontSize: '0.85rem', lineHeight: '1.7', color: '#555', marginLeft: '20px', paddingLeft: '0', marginBottom: '0' }}>
              <li style={{ marginBottom: '10px' }}>
                <strong>API Key:</strong> Must be the Basic (Base64) key copied from your Inworld workspace (API Keys → Copy the "Basic (Base64) key")
              </li>
              <li style={{ marginBottom: '0' }}>
                <strong>Voice ID:</strong> Copy directly from your Select Voice list
                <ul style={{ marginTop: '8px', marginLeft: '20px', marginBottom: '0' }}>
                  <li style={{ marginBottom: '6px' }}>Inworld voices: Just the name (e.g., "Alex")</li>
                  <li style={{ marginBottom: '0' }}>Custom voices: Full format (e.g., <code style={{ fontSize: '0.8em', background: '#f0f0f0', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' }}>default-workspaceid__voice_name</code>)</li>
                </ul>
              </li>
            </ul>
          </div>
          
          <div className="input-group" style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="voice-selection-label" style={{ marginBottom: '8px', display: 'block' }}>
                  Inworld API Key (Base64):
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Base64-encoded Inworld API Key..."
                  className="name-input-field"
                  autoFocus
                  style={{ width: '100%' }}
                />
              </div>
              
              <div>
                <label className="voice-selection-label" style={{ marginBottom: '8px', display: 'block' }}>
                  Inworld Voice ID:
                </label>
                <input
                  type="text"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter your Inworld Voice ID..."
                  className="name-input-field"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={!apiKey.trim() || !voiceId.trim()}
              className="submit-button"
              style={{ marginTop: '20px' }}
            >
              Create Story with Custom Narrator
            </button>
          </div>
        </>
      )}
      
      {error && (
        <div className="error-message" style={{ color: '#f5576c', marginTop: '10px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      
      <button onClick={onBack} className="back-button" style={{ marginTop: '20px' }}>
        ← Go Back
      </button>
    </div>
  )
}

export default CustomNarrator
