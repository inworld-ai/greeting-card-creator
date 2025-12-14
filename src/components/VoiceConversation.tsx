import { useState, useEffect, useRef, useCallback } from 'react'
import { VoiceSession, VoiceSessionConfig } from '../services/voiceSessionService'
import './ConversationalQuestionnaire.css'

interface VoiceConversationProps {
  experienceType: 'year-review' | 'wish-list' | 'greeting-card'
  userName?: string
  onSubmit: (answers: {
    favoriteMemory?: string
    newThing?: string
    lookingForward?: string
    dreamGift?: string
    experience?: string
    practicalNeed?: string
    recipientName?: string
    relationship?: string
    specialAboutThem?: string
    funnyStory?: string
  }) => void
  onBack: () => void
}

interface ConversationMessage {
  role: 'assistant' | 'user'
  content: string
  interactionId?: string
}

// Progress steps for greeting card
const STEPS = {
  'greeting-card': [
    { key: 'name', label: 'Name & Relationship' },
    { key: 'story', label: 'Funny Story' },
    { key: 'generating', label: 'Creating Card' }
  ]
}

// Smart detection: check if conversation contains recipient info AND funny story
function hasCollectedGreetingCardInfo(messages: ConversationMessage[]): { hasRecipient: boolean; hasStory: boolean } {
  const userMessages = messages.filter(m => m.role === 'user')
  const assistantMessages = messages.filter(m => m.role === 'assistant')
  
  // We need at least 2 user messages
  if (userMessages.length < 2) {
    return { hasRecipient: userMessages.length >= 1, hasStory: false }
  }
  
  // Check the agent's questions to understand what was asked
  const allAgentText = assistantMessages.map(m => m.content.toLowerCase()).join(' ')
  
  // First user response after agent asks about recipient
  const hasRecipient = userMessages.length >= 1 && userMessages[0].content.length > 2
  
  // Second user response should be the funny story/anecdote
  // Verify agent asked about story/anecdote/funny thing before user's second message
  const askedAboutStory = allAgentText.includes('funny') || 
                          allAgentText.includes('anecdote') || 
                          allAgentText.includes('story') ||
                          allAgentText.includes('sweet') ||
                          allAgentText.includes('special') ||
                          allAgentText.includes('love about')
  
  const hasStory = userMessages.length >= 2 && 
                   userMessages[1].content.length > 10 && // Story should be substantive
                   askedAboutStory
  
  return { hasRecipient, hasStory }
}

export default function VoiceConversation({ experienceType, userName = 'Friend', onSubmit, onBack }: VoiceConversationProps) {
  const [hasStarted, setHasStarted] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [_currentTranscript, setCurrentTranscript] = useState('')
  const [currentStep, setCurrentStep] = useState(0) // 0=name, 1=story, 2=generating
  
  // Suppress unused variable warning (tracked for future UI display)
  void _currentTranscript
  
  const voiceSessionRef = useRef<VoiceSession | null>(null)
  const answersRef = useRef<Record<string, string>>({})
  const autoMicEnabledRef = useRef(false)
  const triggerDetectedRef = useRef(false)
  const fullAgentTextRef = useRef('') // Accumulate agent text for trigger detection
  const generationStartedRef = useRef(false) // Prevent duplicate generation
  
  // Questions based on experience type
  const questions = experienceType === 'year-review'
    ? [
        { key: 'favoriteMemory', question: "What was your favorite memory from 2025?" },
        { key: 'newThing', question: "What's something new you tried or learned?" },
        { key: 'lookingForward', question: "What are you most looking forward to in 2026?" }
      ]
    : experienceType === 'greeting-card'
    ? [
        { key: 'recipientName', question: "Who is this card for and what's their relationship to you?" },
        { key: 'funnyStory', question: "What's a funny or heartwarming anecdote about them?" }
      ]
    : [
        { key: 'dreamGift', question: "What's the one gift you've been thinking about all year?" },
        { key: 'experience', question: "What's an experience you'd love to have?" },
        { key: 'practicalNeed', question: "What's something practical you actually need?" }
      ]

  const getSystemPrompt = useCallback(() => {
    if (experienceType === 'greeting-card') {
      // Important: greeting-card flow is enforced server-side (fixed prompt),
      // so we do not send a client prompt that could override it.
      return ''
    } else if (experienceType === 'year-review') {
      return `You are Olivia - a warm, friendly AI assistant helping ${userName} reflect on their year.

Your role:
1. Ask about their favorite memory from 2025
2. Ask about something new they tried or learned
3. Ask what they're looking forward to in 2026

Guidelines:
- Ask ONE question at a time
- React positively to their answers before continuing
- Keep responses brief
- When done, say "Thank you for sharing! I'll create your Year In Review now."`
    } else {
      return `You are Olivia - a warm AI assistant helping ${userName} create their Christmas wish list.

Your role:
1. Ask about their dream gift
2. Ask about an experience they'd love
3. Ask about something practical they need

Guidelines:
- Ask ONE question at a time
- Keep responses brief
- When done, say "Thank you! I'll create your Christmas Wish List now."`
    }
  }, [experienceType, userName])

  // Parse AI responses to detect answers
  const parseForAnswers = useCallback((agentText: string, userText: string) => {
    const lowerAgent = agentText.toLowerCase()
    const answers = { ...answersRef.current }
    
    // Detect if conversation is complete
    const isWrappingUp = lowerAgent.includes('all set') ||
      lowerAgent.includes("i'll create your") ||
      lowerAgent.includes('thank you for sharing') ||
      (lowerAgent.includes('thank') && lowerAgent.includes('create'))
    
    // Determine which question was just answered based on conversation flow
    const answeredCount = Object.keys(answers).filter(k => answers[k]).length
    
    if (answeredCount < questions.length && userText) {
      const currentQuestion = questions[answeredCount]
      if (currentQuestion && !answers[currentQuestion.key]) {
        answers[currentQuestion.key] = userText
        answersRef.current = answers
        console.log(`📝 Detected answer for ${currentQuestion.key}:`, userText.substring(0, 50))
      }
    }
    
    if (isWrappingUp) {
      setIsComplete(true)
    }
    
    return answers
  }, [questions])

  const startSession = useCallback(async () => {
    if (voiceSessionRef.current) return
    
    setIsProcessing(true)
    setError(null)
    
    const config: VoiceSessionConfig = {
      experienceType,
      userName,
      // Force female elf voice for greeting card conversations
      ...(experienceType === 'greeting-card'
        ? { voiceId: 'christmas_story_generator__female_elf_narrator' }
        : {}),
      systemPrompt: getSystemPrompt(),
      onAgentText: (text, interactionId) => {
        console.log('🤖 Agent:', text)

        // Elf is speaking - show "Elf is speaking..." in UI
        setIsProcessing(true)

        // Debug: Log ref states on every agent text
        console.log('📊 Ref states:', {
          triggerDetected: triggerDetectedRef.current,
          generationStarted: generationStartedRef.current,
          fullAgentTextLength: fullAgentTextRef.current.length
        })

        // Once we start generating, ignore further agent chatter.
        // Use ref instead of state to avoid stale closure issues
        if (generationStartedRef.current || triggerDetectedRef.current) {
          console.log('⏭️ Skipping - already generating or trigger detected')
          return
        }
        
        // Accumulate agent text for better trigger detection
        fullAgentTextRef.current += ' ' + text
        
        setConversationHistory(prev => {
          const exists = prev.some(m => m.role === 'assistant' && m.interactionId === interactionId)
          if (exists) return prev
          const updated: ConversationMessage[] = [...prev, { role: 'assistant' as const, content: text, interactionId }]
          
          // Update step based on conversation progress
          const userMessages = updated.filter(m => m.role === 'user').length
          if (userMessages >= 1 && currentStep === 0) {
            setCurrentStep(1) // Got name, now asking for story
          }
          
          // Check for trigger phrase - agent is done collecting info
          const fullText = fullAgentTextRef.current.toLowerCase()
          const hasTrigger = 
              fullText.includes('perfect! creating your card') ||
              fullText.includes('creating your christmas card') ||
              fullText.includes('creating your card now') ||
              fullText.includes('sprinkle some christmas magic') ||
              fullText.includes('christmas magic on your card') ||
              fullText.includes('hold tight while i') ||
              fullText.includes('let me generate') ||
              fullText.includes('let me create') ||
              fullText.includes('generate your card') ||
              fullText.includes('make your card')
          
          console.log('🔍 Trigger check:', { 
            hasTrigger, 
            triggerDetectedRef: triggerDetectedRef.current,
            fullTextSample: fullText.slice(-100)
          })
          
          if (!triggerDetectedRef.current && hasTrigger) {
            triggerDetectedRef.current = true
            generationStartedRef.current = true
            console.log('🎄 Trigger phrase detected - starting generation')
            setCurrentStep(2) // Generating
            setIsGenerating(true)
            
            // Stop recording and trigger generation
            setTimeout(() => {
              if (voiceSessionRef.current) {
                voiceSessionRef.current.stopRecording()
                voiceSessionRef.current.stop()
              }
              setIsRecording(false)
              setIsComplete(true)
              // Pass conversation history for generation
              onSubmit({ conversationHistory: updated } as any)
            }, 3000) // Wait 3s for TTS to finish saying the phrase
          }
          
          return updated
        })
      },
      onUserText: (text, interactionId) => {
        // Ignore synthetic/session control messages and very short noise
        const cleaned = (text || '').trim()
        if (!cleaned || cleaned.toLowerCase() === '[start]' || cleaned.length < 2) {
          setIsProcessing(false)
          return
        }

        // Show partial transcript in UI
        setCurrentTranscript(cleaned)

        // Update conversation history with latest transcript for this interactionId
        // NOTE: Don't trigger generation here - wait for onSpeechComplete
        setConversationHistory(prev => {
          // Find existing message with this interactionId
          const existingIdx = prev.findIndex(m => m.role === 'user' && m.interactionId === interactionId)
          
          if (existingIdx >= 0) {
            // UPDATE existing message with longer/newer text (this is a partial update)
            const existing = prev[existingIdx]
            // Only update if new text is longer (more complete)
            if (cleaned.length > existing.content.length) {
              const updated = [...prev]
              updated[existingIdx] = { ...existing, content: cleaned }
              console.log('👤 User (updated):', cleaned)
              return updated
            }
            return prev // No change needed
          } else {
            // New message for this interactionId
            console.log('👤 User:', cleaned)
            return [...prev, { role: 'user', content: cleaned, interactionId }]
          }
        })
        // Don't set isProcessing here - that's for when elf is speaking
      },
      onAudioChunk: (_audioData, _interactionId) => {
        // Audio is handled by the voiceSessionService
      },
      onError: (errorMsg) => {
        console.error('❌ Voice session error:', errorMsg)
        setError(errorMsg)
        setIsProcessing(false)
      },
      onInteractionEnd: async (interactionId) => {
        console.log('✅ Interaction ended:', interactionId)
        // Server finished sending packets - but audio may still be playing
        // Don't enable mic here - wait for onAudioPlaybackComplete
      },
      onAudioPlaybackComplete: async (interactionId) => {
        console.log('🔊 Audio playback complete:', interactionId)
        // Audio actually finished playing - NOW it's safe to enable mic
        setIsProcessing(false)
        
        // Enable mic after audio playback completes - it stays on continuously
        // (continuous audio stream architecture - no need to restart between turns)
        if (!autoMicEnabledRef.current && voiceSessionRef.current && !generationStartedRef.current) {
          try {
            await voiceSessionRef.current.startRecording()
            setIsRecording(true)
            autoMicEnabledRef.current = true
            console.log('🎤 Mic enabled after audio playback complete (continuous mode)')
          } catch (err: any) {
            console.error('Failed to enable mic:', err)
          }
        }
      },
      // Note: onTurnComplete no longer used - audio stream stays alive between turns
      onTurnComplete: async () => {
        // With continuous audio stream, we don't need to restart recording
        // The mic stays on and the graph continues processing
        console.log('🔄 Turn complete (continuous mode - mic stays active)')
        // Mic should already be recording - no action needed
      },
      onSpeechComplete: (interactionId) => {
        console.log('🎙️ User speech complete:', interactionId)
        
        // Clear partial transcript display
        setCurrentTranscript('')
        // NOTE: Don't reset fullAgentTextRef here - it's needed for trigger detection
        // fullAgentTextRef will be reset when generation starts
        
        // Wait a bit for any final transcript to arrive before checking
        // The STT sometimes sends the final transcript AFTER the speech complete event
        setTimeout(() => {
          // Check if we've collected all info (user finished speaking)
          setConversationHistory(prev => {
            if (experienceType === 'greeting-card') {
              const { hasRecipient, hasStory } = hasCollectedGreetingCardInfo(prev)
              
              // Debug logging
              console.log('📊 onSpeechComplete check:', {
                hasRecipient,
                hasStory,
                generationStarted: generationStartedRef.current,
                triggerDetected: triggerDetectedRef.current,
                userMessageCount: prev.filter(m => m.role === 'user').length,
                messages: prev.map(m => ({ role: m.role, content: m.content.substring(0, 50) }))
              })
              
              // Update step based on what we've collected
              if (hasRecipient && !hasStory) {
                setCurrentStep(1) // Got name, waiting for story
              }
              
              // If we have both pieces AND haven't already started generation
              if (hasRecipient && hasStory && !generationStartedRef.current) {
                console.log('🎄 User finished speaking - both pieces collected, starting generation')
                console.log('📝 Final conversation:', prev.map(m => `${m.role}: ${m.content}`).join('\n'))
                generationStartedRef.current = true
                triggerDetectedRef.current = true
                fullAgentTextRef.current = '' // Reset now that we're generating
                setCurrentStep(2) // Creating Card
                setIsGenerating(true)

                // Stop recording/session and begin generation
                setTimeout(() => {
                  try {
                    voiceSessionRef.current?.stopRecording()
                    voiceSessionRef.current?.stop()
                  } finally {
                    setIsRecording(false)
                    setIsComplete(true)
                    onSubmit({ conversationHistory: prev } as any)
                  }
                }, 250)
              }
            } else {
              // For other experience types, keep simple counting
              const userCount = prev.filter(m => m.role === 'user').length
              if (userCount === 1) {
                setCurrentStep(1)
              }
            }
            return prev // Don't modify, just read
          })
        }, 800) // Wait 800ms for final transcript to arrive
      },
    }
    
    try {
      const session = new VoiceSession(config)
      voiceSessionRef.current = session
      await session.start()
      setHasStarted(true)
      setIsProcessing(true) // Set to true - elf is speaking first
      
      // Mic will auto-enable after elf finishes speaking (in onInteractionEnd)
      console.log('🎤 Waiting for elf to finish speaking before enabling mic...')
    } catch (err: any) {
      console.error('Failed to start voice session:', err)
      setError(err.message || 'Failed to connect')
      setIsProcessing(false)
      voiceSessionRef.current = null
    }
  }, [experienceType, userName, getSystemPrompt, parseForAnswers, conversationHistory])

  // Manual submit handler (kept for non-voice flows)
  const _handleSubmit = useCallback(() => {
    // Stop session
    if (voiceSessionRef.current) {
      voiceSessionRef.current.stop()
      voiceSessionRef.current = null
    }
    
    const answers = answersRef.current
    console.log('📤 Submitting answers:', answers)
    
    if (experienceType === 'year-review') {
      onSubmit({
        favoriteMemory: answers.favoriteMemory || 'Not specified',
        newThing: answers.newThing || 'Not specified',
        lookingForward: answers.lookingForward || 'Not specified'
      })
    } else if (experienceType === 'greeting-card') {
      onSubmit({
        recipientName: answers.recipientName || 'Friend',
        relationship: answers.relationship || '',
        specialAboutThem: answers.specialAboutThem || '',
        funnyStory: answers.funnyStory || 'They are wonderful'
      })
    } else {
      onSubmit({
        dreamGift: answers.dreamGift || 'Not specified',
        experience: answers.experience || 'Not specified',
        practicalNeed: answers.practicalNeed || 'Not specified'
      })
    }
  }, [experienceType, onSubmit])
  
  // Suppress unused warning (kept for future manual submit button)
  void _handleSubmit

  // Cleanup on unmount - reset ALL refs to prevent state bleeding
  useEffect(() => {
    return () => {
      console.log('🧹 VoiceConversation unmounting - cleaning up all state')
      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop()
        voiceSessionRef.current = null
      }
      // Reset all refs to prevent state bleeding between sessions
      autoMicEnabledRef.current = false
      triggerDetectedRef.current = false
      fullAgentTextRef.current = ''
      generationStartedRef.current = false
      answersRef.current = {}
    }
  }, [])

  // Calculate progress (for potential future progress bar)
  const totalQuestions = questions.length
  const answeredCount = Object.keys(answersRef.current).filter(k => answersRef.current[k]).length
  const _progress = (answeredCount / totalQuestions) * 100
  const steps = STEPS['greeting-card'] || []
  
  // Suppress unused warnings (kept for future progress UI)
  void totalQuestions
  void answeredCount
  void _progress

  // Don't show anything when generating - let the parent component handle the transition
  // to GreetingCardGeneration which has its own loading screen
  if (isGenerating) {
    return null
  }

  return (
    <div className={`conversational-questionnaire ${experienceType === 'greeting-card' ? 'greeting-card' : ''}`}>
      <div className="conversational-header">
        {experienceType !== 'greeting-card' && (
          <h2 className="conversational-title">
            {experienceType === 'year-review' ? 'Year In Review' : 'Christmas Wish List'}
          </h2>
        )}
      </div>

      {/* Progress bar for greeting card */}
      {experienceType === 'greeting-card' && hasStarted && !isComplete && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '0.75rem', 
          marginBottom: '1.5rem',
          padding: '0 1rem'
        }}>
          {steps.slice(0, 2).map((step, i) => (
            <div key={step.key} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem',
              opacity: i <= currentStep ? 1 : 0.4
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: i < currentStep ? '#22c55e' : i === currentStep ? '#eab308' : '#d1d5db',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.75rem'
              }}>
                {i < currentStep ? '✓' : i + 1}
              </div>
              <span style={{ 
                fontSize: '0.75rem',
                color: i <= currentStep ? '#166534' : '#9ca3af'
              }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="conversational-content">
        {error && (
          <div className="error-message" style={{ color: 'red', marginBottom: '1rem' }}>
            ⚠️ {error}
          </div>
        )}

        {hasStarted && (
          <div className="olivia-blob-container">
            <div className={`olivia-blob ${isComplete ? 'complete' : isRecording ? 'listening' : isProcessing ? 'processing' : 'idle'} ${experienceType === 'greeting-card' ? 'greeting-card' : ''}`}>
              <div className="blob-inner"></div>
              {!isComplete && <div className="blob-pulse"></div>}
              {isComplete && (
                <div className="complete-overlay">
                  <div className="checkmark">✓</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="listening-indicator">
          {isComplete ? (
            <div className="complete">
              <p style={{ color: '#166534', marginBottom: '1rem' }}>✨ Info collected!</p>
            </div>
          ) : !hasStarted ? (
            <button
              className="btn btn-primary start-listening-btn"
              onClick={startSession}
              disabled={isProcessing}
            >
              {isProcessing ? 'Connecting...' : 'Start Conversation'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Hide back button for greeting card experience */}
      {experienceType !== 'greeting-card' && (
        <button 
          className="btn btn-secondary" 
          onClick={onBack}
          style={{ marginTop: '2rem' }}
        >
          ← Back
        </button>
      )}
    </div>
  )
}
