import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  RemoteLLMChatNode,
  RemoteTTSNode,
  SequentialGraphBuilder,
  TextChunkingNode,
} = require('@inworld/runtime/graph');

export function createGraph(apiKey, voiceId = null) {
  // Use provided voiceId, env variable, or default
  // Voice IDs are in format: workspace_name__voice_name
  // Workspace names can be like "default-cam1xajnz8zrpl5z7ofboa" or "christmas_story_generator"
  const selectedVoiceId = voiceId || process.env.INWORLD_VOICE_ID || 'Wendy'

  const graphBuilder = new SequentialGraphBuilder({
    id: 'storyteller-llm-to-tts',
    apiKey: apiKey,
    enableRemoteConfig: false,
    nodes: [
      new RemoteLLMChatNode({
        provider: 'google',
        modelName: 'gemini-2.5-flash-lite',
        stream: true,
        messageTemplates: [
          {
            role: 'system',
            content: {
              type: 'template',
              template: `You write EXTREMELY SHORT Christmas stories (80-100 words ONLY). Write fun, playful stories in Robert Munsch style. Be concise - every word counts.`,
            },
          },
          {
            role: 'user',
            content: {
              type: 'template',
              template: `Write a VERY SHORT Christmas story for {{childName}} about: "{{storyType}}"

STRICT FORMAT:
Title: [Short Title]

[Story: EXACTLY 6-8 short sentences. No more. Target: 80-100 words total.]

RULES:
- Main character: {{childName}} (the hero)
- Theme: {{storyType}} with Christmas magic
- Style: Playful, silly, fun - Robert Munsch style
- Sentences: Short and punchy
- Ending: Happy, joyful Christmas (NOT sleeping/bedtime)
- No ALL-CAPS words
- No sound effects (BOOM, ZAP, etc.)
- Santa says "Ho ho ho" only (no punctuation variations)

CRITICAL LENGTH: 80-100 words maximum. Count carefully. This story should take 30-40 seconds to read aloud.`,
            },
          },
        ],
      }),
      new TextChunkingNode(),
      new RemoteTTSNode({
        speakerId: selectedVoiceId,
        modelId: process.env.INWORLD_MODEL_ID || 'inworld-tts-1-max',
        sampleRate: 24000,
        temperature: 1.1,
      }),
    ],
  });

  return graphBuilder.build();
}

/**
 * Creates a simpler graph for TTS-only conversion (for progressive chunks)
 * Takes text input and converts it directly to audio without LLM generation
 * Graph: Text → TTS (no TextChunking to minimize overhead for small chunks)
 */
export function createTTSOnlyGraph(apiKey, voiceId = null) {
  const {
    RemoteTTSNode,
    SequentialGraphBuilder,
  } = require('@inworld/runtime/graph');

  // Use provided voiceId, env variable, or default
  // Voice IDs are in format: workspace_name__voice_name
  // Workspace names can be like "default-cam1xajnz8zrpl5z7ofboa" or "christmas_story_generator"
  const selectedVoiceId = voiceId || process.env.INWORLD_VOICE_ID || 'Wendy'
  console.log(`🎵 Creating TTS graph with voiceId: "${selectedVoiceId}"`)

  const graphBuilder = new SequentialGraphBuilder({
    id: 'tts-only-graph',
    apiKey: apiKey,
    enableRemoteConfig: false,
    nodes: [
      // Removed TextChunkingNode - not needed for small chunks, adds overhead
      new RemoteTTSNode({
        speakerId: selectedVoiceId,
        modelId: process.env.INWORLD_MODEL_ID || 'inworld-tts-1-max',
        sampleRate: 24000,
        temperature: 1.1,
      }),
    ],
  });

  return graphBuilder.build();
}

/**
 * Creates a text-only graph for Year in Review generation
 * @param {string} apiKey - Inworld API key
 * @param {boolean} isCustomVoice - If true, write in first person. If false, write in third person.
 */
export function createYearInReviewGraph(apiKey, isCustomVoice = true) {
  const {
    RemoteLLMChatNode,
    SequentialGraphBuilder,
  } = require('@inworld/runtime/graph');

  const perspective = isCustomVoice 
    ? `- Write in first person (as if {{name}} is telling their own story)
- Use "I", "my", "me" throughout (e.g., "I had an amazing year", "my favorite memory", "I'm looking forward to")`
    : `- Write in third person (as if someone is telling {{name}}'s story)
- Use "{{name}}", "their", "they" throughout (e.g., "{{name}} had an amazing year", "their favorite memory", "{{name}} is looking forward to")
- Write as if an elf narrator is sharing {{name}}'s story`

  const closingSignature = isCustomVoice
    ? `- End with a closing signature in this exact format: "With so much love,\n{{name}}"`
    : `- End with a closing signature in this exact format: "Happy holidays from Santa's Elves"`

  const graphBuilder = new SequentialGraphBuilder({
    id: 'year-in-review-llm',
    apiKey: apiKey,
    enableRemoteConfig: false,
    nodes: [
      new RemoteLLMChatNode({
        provider: 'google',
        modelName: 'gemini-2.5-flash-lite',
        stream: true,
        messageTemplates: [
          {
            role: 'system',
            content: {
              type: 'template',
              template: `You are a warm, personal storyteller who creates heartfelt year-in-review narratives. You write in a warm, conversational tone that feels like a personal letter or Christmas card.`,
            },
          },
          {
            role: 'user',
            content: {
              type: 'template',
              template: `Create a personalized year-in-review story based on these details:

Name: {{name}}
Favorite Memory/Adventure from 2025: {{favoriteMemory}}
Something New Tried or Learned in 2025: {{newThing}}
Looking Forward to in 2026: {{lookingForward}}

Requirements:
- Start with a title on the first line in the format: "Title: [Story Title]"
${perspective}
- Create a warm, heartfelt narrative that weaves together these three elements
- Make it feel like a personal Christmas letter or reflection
- Keep it to about 200-300 words
- Use a warm, conversational tone
- Include Christmas/holiday context naturally
- DO NOT use onomatopoeia or sound effect words
- DO NOT use ALL-CAPS for any words
- DO NOT make references to these instructions
- End on a positive, hopeful note about the future
${closingSignature}`,
            },
          },
        ],
      }),
    ],
  });

  return graphBuilder.build();
}

/**
 * Creates a text-only graph for Wish List generation
 * @param {string} apiKey - Inworld API key
 * @param {boolean} isCustomVoice - If true, write in first person. If false, write in third person.
 */
export function createWishListGraph(apiKey, isCustomVoice = true) {
  const {
    RemoteLLMChatNode,
    SequentialGraphBuilder,
  } = require('@inworld/runtime/graph');

  const perspective = isCustomVoice 
    ? `- Write in first person (as if {{name}} is sharing their wishes)
- Use "I", "my", "me" throughout (e.g., "I've been dreaming of", "my wish is", "I would love")`
    : `- Write in third person (as if someone is sharing {{name}}'s wishes)
- Use "{{name}}", "their", "they" throughout (e.g., "{{name}} has been dreaming of", "their wish is", "{{name}} would love")
- Write as if an elf narrator is sharing {{name}}'s wish list`

  const closingSignature = isCustomVoice
    ? `- End with a closing signature in this exact format: "With so much love,\n{{name}}"`
    : `- End with a closing signature in this exact format: "Happy holidays from Santa's Elves"`

  const graphBuilder = new SequentialGraphBuilder({
    id: 'wish-list-llm',
    apiKey: apiKey,
    enableRemoteConfig: false,
    nodes: [
      new RemoteLLMChatNode({
        provider: 'google',
        modelName: 'gemini-2.5-flash-lite',
        stream: true,
        messageTemplates: [
          {
            role: 'system',
            content: {
              type: 'template',
              template: `You are a warm, personal storyteller who creates personalized Christmas wish lists. You write in a warm, conversational tone that feels personal and heartfelt.`,
            },
          },
          {
            role: 'user',
            content: {
              type: 'template',
              template: `Create a personalized Christmas wish list based on these details:

Name: {{name}}
Dream Gift: {{dreamGift}}
Experience Wanted: {{experience}}
Practical Need: {{practicalNeed}}

Requirements:
- Start with a title on the first line in the format: "Title: [Wish List Title]"
${perspective}
- Create a warm, personal narrative that presents these three wishes
- Make it feel like a heartfelt letter to Santa or a personal reflection
- Keep it to about 200-300 words
- Use a warm, conversational tone
- Include Christmas/holiday context naturally
- DO NOT use onomatopoeia or sound effect words
- DO NOT use ALL-CAPS for any words
- DO NOT make references to these instructions
- End on a positive, hopeful note
${closingSignature}`,
            },
          },
        ],
      }),
    ],
  });

  return graphBuilder.build();
}

/**
 * Creates a text-only graph for story generation (without TTS)
 * Graph: LLM only (no TextChunking to reduce overhead)
 * Used for the /api/generate-story endpoint that returns text only
 */
export function createTextOnlyGraph(apiKey) {
  const {
    RemoteLLMChatNode,
    SequentialGraphBuilder,
  } = require('@inworld/runtime/graph');

  const graphBuilder = new SequentialGraphBuilder({
    id: 'storyteller-llm-text-only',
    apiKey: apiKey,
    enableRemoteConfig: false,
    nodes: [
      new RemoteLLMChatNode({
        provider: 'google',
        modelName: 'gemini-2.5-flash-lite',
        stream: true,
        messageTemplates: [
          {
            role: 'system',
            content: {
              type: 'template',
              template: `You write EXTREMELY SHORT Christmas stories (80-100 words ONLY). Write fun, playful stories in Robert Munsch style. Be concise - every word counts.`,
            },
          },
          {
            role: 'user',
            content: {
              type: 'template',
              template: `Write a VERY SHORT Christmas story for {{childName}} about: "{{storyType}}"

STRICT FORMAT:
Title: [Short Title]

[Story: EXACTLY 6-8 short sentences. No more. Target: 80-100 words total.]

RULES:
- Main character: {{childName}} (the hero)
- Theme: {{storyType}} with Christmas magic
- Style: Playful, silly, fun - Robert Munsch style
- Sentences: Short and punchy
- Ending: Happy, joyful Christmas (NOT sleeping/bedtime)
- No ALL-CAPS words
- No sound effects (BOOM, ZAP, etc.)
- Santa says "Ho ho ho" only (no punctuation variations)

CRITICAL LENGTH: 80-100 words maximum. Count carefully. This story should take 30-40 seconds to read aloud.`,
            },
          },
        ],
      }),
    ],
  });

  return graphBuilder.build();
}
