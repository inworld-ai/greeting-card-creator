import path from 'path';
import { fileURLToPath } from 'url';

import {
  DEFAULT_LLM_MODEL_NAME,
  DEFAULT_PROVIDER,
  DEFAULT_TTS_MODEL_ID,
} from './constants.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const parseEnvironmentVariables = () => {
  if (!process.env.INWORLD_API_KEY) {
    throw new Error('INWORLD_API_KEY env variable is required');
  }

  // Validate API keys for Assembly.AI (optional - voice agent won't work without it)
  const assemblyAIApiKey = process.env.ASSEMBLY_AI_API_KEY?.trim();
  if (!assemblyAIApiKey) {
    console.warn('⚠️ ASSEMBLY_AI_API_KEY is not set - voice agent features will be disabled');
    console.warn('   Get an API key from https://www.assemblyai.com/ to enable voice features');
  } else {
    console.log(`✓ Available STT service: Assembly.AI`);
  }

  // Check OpenAI API key if using OpenAI provider
  const llmProvider = process.env.LLM_PROVIDER || DEFAULT_PROVIDER;
  if (llmProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY is not set but LLM_PROVIDER is openai');
  }

  return {
    apiKey: process.env.INWORLD_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    llmModelName: process.env.LLM_MODEL_NAME || DEFAULT_LLM_MODEL_NAME,
    llmProvider,
    vadModelPath:
      process.env.VAD_MODEL_PATH ||
      path.join(__dirname, 'models', 'silero_vad.onnx'),
    ttsModelId: process.env.TTS_MODEL_ID || DEFAULT_TTS_MODEL_ID,
    graphVisualizationEnabled:
      (process.env.GRAPH_VISUALIZATION_ENABLED || '').toLowerCase().trim() ===
      'true',
    disableAutoInterruption:
      (process.env.DISABLE_AUTO_INTERRUPTION || '').toLowerCase().trim() ===
      'true',
    useAssemblyAI: true,
    assemblyAIApiKey,
  };
};
