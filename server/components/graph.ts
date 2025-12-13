import {
  Graph,
  GraphBuilder,
  ProxyNode,
  RemoteLLMChatNode,
  RemoteTTSNode,
  TextAggregatorNode,
  TextChunkingNode,
} from '@inworld/runtime/graph';
import * as os from 'os';
import * as path from 'path';

import {
  INPUT_SAMPLE_RATE,
  TEXT_CONFIG,
  TTS_SAMPLE_RATE,
} from '../constants';
import { CreateGraphPropsInterface, TextInput } from '../types';
import { AssemblyAISTTWebSocketNode } from './nodes/assembly_ai_stt_ws_node';
import { DialogPromptBuilderNode } from './nodes/dialog_prompt_builder_node';
import { InteractionQueueNode } from './nodes/interaction_queue_node';
import { SpeechCompleteNotifierNode } from './nodes/speech_complete_notifier_node';
import { StateUpdateNode } from './nodes/state_update_node';
import { TextInputNode } from './nodes/text_input_node';
import { TranscriptExtractorNode } from './nodes/transcript_extractor_node';
import { TTSRequestBuilderNode } from './nodes/tts_request_builder_node';

//
// Audio-to-speech pipeline for Christmas Storyteller:
//
// Audio Input → AssemblyAI STT → TranscriptExtractor → InteractionQueue
//                                                           ↓
// TextInput → DialogPromptBuilder → LLM → TextChunking → TTS → Audio Out
//                                    ↓
//                              TextAggregator → StateUpdate → (loop)
//

export class InworldGraphWrapper {
  graph: Graph;

  private constructor({ graph }: { graph: Graph }) {
    this.graph = graph;
  }

  async destroy() {
    await this.graph.stop();
  }

  static async create(props: CreateGraphPropsInterface) {
    const {
      apiKey,
      llmModelName,
      llmProvider,
      voiceId,
      connections,
      withAudioInput = false,
      ttsModelId,
    } = props;

    // Create unique postfix based on audio input and unique ID (for graph recreation)
    const uniqueId = props.uniqueId || 1;
    let postfix = withAudioInput ? '-with-audio-input' : '-with-text-input';
    if (withAudioInput) {
      postfix += `-assembly-ai-${uniqueId}`;
    }

    const dialogPromptBuilderNode = new DialogPromptBuilderNode({
      id: `dialog-prompt-builder-node${postfix}`,
    });

    const textInputNode = new TextInputNode({
      id: `text-input-node${postfix}`,
      connections,
      reportToClient: true,
    });

    const llmNode = new RemoteLLMChatNode({
      id: `llm-node${postfix}`,
      provider: llmProvider,
      modelName: llmModelName,
      stream: true,
      textGenerationConfig: TEXT_CONFIG,
    });

    const textChunkingNode = new TextChunkingNode({
      id: `text-chunking-node${postfix}`,
    });

    const textAggregatorNode = new TextAggregatorNode({
      id: `text-aggregator-node${postfix}`,
    });

    const stateUpdateNode = new StateUpdateNode({
      id: `state-update-node${postfix}`,
      connections,
      reportToClient: true,
    });

    const ttsRequestBuilderNode = new TTSRequestBuilderNode({
      id: `tts-request-builder-node${postfix}`,
      connections,
    });

    const ttsNode = new RemoteTTSNode({
      id: `tts-node${postfix}`,
      speakerId: voiceId,
      modelId: ttsModelId,
      sampleRate: TTS_SAMPLE_RATE,
      temperature: 1.1,
      speakingRate: 1,
    });

    const graphName = `voice-agent${postfix}`;
    const graphBuilder = new GraphBuilder({
      id: graphName,
      apiKey,
      enableRemoteConfig: false,
    });

    graphBuilder
      .addNode(textInputNode)
      .addNode(dialogPromptBuilderNode)
      .addNode(llmNode)
      .addNode(textChunkingNode)
      .addNode(textAggregatorNode)
      .addNode(ttsRequestBuilderNode)
      .addNode(ttsNode)
      .addNode(stateUpdateNode)
      .addEdge(textInputNode, dialogPromptBuilderNode)
      .addEdge(dialogPromptBuilderNode, llmNode)
      .addEdge(llmNode, textChunkingNode)
      .addEdge(textChunkingNode, ttsRequestBuilderNode)
      .addEdge(ttsRequestBuilderNode, ttsNode)
      .addEdge(llmNode, textAggregatorNode)
      .addEdge(textAggregatorNode, stateUpdateNode);

    if (withAudioInput) {
      // Validate configuration
      if (!props.assemblyAIApiKey) {
        throw new Error(
          'Assembly.AI API key is required for audio processing pipeline',
        );
      }
      if (!props.vadClient) {
        throw new Error('VAD client is required for audio processing pipeline');
      }

      // Audio input node
      const audioInputNode = new ProxyNode();
      const interactionQueueNode = new InteractionQueueNode();

      console.log('Building graph with Assembly.AI STT pipeline');

      const assemblyAISTTNode = new AssemblyAISTTWebSocketNode({
        id: `assembly-ai-stt-ws-node${postfix}`,
        config: {
          apiKey: props.assemblyAIApiKey!,
          connections: connections,
          vadClient: props.vadClient,
          sampleRate: INPUT_SAMPLE_RATE,
          formatTurns: false,
          // Increased thresholds to give users more time to pause without cutting off
          endOfTurnConfidenceThreshold: 0.6, // Higher = needs more confidence user is done (was 0.4)
          minEndOfTurnSilenceWhenConfident: 500, // 500ms minimum silence (was 160ms)
          maxTurnSilence: 2500, // 2.5 seconds max silence before ending turn (was 1280ms)
        },
      });

      const transcriptExtractorNode = new TranscriptExtractorNode({
        id: `transcript-extractor-node${postfix}`,
        reportToClient: true,
        disableAutoInterruption: props.disableAutoInterruption,
      });

      const speechCompleteNotifierNode = new SpeechCompleteNotifierNode({
        id: `speech-complete-notifier-node${postfix}`,
      });

      // CONTINUOUS GRAPH: Loops back to STT after each turn completes
      // Audio stream stays alive throughout the session for multi-turn conversations
      graphBuilder
        .addNode(audioInputNode)
        .addNode(assemblyAISTTNode)
        .addNode(transcriptExtractorNode)
        .addNode(speechCompleteNotifierNode)
        .addNode(interactionQueueNode)
        .addEdge(audioInputNode, assemblyAISTTNode)
        // STT continuously processes audio, looping back when not complete
        .addEdge(assemblyAISTTNode, assemblyAISTTNode, {
          condition: async (input: any) => {
            // Loop back to continue processing audio until turn is complete
            return input?.interaction_complete !== true;
          },
          loop: true,
        })
        .addEdge(assemblyAISTTNode, speechCompleteNotifierNode, {
          condition: async (input: any) => {
            return input?.interaction_complete === true;
          },
        })
        .addEdge(assemblyAISTTNode, transcriptExtractorNode, {
          condition: async (input: any) => {
            return input?.interaction_complete === true;
          },
        })
        .addEdge(transcriptExtractorNode, interactionQueueNode)
        .addEdge(interactionQueueNode, textInputNode, {
          condition: (input: TextInput) => {
            return !!(input.text && input.text.trim().length > 0);
          },
        })
        // Loop back from StateUpdate to STT node to wait for next user turn
        // This keeps the audio stream alive and processing
        .addEdge(stateUpdateNode, assemblyAISTTNode, {
          loop: true,
        })
        .setStartNode(audioInputNode);
    } else {
      graphBuilder.setStartNode(textInputNode);
      // Text-only graph (no audio loop) - set end node so it completes after TTS
      graphBuilder.setEndNode(ttsNode);
    }

    // NOTE: For audio input graphs, we DON'T set an end node
    // This allows the graph to keep running and loop back to STT for multi-turn conversations

    const graph = graphBuilder.build();
    if (props.graphVisualizationEnabled) {
      const graphPath = path.join(os.tmpdir(), `${graphName}.png`);
      console.log(
        `Graph visualization will be saved to ${graphPath}`,
      );
    }

    return new InworldGraphWrapper({
      graph,
    });
  }
}
