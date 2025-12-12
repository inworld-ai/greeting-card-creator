import { stopInworldRuntime } from '@inworld/runtime';
import { VADFactory } from '@inworld/runtime/primitives/vad';
import { v4 } from 'uuid';
import { validationResult } from 'express-validator';

import { DEFAULT_VOICE_ID } from '../constants';
import { parseEnvironmentVariables } from '../helpers';
import { Connection } from '../types';
import { InworldGraphWrapper } from './graph';

export class InworldApp {
  apiKey!: string;
  llmModelName!: string;
  llmProvider!: string;
  vadModelPath!: string;
  graphVisualizationEnabled!: boolean;
  disableAutoInterruption!: boolean; // Flag to disable graph-based auto-interruptions (default: false, meaning auto-interruptions are enabled)
  ttsModelId!: string;
  connections: {
    [sessionId: string]: Connection;
  } = {};

  vadClient: any;

  // Shared graphs for all sessions (voice selected dynamically via TTSRequestBuilderNode)
  graphWithTextInput!: InworldGraphWrapper;
  private graphWithAudioInputAssemblyAI?: InworldGraphWrapper;
  
  // Counter for unique graph IDs (incremented when graph is recreated after crash)
  private graphCreationCounter = 0;

  // Environment configuration for lazy graph creation
  private env!: ReturnType<typeof parseEnvironmentVariables>;

  async initialize() {
    this.connections = {};

    // Parse the environment variables
    this.env = parseEnvironmentVariables();

    this.apiKey = this.env.apiKey;
    this.llmModelName = this.env.llmModelName;
    this.llmProvider = this.env.llmProvider;
    this.vadModelPath = this.env.vadModelPath;
    this.graphVisualizationEnabled = this.env.graphVisualizationEnabled;
    this.disableAutoInterruption = this.env.disableAutoInterruption;
    this.ttsModelId = this.env.ttsModelId;

    // Initialize the VAD client for Assembly.AI
    console.log('Loading VAD model from:', this.vadModelPath);
    this.vadClient = await VADFactory.createLocal({
      modelPath: this.vadModelPath,
    });

    // Create shared text-only graph
    // Voice is selected dynamically per session via TTSRequestBuilderNode
    this.graphWithTextInput = await InworldGraphWrapper.create({
      apiKey: this.apiKey,
      llmModelName: this.llmModelName,
      llmProvider: this.llmProvider,
      voiceId: DEFAULT_VOICE_ID, // Default voice (overridden by TTSRequestBuilderNode)
      connections: this.connections,
      graphVisualizationEnabled: this.graphVisualizationEnabled,
      disableAutoInterruption: this.disableAutoInterruption,
      ttsModelId: this.ttsModelId,
      vadClient: this.vadClient,
    });

    console.log('\n✓ Text input graph initialized');
    console.log('✓ Audio input graph will be created lazily when first requested\n');
    console.log('✓ STT service: Assembly.AI\n');
  }

  /**
   * Get or create an Assembly.AI audio graph for a session.
   * Creates a FRESH graph for each session to avoid shared state issues.
   * Voice is selected dynamically per session via TTSRequestBuilderNode.
   */
  async getGraphForSTTService(_sttService?: string, sessionId?: string): Promise<InworldGraphWrapper> {
    if (!this.env.assemblyAIApiKey) {
      throw new Error(
        `Assembly.AI STT requested but ASSEMBLY_AI_API_KEY is not configured. This should have been caught during session load.`,
      );
    }

    // Check if session already has a graph
    if (sessionId && this.connections[sessionId]?.sessionGraph) {
      console.log(`  → Using existing graph for session ${sessionId}`);
      return this.connections[sessionId].sessionGraph;
    }

    // Create a fresh graph for this session
    this.graphCreationCounter++;
    console.log(`  → Creating fresh Assembly.AI STT graph #${this.graphCreationCounter} for session ${sessionId || 'unknown'}...`);
    
    const newGraph = await InworldGraphWrapper.create({
      apiKey: this.apiKey,
      llmModelName: this.llmModelName,
      llmProvider: this.llmProvider,
      voiceId: DEFAULT_VOICE_ID, // Default voice (overridden by TTSRequestBuilderNode)
      connections: this.connections,
      withAudioInput: true,
      graphVisualizationEnabled: this.graphVisualizationEnabled,
      disableAutoInterruption: this.disableAutoInterruption,
      ttsModelId: this.ttsModelId,
      vadClient: this.vadClient,
      useAssemblyAI: true,
      assemblyAIApiKey: this.env.assemblyAIApiKey,
      uniqueId: this.graphCreationCounter, // Unique ID for graph node names
    });
    
    console.log(`  ✓ Assembly.AI STT graph #${this.graphCreationCounter} created for session ${sessionId || 'unknown'}`);

    // Store the graph on the session connection
    if (sessionId && this.connections[sessionId]) {
      this.connections[sessionId].sessionGraph = newGraph;
    }

    return newGraph;
  }

  async load(req: any, res: any) {
    res.setHeader('Content-Type', 'application/json');

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const agent = {
      ...req.body.agent,
      id: v4(),
    };

    const sessionId = req.query.sessionId;
    const systemMessageId = v4();
    const sttService = req.body.sttService || 'assemblyai'; // Default to Assembly.AI

    // Validate STT service availability BEFORE creating session
    if (sttService !== 'assemblyai') {
      return res.status(400).json({
        error: `Only Assembly.AI STT is supported`,
        availableServices: ['assemblyai'],
        requestedService: sttService,
      });
    }

    if (!this.env.assemblyAIApiKey) {
      return res.status(400).json({
        error: `Assembly.AI STT requested but ASSEMBLY_AI_API_KEY is not configured`,
        availableServices: ['assemblyai'],
        requestedService: sttService,
      });
    }

    // Get voice from request or use default
    const sessionVoiceId = req.body.voiceId !== undefined && req.body.voiceId !== null 
      ? req.body.voiceId 
      : DEFAULT_VOICE_ID;

    // Get experience type for customizing prompts
    const experienceType = req.body.experienceType || 'greeting-card';

    this.connections[sessionId] = {
      state: {
        interactionId: systemMessageId,
        messages: [
          {
            role: 'system',
            content: this.createSystemMessage(agent, req.body.userName, experienceType),
            id: 'system' + systemMessageId,
          },
        ],
        agent,
        userName: req.body.userName,
        voiceId: sessionVoiceId,
        experienceType,
        answeredQuestions: {},
      },
      ws: null,
      sttService, // Store STT service choice for this session
    };

    res.end(JSON.stringify({ agent }));
  }

  private createSystemMessage(agent: any, userName: string, experienceType: string): string {
    // For greeting-card, use a SINGLE-TURN approach due to runtime limitations
    if (experienceType === 'greeting-card') {
      return `You are a cheerful Christmas elf helping ${userName} create a personalized Christmas card.

YOUR ONE JOB: After the user tells you about the card recipient, say "CARD_READY: [name]" and nothing else.

WHAT TO LISTEN FOR:
- Who the card is for (relationship like "my dad", "Mom", "my wife Sarah")
- Optionally: a story, memory, or special thing about them

RESPONSE RULES:
- If user provides recipient + any detail about them: Say "CARD_READY: [name]" (e.g., "CARD_READY: Dad")
- If user ONLY provides recipient with no detail: Say "CARD_READY: [name]" anyway - we'll work with what we have
- Keep your response to JUST "CARD_READY: [name]" - nothing else!

EXAMPLES:
- User: "This card is for my dad, he loves fishing" → You: "CARD_READY: Dad"
- User: "My mom, she makes the best cookies" → You: "CARD_READY: Mom"
- User: "For my wife Sarah" → You: "CARD_READY: Sarah"
- User: "It's for grandma" → You: "CARD_READY: Grandma"`;
    }

    let basePrompt = agent.systemPrompt?.replace('{userName}', userName) || '';

    // Add experience-specific context
    if (experienceType === 'year-review') {
      basePrompt = basePrompt || `You are a friendly Christmas Elf helping create a Year In Review.

Collect exactly 3 pieces of info:
1. Favorite memory from the year
2. Something new they tried or learned
3. What they're looking forward to next year

After getting all 3, say: "Perfect! Let me create your Year In Review now."
Keep responses brief (1-2 sentences).`;
    } else if (experienceType === 'wish-list') {
      basePrompt = basePrompt || `You are a friendly Christmas Elf helping create a Christmas Wish List.

Collect exactly 3 pieces of info:
1. Their dream gift
2. An experience they'd love
3. Something practical they need

After getting all 3, say: "Perfect! Let me create your Christmas Wish List now."
Keep responses brief (1-2 sentences).`;
    }

    return basePrompt;
  }

  /**
   * Get the initial greeting based on experience type
   */
  getInitialGreeting(experienceType: string): string {
    switch (experienceType) {
      case 'greeting-card':
        return "Who's this Christmas card for, and what's something special or funny about them?";
      case 'year-review':
        return "Hello! I'm one of Santa's elves, and I'm here to help you look back on all the wonderful moments from this year. Let's start with your favorite memory - what stands out the most?";
      case 'wish-list':
        return "Ho ho hello! I'm one of Santa's elves, ready to help you create the perfect Christmas wish list. So tell me, what's that one gift you've been dreaming about all year?";
      default:
        return "Hi there! I'm one of Santa's elves. How can I help you today?";
    }
  }

  unload(req: any, res: any) {
    res.setHeader('Content-Type', 'application/json');

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const sessionId = req.query.sessionId;

    if (!this.connections[sessionId]) {
      return res
        .status(404)
        .json({ error: `Session not found for sessionId: ${sessionId}` });
    }

    // Clean up session graph
    if (this.connections[sessionId].sessionGraph) {
      try {
        console.log(`🧹 Destroying session graph for ${sessionId}`);
        this.connections[sessionId].sessionGraph.destroy();
      } catch (e) {
        console.warn(`Error destroying session graph for ${sessionId}:`, e);
      }
      this.connections[sessionId].sessionGraph = undefined;
    }

    this.connections[sessionId].unloaded = true;

    res.end(JSON.stringify({ message: 'Session unloaded' }));
  }

  clearGraphCache(sessionId?: string) {
    if (sessionId && this.connections[sessionId]?.sessionGraph) {
      console.log(`🔄 Clearing session graph for ${sessionId}`);
      try {
        this.connections[sessionId].sessionGraph.destroy();
      } catch (e) {
        console.warn(`Error destroying session graph for ${sessionId}:`, e);
      }
      this.connections[sessionId].sessionGraph = undefined;
    }
    
    // Also clear the legacy shared graph if it exists
    if (this.graphWithAudioInputAssemblyAI) {
      console.log('🔄 Clearing shared graph cache');
      try {
        this.graphWithAudioInputAssemblyAI.destroy();
      } catch (e) {
        console.warn('Error destroying shared graph:', e);
      }
      this.graphWithAudioInputAssemblyAI = undefined;
    }
  }

  shutdown() {
    this.connections = {};
    this.graphWithTextInput.destroy();
    this.graphWithAudioInputAssemblyAI?.destroy();
    stopInworldRuntime();
  }
}
