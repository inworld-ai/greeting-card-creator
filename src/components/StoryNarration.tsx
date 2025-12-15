import { useState, useEffect, useRef } from 'react'
import { synthesizeSpeech } from '../services/ttsService'
import { shareStory, shareUrl as shareUrlHelper } from '../services/shareService'
import ChristmasCard from './ChristmasCard'
import './StoryNarration.css'
import './StoryGeneration.css'

import type { VoiceId, StoryType } from '../App'

/**
 * Cleans markdown formatting from story text for display and formats paragraphs
 */
function cleanStoryTextForDisplay(text: string): string {
  let cleaned = text
    // Remove hashtags at the start of lines (markdown headers)
    .replace(/^#+\s*/gm, '')
    // Remove markdown bold/italic formatting but keep the text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*]+)\*/g, '$1') // *italic*
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/_([^_]+)_/g, '$1') // _italic_
    // Remove markdown links but keep the text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Normalize extra whitespace
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim()
  
  // Format into consistent paragraphs
  // Split on double newlines first (existing paragraph breaks)
  let paragraphs = cleaned.split(/\n\n+/)
  
  // If we have very few paragraphs or very long paragraphs, try to split them better
  const formattedParagraphs = paragraphs.map(para => {
    para = para.trim()
    // If paragraph is very long (more than ~150 characters), try to split on sentence boundaries
    if (para.length > 150) {
      // Split on sentence endings followed by space
      const sentences = para.split(/([.!?]\s+)/)
      const chunks: string[] = []
      let currentChunk = ''
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i]
        currentChunk += sentence
        
        // If chunk is getting long (around 100-120 chars) and we're at a sentence boundary, start new chunk
        if (currentChunk.length > 100 && /[.!?]\s*$/.test(currentChunk.trim())) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
        }
      }
      
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
      }
      
      // If we successfully split, return the chunks; otherwise return original
      return chunks.length > 1 ? chunks.join('\n\n') : para
    }
    
    return para
  }).filter(p => p.length > 0)
  
  // Join paragraphs with double newlines for consistent spacing
  return formattedParagraphs.join('\n\n')
}

interface StoryNarrationProps {
  storyText: string
  childName: string
  voiceId: VoiceId
  storyType: StoryType
  imageUrl?: string | null
  onRestart: () => void
  isProgressive?: boolean
  onFullStoryReady?: (fullStory: string) => void
  customApiKey?: string
  customVoiceId?: string
  isShared?: boolean
  experienceType?: 'story' | 'year-review' | 'wish-list' | 'greeting-card'
  preloadedAudio?: HTMLAudioElement | null
  preloadedText?: string  // The text that was already converted to preloaded audio
  fullFirstChunkAudio?: HTMLAudioElement | null  // Full audio for first chunk (after TTS completes)
}

function StoryNarration({ storyText, childName, voiceId, storyType: _storyType, imageUrl, onRestart: _onRestart, isProgressive = false, onFullStoryReady, customApiKey, customVoiceId, isShared = false, experienceType = 'story', preloadedAudio = null, preloadedText = '', fullFirstChunkAudio = null }: StoryNarrationProps) {
  // REMOVED: isAudioReady state - story page shows immediately
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false) // Track audio generation for button state
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false)
  const [hasStartedNarration, setHasStartedNarration] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false) // Track if audio is currently playing
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const checkAudioIntervalRef = useRef<NodeJS.Timeout | null>(null) // Interval to check if audio has ended
  const secondAudioRef = useRef<HTMLAudioElement | null>(null)
  const isGeneratingRef = useRef<boolean>(false)
  const currentStoryTextRef = useRef<string>('')
  const hasStartedFirstChunkRef = useRef<boolean>(false)
  const fullStoryRef = useRef<string>('')
  const hasStartedNarrationForStoryRef = useRef<string>('') // Track which story text we've started narration for
  const isNarrationInProgressRef = useRef<boolean>(false) // Track if narration is in progress (generating or playing)
  const narrationTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Track the narration start timeout so we can cancel it
  const shouldStopAllAudioRef = useRef<boolean>(false) // Global flag to stop all audio immediately
  const allAudioElementsRef = useRef<Set<HTMLAudioElement>>(new Set()) // Track all audio elements created
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null) // Preloaded audio ready to play
  const hasUsedPreloadedAudioRef = useRef<boolean>(false) // Track if we've already used the preloaded audio
  const isPreloadingRef = useRef<boolean>(false) // Track if we're currently preloading
  const preloadedChunksRef = useRef<HTMLAudioElement[]>([]) // All preloaded audio chunks
  const [isAudioPreloaded, setIsAudioPreloaded] = useState(false) // Track if audio is fully ready to play

  useEffect(() => {
    return () => {
      // Cleanup: stop any ongoing audio when component unmounts
      cleanupAudio()
      isGeneratingRef.current = false
    }
  }, [])

  // Store preloaded audio from parent (generated during loading screen)
  // Audio will be played when user clicks to open the card (via handleCardOpen)
  useEffect(() => {
    if (preloadedAudio && experienceType === 'story') {
      console.log('🎵 Preloaded audio stored and ready - will play when card is opened')
      preloadedAudioRef.current = preloadedAudio
      allAudioElementsRef.current.add(preloadedAudio)
      setIsAudioPreloaded(true)
      // Don't auto-start - wait for user to click "Click to see the story"
    }
  }, [preloadedAudio, experienceType])

  // Resume AudioContext on any user interaction to enable autoplay
  useEffect(() => {
    const handleUserInteraction = async () => {
      // Try to resume any suspended audio contexts
      if (audioRef.current) {
        // If it's our custom audio wrapper, try to access the underlying context
        try {
          // The audio element might have an audioContext property if it's from our custom wrapper
          const audio = audioRef.current as any
          if (audio.audioContext && audio.audioContext.state === 'suspended') {
            await audio.audioContext.resume()
            console.log('🎵 AudioContext resumed on user interaction')
            // Try to play if we were waiting for user interaction
            if (needsUserInteraction && audio.paused !== false) {
              try {
                await audio.play()
                setNeedsUserInteraction(false)
                console.log('🎵 Audio started after AudioContext resume')
              } catch (e) {
                console.log('Audio still needs explicit play button')
              }
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Listen for any user interaction
    window.addEventListener('click', handleUserInteraction, { once: true })
    window.addEventListener('touchstart', handleUserInteraction, { once: true })
    window.addEventListener('keydown', handleUserInteraction, { once: true })

    return () => {
      window.removeEventListener('click', handleUserInteraction)
      window.removeEventListener('touchstart', handleUserInteraction)
      window.removeEventListener('keydown', handleUserInteraction)
    }
  }, [needsUserInteraction])

  // Helper function to extract title and story body
  const extractTitleAndStory = (text: string): [string, string] => {
    // Look for "Title: " pattern at the start
    const titleMatch = text.match(/^Title:\s*(.+?)(?:\n\n|\n)/i)
    if (titleMatch) {
      const title = titleMatch[1].trim()
      const storyBody = text.substring(titleMatch[0].length).trim()
      return [title, storyBody]
    }
    // If no title found, return empty title and full text
    return ['', text]
  }

  // Helper function to split story into smaller chunks for faster TTS start
  // First chunk is smaller (100 words) for ultra-fast start, rest are larger (300 words)
  const splitStoryIntoSmallChunks = (text: string, firstChunkWords: number = 100, restChunkWords: number = 300): string[] => {
    // Extract title first (we'll add it back to first chunk)
    const [_title, storyBody] = extractTitleAndStory(text)
    
    // Remove any "Part 1", "Part 2", "Page 1", "Page 2" text
    const cleanedBody = storyBody
      .replace(/^Part\s+[12]:?\s*/gmi, '')
      .replace(/^Page\s+[12]:?\s*/gmi, '')
      .replace(/\n+Part\s+[12]:?\s*/gmi, '\n')
      .replace(/\n+Page\s+[12]:?\s*/gmi, '\n')
      .trim()
    
    // Split into words
    const words = cleanedBody.split(/\s+/)
    const chunks: string[] = []
    
    // First chunk is smaller for ultra-fast start
    if (words.length > 0) {
      const firstChunk = words.slice(0, firstChunkWords).join(' ')
      if (firstChunk.trim()) {
        chunks.push(firstChunk.trim())
      }
      
      // Remaining chunks are larger
      for (let i = firstChunkWords; i < words.length; i += restChunkWords) {
        const chunk = words.slice(i, i + restChunkWords).join(' ')
        if (chunk.trim()) {
          chunks.push(chunk.trim())
        }
      }
    }
    
    return chunks.length > 0 ? chunks : [cleanedBody]
  }

  // Helper function to clean up audio properly and stop immediately
  // Helper function to start polling for audio end detection
  const startPollingForAudioEnd = () => {
    // Clear any existing polling
    if (checkAudioIntervalRef.current) {
      clearInterval(checkAudioIntervalRef.current)
    }
    
    console.log('🟡 Starting polling interval to detect when audio ends')
    console.log(`🟡 Total tracked audio elements: ${allAudioElementsRef.current.size}`)
    
    let pollCount = 0
    checkAudioIntervalRef.current = setInterval(() => {
      pollCount++
      // Check all tracked audio elements
      let anyPlaying = false
      let playingCount = 0
      let endedCount = 0
      let pausedCount = 0
      let noSrcCount = 0
      
      allAudioElementsRef.current.forEach((audio) => {
        // Check if audio is actually playing (not ended, not paused, and has a source)
        if (audio.src) {
          if (!audio.ended && !audio.paused && audio.readyState >= 2) {
            anyPlaying = true
            playingCount++
          } else if (audio.ended) {
            endedCount++
          } else if (audio.paused) {
            pausedCount++
          }
        } else {
          noSrcCount++
        }
      })
      
      // Also check audioRef
      if (audioRef.current) {
        if (audioRef.current.src) {
          if (!audioRef.current.ended && !audioRef.current.paused && audioRef.current.readyState >= 2) {
            anyPlaying = true
            playingCount++
          } else if (audioRef.current.ended) {
            endedCount++
          } else if (audioRef.current.paused) {
            pausedCount++
          }
        } else {
          noSrcCount++
        }
      }
      
      // Log every 10th poll to help debug
      if (pollCount % 10 === 0) {
        console.log(`🟡 Polling check #${pollCount}: playing=${playingCount}, ended=${endedCount}, paused=${pausedCount}, noSrc=${noSrcCount}, total=${allAudioElementsRef.current.size}, anyPlaying=${anyPlaying}, isAudioPlaying=${isAudioPlaying}`)
      }
      
      // If no audio is playing, set state to false (regardless of current state)
      // BUT don't stop if we're still generating remaining audio chunks
      if (!anyPlaying && allAudioElementsRef.current.size > 0 && !isGeneratingRemainingRef.current) {
        // Always update state if no audio is playing (even if state already says false)
        // This ensures the button becomes active
        console.log(`🟡🟡🟡 POLLING DETECTED ALL AUDIO HAS ENDED! (poll #${pollCount}, playing: ${playingCount}, ended: ${endedCount}, paused: ${pausedCount}, total tracked: ${allAudioElementsRef.current.size}, isAudioPlaying: ${isAudioPlaying}) 🟡🟡🟡`)
        setIsAudioPlaying(false)
        isNarrationInProgressRef.current = false
        if (checkAudioIntervalRef.current) {
          clearInterval(checkAudioIntervalRef.current)
          checkAudioIntervalRef.current = null
        }
        if (onFullStoryReady && fullStoryRef.current) {
          onFullStoryReady(fullStoryRef.current)
        }
      } else if (!anyPlaying && isGeneratingRemainingRef.current) {
        console.log(`🟡 First chunk ended, waiting for remaining audio to be generated...`)
      }
    }, 300) // Check every 300ms for faster detection
  }

  const cleanupAudio = () => {
    console.log('🛑 Cleaning up all audio...')
    
    // Set global stop flag FIRST - this will prevent any chained audio from playing
    shouldStopAllAudioRef.current = true
    
    // Stop ALL tracked audio elements (similar to page refresh)
    allAudioElementsRef.current.forEach((audio) => {
      try {
        console.log('🛑 Stopping tracked audio element')
        audio.pause()
        audio.currentTime = 0
        // Remove all event listeners
        audio.onplay = null
        audio.onpause = null
        audio.onended = null
        audio.onerror = null
        audio.onloadstart = null
        audio.onloadeddata = null
        audio.oncanplay = null
        audio.oncanplaythrough = null
        // Break the chain by removing src
        if (audio.src && audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(audio.src)
        }
        audio.src = ''
        audio.load() // Force reload to break any pending operations
      } catch (e) {
        console.warn('Error stopping tracked audio element:', e)
      }
    })
    allAudioElementsRef.current.clear()
    
    // Clear any pending narration timeout
    if (narrationTimeoutRef.current) {
      clearTimeout(narrationTimeoutRef.current)
      narrationTimeoutRef.current = null
    }
    
    // Stop and clean up audioRef
    if (audioRef.current) {
      const oldAudio = audioRef.current
      console.log('🛑 Stopping audioRef audio element')
      // Stop immediately - don't wait for pause
      oldAudio.pause()
      oldAudio.currentTime = 0
      // Remove ALL event listeners by replacing all event handler properties
      oldAudio.onplay = null
      oldAudio.onpause = null
      oldAudio.onended = null
      oldAudio.onerror = null
      oldAudio.onloadstart = null
      oldAudio.onloadeddata = null
      oldAudio.oncanplay = null
      oldAudio.oncanplaythrough = null
      // If it's a custom audio wrapper, try to stop the underlying audio context
      if ((oldAudio as any).stop) {
        try {
          (oldAudio as any).stop()
        } catch (e) {
          // Ignore errors if stop doesn't exist
        }
      }
      // Break the chain by removing src
      if (oldAudio.src && oldAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(oldAudio.src)
      }
      oldAudio.src = ''
      oldAudio.load() // Force reload to break any pending operations
      audioRef.current = null
    }
    
    // Stop and clean up secondAudioRef
    if (secondAudioRef.current) {
      const oldAudio = secondAudioRef.current
      console.log('🛑 Stopping secondAudioRef audio element')
      oldAudio.pause()
      oldAudio.currentTime = 0
      oldAudio.onplay = null
      oldAudio.onpause = null
      oldAudio.onended = null
      oldAudio.onerror = null
      oldAudio.onloadstart = null
      oldAudio.onloadeddata = null
      oldAudio.oncanplay = null
      oldAudio.oncanplaythrough = null
      if ((oldAudio as any).stop) {
        try {
          (oldAudio as any).stop()
        } catch (e) {
          // Ignore errors if stop doesn't exist
        }
      }
      if (oldAudio.src && oldAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(oldAudio.src)
      }
      oldAudio.src = ''
      oldAudio.load() // Force reload to break any pending operations
      secondAudioRef.current = null
    }
    
    // Also try to stop any audio elements that might be in the DOM (though they shouldn't be)
    try {
      const allAudioElements = document.querySelectorAll('audio')
      allAudioElements.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
        audio.src = ''
      })
    } catch (e) {
      // Ignore errors
    }
    
    // Reset the narration tracking when cleaning up
    hasStartedNarrationForStoryRef.current = ''
    isNarrationInProgressRef.current = false
    hasStartedFirstChunkRef.current = false // Reset first chunk flag on cleanup
    setIsAudioPlaying(false) // Reset audio playing state
    
    // Reset stop flag after a brief delay to allow cleanup to complete
    setTimeout(() => {
      shouldStopAllAudioRef.current = false
    }, 100)
    
    console.log('✅ Audio cleanup complete')
  }

  // Preload audio in the background without playing
  // This allows audio to start instantly when user opens the card
  const preloadAudio = async (textToSpeak?: string) => {
    const text = textToSpeak || storyText
    
    // Prevent multiple simultaneous preloads
    if (isPreloadingRef.current) {
      console.log('🎵 Audio preload already in progress, skipping duplicate call')
      return
    }
    
    // Don't preload if we already have audio ready
    if (preloadedAudioRef.current && isAudioPreloaded) {
      console.log('🎵 Audio already preloaded and ready, skipping')
      return
    }
    
    console.log('🎵 Starting audio preload in background...')
    isPreloadingRef.current = true
    setIsGeneratingAudio(true)
    setIsAudioPreloaded(false)

    try {
      // Extract title for TTS
      const [title] = extractTitleAndStory(text)
      
      // Split story into chunks
      const storyChunks = splitStoryIntoSmallChunks(text, 100, 300)
      console.log(`🟡 Preloading ${storyChunks.length} audio chunks in background...`)

      // Add title to the first chunk
      // For greeting cards, prepend [happy] emotion tag to influence voice tone (won't be verbalized)
      const emotionPrefix = experienceType === 'greeting-card' ? '[happy] ' : ''
      const firstChunkWithTitle = emotionPrefix + (title ? `${title}. ${storyChunks[0]}` : storyChunks[0])
      
      // Generate first chunk audio
      const firstAudio = await synthesizeSpeech(firstChunkWithTitle, {
        voiceId: customVoiceId || voiceId,
        apiKey: customApiKey || undefined,
        onAllChunksCreated: (allChunks) => {
          allChunks.forEach(chunk => {
            allAudioElementsRef.current.add(chunk)
            preloadedChunksRef.current.push(chunk)
          })
          console.log(`🟡 Preloaded ${allChunks.length} WAV chunks from first text chunk`)
        }
      })
      
      // Store the preloaded audio
      preloadedAudioRef.current = firstAudio
      allAudioElementsRef.current.add(firstAudio)
      preloadedChunksRef.current.push(firstAudio)
      
      // Wait for first audio to be fully buffered and ready to play
      await new Promise<void>((resolve) => {
        if (firstAudio.readyState >= 4) { // HAVE_ENOUGH_DATA
          console.log('🟡 First audio chunk already buffered and ready')
          resolve()
        } else {
          console.log('🟡 Waiting for first audio chunk to buffer...')
          firstAudio.addEventListener('canplaythrough', () => {
            console.log('🟡 First audio chunk buffered and ready to play!')
            resolve()
          }, { once: true })
          // Also listen for loadeddata as a fallback
          firstAudio.addEventListener('loadeddata', () => {
            if (firstAudio.readyState >= 3) {
              console.log('🟡 First audio chunk loaded (fallback)')
              resolve()
            }
          }, { once: true })
          // Trigger loading if not already started
          firstAudio.load()
        }
      })
      
      // Generate remaining chunks in parallel
      const remainingChunks = storyChunks.slice(1)
      if (remainingChunks.length > 0) {
        const audioPromises = remainingChunks.map((chunk, chunkIndex) => {
          return synthesizeSpeech(chunk, { 
            voiceId: customVoiceId || voiceId, 
            apiKey: customApiKey || undefined,
            onAllChunksCreated: (allChunks) => {
              allChunks.forEach(wavChunk => {
                allAudioElementsRef.current.add(wavChunk)
                preloadedChunksRef.current.push(wavChunk)
              })
              console.log(`🟡 Preloaded ${allChunks.length} WAV chunks from text chunk ${chunkIndex + 2}`)
            }
          })
        })
        
        const audioChunks = await Promise.all(audioPromises)
        
        // Buffer all audio chunks for instant playback
        await Promise.all(audioChunks.map((audio) => {
          return new Promise<void>((resolve) => {
            allAudioElementsRef.current.add(audio)
            preloadedChunksRef.current.push(audio)
            
            if (audio.readyState >= 4) {
              resolve()
            } else {
              audio.addEventListener('canplaythrough', () => resolve(), { once: true })
              audio.addEventListener('loadeddata', () => {
                if (audio.readyState >= 3) resolve()
              }, { once: true })
              audio.load()
            }
          })
        }))
        
        console.log(`✅ All ${audioChunks.length + 1} audio chunks preloaded and buffered!`)
      }
      
      setIsGeneratingAudio(false)
      setIsAudioPreloaded(true) // Mark audio as fully ready
      isPreloadingRef.current = false
      console.log('✅ Audio preload complete - READY FOR INSTANT PLAYBACK!')
      
    } catch (err: any) {
      console.error('Error preloading audio:', err)
      setIsGeneratingAudio(false)
      setIsAudioPreloaded(false)
      isPreloadingRef.current = false
      // Don't set error - preload failure shouldn't block the user
    }
  }

  // Ref to track if we're still generating remaining audio
  const isGeneratingRemainingRef = useRef<boolean>(false)

  // Ref to store full first chunk audio when it arrives
  const fullFirstChunkAudioRef = useRef<HTMLAudioElement | null>(null)

  // Store full first chunk audio when it arrives from parent
  useEffect(() => {
    if (fullFirstChunkAudio && experienceType === 'story') {
      console.log('🎵 Full first chunk audio received and stored')
      fullFirstChunkAudioRef.current = fullFirstChunkAudio
      allAudioElementsRef.current.add(fullFirstChunkAudio)
    }
  }, [fullFirstChunkAudio, experienceType])

  // Generate remaining audio chunks and chain them to the first preloaded chunk
  const generateRemainingAudioChunks = async (text: string, firstChunkAudio: HTMLAudioElement) => {
    console.log('🟡 Setting up audio chain: preloaded → full first chunk → remaining text...')
    isGeneratingRemainingRef.current = true
    
    // Get the duration of the preloaded audio for seeking in full audio
    const preloadedDuration = firstChunkAudio.duration || 5 // Default to 5s if not available
    console.log(`🟡 Preloaded audio duration: ${preloadedDuration.toFixed(1)}s`)
    
    // Promise that resolves when remaining text audio is ready
    let remainingTextAudios: HTMLAudioElement[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let remainingTextAudiosResolve: any = null
    const remainingTextAudiosPromise = new Promise<HTMLAudioElement[]>(resolve => {
      remainingTextAudiosResolve = resolve
    })
    
    // Set up the onended handler IMMEDIATELY so we don't miss the event
    firstChunkAudio.onended = async () => {
      console.log('🎵 Preloaded audio (~5s) ended, chaining to full first chunk audio...')
      
      // Check if we have the full first chunk audio
      if (fullFirstChunkAudioRef.current && !shouldStopAllAudioRef.current) {
        try {
          const fullAudio = fullFirstChunkAudioRef.current
          
          // Seek past the part we already played (the preloaded portion)
          // Add a small buffer (0.1s) to avoid any overlap
          const seekTime = Math.min(preloadedDuration - 0.1, fullAudio.duration - 1)
          fullAudio.currentTime = seekTime
          console.log(`🎵 Seeking full audio to ${seekTime.toFixed(1)}s (duration: ${fullAudio.duration.toFixed(1)}s)`)
          
          // When full first chunk audio ends, chain to remaining text audio
          fullAudio.onended = async () => {
            console.log('🎵 Full first chunk audio ended, chaining to remaining text...')
            const remainingAudios = await remainingTextAudiosPromise
            
            if (!shouldStopAllAudioRef.current && remainingAudios.length > 0) {
              try {
                await remainingAudios[0].play()
                console.log('✅ Started playing remaining text audio')
              } catch (err) {
                console.error('Error playing remaining text audio:', err)
              }
            } else {
              // No remaining text audio - playback complete
              console.log('🎵 All audio playback complete!')
              setIsAudioPlaying(false)
              isNarrationInProgressRef.current = false
              isGeneratingRemainingRef.current = false
              if (checkAudioIntervalRef.current) {
                clearInterval(checkAudioIntervalRef.current)
                checkAudioIntervalRef.current = null
              }
            }
          }
          
          await fullAudio.play()
          console.log('✅ Full first chunk audio playing (from seek position)')
        } catch (err) {
          console.error('Error playing full first chunk audio:', err)
          // Fallback: just wait for remaining text audio
          const remainingAudios = await remainingTextAudiosPromise
          if (remainingAudios.length > 0) {
            await remainingAudios[0].play()
          }
        }
      } else {
        // No full first chunk audio available, wait for remaining text
        console.log('⚠️ Full first chunk audio not ready, waiting for remaining text audio...')
        const remainingAudios = await remainingTextAudiosPromise
        if (!shouldStopAllAudioRef.current && remainingAudios.length > 0) {
          try {
            await remainingAudios[0].play()
            console.log('✅ Started playing remaining text audio (fallback)')
          } catch (err) {
            console.error('Error playing remaining text audio:', err)
          }
        }
      }
    }
    
    try {
      // Find remaining text AFTER what the first chunk covers (preloadedText)
      // This is the text that neither preloaded nor fullFirstChunkAudio covers
      let remainingText = text
      
      if (preloadedText) {
        // Find where preloadedText ends in the full text
        const preloadedIndex = text.indexOf(preloadedText)
        if (preloadedIndex !== -1) {
          remainingText = text.substring(preloadedIndex + preloadedText.length).trim()
          console.log(`🟡 First chunk covers ${preloadedText.length} chars, remaining text: ${remainingText.length} chars`)
        } else {
          // Fallback: try to match just the last part of preloaded text
          const lastWords = preloadedText.split(/\s+/).slice(-10).join(' ')
          const lastWordsIndex = text.indexOf(lastWords)
          if (lastWordsIndex !== -1) {
            remainingText = text.substring(lastWordsIndex + lastWords.length).trim()
            console.log(`🟡 Found first chunk via last words, remaining text: ${remainingText.length} chars`)
          } else {
            console.log('⚠️ Could not find first chunk text in full story')
          }
        }
      }
      
      if (!remainingText || remainingText.length < 10) {
        console.log('🟡 First chunk covers the entire story')
        remainingTextAudiosResolve?.([])
        hasStartedNarrationForStoryRef.current = text
        isGeneratingRemainingRef.current = false
        return
      }
      
      // Split remaining text into chunks for better TTS (300 words each)
      const remainingChunks = splitStoryIntoSmallChunks(remainingText, 300, 300)
      console.log(`🟡 Generating TTS for ${remainingChunks.length} remaining text chunks (${remainingText.length} chars)...`)
      
      // Generate all remaining chunks
      const audioPromises = remainingChunks.map((chunk) => 
        synthesizeSpeech(chunk, {
          voiceId: customVoiceId || voiceId,
          apiKey: customApiKey || undefined,
        })
      )
      
      remainingTextAudios = await Promise.all(audioPromises)
      console.log(`✅ Generated ${remainingTextAudios.length} remaining text audio chunks`)
      
      // Track all audio elements
      remainingTextAudios.forEach(audio => {
        allAudioElementsRef.current.add(audio)
      })
      
      // Chain remaining audios to each other
      for (let i = 0; i < remainingTextAudios.length - 1; i++) {
        const current = remainingTextAudios[i]
        const next = remainingTextAudios[i + 1]
        current.onended = async () => {
          if (!shouldStopAllAudioRef.current) {
            try {
              await next.play()
              console.log(`✅ Playing remaining text chunk ${i + 2}`)
            } catch (err) {
              console.error('Error playing next chunk:', err)
            }
          }
        }
      }
      
      // Set up final chunk ended handler
      const lastAudio = remainingTextAudios[remainingTextAudios.length - 1]
      lastAudio.onended = () => {
        console.log('🎵 All audio playback complete!')
        setIsAudioPlaying(false)
        isNarrationInProgressRef.current = false
        isGeneratingRemainingRef.current = false
        if (checkAudioIntervalRef.current) {
          clearInterval(checkAudioIntervalRef.current)
          checkAudioIntervalRef.current = null
        }
      }
      
      hasStartedNarrationForStoryRef.current = text
      isGeneratingRemainingRef.current = false
      
      // Resolve the promise so onended handler can play the audio
      remainingTextAudiosResolve?.(remainingTextAudios)
      
    } catch (err) {
      console.error('Error generating remaining audio chunks:', err)
      isGeneratingRemainingRef.current = false
      remainingTextAudiosResolve?.([])
    }
  }

  const handleStartNarration = async (textToSpeak?: string) => {
    const text = textToSpeak || storyText
    
    // Prevent multiple simultaneous generations (but allow if we're just starting)
    if (isGeneratingRef.current) {
      console.log('🎵 Audio generation already in progress, skipping duplicate call')
      return
    }
    
    // Prevent restarting narration if we've already started for this exact story text
    if (hasStartedNarrationForStoryRef.current === text && audioRef.current && !audioRef.current.ended) {
      console.log('🎵 Narration already started for this exact story text, skipping duplicate call')
      return
    }
    
    // Prevent restarting if we're already playing and the new text contains the old text (progressive update)
    if (hasStartedNarrationForStoryRef.current && text.includes(hasStartedNarrationForStoryRef.current) && audioRef.current && !audioRef.current.ended) {
      console.log('🎵 Already playing a prefix of this story text, skipping duplicate call (progressive update)')
      return
    }
    
    // Prevent restarting if the old text contains the new text (shouldn't happen, but safety check)
    if (hasStartedNarrationForStoryRef.current && hasStartedNarrationForStoryRef.current.includes(text) && audioRef.current && !audioRef.current.ended) {
      console.log('🎵 Already playing a longer version of this story text, skipping duplicate call')
      return
    }
    
    // Mark that narration is in progress (set this at the start of the function)
    isNarrationInProgressRef.current = true
    setIsGeneratingAudio(true) // Show "Preparing audio..." on button

    try {
      isGeneratingRef.current = true
      setError(null)
      
      // Stop and clean up any existing audio FIRST
      cleanupAudio()
      
      // Reset stop flag for new narration
      shouldStopAllAudioRef.current = false

      // Use provided text or current storyText
      const text = textToSpeak || storyText
      currentStoryTextRef.current = text

      // Extract title for TTS
      const [title] = extractTitleAndStory(text)
      
      // Split story into chunks: first chunk is tiny (100 words) for ultra-fast start
      // This allows TTS to start in ~1-2 seconds while generating the rest
      const storyChunks = splitStoryIntoSmallChunks(text, 100, 300) // First: 100 words, Rest: 300 words
      console.log(`🟡 Splitting story into ${storyChunks.length} chunks (first: ${storyChunks[0]?.split(/\s+/).length || 0} words) for ultra-fast TTS start`)

      // Add title to the first chunk for TTS (if title exists)
      // For greeting cards, prepend [happy] emotion tag to influence voice tone (won't be verbalized)
      const emotionPrefix = experienceType === 'greeting-card' ? '[happy] ' : ''
      const firstChunkWithTitle = emotionPrefix + (title ? `${title}. ${storyChunks[0]}` : storyChunks[0])
      
      let firstWavChunkReady = false
      let firstAudio: HTMLAudioElement
      
      // Check if we have preloaded audio from the loading screen that hasn't been used yet
      if (preloadedAudio && experienceType === 'story' && !hasUsedPreloadedAudioRef.current) {
        console.log('🎵 Using preloaded audio from loading screen (instant playback!)')
        firstAudio = preloadedAudio
        firstWavChunkReady = true
        hasUsedPreloadedAudioRef.current = true
        
        // Start playing immediately
        try {
          await firstAudio.play()
          console.log('✅ Preloaded audio started playing immediately')
          setHasStartedNarration(true)
          setIsAudioPlaying(true)
          setIsGeneratingAudio(false)
          startPollingForAudioEnd()
        } catch (err) {
          console.warn('⚠️ Autoplay prevented for preloaded audio:', err)
          setNeedsUserInteraction(true)
        }
      } else {
        console.log(`🟡 Generating TTS for first chunk (${firstChunkWithTitle.length} chars, ~${firstChunkWithTitle.split(/\s+/).length} words) - should start in ~1-2 seconds...`)
        
        // Start TTS on first chunk immediately (small chunk = fast generation)
        // Use onFirstChunkReady to start playing as soon as first WAV chunk is ready (2-3 seconds)
        firstAudio = await synthesizeSpeech(firstChunkWithTitle, {
          voiceId: customVoiceId || voiceId,
          apiKey: customApiKey || undefined, // Only pass if provided (voice clones don't need user API key)
          onAllChunksCreated: (allChunks) => {
            // Track all WAV chunks from this text chunk
            allChunks.forEach(chunk => {
              allAudioElementsRef.current.add(chunk)
            })
            console.log(`🟡 Tracked ${allChunks.length} WAV chunks from first text chunk`)
          },
          onFirstChunkReady: (firstWavChunk) => {
            // Start playing the first WAV chunk immediately when it's ready
            // Don't wait for all WAV chunks to be generated
            if (!firstWavChunkReady && !shouldStopAllAudioRef.current) {
              firstWavChunkReady = true
              console.log('🎵 First WAV chunk ready, starting playback immediately (before all chunks)...')
              
              // Track this audio element
              allAudioElementsRef.current.add(firstWavChunk)
              
              // Start playing immediately
              if (firstWavChunk.readyState >= 2) {
                firstWavChunk.play().then(() => {
                  console.log('✅ First WAV chunk started playing immediately')
                  setHasStartedNarration(true)
                  setIsAudioPlaying(true) // Audio is now playing, disable restart button
                  setIsGeneratingAudio(false) // Hide "Preparing audio..." message
                  // Start polling immediately when audio starts
                  startPollingForAudioEnd()
                }).catch(err => {
                  console.warn('⚠️ Autoplay prevented for first chunk:', err)
                  setNeedsUserInteraction(true)
                })
              } else {
                firstWavChunk.addEventListener('canplay', () => {
                  if (!shouldStopAllAudioRef.current) {
                    firstWavChunk.play().then(() => {
                      console.log('✅ First WAV chunk started playing after canplay')
                      setHasStartedNarration(true)
                      setIsAudioPlaying(true) // Audio is now playing, disable restart button
                      setIsGeneratingAudio(false) // Hide "Preparing audio..." message
                      // Start polling immediately when audio starts
                      startPollingForAudioEnd()
                    }).catch(err => {
                      console.warn('⚠️ Autoplay prevented for first chunk:', err)
                      setNeedsUserInteraction(true)
                    })
                  }
                }, { once: true })
              }
            }
          }
        })
      }
      
      // Track this audio element and all its chunks
      allAudioElementsRef.current.add(firstAudio)
      if ((firstAudio as any).__lastChunk) {
        allAudioElementsRef.current.add((firstAudio as any).__lastChunk)
      }
      
      // Check if story text changed while we were generating
      // Only discard if it's a completely different story, not just an update
      const currentText = currentStoryTextRef.current
      if (currentText && currentText !== text) {
        // If the new text is longer and contains the old text, it's just an update (progressive generation)
        // Only discard if it's a completely different story
        if (!text.includes(currentText.substring(0, Math.min(100, currentText.length)))) {
          console.log('Story text changed significantly during generation, discarding audio')
        cleanupAudio()
        isGeneratingRef.current = false
        isNarrationInProgressRef.current = false
        setIsGeneratingAudio(false) // Hide "Preparing audio..." message
        return
        } else {
          console.log('Story text updated (progressive generation), keeping audio')
          // Update the current text reference but don't discard audio
          currentStoryTextRef.current = text
        }
      }
      
      audioRef.current = firstAudio
      
      // Mark that we've started narration for this story text
      hasStartedNarrationForStoryRef.current = text
      
      // Audio generation complete - hide "Preparing audio..." message
      setIsGeneratingAudio(false)

      // Set up first audio event handlers
      // Note: onFirstChunkReady callback should have already started playback
      // But we still need to track when it actually starts playing
      firstAudio.onplay = () => {
        // Audio started playing - mark that narration has started
        setHasStartedNarration(true)
        setIsAudioPlaying(true) // Audio is now playing, disable restart button
      }
      
      // REMOVED: Auto-play fallback - user must click "Start Story" button to begin

      // Don't set onended here - let the chaining logic handle it
      // This prevents conflicts with the Promise.all chaining

      firstAudio.onerror = (event) => {
        console.error('First audio playback error:', event)
        setError('Error playing audio. Please try again.')
        audioRef.current = null
      }

      // Start generating remaining chunks in parallel while first chunk plays
      const remainingChunks = storyChunks.slice(1)
      if (remainingChunks.length > 0) {
        console.log(`🟡 Starting TTS generation for ${remainingChunks.length} remaining chunks (in parallel)...`)
        
        // Get the last WAV chunk of the first text chunk to chain to the second text chunk
        const firstTextChunkLastAudio = (firstAudio as any).__lastChunk || firstAudio
        
        // Generate all remaining chunks in parallel, but chain them as soon as first WAV chunk is ready
        const audioPromises = remainingChunks.map((chunk, chunkIndex) => {
          return synthesizeSpeech(chunk, { 
            voiceId: customVoiceId || voiceId, 
            apiKey: customApiKey || undefined, // Only pass if provided (voice clones don't need user API key)
            onAllChunksCreated: (allChunks) => {
              // Track all WAV chunks from this text chunk
              allChunks.forEach(wavChunk => {
                allAudioElementsRef.current.add(wavChunk)
              })
              console.log(`🟡 Tracked ${allChunks.length} WAV chunks from text chunk ${chunkIndex + 2}`)
              
              // Set up ended handler on the last WAV chunk of this text chunk
              // This is the actual last chunk of the entire story
              if (allChunks.length > 0 && chunkIndex === remainingChunks.length - 1) {
                const lastChunk = allChunks[allChunks.length - 1]
                if ((lastChunk as any).__isLastWavChunk) {
                  const lastChunkHandler = () => {
                    console.log('🟡🟡🟡 LAST WAV CHUNK OF ENTIRE STORY ENDED! 🟡🟡🟡')
                    console.log('🟡 Setting isAudioPlaying to false and enabling restart button')
                    setIsAudioPlaying(false)
                    isNarrationInProgressRef.current = false
                    if (checkAudioIntervalRef.current) {
                      clearInterval(checkAudioIntervalRef.current)
                      checkAudioIntervalRef.current = null
                    }
                    if (onFullStoryReady && fullStoryRef.current) {
                      onFullStoryReady(fullStoryRef.current)
                    }
                  }
                  lastChunk.addEventListener('ended', lastChunkHandler, { once: true })
                  console.log('🟡 Set up last WAV chunk handler for final text chunk')
                }
              }
            },
            onFirstChunkReady: (firstWavChunk) => {
              // Chain this text chunk's first WAV chunk to the previous text chunk's last WAV chunk
              if (chunkIndex === 0) {
                // This is the first remaining chunk - chain it to the first text chunk's last WAV chunk
                const handler = async () => {
                  console.log(`🟡 Text chunk 1 ended, attempting to play text chunk 2 (early chaining)...`)
                  try {
                    // Check stop flag before playing
                    if (shouldStopAllAudioRef.current) {
                      console.log('🛑 Audio playback stopped by cleanup flag')
                      return
                    }
                    const playPromise = firstWavChunk.play()
                    if (playPromise !== undefined) {
                      await playPromise
                      console.log(`✅ Text chunk 2 started playing successfully (early start)`)
                    }
                  } catch (err: any) {
                    console.error('Error playing next text chunk:', err)
                    setError('Error playing next part of story. Please try again.')
                  }
                }
                
                firstTextChunkLastAudio.onended = null
                firstTextChunkLastAudio.addEventListener('ended', handler, { once: true })
                console.log(`🔗 Early chaining: first text chunk's last WAV → second text chunk's first WAV`)
              }
            }
          })
        })
        
        Promise.all(audioPromises).then((audioChunks) => {
        // Track all audio chunks
        audioChunks.forEach(audio => {
          allAudioElementsRef.current.add(audio)
          if ((audio as any).__lastChunk) {
            allAudioElementsRef.current.add((audio as any).__lastChunk)
          }
        })
        
        // Check if story text changed while we were generating
        if (currentStoryTextRef.current !== text) {
            console.log('Story text changed during chunk generation, discarding audio')
            audioChunks.forEach(audio => {
              if (audio.src && audio.src.startsWith('blob:')) {
                URL.revokeObjectURL(audio.src)
              }
            })
          return
        }

          // Chain all remaining audio chunks together sequentially
          let currentAudio = audioChunks[0]
          let finalAudioElement: HTMLAudioElement | null = null // Track the actual final audio element
          
          for (let i = 1; i < audioChunks.length; i++) {
            const nextAudio = audioChunks[i]
            
            // Get the last WAV chunk of this text chunk for chaining to the next text chunk
            const nextTextChunkLastAudio = (nextAudio as any).__lastChunk || nextAudio
            
            // Track the final audio element
            if (i === audioChunks.length - 1) {
              finalAudioElement = nextTextChunkLastAudio
            }
            
            // Remove any existing ended handlers to prevent conflicts
            const newEndedHandler = async () => {
              console.log(`🟡 Text chunk ${i + 1} ended, attempting to play text chunk ${i + 2}...`)
              try {
                // Check if audio element exists and is valid
                if (!nextAudio) {
                  console.error('Next audio chunk is null or undefined')
                  setError('Error: Next audio chunk is missing.')
          return
        }

                // Check stop flag before playing
                if (shouldStopAllAudioRef.current) {
                  console.log('🛑 Audio playback stopped by cleanup flag')
                  return
                }
                // Try to play immediately
                const playPromise = nextAudio.play()
                
                if (playPromise !== undefined) {
                  await playPromise
                  console.log(`✅ Text chunk ${i + 2} started playing successfully`)
                } else {
                  console.warn('play() returned undefined, audio may already be playing')
                }
              } catch (err: any) {
                console.error('Error playing next audio chunk:', err)
                console.error('Error details:', {
                  message: err?.message,
                  name: err?.name,
                  stack: err?.stack,
                  audioElement: nextAudio,
                  readyState: (nextAudio as any)?.readyState,
                  paused: nextAudio?.paused,
                  ended: nextAudio?.ended
                })
                setError('Error playing next part of story. Please try again.')
              }
            }
            
            // Set up chaining - remove old handler first if it exists
            currentAudio.onended = null
            currentAudio.addEventListener('ended', newEndedHandler, { once: true })
            
            // Set up event handlers for next chunk
            nextAudio.onplay = () => {
              // Next chunk started playing
            }
            
            // If this is the last chunk, set up final ended handler on its last audio element
            if (i === audioChunks.length - 1) {
              console.log(`🟡 This is the final text chunk (${i + 2}), setting up final ended handler`)
              console.log(`🟡 Final audio element:`, nextTextChunkLastAudio)
              console.log(`🟡 Final audio element src:`, nextTextChunkLastAudio.src)
              console.log(`🟡 Final audio element ended:`, nextTextChunkLastAudio.ended)
              
              const finalChunkEndedHandler = () => {
                console.log('🟡🟡🟡 FINAL text chunk ended - all narration complete! 🟡🟡🟡')
                console.log('🟡 Setting isAudioPlaying to false and enabling restart button')
                setIsAudioPlaying(false) // Audio has ended, enable restart button
                isNarrationInProgressRef.current = false
                if (checkAudioIntervalRef.current) {
                  clearInterval(checkAudioIntervalRef.current)
                  checkAudioIntervalRef.current = null
                }
                if (onFullStoryReady && fullStoryRef.current) {
                  onFullStoryReady(fullStoryRef.current)
                }
              }
              // Remove any existing handler first
              nextTextChunkLastAudio.onended = null
              nextTextChunkLastAudio.addEventListener('ended', finalChunkEndedHandler, { once: true })
              
              // Also set up on the main nextAudio element as backup
              nextAudio.onended = null
              nextAudio.addEventListener('ended', () => {
                console.log('🟡🟡🟡 FINAL audio chunk ended (backup handler) - all narration complete! 🟡🟡🟡')
                setIsAudioPlaying(false)
                isNarrationInProgressRef.current = false
                if (checkAudioIntervalRef.current) {
                  clearInterval(checkAudioIntervalRef.current)
                  checkAudioIntervalRef.current = null
                }
                if (onFullStoryReady && fullStoryRef.current) {
                  onFullStoryReady(fullStoryRef.current)
                }
              }, { once: true })
              
              console.log(`🟡 Set up final chunk ended handlers on both last audio element and main audio (text chunk ${i + 2})`)
            }
            
            currentAudio = nextTextChunkLastAudio
          }
          
          // Set up ended handler for the final audio element (after all chaining is set up)
          if (finalAudioElement) {
            // Remove any existing handler first
            finalAudioElement.onended = null
            const finalEndedHandler = () => {
              console.log('🟡 FINAL audio element ended - all narration complete!')
              console.log('🟡 Setting isAudioPlaying to false and enabling restart button')
              setIsAudioPlaying(false) // Audio has ended, enable restart button
              isNarrationInProgressRef.current = false
              if (checkAudioIntervalRef.current) {
                clearInterval(checkAudioIntervalRef.current)
                checkAudioIntervalRef.current = null
              }
              if (onFullStoryReady && fullStoryRef.current) {
                onFullStoryReady(fullStoryRef.current)
              }
            }
            finalAudioElement.addEventListener('ended', finalEndedHandler, { once: true })
            console.log('🟡 Set up final audio element ended handler')
            
            // Also set up a polling check as a backup to detect when audio has ended
            // This helps catch cases where the ended event might not fire
            if (checkAudioIntervalRef.current) {
              clearInterval(checkAudioIntervalRef.current)
            }
            console.log('🟡 Starting polling interval to detect when audio ends')
            let pollCount = 0
            checkAudioIntervalRef.current = setInterval(() => {
              pollCount++
              // Check all tracked audio elements
              let anyPlaying = false
              let playingCount = 0
              let endedCount = 0
              let pausedCount = 0
              let noSrcCount = 0
              
              allAudioElementsRef.current.forEach((audio) => {
                // Check if audio is actually playing (not ended, not paused, and has a source)
                if (audio.src) {
                  if (!audio.ended && !audio.paused && audio.readyState >= 2) {
                    anyPlaying = true
                    playingCount++
                  } else if (audio.ended) {
                    endedCount++
                  } else if (audio.paused) {
                    pausedCount++
                  }
                } else {
                  noSrcCount++
                }
              })
              
              // Also check the final audio element specifically
              if (finalAudioElement) {
                if (finalAudioElement.src) {
                  if (!finalAudioElement.ended && !finalAudioElement.paused && finalAudioElement.readyState >= 2) {
                    anyPlaying = true
                    playingCount++
                  } else if (finalAudioElement.ended) {
                    endedCount++
                  } else if (finalAudioElement.paused) {
                    pausedCount++
                  }
                } else {
                  noSrcCount++
                }
              }
              
              // Also check audioRef
              if (audioRef.current) {
                if (audioRef.current.src) {
                  if (!audioRef.current.ended && !audioRef.current.paused && audioRef.current.readyState >= 2) {
                    anyPlaying = true
                    playingCount++
                  } else if (audioRef.current.ended) {
                    endedCount++
                  } else if (audioRef.current.paused) {
                    pausedCount++
                  }
                } else {
                  noSrcCount++
                }
              }
              
              // Log every 10th poll to help debug
              if (pollCount % 10 === 0) {
                console.log(`🟡 Polling check #${pollCount}: playing=${playingCount}, ended=${endedCount}, paused=${pausedCount}, noSrc=${noSrcCount}, total=${allAudioElementsRef.current.size}, anyPlaying=${anyPlaying}, isAudioPlaying=${isAudioPlaying}`)
              }
              
              // If no audio is playing, set state to false (regardless of current state)
              // BUT don't stop if we're still generating remaining audio chunks
              if (!anyPlaying && !isGeneratingRemainingRef.current) {
                // Always update state if no audio is playing (even if state already says false)
                // This ensures the button becomes active
                console.log(`🟡🟡🟡 POLLING DETECTED ALL AUDIO HAS ENDED! (poll #${pollCount}, playing: ${playingCount}, ended: ${endedCount}, paused: ${pausedCount}, total tracked: ${allAudioElementsRef.current.size}, isAudioPlaying: ${isAudioPlaying}) 🟡🟡🟡`)
                setIsAudioPlaying(false)
                isNarrationInProgressRef.current = false
                if (checkAudioIntervalRef.current) {
                  clearInterval(checkAudioIntervalRef.current)
                  checkAudioIntervalRef.current = null
                }
                if (onFullStoryReady && fullStoryRef.current) {
                  onFullStoryReady(fullStoryRef.current)
                }
              } else if (!anyPlaying && isGeneratingRemainingRef.current) {
                console.log(`🟡 First chunk ended, waiting for remaining audio to be generated...`)
              }
            }, 300) // Check every 300ms for faster detection
          }
          
          // Store second audio for reference (though chaining handles it now)
          if (audioChunks.length > 0) {
            secondAudioRef.current = audioChunks[0]
          }
          
          console.log(`✅ All ${audioChunks.length + 1} audio chunks ready and chained!`)
        }).catch(err => {
          console.error('Error generating remaining audio chunks:', err)
          setError('Error generating audio for some parts of the story.')
        })
      } else {
        // No remaining chunks, just mark as complete when first ends
        firstAudio.onended = () => {
          console.log('🟡 Single chunk ended')
          setIsAudioPlaying(false) // Audio has ended, enable restart button
          isNarrationInProgressRef.current = false
          if (checkAudioIntervalRef.current) {
            clearInterval(checkAudioIntervalRef.current)
            checkAudioIntervalRef.current = null
          }
          if (onFullStoryReady && fullStoryRef.current) {
            onFullStoryReady(fullStoryRef.current)
          }
        }
        
        // Also set up polling check for single chunk case as a backup
        if (checkAudioIntervalRef.current) {
          clearInterval(checkAudioIntervalRef.current)
        }
        checkAudioIntervalRef.current = setInterval(() => {
          // Check if audio has ended or is paused and has no source
          const isEnded = firstAudio.ended || !firstAudio.src || (firstAudio.paused && firstAudio.currentTime > 0 && firstAudio.currentTime >= firstAudio.duration - 0.1)
          
          if (isEnded) {
            // Only log and update if we actually need to change the state
            if (isAudioPlaying || isNarrationInProgressRef.current) {
              console.log(`🟡 Polling detected single chunk audio has ended (ended: ${firstAudio.ended}, paused: ${firstAudio.paused}, currentTime: ${firstAudio.currentTime}, duration: ${firstAudio.duration})`)
              setIsAudioPlaying(false)
              isNarrationInProgressRef.current = false
              if (checkAudioIntervalRef.current) {
                clearInterval(checkAudioIntervalRef.current)
                checkAudioIntervalRef.current = null
              }
              if (onFullStoryReady && fullStoryRef.current) {
                onFullStoryReady(fullStoryRef.current)
              }
            }
          }
        }, 300) // Check every 300ms for faster detection
      }

      // Start playing first chunk if it hasn't already started via onFirstChunkReady callback
      // The onFirstChunkReady callback should have already started playback, but this is a fallback
      if (!firstWavChunkReady) {
        try {
          // Check stop flag before playing
          if (shouldStopAllAudioRef.current) {
            console.log('🛑 Audio playback stopped by cleanup flag')
            return
          }
      await firstAudio.play()
          console.log('🎵 First audio chunk started playing (fallback - onFirstChunkReady may not have fired)')
          setHasStartedNarration(true)
          setIsAudioPlaying(true) // Audio is now playing, disable restart button
          setIsGeneratingAudio(false) // Hide "Preparing audio..." message
          setNeedsUserInteraction(false)
        } catch (playError: any) {
          console.error('Error auto-playing first audio:', playError)
          isGeneratingRef.current = false
          isNarrationInProgressRef.current = false
          // If autoplay fails (e.g., browser policy), show a play button
          if (playError.name === 'NotAllowedError' || playError.message?.includes('user gesture')) {
            console.log('⚠️ Autoplay blocked by browser policy, showing play button')
            setNeedsUserInteraction(true)
            setError(null) // Don't show error, just show play button
          } else {
            setError('Error starting audio playback. Please try again.')
          }
        }
      } else {
        // Audio already started via onFirstChunkReady callback
      isGeneratingRef.current = false
      }
    } catch (err: any) {
      console.error('Error generating speech:', err)
      setError(err.message || 'Failed to generate speech. Please try again.')
      // Story page shows immediately
      isGeneratingRef.current = false
        isNarrationInProgressRef.current = false
        setIsGeneratingAudio(false) // Hide "Preparing audio..." message
      cleanupAudio()
    }
  }



  // Handle progressive story updates
  useEffect(() => {
    if (isProgressive && onFullStoryReady && storyText && !fullStoryRef.current) {
      // This is the first chunk - store it and notify parent when full story is ready
      fullStoryRef.current = storyText
    } else if (!isProgressive && storyText && storyText !== fullStoryRef.current) {
      // Full story has arrived - update the ref
      fullStoryRef.current = storyText
      if (onFullStoryReady) {
        onFullStoryReady(storyText)
      }
    }
  }, [storyText, isProgressive, onFullStoryReady])

  // For story experience: preload audio in background when image is ready
  // This allows instant playback when user clicks to open the card
  useEffect(() => {
    if (experienceType === 'story' && imageUrl && storyText && !preloadedAudioRef.current && !isPreloadingRef.current) {
      console.log('🎵 Image ready - starting background audio preload for story...')
      preloadAudio(storyText)
    }
  }, [experienceType, imageUrl, storyText])

  // Auto-start narration when storyText changes
  useEffect(() => {
    // Don't auto-start if there's no story text
    if (!storyText || storyText.trim().length === 0) {
      return
    }

    // If we're already generating or narration is in progress, don't restart (most important check)
    if (isGeneratingRef.current || isNarrationInProgressRef.current || (audioRef.current && !audioRef.current.ended)) {
      console.log('🎵 Already generating, narrating, or playing audio, skipping duplicate narration start')
      currentStoryTextRef.current = storyText
      return
    }
    
    // If we've already started narration for this exact story text, don't restart
    if (hasStartedNarrationForStoryRef.current === storyText && audioRef.current && !audioRef.current.ended) {
      console.log('🎵 Already playing this exact story text, skipping duplicate narration start')
      currentStoryTextRef.current = storyText
      return
    }
    
    // If we're already playing and the new text contains the old text (progressive update), don't restart
    if (hasStartedNarrationForStoryRef.current && storyText.includes(hasStartedNarrationForStoryRef.current) && audioRef.current && !audioRef.current.ended) {
      console.log('🎵 Already playing a prefix of this story text, skipping duplicate narration start (progressive update)')
      currentStoryTextRef.current = storyText
      return
    }
    
    // CRITICAL: If we're NOT in progressive mode (full story) but we have a first chunk that's being processed,
    // and the new full story contains the first chunk text, we need to handle this carefully
    // The full story should start narration immediately (delay=0ms), not wait for the first chunk's delayed callback
    if (!isProgressive && hasStartedFirstChunkRef.current && currentStoryTextRef.current && storyText.includes(currentStoryTextRef.current)) {
      console.log('🎵 Full story contains first chunk that is already being processed')
      // Update the story text reference
      currentStoryTextRef.current = storyText
      // Don't return - let the useEffect continue to set up the scheduled callback
      // The scheduled callback will check and skip if narration has already started
      // But we should start narration immediately here (delay=0ms) instead of waiting
      // Skip the cleanup and reset logic below for this case, but continue to scheduling
    } else {
    // In progressive mode, if we've already started the first chunk, don't restart
    if (isProgressive && hasStartedFirstChunkRef.current && storyText === fullStoryRef.current) {
      // Full story has arrived, but we're already playing first chunk
      // Just update the display, don't restart audio
      currentStoryTextRef.current = storyText
      return
    }

    // Update the current story text reference
    currentStoryTextRef.current = storyText

    // In progressive mode with first chunk, mark that we've started
      // Note: isNarrationInProgressRef will be set in handleStartNarration when it actually starts
    if (isProgressive && !hasStartedFirstChunkRef.current) {
      hasStartedFirstChunkRef.current = true
    }

    // Stop and clean up any existing audio IMMEDIATELY when story changes
    // (unless we're in progressive mode and already playing)
    if (!isProgressive || !hasStartedFirstChunkRef.current) {
      cleanupAudio()
    }

      // Reset state
    if (!isProgressive || !hasStartedFirstChunkRef.current) {
      setError(null)
    }
    }

    // REMOVED: Auto-start narration - user must click "Start Story" button to begin
    // This prevents conflicts between auto-play and manual button clicks
    
    // Clear any pending narration timeout (safety cleanup)
    if (narrationTimeoutRef.current) {
      clearTimeout(narrationTimeoutRef.current)
      narrationTimeoutRef.current = null
    }

    return () => {
      if (narrationTimeoutRef.current) {
        clearTimeout(narrationTimeoutRef.current)
        narrationTimeoutRef.current = null
      }
      // Cleanup audio on story change - this runs when storyText changes
      // But only if we're not in progressive mode or haven't started yet
      if (!isProgressive || !hasStartedFirstChunkRef.current) {
        cleanupAudio()
        isGeneratingRef.current = false
      }
    }
  }, [storyText, isProgressive]) // Re-run when storyText changes

  return (
    <div className="story-narration">
      {/* REMOVED: "Almost ready!" message - story page shows immediately */}
      
      {/* Start Narration button at the top */}
      {/* For story experience, narration auto-starts when card is opened - no button needed */}
      {/* For other experience types, show button when ready */}
      {experienceType !== 'story' && (
        <div className="story-controls" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginBottom: '30px' }}>
          {/* Start Story button - more prominent, comes first */}
          <button 
            onClick={async () => {
              // Only start if audio is not playing
              if (!isAudioPlaying && !isGeneratingAudio) {
                await handleStartNarration(storyText)
              }
            }} 
            disabled={isGeneratingAudio || isAudioPlaying}
            className="restart-story-button"
            style={{
              fontSize: '1.3rem',
              padding: '18px 36px',
              fontWeight: '700',
              order: 1,
              opacity: (isGeneratingAudio || isAudioPlaying) ? 0.6 : 1,
              cursor: (isGeneratingAudio || isAudioPlaying) ? 'not-allowed' : 'pointer'
            }}
          >
            {isGeneratingAudio 
              ? 'Starting Narration...' 
              : hasStartedNarration 
                ? (experienceType === 'greeting-card' ? 'Restart Narrator 🧝' : 'Restart Story 🧝')
                : 'Start Narration 🧝'}
          </button>
        
        {/* For greeting cards and stories, Share and Make Another buttons go below the text */}
        {experienceType !== 'greeting-card' && !isShared && (
          <>
            {!shareUrl ? (
              <button 
                  onClick={async () => {
                    setIsSharing(true)
                    setShareError(null)
                    try {
                      // Convert blob URL to data URL if needed for sharing
                      let finalImageUrl = imageUrl
                      if (imageUrl && imageUrl.startsWith('blob:')) {
                        try {
                          const response = await fetch(imageUrl)
                          const blob = await response.blob()
                          const reader = new FileReader()
                          finalImageUrl = await new Promise<string>((resolve, reject) => {
                            reader.onloadend = () => resolve(reader.result as string)
                            reader.onerror = reject
                            reader.readAsDataURL(blob)
                          })
                        } catch (error) {
                          console.error('Error converting blob URL to data URL:', error)
                          // Continue with original URL if conversion fails
                        }
                      }
                      
                      const result = await shareStory({
                        storyText,
                        childName,
                        voiceId,
                        storyType: _storyType,
                        imageUrl: finalImageUrl,
                        customApiKey,
                        customVoiceId
                      })
                      setShareUrl(result.shareUrl)
                      // Use Web Share API (mobile) or clipboard (desktop)
                      await shareUrlHelper(
                        result.shareUrl,
                        'A Christmas Story For You',
                        `Check out this personalized Christmas story for ${childName}!`
                      )
                  } catch (err: any) {
                    setShareError(err.message || 'Failed to share story')
                  } finally {
                    setIsSharing(false)
                  }
                }}
                disabled={isSharing}
                className="share-story-button"
                style={{ order: 2 }}
              >
                {isSharing ? 'Sharing...' : 'Share Story'}
              </button>
            ) : (
              <div className="share-success" style={{ order: 2 }}>
                  <input 
                    type="text" 
                    value={shareUrl} 
                    readOnly 
                    className="share-url-input"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                <button 
                  onClick={async () => {
                    // Use Web Share API (mobile) or clipboard (desktop)
                    await shareUrlHelper(
                      shareUrl,
                      'A Christmas Story For You',
                      `Check out this personalized Christmas story for ${childName}!`
                    )
                    setIsLinkCopied(true)
                    // Reset after 2 seconds
                    setTimeout(() => {
                      setIsLinkCopied(false)
                    }, 2000)
                  }}
                  className="copy-link-button"
                >
                  {isLinkCopied ? '✓ Shared!' : 'Share Again'}
                </button>
            </div>
            )}
            {shareError && (
              <div className="error-message" style={{ color: '#f5576c', marginTop: '10px', width: '100%' }}>
                {shareError}
          </div>
      )}
          </>
        )}
        </div>
      )}

      {error && (
        <div className="error-message" style={{ color: '#f5576c', marginBottom: '16px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      
      {/* For story experience, audio starts when card is opened - no separate button needed */}
      {needsUserInteraction && audioRef.current && experienceType !== 'story' && (
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <button 
            onClick={async () => {
              try {
                if (audioRef.current) {
                  await audioRef.current.play()
                  setNeedsUserInteraction(false)
                  setHasStartedNarration(true) // Mark that narration has started
                  console.log('🎵 Audio started after user interaction')
                }
              } catch (err: any) {
                console.error('Error playing audio after user interaction:', err)
                setError('Error starting audio. Please try again.')
              }
            }}
            className="play-button"
            style={{ 
              padding: '16px 32px',
              fontSize: '1.2rem',
              fontWeight: '600',
              background: 'linear-gradient(135deg, #228b22 0%, #0f5132 100%)',
              color: '#fff8f0',
              border: '2px solid #0f5132',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            ▶️ Start Story Narration
              </button>
        </div>
      )}
      
      {(() => {
        const [title, storyBody] = extractTitleAndStory(storyText)
        const cleanedBody = cleanStoryTextForDisplay(storyBody)
          .replace(/^Part\s+[12]:?\s*/gmi, '')
          .replace(/^Page\s+[12]:?\s*/gmi, '')
          .replace(/\n+Part\s+[12]:?\s*/gmi, '\n')
          .replace(/\n+Page\s+[12]:?\s*/gmi, '\n')
          .trim()
        
        const fullStoryText = title ? `Title: ${title}\n\n${cleanedBody}` : cleanedBody
        
        // Show ChristmasCard for Year In Review and Story (with cover image)
        // For story experience, only show the card if we have an image (prevent placeholder flash)
        if (experienceType === 'year-review' || experienceType === 'story') {
          // For story experience, wait for image before showing card
          if (experienceType === 'story' && !imageUrl) {
            return (
              <div className="story-generation">
                <div className="loading-container">
                  <h2 className="loading-title">Creating your Christmas story...</h2>
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )
          }
          
          // Handler for when user clicks to open the card (starts audio playback)
          const handleCardOpen = async () => {
            console.log('🎵 Card opened - starting narration...')
            console.log(`🎵 Audio preload status: preloaded=${!!preloadedAudioRef.current}, ready=${isAudioPreloaded}, chunks=${preloadedChunksRef.current.length}`)
            
            // Use preloaded audio if available and ready
            // Check for either: preloaded chunks array OR single preloaded audio from parent
            if (preloadedAudioRef.current && isAudioPreloaded) {
              // Check if we have a preloaded chunks array
              if (preloadedChunksRef.current.length > 0) {
                console.log('🎵 Using preloaded audio chunks - INSTANT playback!')
                
                // Set up the audio refs and chain all preloaded chunks
                audioRef.current = preloadedAudioRef.current
                
                // Set up chaining for all preloaded chunks
                const allChunks = preloadedChunksRef.current
                for (let i = 0; i < allChunks.length - 1; i++) {
                  const currentChunk = allChunks[i]
                  const nextChunk = allChunks[i + 1]
                  
                  currentChunk.onended = async () => {
                    if (!shouldStopAllAudioRef.current) {
                      try {
                        await nextChunk.play()
                      } catch (err) {
                        console.error('Error playing next chunk:', err)
                      }
                    }
                  }
                }
                
                // Set up final chunk handler
                const lastChunk = allChunks[allChunks.length - 1]
                lastChunk.onended = () => {
                  console.log('🎵 All audio playback complete')
                  setIsAudioPlaying(false)
                  isNarrationInProgressRef.current = false
                }
                
                // Start playing the first chunk IMMEDIATELY
                try {
                  const playPromise = preloadedAudioRef.current.play()
                  setHasStartedNarration(true)
                  setIsAudioPlaying(true)
                  isNarrationInProgressRef.current = true
                  startPollingForAudioEnd()
                  
                  await playPromise
                  console.log('🎵 Preloaded audio playing!')
                } catch (err: any) {
                  console.error('Error playing preloaded audio:', err)
                  if (err.name === 'NotAllowedError') {
                    setNeedsUserInteraction(true)
                  } else {
                    await handleStartNarration(storyText)
                  }
                }
              } else {
                // Single preloaded audio from parent (first ~3 seconds from loading screen)
                console.log('🎵 Using preloaded audio from loading screen - INSTANT playback!')
                audioRef.current = preloadedAudioRef.current
                hasUsedPreloadedAudioRef.current = true // Mark as used
                
                try {
                  // Play the preloaded first chunk immediately
                  const playPromise = preloadedAudioRef.current.play()
                  setHasStartedNarration(true)
                  setIsAudioPlaying(true)
                  isNarrationInProgressRef.current = true
                  // DON'T set hasStartedNarrationForStoryRef yet - we still need to generate remaining chunks
                  startPollingForAudioEnd()
                  
                  await playPromise
                  console.log('🎵 Preloaded audio (first chunk) playing!')
                  
                  // Generate the rest of the story audio in background
                  // Chain the remaining audio to the preloaded first chunk
                  generateRemainingAudioChunks(storyText, preloadedAudioRef.current)
                } catch (err: any) {
                  console.error('Error playing preloaded audio:', err)
                  if (err.name === 'NotAllowedError') {
                    setNeedsUserInteraction(true)
                  } else {
                    // Fall back to generating audio from scratch
                    hasUsedPreloadedAudioRef.current = false // Reset so handleStartNarration can try
                    await handleStartNarration(storyText)
                  }
                }
              }
            } else if (preloadedAudioRef.current && !isAudioPreloaded) {
              // Audio is still loading - wait briefly then play
              console.log('🎵 Audio still buffering, waiting...')
              setIsGeneratingAudio(true)
              
              // Wait for first audio to be ready (max 3 seconds)
              const timeout = setTimeout(() => {
                console.log('🎵 Timeout waiting for audio, generating fresh...')
                handleStartNarration(storyText)
              }, 3000)
              
              preloadedAudioRef.current.addEventListener('canplaythrough', async () => {
                clearTimeout(timeout)
                setIsGeneratingAudio(false)
                console.log('🎵 Audio ready now, playing...')
                try {
                  await preloadedAudioRef.current?.play()
                  setHasStartedNarration(true)
                  setIsAudioPlaying(true)
                  isNarrationInProgressRef.current = true
                  startPollingForAudioEnd()
                } catch (err) {
                  console.error('Error playing audio:', err)
                  await handleStartNarration(storyText)
                }
              }, { once: true })
            } else {
              // No preloaded audio, generate and play
              console.log('🎵 No preloaded audio available, generating now...')
              await handleStartNarration(storyText)
            }
          }
          
          return (
            <ChristmasCard
              imageUrl={imageUrl || null}
              title={title || ''}
              content={fullStoryText}
              childName={childName}
              onCardOpen={experienceType === 'story' ? handleCardOpen : undefined}
              isAudioReady={experienceType === 'story' ? isAudioPreloaded : undefined}
              isAudioLoading={experienceType === 'story' ? isGeneratingAudio : undefined}
            />
          )
        } else {
          // For wish-list, show content directly without card
          return (
            <div className="story-content-direct">
              {title && <h1 className="story-direct-title">{title}</h1>}
              <div className="story-direct-body">
                {cleanedBody.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="story-paragraph">
                    {paragraph.trim()}
                  </p>
                ))}
              </div>
          </div>
        )
        }
      })()}

      {/* For greeting cards and stories, show Share and Make Another buttons below the text */}
      {/* For story experience, only show buttons when image is ready */}
      {(experienceType === 'greeting-card' || (experienceType === 'story' && imageUrl)) && (
        <div className="story-controls" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '30px' }}>
          {!isShared && (
            <>
              {!shareUrl ? (
                <button 
                  onClick={async () => {
                    setIsSharing(true)
                    setShareError(null)
                    try {
                      // Convert blob URL to data URL if needed for sharing
                      let finalImageUrl = imageUrl
                      if (imageUrl && imageUrl.startsWith('blob:')) {
                        try {
                          const response = await fetch(imageUrl)
                          const blob = await response.blob()
                          const reader = new FileReader()
                          finalImageUrl = await new Promise<string>((resolve, reject) => {
                            reader.onloadend = () => resolve(reader.result as string)
                            reader.onerror = reject
                            reader.readAsDataURL(blob)
                          })
                        } catch (error) {
                          console.error('Error converting blob URL to data URL:', error)
                          // Continue with original URL if conversion fails
                        }
                      }
                      
                      const result = await shareStory({
                        storyText,
                        childName,
                        voiceId,
                        storyType: _storyType,
                        imageUrl: finalImageUrl,
                        customApiKey,
                        customVoiceId
                      })
                        setShareUrl(result.shareUrl)
                        // Use Web Share API (mobile) or clipboard (desktop)
                        await shareUrlHelper(
                          result.shareUrl,
                          experienceType === 'greeting-card' ? 'Christmas Card Creator' : 'A Christmas Story For You',
                          experienceType === 'greeting-card' 
                            ? `Check out this personalized Christmas card for ${childName}!`
                            : `Check out this personalized Christmas story for ${childName}!`
                        )
                    } catch (err: any) {
                      setShareError(err.message || 'Failed to share story')
                    } finally {
                      setIsSharing(false)
                    }
                  }}
                  disabled={isSharing}
                  className="share-story-button"
                >
                  {isSharing ? 'Sharing...' : experienceType === 'greeting-card' ? 'Share Card' : 'Share Story'}
              </button>
              ) : (
                <div className="share-success">
                  <input 
                    type="text" 
                    value={shareUrl} 
                    readOnly 
                    className="share-url-input"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button 
                    onClick={async () => {
                      // Use Web Share API (mobile) or clipboard (desktop)
                      await shareUrlHelper(
                        shareUrl,
                        experienceType === 'greeting-card' ? 'Christmas Card Creator' : 'A Christmas Story For You',
                        experienceType === 'greeting-card' 
                          ? `Check out this personalized Christmas card for ${childName}!`
                          : `Check out this personalized Christmas story for ${childName}!`
                      )
                      setIsLinkCopied(true)
                      // Reset after 2 seconds
                      setTimeout(() => {
                        setIsLinkCopied(false)
                      }, 2000)
                    }}
                    className="copy-link-button"
                  >
                    {isLinkCopied ? '✓ Shared!' : 'Share Again'}
              </button>
                </div>
            )}
              {shareError && (
                <div className="error-message" style={{ color: '#f5576c', marginTop: '10px', width: '100%' }}>
                  {shareError}
          </div>
              )}
            </>
          )}
          {experienceType === 'greeting-card' && (
            <button 
              onClick={() => {
                // Use browser refresh to ensure all audio stops completely
                // This is the most reliable way to stop all audio and reset the app
                window.location.href = '/'
              }} 
              className="restart-button"
            >
              Make Another Christmas Creation
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default StoryNarration

