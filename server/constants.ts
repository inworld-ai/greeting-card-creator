// Voice and model defaults
export const DEFAULT_VOICE_ID = 'christmas_story_generator__female_elf_narrator';
export const DEFAULT_LLM_MODEL_NAME = 'gpt-4o-mini';
export const DEFAULT_PROVIDER = 'openai';
export const DEFAULT_TTS_MODEL_ID = 'inworld-tts-1'; // Use standard TTS (not 'max') for faster streaming
export const DEFAULT_VAD_MODEL_PATH = 'models/silero_vad.onnx';

// Audio Configuration (used by graph-based VAD)
export const INPUT_SAMPLE_RATE = 16000;
export const TTS_SAMPLE_RATE = 24000;
export const PAUSE_DURATION_THRESHOLD_MS = 300;
export const SPEECH_THRESHOLD = 0.5;

// Legacy constants
export const MIN_SPEECH_DURATION_MS = 200;
export const PRE_ROLL_MS = 500;
export const FRAME_PER_BUFFER = 1024;
export const TEXT_CONFIG = {
  maxNewTokens: 100, // Keep responses short (~75 words) to prevent TTS timeout
  maxPromptLength: 1000, // Matching release/0.8
  repetitionPenalty: 1,
  topP: 0.5,
  temperature: 0.1, // Low temperature for deterministic responses (release/0.8)
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: ['\n\n'],
};

// Server port - use environment variable for Railway
export const WS_APP_PORT = parseInt(process.env.PORT || '3001', 10);
