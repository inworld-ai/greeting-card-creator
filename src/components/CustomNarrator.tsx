import { useState, useRef, useEffect } from 'react'

interface CustomNarratorProps {
  childName: string
  onSubmit: (apiKey: string, voiceId: string) => void
  onBack: () => void
}

function CustomNarrator({ childName, onSubmit, onBack }: CustomNarratorProps) {
  const [error, setError] = useState<string | null>(null)
  
  // Voice cloning state
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
          sampleRate: 24000,
        } 
      })
      
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
        audioBitsPerSecond: 64000,
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
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1
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

  // File upload handlers
  const handleFileUpload = (file: File) => {
    // Validate file type
    const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/x-m4a']
    if (!validTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|webm|ogg|m4a)$/i)) {
      setError('Please upload a valid audio file (WAV, MP3, WebM, OGG, or M4A)')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Please upload an audio file under 10MB.')
      return
    }

    setError(null)
    setAudioBlob(file)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioUrl(URL.createObjectURL(file))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const convertAudioToBase64 = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const handleCloneVoice = async () => {
    if (!audioBlob) {
      setError('Please record or upload an audio sample first')
      return
    }

    const voiceName = `${childName}'s Voice`

    setIsProcessing(true)
    setError(null)

    try {
      const base64Audio = await convertAudioToBase64(audioBlob)
      
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
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
      
      if (data.errors && data.errors.length > 0) {
        setError(`Voice cloning validation failed: ${data.errors.map((e: any) => e.text).join(', ')}`)
        setIsProcessing(false)
        return
      }

      if (data.warnings && data.warnings.length > 0) {
        console.warn('Voice clone warnings:', data.warnings)
      }

      onSubmit('', data.voiceId)
      
    } catch (err: any) {
      console.error('Error cloning voice:', err)
      setError(err.message || 'Failed to clone voice. Please try again.')
      setIsProcessing(false)
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      padding: '1rem',
    }}>
      <div style={{ 
        marginTop: '10px', 
        padding: '18px', 
        backgroundColor: '#fff5f5', 
        borderRadius: '12px',
        border: '1px solid #f0d0d0',
        marginBottom: '20px',
        maxWidth: '500px',
        textAlign: 'center'
      }}>
        <p style={{ fontSize: '1.05rem', lineHeight: '1.8', color: '#555', margin: '0 0 12px 0' }}>
          <strong>Record a 10-15 second audio sample</strong> or <strong>upload an existing audio file</strong>.
          <br /><br />
          Find a quiet place for the best results. An AI voice will be created instantly!
          <br /><br />
          Sample script:
        </p>
        <div style={{ 
          backgroundColor: '#fff', 
          padding: '14px', 
          borderRadius: '8px', 
          border: '1px solid #d0e7ff',
          fontSize: '1rem',
          lineHeight: '1.8',
          color: '#333',
          fontStyle: 'italic'
        }}>
          "Hi there! I'm excited to share this personalized greeting card that I made just for you. I hope it brings a smile to your face. Thanks for listening!"
        </div>
      </div>

      {/* Recording/Upload Interface */}
      <div style={{ marginTop: '20px', textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        {!audioBlob ? (
          <div>
            {/* Drag & Drop Upload Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !isRecording && fileInputRef.current?.click()}
              style={{
                padding: '24px',
                marginBottom: '20px',
                border: `2px dashed ${isDragging ? '#333' : '#ddd'}`,
                borderRadius: '12px',
                backgroundColor: isDragging ? '#f5f5f5' : '#fafafa',
                cursor: isRecording ? 'default' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📁</div>
              <p style={{ 
                color: '#666', 
                margin: '0 0 4px 0',
                fontSize: '1rem',
              }}>
                Drag & drop an audio file here, or click to browse
              </p>
              <p style={{ 
                color: '#999', 
                margin: 0,
                fontSize: '0.85rem',
              }}>
                WAV, MP3, WebM, OGG, M4A (max 10MB)
              </p>
            </div>

            <p style={{ color: '#999', margin: '0 0 20px 0' }}>— or —</p>

            {/* Record Button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              style={{
                backgroundColor: isRecording ? '#333' : '#dc3545',
                color: 'white',
                fontSize: '1.1rem',
                padding: '16px 32px',
                marginBottom: '12px',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              {isRecording ? (
                <>
                  Stop Recording ({recordingTime}s)
                </>
              ) : (
                <>
                  Start Recording
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
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#333',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = '#333'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = '#ddd'
                }}
              >
                Try Again
              </button>
            </div>
            
            <div style={{ marginTop: '20px' }}>
              <button
                onClick={handleCloneVoice}
                disabled={isProcessing}
                style={{ 
                  marginTop: '0',
                  opacity: isProcessing ? 0.6 : 1,
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  backgroundColor: '#333',
                  color: 'white',
                  fontSize: '1.1rem',
                  padding: '16px 32px',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: '600',
                }}
              >
                {isProcessing ? 'Creating Narrator...' : 'Create Narrator'}
              </button>
            </div>
          </div>
        )}
      </div>
      
      {error && (
        <div style={{ color: '#f5576c', marginTop: '10px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      
      <button 
        onClick={onBack} 
        style={{ 
          marginTop: '20px',
          fontSize: '1.1rem',
          padding: '16px 32px',
          alignSelf: 'center',
          backgroundColor: 'white',
          border: '2px solid #ddd',
          borderRadius: '8px',
          cursor: 'pointer',
          color: '#333',
          fontWeight: '600',
          transition: 'all 0.2s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = '#333'
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = '#ddd'
        }}
      >
        ← Go Back
      </button>
    </div>
  )
}

export default CustomNarrator
