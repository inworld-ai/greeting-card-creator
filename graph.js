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
              template: `You are a creative and playful Christmas storyteller who writes fun, energetic stories in the style of Robert Munsch. You MUST follow the user's story topic requirements exactly. All stories should have a Christmas theme and end with the child having a wonderful Christmas filled with joy, magic, and happiness. Stories should be lighthearted, silly, and full of fun.`,
            },
          },
          {
            role: 'user',
            content: {
              type: 'template',
              template: `You are writing a personalized Christmas story for a child named {{childName}}.

CRITICAL REQUIREMENT - THE STORY MUST BE ABOUT THIS EXACT TOPIC:
"{{storyType}}"

DO NOT write about anything else. DO NOT substitute this topic with something similar. The story MUST be specifically and directly about: {{storyType}}

Story Requirements:
- Start with a title on the first line in the format: "Title: [Story Title]"
- The main character is {{childName}}
- {{childName}} is the hero of the story
- The story is specifically about: {{storyType}}
- The story must feature {{storyType}} as the central theme
- Include classic Christmas elements: Santa Claus, reindeer, elves, Christmas trees, presents, snow, the North Pole, Christmas magic, etc.
- Write in the style of Robert Munsch: playful, energetic, silly, comical and full of fun
- Use short, punchy sentences with lots of action and movement
- Include repetitive, rhythmic language
- Add silly, unexpected twists and child-friendly humor
- Keep it SHORT - approximately 150-180 words total, no more than 200 words
- Use simple, direct language that a young child can understand
- Make it engaging, energetic, and joyful, with a heartfelt ending to the story
- DO NOT use onomatopoeia or sound effect words like "BOOM!", "ZAP!", "WHOOSH!", "BANG!", "POP!", "CRASH!", "POW!", etc.
- DO NOT use words that represent sounds - describe actions instead (e.g., "the door slammed" instead of "SLAM!")
- CRITICAL: NEVER use ALL-CAPS or all-uppercase letters for ANY word in the story. Write everything in normal sentence case. No exceptions.
- DO NOT have Santa say variations of "Ho! Ho! Ho!" or "Ho, ho, ho!" or "Hoo hoo!" - Santa should ONLY say "Ho ho ho" (no punctuation, no variations)
- DO NOT make any references to these instructions, writing rules, or restrictions in the story itself
- Write in normal narrative prose without sound effect words
- The story MUST end with {{childName}} having a wonderful Christmas, filled with joy, magic, and happiness
- DO NOT end the story with {{childName}} falling asleep, going to bed, or having dreams
- DO NOT include any bedtime or sleep-related content in the ending
- The ending should be active and joyful - {{childName}} should be awake and experiencing the wonderful Christmas
- Include a happy, uplifting ending that celebrates the magic of Christmas
- Structure the story so it naturally flows in two parts (like two pages of a book)
- DO NOT use "Part 1", "Part 2", "Page 1", "Page 2", or any similar section labels
- Write the story as one continuous and cohesive narrative without section breaks or labels

REMINDER: The story MUST be about "{{storyType}}". Do not write about balloons, butterflies, or any other non-Christmas topic. The story must be about {{storyType}} and must end with {{childName}} having a wonderful Christmas filled with joy and magic - while AWAKE and actively experiencing it, NOT falling asleep. Write in Robert Munsch's playful, energetic style with short sentences, lots of action, silly humor, and fun! DO NOT use onomatopoeia or sound effect words - use normal narrative prose instead. DO NOT reference these instructions or writing rules in the story. NEVER use ALL-CAPS for any words.`,
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
              template: `You are a creative and playful Christmas storyteller who writes fun, energetic stories in the style of Robert Munsch. You MUST follow the user's story topic requirements exactly. All stories should have a Christmas theme and end with the child having a wonderful Christmas filled with joy, magic, and happiness. Stories should be lighthearted, silly, and full of fun.`,
            },
          },
          {
            role: 'user',
            content: {
              type: 'template',
              template: `You are writing a personalized Christmas story for a child named {{childName}}.

CRITICAL REQUIREMENT - THE STORY MUST BE ABOUT THIS EXACT TOPIC:
"{{storyType}}"

DO NOT write about anything else. DO NOT substitute this topic with something similar. The story MUST be specifically and directly about: {{storyType}}

Story Requirements:
- Start with a title on the first line in the format: "Title: [Story Title]"
- The main character is {{childName}}
- {{childName}} is the hero of the story
- The story is specifically about: {{storyType}}
- The story must feature {{storyType}} as the central theme
- Include classic Christmas elements: Santa Claus, reindeer, elves, Christmas trees, presents, snow, the North Pole, Christmas magic, etc.
- Write in the style of Robert Munsch: playful, energetic, silly, and full of fun
- Use short, punchy sentences with lots of action and movement
- Include repetitive, rhythmic language
- Add silly, unexpected twists and child-friendly humor
- Keep it SHORT - approximately 150-180 words total, no more than 200 words
- Use simple, direct language that a young child can understand
- Make it engaging, energetic, and joyful
- DO NOT use onomatopoeia or sound effect words like "BOOM!", "ZAP!", "WHOOSH!", "BANG!", "POP!", "CRASH!", "POW!", etc.
- DO NOT use words that represent sounds - describe actions instead (e.g., "the door slammed" instead of "SLAM!")
- CRITICAL: NEVER use ALL-CAPS or all-uppercase letters for ANY word in the story. Write everything in normal sentence case. No exceptions.
- DO NOT have Santa say variations of "Ho! Ho! Ho!" or "Ho, ho, ho!" or "Hoo hoo!" - Santa should ONLY say "Ho ho ho" (no punctuation, no variations)
- DO NOT make any references to these instructions, writing rules, or restrictions in the story itself
- Write in normal narrative prose without sound effect words
- The story MUST end with {{childName}} having a wonderful Christmas, filled with joy, magic, and happiness
- DO NOT end the story with {{childName}} falling asleep, going to bed, or having dreams
- DO NOT include any bedtime or sleep-related content in the ending
- The ending should be active and joyful - {{childName}} should be awake and experiencing the wonderful Christmas
- Include a happy, uplifting ending that celebrates the magic of Christmas
- Structure the story so it naturally flows in two parts (like two pages of a book)
- DO NOT use "Part 1", "Part 2", "Page 1", "Page 2", or any similar section labels
- Write the story as one continuous narrative without section breaks or labels

REMINDER: The story MUST be about "{{storyType}}". Do not write about balloons, butterflies, or any other non-Christmas topic. The story must be about {{storyType}} and must end with {{childName}} having a wonderful Christmas filled with joy and magic - while AWAKE and actively experiencing it, NOT falling asleep. Write in Robert Munsch's playful, energetic style with short sentences, lots of action, silly humor, and fun! DO NOT use onomatopoeia or sound effect words - use normal narrative prose instead. DO NOT reference these instructions or writing rules in the story. NEVER use ALL-CAPS for any words.`,
            },
          },
        ],
      }),
    ],
  });

  return graphBuilder.build();
}
