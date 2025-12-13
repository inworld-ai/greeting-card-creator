// Voice Session Service for WebSocket-based audio communication
// Uses Inworld Runtime with Assembly.AI STT

const INPUT_SAMPLE_RATE = 16000;
const TTS_SAMPLE_RATE = 24000;

// Get API URL from environment
const getApiUrl = () => {
  const baseUrl = import.meta.env.VITE_API_URL || 
    (import.meta.env.PROD ? '' : 'http://localhost:3001');
  return baseUrl;
};

const getWsUrl = () => {
  const httpUrl = getApiUrl();
  if (httpUrl.startsWith('https://')) {
    return httpUrl.replace('https://', 'wss://');
  } else if (httpUrl.startsWith('http://')) {
    return httpUrl.replace('http://', 'ws://');
  }
  return 'ws://localhost:3001';
};

export interface VoiceSessionConfig {
  experienceType: 'greeting-card' | 'year-review' | 'wish-list' | 'story';
  userName: string;
  voiceId?: string;
  systemPrompt?: string;
  onAgentText: (text: string, interactionId: string) => void;
  onUserText: (text: string, interactionId: string) => void;
  onAudioChunk: (audioData: string, interactionId: string) => void;
  onError: (error: string) => void;
  onInteractionEnd: (interactionId: string) => void;
  onSpeechComplete?: (interactionId: string) => void;
  onGreetingStart?: () => void;
  onGreetingEnd?: () => void;
  onTurnComplete?: () => void; // Called when server finishes processing a turn
}

export class VoiceSession {
  private config: VoiceSessionConfig;
  private sessionId: string;
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private silentGainNode: GainNode | null = null;
  private mediaStream: MediaStream | null = null;
  private audioInterval: number | null = null;
  private isRecording = false;
  private audioPlayer: AudioPlayer;

  constructor(config: VoiceSessionConfig) {
    this.config = config;
    this.sessionId = this.generateSessionId();
    this.audioPlayer = new AudioPlayer();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async start(): Promise<void> {
    const apiUrl = getApiUrl();
    
    // Load session on server
    const response = await fetch(`${apiUrl}/load?sessionId=${this.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: this.config.userName,
        voiceId: this.config.voiceId || 'christmas_story_generator__female_elf_narrator',
        experienceType: this.config.experienceType,
        agent: {
          name: 'Olivia',
          systemPrompt: this.config.systemPrompt || this.getDefaultSystemPrompt(),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create session');
    }

    // Connect WebSocket
    const wsUrl = getWsUrl();
    this.ws = new WebSocket(`${wsUrl}/session?sessionId=${this.sessionId}`);

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      this.ws.onopen = () => {
        console.log('✅ Voice session connected');
        this.audioPlayer.prepare();
        
        // Send greeting trigger to make agent speak first
        this.ws!.send(JSON.stringify({
          type: 'text',
          text: '[START]',
        }));
        console.log('📤 Sent greeting trigger');
        
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.config.onError('Connection failed');
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        if (event.code === 1008) {
          this.config.onError('Session not found');
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
    });
  }

  private getDefaultSystemPrompt(): string {
    const { experienceType, userName } = this.config;
    
    if (experienceType === 'greeting-card') {
      return `You are Olivia - a warm, friendly AI assistant helping ${userName} create a personalized Christmas greeting card. You're conversational and natural. Ask about who the card is for and their relationship, then ask for a funny or heartwarming anecdote about that person. React warmly to their responses. When all questions are answered, say "All set! I'll create your Christmas card for [name]."`;
    } else if (experienceType === 'year-review') {
      return `You are Olivia - a warm AI assistant helping ${userName} create their Year In Review. Ask about their favorite memory from 2025, something new they tried, and what they're looking forward to in 2026. When done, say "Thank you for sharing! I'll create your Year In Review now."`;
    } else if (experienceType === 'wish-list') {
      return `You are Olivia - a warm AI assistant helping ${userName} create their Christmas Wish List. Ask about their dream gift, an experience they'd love, and something practical they need. When done, say "Thank you for sharing! I'll create your Christmas Wish List now."`;
    }
    
    return `You are Olivia, a helpful AI assistant.`;
  }

  private handleMessage(packet: any) {
    switch (packet.type) {
      case 'TEXT':
        const text = packet.text?.text || '';
        const interactionId = packet.packetId?.interactionId;
        
        if (packet.routing?.source?.isAgent) {
          this.config.onAgentText(text, interactionId);
        } else {
          // Ignore our synthetic greeting trigger / empty text
          const cleaned = (text || '').trim();
          if (!cleaned || cleaned.toLowerCase() === '[start]') return;
          this.config.onUserText(text, interactionId);
        }
        break;

      case 'AUDIO':
        if (packet.audio?.chunk) {
          this.audioPlayer.addToQueue(packet.audio.chunk);
          this.config.onAudioChunk(packet.audio.chunk, packet.packetId?.interactionId);
        }
        break;

      case 'INTERACTION_END':
        this.config.onInteractionEnd(packet.packetId?.interactionId);
        break;

      case 'USER_SPEECH_COMPLETE':
        this.config.onSpeechComplete?.(packet.packetId?.interactionId);
        break;

      case 'CANCEL_RESPONSE':
        this.audioPlayer.stop();
        break;

      case 'ERROR':
        console.error('Server error:', packet.error);
        this.config.onError(packet.error);
        break;

      case 'GREETING_START':
        console.log('🎄 Greeting started');
        this.config.onGreetingStart?.();
        break;

      case 'GREETING_END':
        console.log('🎄 Greeting ended - mic should auto-enable');
        this.config.onGreetingEnd?.();
        break;

      case 'TURN_COMPLETE':
        // With continuous audio stream, we don't clean up - just notify
        console.log('🔄 Turn complete (continuous mode - audio stream stays alive)');
        this.config.onTurnComplete?.();
        break;
    }
  }

  /**
   * Clean up audio session without sending audioSessionEnd
   * Used between turns to prepare for a fresh graph
   */
  private cleanupAudioSession(): void {
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
      this.audioInterval = null;
    }
    
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.audioWorkletNode?.disconnect();
    this.silentGainNode?.disconnect();
    this.silentGainNode = null;
    this.isRecording = false;
  }

  async startRecording(): Promise<void> {
    if (this.isRecording || !this.ws) return;

    try {
      this.isRecording = true;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: INPUT_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
      // Ensure the audio graph actually runs (some browsers start suspended)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Log actual sample rate (browser may not honor our request)
      console.log(`🎙️ AudioContext sample rate: ${this.audioContext.sampleRate} (requested: ${INPUT_SAMPLE_RATE})`);

      // Load the AudioWorklet processor
      await this.audioContext.audioWorklet.addModule('/audio-processor.worklet.js');

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.audioWorkletNode = new AudioWorkletNode(
        this.audioContext,
        'audio-capture-processor',
      );

      let audioBuffer: Float32Array[] = [];

      this.audioWorkletNode.port.onmessage = (event) => {
        audioBuffer.push(new Float32Array(event.data.samples));
      };

      source.connect(this.audioWorkletNode);
      // Important: keep the node connected so the worklet processes audio.
      // Route to a silent gain node to avoid audible feedback.
      this.silentGainNode = this.audioContext.createGain();
      this.silentGainNode.gain.value = 0;
      this.audioWorkletNode.connect(this.silentGainNode);
      this.silentGainNode.connect(this.audioContext.destination);

      // Send audio chunks every 100ms
      let chunksSent = 0;
      this.audioInterval = window.setInterval(() => {
        if (audioBuffer.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Calculate total samples and check audio levels
          const totalSamples = audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
          
          // Check audio level (RMS) of first buffer to detect if mic is actually capturing
          if (chunksSent === 0 && audioBuffer.length > 0) {
            const samples = audioBuffer[0];
            let sumSquares = 0;
            for (let i = 0; i < samples.length; i++) {
              sumSquares += samples[i] * samples[i];
            }
            const rms = Math.sqrt(sumSquares / samples.length);
            console.log(`🎙️ First audio chunk - RMS level: ${rms.toFixed(4)}, samples: ${totalSamples}`);
          }
          
          this.ws.send(JSON.stringify({
            type: 'audio',
            audio: audioBuffer,
          }));
          audioBuffer = [];
          chunksSent++;
        }
      }, 100);
    } catch (error) {
      console.error('Error starting recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  stopRecording(): void {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.audioInterval) {
      clearInterval(this.audioInterval);
      this.audioInterval = null;
    }

    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.audioWorkletNode?.disconnect();
    this.silentGainNode?.disconnect();
    this.silentGainNode = null;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'audioSessionEnd' }));
    }
  }

  isRecordingActive(): boolean {
    return this.isRecording;
  }

  async stop(): Promise<void> {
    this.stopRecording();
    this.audioPlayer.stop();

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    if (this.ws) {
      const ws = this.ws; // Capture reference before async operation
      this.ws = null; // Clear immediately to prevent race conditions
      
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/unload?sessionId=${this.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(console.error);

      try {
        ws.close();
      } catch (e) {
        // Already closed, ignore
      }
    }
  }
}

// Audio Player for TTS playback
class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private queue: string[] = [];
  private isPlaying = false;
  private currentSources: AudioBufferSourceNode[] = [];
  private nextStartTime = 0;

  prepare(): void {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.nextStartTime = 0;
  }

  stop(): void {
    this.currentSources.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    this.currentSources = [];
    this.queue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;
  }

  addToQueue(base64Audio: string): void {
    this.queue.push(base64Audio);
    if (!this.isPlaying) {
      this.playQueue();
    }
  }

  private async playQueue(): Promise<void> {
    if (!this.audioContext || !this.gainNode || this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;

    while (this.queue.length > 0) {
      const chunk = this.queue.shift();
      if (chunk) {
        await this.playChunk(chunk);
      }
    }

    this.isPlaying = false;
  }

  private async playChunk(base64Chunk: string): Promise<void> {
    if (!this.audioContext || !this.gainNode) return;

    try {
      const binaryString = atob(base64Chunk);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const float32Samples = new Float32Array(bytes.buffer);
      const audioBuffer = this.audioContext.createBuffer(1, float32Samples.length, TTS_SAMPLE_RATE);
      audioBuffer.getChannelData(0).set(float32Samples);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;

      const fadeGain = this.audioContext.createGain();
      fadeGain.connect(this.gainNode);
      source.connect(fadeGain);

      const currentTime = this.audioContext.currentTime;
      const startTime = Math.max(currentTime, this.nextStartTime > 0 ? this.nextStartTime : currentTime);
      const fadeTime = 0.005;

      fadeGain.gain.setValueAtTime(0, startTime);
      fadeGain.gain.linearRampToValueAtTime(1, startTime + fadeTime);

      const endTime = startTime + audioBuffer.duration;
      fadeGain.gain.setValueAtTime(1, endTime - fadeTime);
      fadeGain.gain.linearRampToValueAtTime(0, endTime);

      source.start(startTime);
      source.stop(endTime);

      this.currentSources.push(source);
      source.onended = () => {
        const index = this.currentSources.indexOf(source);
        if (index > -1) this.currentSources.splice(index, 1);
      };

      this.nextStartTime = endTime;
    } catch (error) {
      console.error('Failed to play audio chunk:', error);
    }
  }
}

export default VoiceSession;
