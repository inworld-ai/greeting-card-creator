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
  interruptionEnabled!: boolean;
  disableAutoInterruption!: boolean; // Flag to disable graph-based auto-interruptions (default: false, meaning auto-interruptions are enabled)
  ttsModelId!: string;
  connections: {
    [sessionId: string]: Connection;
  } = {};

  vadClient: any;

  // Shared graph for text input
  graphWithTextInput!: InworldGraphWrapper;
  
  // Counter for unique graph IDs per session
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
    this.interruptionEnabled = this.env.interruptionEnabled;
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
   * Create a NEW audio graph for each session.
   * Each session gets its own graph to avoid shared state issues.
   */
  async getGraphForSTTService(_sttService?: string, sessionId?: string): Promise<InworldGraphWrapper> {
    if (!this.env.assemblyAIApiKey) {
      throw new Error(
        `Assembly.AI STT requested but ASSEMBLY_AI_API_KEY is not configured. This should have been caught during session load.`,
      );
    }

    // Create a fresh graph for each call (each session gets its own graph)
    this.graphCreationCounter++;
    const graphId = this.graphCreationCounter;
    console.log(`  → Creating new Assembly.AI STT graph #${graphId} for session ${sessionId || 'unknown'}...`);
    
    const graph = await InworldGraphWrapper.create({
      apiKey: this.apiKey,
      llmModelName: this.llmModelName,
      llmProvider: this.llmProvider,
      voiceId: DEFAULT_VOICE_ID,
      connections: this.connections,
      withAudioInput: true,
      graphVisualizationEnabled: this.graphVisualizationEnabled,
      disableAutoInterruption: this.disableAutoInterruption,
      ttsModelId: this.ttsModelId,
      vadClient: this.vadClient,
      useAssemblyAI: true,
      assemblyAIApiKey: this.env.assemblyAIApiKey,
      uniqueId: graphId,
    });
    
    console.log(`  ✓ Assembly.AI STT graph #${graphId} created`);
    return graph;
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
    // For greeting-card, we enforce a fixed, strict prompt so the flow is reliable
    if (experienceType === 'greeting-card') {
      return `You are Inny, a cheerful and enthusiastic Inworld elf helping ${userName} create a fun personalized Christmas card! You're warm, playful, and genuinely excited to help spread holiday cheer.

You must collect EXACTLY 2 pieces of info, then stop:
1) Who is the card for? (name + relationship in one answer, e.g. "Mom", "my partner Alex", "my best friend Sam")
2) One funny or sweet anecdote/reason they love them (one answer)

When user says [START], respond EXACTLY with this and nothing else:
"Hi! I'm Inny the Inworld elf, here to help you create a fun Christmas card for your loved one. So tell me, what's the name of the lucky person receiving this card and what's your relationship to them?"

After the user answers #1, respond with EXACTLY this one sentence and nothing else:
"Ooh wonderful! Now tell me something sweet or funny about them - a little story or reason why they're so special to you!"

After the user answers #2, respond with EXACTLY this one sentence and nothing else:
"I love it! Hold tight while I sprinkle some Christmas magic on your card..."

STRICT RULES:
- Ask ONLY those 2 questions; no follow-ups
- Max 2 sentences per response
- Be warm and enthusiastic but concise
- If user says "I don't know" for the anecdote, respond: "No worries! Just share one little thing you love about them - anything at all!"
- If user shares something off-topic, briefly acknowledge it warmly (1 sentence), then redirect to the current question in a cheerful way`;
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
        return "Hi! I'm Inny the Inworld elf, here to help you create a fun Christmas card for your loved one. So tell me, what's the name of the lucky person receiving this card and what's your relationship to them?";
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

    // Mark as unloaded first
    this.connections[sessionId].unloaded = true;
    
    // Close WebSocket if open
    if (this.connections[sessionId].ws) {
      try {
        this.connections[sessionId].ws.close();
      } catch (e) {
        // Already closed
      }
    }
    
    // DELETE the connection to free memory and prevent state bleeding
    console.log(`🧹 Cleaning up session ${sessionId}`);
    delete this.connections[sessionId];

    res.end(JSON.stringify({ message: 'Session unloaded' }));
  }

  clearGraphCache(_sessionId?: string) {
    // Per-session graphs are created fresh each time, no caching to clear
    console.log('📝 clearGraphCache called - graphs are created per-session');
  }

  shutdown() {
    this.connections = {};
    this.graphWithTextInput.destroy();
    stopInworldRuntime();
  }
}
