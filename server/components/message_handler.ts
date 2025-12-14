import { GraphOutputStream, GraphTypes } from '@inworld/runtime/graph';
import { v4 } from 'uuid';
import { RawData } from 'ws';

import { INPUT_SAMPLE_RATE } from '../constants';
import { AudioStreamInput, EVENT_TYPE, TextInput } from '../types';
import { Connection } from '../types';
import { InworldApp } from './app';
import { AudioStreamManager } from './audio_stream_manager';
import { EventFactory } from './event_factory';
import { InworldGraphWrapper } from './graph';

export class MessageHandler {
  private INPUT_SAMPLE_RATE = INPUT_SAMPLE_RATE;
  private interruptionEnabled: boolean;
  private currentInteractionId: string = v4();

  // Keep track of the processing queue to avoid concurrent execution of the graph
  // within the same session.
  private processingQueue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  constructor(
    private inworldApp: InworldApp,
    private send: (data: any) => void,
  ) {
    this.interruptionEnabled = inworldApp.interruptionEnabled;
  }

  private createNewInteraction(logMessage: string): string {
    this.currentInteractionId = v4();
    console.log(logMessage, this.currentInteractionId);
    this.send(
      EventFactory.newInteraction(
        this.currentInteractionId,
        this.interruptionEnabled,
      ),
    );
    return this.currentInteractionId;
  }

  async handleMessage(data: RawData, sessionId: string) {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'text':
      case EVENT_TYPE.TEXT:
        this.createNewInteraction('Starting a new interaction from text input');
        const textInteractionId = this.currentInteractionId;

        // Handle [START] trigger specially - bypass LLM and use fixed greeting
        const isStartTrigger = message.text?.trim().toLowerCase() === '[start]';
        if (isStartTrigger) {
          console.log('📢 [START] trigger received - generating initial greeting');
          const connection = this.inworldApp.connections[sessionId];
          if (connection) {
            const experienceType = connection.state.experienceType || 'greeting-card';
            const greetingText = this.inworldApp.getInitialGreeting(experienceType);
            
            // Add greeting as assistant message to conversation history
            connection.state.messages.push({
              role: 'assistant',
              content: greetingText,
              id: textInteractionId,
            });
            
            // Use the greeting text directly instead of [START]
            const textInput: TextInput = {
              text: greetingText,
              interactionId: textInteractionId,
              sessionId,
            };
            
            // Execute TTS-only graph for the greeting
            this.addToQueue(() =>
              this.executeGreeting({
                sessionId,
                greetingText,
                interactionId: textInteractionId,
              }),
            );
            break;
          }
        }

        const textInput: TextInput = {
          text: message.text,
          interactionId: textInteractionId,
          sessionId,
        };

        // Use shared text graph
        // Voice is selected dynamically by TTSRequestBuilderNode based on session state
        this.addToQueue(() =>
          this.executeGraph({
            sessionId,
            input: textInput,
            interactionId: textInteractionId,
            graphWrapper: this.inworldApp.graphWithTextInput,
          }),
        );
        break;

      case 'audio':
      case EVENT_TYPE.AUDIO:
        // Process audio chunk - send to graph for VAD + STT processing
        await this.processAudioChunk(message, sessionId);
        break;

      case EVENT_TYPE.AUDIO_SESSION_END:
        console.log('Audio session ended for sessionId:', sessionId);
        const audioConnection = this.inworldApp.connections[sessionId];
        if (audioConnection?.audioStreamManager) {
          console.log('Ending audio stream for sessionId:', sessionId);
          audioConnection.audioStreamManager.end();

          if (audioConnection.currentAudioGraphExecution) {
            await audioConnection.currentAudioGraphExecution;
          }
        }
        break;
    }
  }

  private async executeGraph({
    sessionId,
    input,
    interactionId,
    graphWrapper,
  }: {
    sessionId: string;
    input: TextInput;
    interactionId: string;
    graphWrapper: InworldGraphWrapper;
  }) {
    const connection = this.inworldApp.connections[sessionId];
    if (!connection) {
      throw new Error(`Failed to get connection for sessionId:${sessionId}`);
    }

    const { outputStream } = await graphWrapper.graph.start(input, {
      dataStoreContent: {
        sessionId: input.sessionId,
        state: connection.state,
      },
    });

    await this.handleResponse(outputStream, interactionId, connection, sessionId);
    this.send(EventFactory.interactionEnd(interactionId));
  }

  private async executeGreeting({
    sessionId,
    greetingText,
    interactionId,
  }: {
    sessionId: string;
    greetingText: string;
    interactionId: string;
  }) {
    const connection = this.inworldApp.connections[sessionId];
    if (!connection) {
      throw new Error(`Failed to get connection for sessionId:${sessionId}`);
    }

    console.log(`📢 Generating TTS for greeting: "${greetingText}"`);

    try {
      // Import TTS components dynamically
      const { RemoteTTSNode, SequentialGraphBuilder } = await import('@inworld/runtime/graph');
      
      // Get the voice ID from the connection state
      const voiceId = connection.state.voiceId || 'christmas_story_generator__female_elf_narrator';
      
      const graphBuilder = new SequentialGraphBuilder({
        id: `greeting-tts-${Date.now()}`,
        apiKey: process.env.INWORLD_API_KEY,
        enableRemoteConfig: false,
        nodes: [
          new RemoteTTSNode({
            speakerId: voiceId,
            modelId: process.env.TTS_MODEL_ID || 'inworld-tts-1',
            sampleRate: 24000,
            temperature: 1.1,
            speakingRate: 1,
            reportToClient: true,
          }),
        ],
      });

      const graph = graphBuilder.build();
      const { outputStream } = await graph.start(greetingText);

      // Send text packet first
      const textPacket = EventFactory.text(greetingText, interactionId, {
        isAgent: true,
        name: connection.state.agent?.id || 'elf',
      });
      this.send(textPacket);

      // Process TTS output
      for await (const result of outputStream) {
        await result.processResponse({
          TTSOutputStream: async (ttsStream: any) => {
            for await (const chunk of ttsStream) {
              if (!chunk.audio?.data) continue;

              let audioBuffer: Buffer;
              if (Array.isArray(chunk.audio.data)) {
                audioBuffer = Buffer.from(chunk.audio.data);
              } else if (typeof chunk.audio.data === 'string') {
                audioBuffer = Buffer.from(chunk.audio.data, 'base64');
              } else if (Buffer.isBuffer(chunk.audio.data)) {
                audioBuffer = chunk.audio.data;
              } else {
                continue;
              }

              if (audioBuffer.byteLength === 0) continue;

              this.send(
                EventFactory.audio(
                  audioBuffer.toString('base64'),
                  interactionId,
                  textPacket.packetId.utteranceId,
                ),
              );
            }
          },
          default: () => {},
        });
      }

      console.log(`✅ Greeting TTS complete for session ${sessionId}`);
    } catch (error) {
      console.error(`❌ Error generating greeting TTS:`, error);
      // Still send the text even if TTS fails
      this.send(EventFactory.text(greetingText, interactionId, {
        isAgent: true,
        name: connection.state.agent?.id || 'elf',
      }));
    }

    this.send(EventFactory.interactionEnd(interactionId));
  }

  private async processAudioChunk(message: any, sessionId: string) {
    try {
      const connection = this.inworldApp.connections[sessionId];
      if (!connection) {
        console.error(`No connection found for sessionId: ${sessionId}`);
        return;
      }

      // Flatten audio array into single buffer
      const audioData: number[] = [];
      for (let i = 0; i < message.audio.length; i++) {
        Object.values(message.audio[i]).forEach((value) => {
          audioData.push(value as number);
        });
      }
      
      // Log audio stats occasionally
      const conn = connection as any;
      if (!conn._audioChunkCount) conn._audioChunkCount = 0;
      conn._audioChunkCount++;
      if (conn._audioChunkCount === 1) {
        // Calculate RMS to check if there's actual audio
        let sumSquares = 0;
        for (let i = 0; i < Math.min(audioData.length, 1600); i++) {
          sumSquares += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sumSquares / Math.min(audioData.length, 1600));
        console.log(`[Session ${sessionId}] First audio chunk - samples: ${audioData.length}, RMS: ${rms.toFixed(6)}`);
      }

      // Initialize audio stream manager if not already present
      if (!connection.audioStreamManager) {
        connection.audioStreamManager = new AudioStreamManager();

        const audioStreamInput: AudioStreamInput = {
          state: connection.state,
          sessionId,
        };

        // Get a fresh audio graph for this session
        const graphWrapper = await this.inworldApp.getGraphForSTTService(
          connection.sttService,
          sessionId,
        );

        // Start graph execution in the background
        connection.currentAudioGraphExecution =
          this.executeGraphWithAudioStream({
            sessionId,
            input: audioStreamInput,
            graphWrapper,
            audioStreamManager: connection.audioStreamManager,
          }).catch((error) => {
            console.error('Error in audio graph execution:', error);
            if (connection.audioStreamManager) {
              connection.audioStreamManager.end();
              connection.audioStreamManager = undefined;
            }
            connection.currentAudioGraphExecution = undefined;
          });
      }

      // Push the audio chunk to the stream
      connection.audioStreamManager.pushChunk({
        data: audioData,
        sampleRate: this.INPUT_SAMPLE_RATE,
      });
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  }

  private async executeGraphWithAudioStream({
    sessionId,
    input,
    graphWrapper,
    audioStreamManager,
  }: {
    sessionId: string;
    input: AudioStreamInput;
    graphWrapper: InworldGraphWrapper;
    audioStreamManager: AudioStreamManager;
  }) {
    // Create audio stream generator
    async function* audioStreamGenerator() {
      for await (const audioChunk of audioStreamManager.createStream()) {
        yield audioChunk;
      }
    }

    const taggedStream = Object.assign(audioStreamGenerator(), {
      _iw_type: 'Audio',
    });

    const { outputStream } = await graphWrapper.graph.start(taggedStream, {
      dataStoreContent: {
        sessionId: input.sessionId,
        state: input.state,
      },
    });

    const connection = this.inworldApp.connections[sessionId];
    if (!connection) {
      throw new Error(`Failed to get connection for sessionId:${sessionId}`);
    }

    // Handle multiple interactions from the stream (from release/0.8)
    try {
      let currentGraphInteractionId: string | undefined = undefined;
      let resultCount = 0;

      console.log(`[Session ${sessionId}] 🔄 Starting to iterate over outputStream...`);
      for await (const result of outputStream) {
        resultCount++;
        const resultType = result?.data?.constructor?.name || typeof result?.data;
        console.log(
          `[Session ${sessionId}] Processing audio interaction ${resultCount} from stream (type: ${resultType})`,
        );

        // Check if result contains an error
        if (result && result.isGraphError && result.isGraphError()) {
          const errorData = result.data;
          console.error(
            `[Session ${sessionId}] Received error result from graph:`,
            errorData?.message || errorData,
            'Code:',
            errorData?.code,
          );

          // Check if this is a timeout error (code 4 = DEADLINE_EXCEEDED)
          const isTimeout =
            errorData?.code === 4 || errorData?.message?.includes('timed out');

          // Send error to client
          const effectiveInteractionId = currentGraphInteractionId || v4();
          const errorObj = new Error(
            errorData?.message || 'Graph processing error',
          );
          this.send(EventFactory.error(errorObj, effectiveInteractionId));

          // For timeout errors, close the audio session
          if (isTimeout) {
            console.error(
              `[Session ${sessionId}] ⚠️ TIMEOUT DETECTED - Closing audio session`,
            );

            // End the audio stream
            if (audioStreamManager) {
              audioStreamManager.end();
            }

            // Stop processing - don't continue with more results
            outputStream.abort();
            break;
          }

          // For non-timeout errors, continue processing other results
          continue;
        }

        currentGraphInteractionId = await this.processSingleResult(
          result,
          undefined,
          connection,
          sessionId,
          currentGraphInteractionId,
        );

        if (currentGraphInteractionId) {
          this.send(EventFactory.interactionEnd(currentGraphInteractionId));
        }
      }

      console.log(
        `[Session ${sessionId}] Audio stream processing complete - processed ${resultCount} result(s)`,
      );
    } catch (error) {
      console.error('Error processing audio stream interactions:', error);
      throw error;
    } finally {
      // Clean up stream manager
      console.log(`[Session ${sessionId}] 🧹 Audio graph execution ended`);
      connection.audioStreamManager = undefined;
      connection.currentAudioGraphExecution = undefined;
    }
  }

  private async processSingleResult(
    result: any,
    interactionId: string | undefined,
    connection: Connection,
    sessionId: string,
    currentGraphInteractionId: string | undefined,
  ): Promise<string | undefined> {
    // Check for interaction mismatch (interruption)
    if (
      this.interruptionEnabled &&
      interactionId &&
      this.currentInteractionId !== interactionId
    ) {
      console.log(
        'Interaction ID mismatch, skipping response',
        this.currentInteractionId,
        interactionId,
      );
      return currentGraphInteractionId;
    }

    const resultType = result?.data?.constructor?.name || typeof result?.data;
    console.log(`[Session ${sessionId}] Processing result type: ${resultType}`);

    try {
      await result.processResponse({
        TTSOutputStream: async (ttsStream: GraphTypes.TTSOutputStream) => {
          let ttsChunkCount = 0;
          let totalTextLength = 0;
          console.log(`[Session ${sessionId}] 🎵 TTS stream started (interruptionEnabled: ${this.interruptionEnabled})`);
          
          try {
            for await (const chunk of ttsStream) {
              ttsChunkCount++;
              
              // Check interruption inside TTS loop
              const checkInteractionId = interactionId || currentGraphInteractionId;
              if (
                this.interruptionEnabled &&
                checkInteractionId &&
                this.currentInteractionId !== checkInteractionId
              ) {
                console.log(
                  `[Session ${sessionId}] ⚠️ TTS INTERRUPTED - ID mismatch after ${ttsChunkCount} chunks`,
                  'current:', this.currentInteractionId,
                  'processing:', checkInteractionId,
                );
                return;
              }

              // Simple buffer conversion (matching greeting TTS approach)
              // The TTS already outputs properly formatted audio - no need to re-encode
              if (!chunk.audio?.data) {
                console.log(`[Session ${sessionId}] TTS chunk ${ttsChunkCount} has no audio data`);
                continue;
              }

              let audioBuffer: Buffer;
              if (Array.isArray(chunk.audio.data)) {
                audioBuffer = Buffer.from(chunk.audio.data);
              } else if (typeof chunk.audio.data === 'string') {
                audioBuffer = Buffer.from(chunk.audio.data, 'base64');
              } else if (Buffer.isBuffer(chunk.audio.data)) {
                audioBuffer = chunk.audio.data;
              } else {
                console.log(`[Session ${sessionId}] TTS chunk ${ttsChunkCount} has unknown data type`);
                continue;
              }

              if (audioBuffer.byteLength === 0) {
                console.log(`[Session ${sessionId}] TTS chunk ${ttsChunkCount} has empty buffer`);
                continue;
              }

              totalTextLength += (chunk.text || '').length;
              const effectiveInteractionId = currentGraphInteractionId || v4();
              const textPacket = EventFactory.text(
                chunk.text || '',
                effectiveInteractionId,
                {
                  isAgent: true,
                  name: connection.state.agent.id,
                },
              );

              this.send(
                EventFactory.audio(
                  audioBuffer.toString('base64'),
                  effectiveInteractionId,
                  textPacket.packetId.utteranceId,
                ),
              );
              this.send(textPacket);
            }
            
            console.log(`[Session ${sessionId}] ✅ TTS stream completed: ${ttsChunkCount} chunks, ${totalTextLength} chars`);
          } catch (ttsError) {
            console.error(`[Session ${sessionId}] ❌ TTS stream error after ${ttsChunkCount} chunks:`, ttsError);
            throw ttsError;
          }
        },
        Custom: async (customData: GraphTypes.Custom<any>) => {
          // Check if it's SpeechCompleteEvent (from SpeechCompleteNotifierNode - VAD based)
          if (customData.type === 'SPEECH_COMPLETE') {
            // Use the full interactionId from the event (compound ID like "abc123#1")
            const effectiveInteractionId =
              customData.interactionId || String(customData.iteration);
            console.log(
              `User speech complete (VAD) - Interaction: ${effectiveInteractionId}, ` +
                `Iteration: ${customData.iteration}, Samples: ${customData.totalSamples}, Endpointing Latency: ${customData.endpointingLatencyMs}ms`,
            );

            // Send USER_SPEECH_COMPLETE event to client for latency tracking
            this.send(
              EventFactory.userSpeechComplete(effectiveInteractionId, {
                totalSamples: customData.totalSamples,
                sampleRate: customData.sampleRate,
                endpointingLatencyMs: customData.endpointingLatencyMs,
                source: 'VAD',
                iteration: customData.iteration,
              }),
            );
            return;
          }

          // Check if it's InteractionInfo (has isInterrupted property)
          if ('isInterrupted' in customData && customData.isInterrupted) {
            // InteractionInfo has interactionId field - use it directly
            const effectiveInteractionId =
              customData.interactionId || currentGraphInteractionId || v4();
            console.log(
              'Interruption detected, sending cancel to client for interactionId:',
              effectiveInteractionId,
            );
            // Send cancel event to client to stop audio playback
            this.send(EventFactory.cancelResponse(effectiveInteractionId));
            return;
          }

          // State updates (messages)
          if ('messages' in customData) {
            const text = customData.messages.at(-1).content;
            const role = customData.messages.at(-1).role;

            if (role === 'assistant') {
              return;
            }

            // Update the current graph interaction ID from the state
            // This captures the interactionId from TextInputNode or StateUpdateNode output
            currentGraphInteractionId = customData.interactionId;
            console.log(
              `Updated currentGraphInteractionId to: ${currentGraphInteractionId} (from ${role} message)`,
            );

            // Validate connection and state (matching release/0.8)
            if (connection?.unloaded) {
              throw Error(`Session unloaded for sessionId:${sessionId}`);
            }
            if (!connection) {
              throw Error(
                `Failed to read connection for sessionId:${sessionId}`,
              );
            }
            const state = connection.state;
            if (!state) {
              throw Error(
                `Failed to read state from connection for sessionId:${sessionId}`,
              );
            }

            this.send(
              EventFactory.text(text, currentGraphInteractionId || v4(), {
                isUser: role === 'user',
              }),
            );
          }
        },
        error: async (error: GraphTypes.GraphError) => {
          console.error(`[Session ${sessionId}] *** ERROR HANDLER CALLED ***`);
          console.error(
            `[Session ${sessionId}] Graph error:`,
            error.message,
            'Code:',
            error.code,
          );

          // Get effective interaction ID
          const effectiveInteractionId =
            currentGraphInteractionId || interactionId || v4();

          // Check if this is a timeout error
          // Code 4 = DEADLINE_EXCEEDED in gRPC/Abseil status codes
          const isTimeout =
            error.code === 4 || error.message.includes('timed out');

          // Don't send errors for empty speech recognition (common and expected)
          if (!error.message.includes('recognition produced no text')) {
            // Convert GraphError to Error for EventFactory
            const errorObj = new Error(error.message);
            this.send(EventFactory.error(errorObj, effectiveInteractionId));
            console.log(`[Session ${sessionId}] Error sent to client`);
          } else {
            console.log(`[Session ${sessionId}] Ignoring empty speech error`);
          }

          // For timeout errors, close audio session if active
          if (isTimeout) {
            console.error(
              `[Session ${sessionId}] ⚠️ NODE TIMEOUT DETECTED - Closing audio session`,
              '\n  Possible causes:',
              '\n  - Audio stream issues or delays',
              '\n  - STT service connectivity problems',
              '\n  - Slow processing in custom nodes',
              '\n  - Network latency to external services',
            );

            // Close audio session if it exists
            // Client will close microphone based on the error event already sent
            const audioConnection = this.inworldApp.connections[sessionId];
            if (audioConnection?.audioStreamManager) {
              console.log(
                `[Session ${sessionId}] Ending audio stream due to timeout`,
              );
              audioConnection.audioStreamManager.end();
            }
          }
        },
        default: (data: any) => {
          console.log('Unprocessed data', data);
        },
      });
    } catch (error) {
      // Catch any errors not handled by the error handler above
      console.error(
        `[Session ${sessionId}] *** CATCH BLOCK - Error processing result:***`,
        error,
      );

      const effectiveInteractionId =
        currentGraphInteractionId || interactionId || v4();

      // Send error to client if it's not about empty speech
      if (
        error instanceof Error &&
        !error.message.includes('recognition produced no text')
      ) {
        this.send(EventFactory.error(error, effectiveInteractionId));
        console.log(
          `[Session ${sessionId}] Error sent to client from catch block`,
        );
      }

      // Don't throw - let the processing continue for other results
      // Return the current interaction ID so the flow can continue
    }

    return currentGraphInteractionId;
  }

  private async handleResponse(
    outputStream: GraphOutputStream,
    interactionId: string | undefined,
    connection: Connection,
    sessionId: string,
  ): Promise<string | undefined> {
    // Track the actual interactionId being processed by the graph
    // This will be updated when we receive TextInputNode output
    let currentGraphInteractionId = interactionId;

    try {
      for await (const result of outputStream) {
        currentGraphInteractionId = await this.processSingleResult(
          result,
          interactionId,
          connection,
          sessionId,
          currentGraphInteractionId,
        );
      }
    } catch (error) {
      console.error(error);
      const effectiveInteractionId = currentGraphInteractionId || v4();
      const errorPacket = EventFactory.error(error as Error, effectiveInteractionId);
      // Ignore errors caused by empty speech.
      if (!errorPacket.error.includes('recognition produced no text')) {
        this.send(errorPacket);
      }
      return effectiveInteractionId;
    }

    return currentGraphInteractionId;
  }

  private addToQueue(task: () => Promise<void>) {
    this.processingQueue.push(task);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    while (this.processingQueue.length > 0) {
      const task = this.processingQueue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error('Error processing task from queue:', error);
        }
      }
    }
    this.isProcessing = false;
  }
}
