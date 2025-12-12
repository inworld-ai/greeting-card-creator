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
  private currentInteractionId: string = v4();

  // Keep track of the processing queue to avoid concurrent execution of the graph
  // within the same session.
  private processingQueue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  constructor(
    private inworldApp: InworldApp,
    private send: (data: any) => void,
  ) {}

  private createNewInteraction(logMessage: string): string {
    this.currentInteractionId = v4();
    console.log(logMessage, this.currentInteractionId);
    this.send(EventFactory.newInteraction(this.currentInteractionId));
    return this.currentInteractionId;
  }

  async handleMessage(data: RawData, sessionId: string) {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'text':
      case EVENT_TYPE.TEXT:
        this.createNewInteraction('Starting a new interaction from text input');
        const textInteractionId = this.currentInteractionId;

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

        // Get the audio graph (creates a fresh one per session)
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

    try {
      let currentGraphInteractionId: string | undefined = undefined;
      let resultCount = 0;

      for await (const result of outputStream) {
        resultCount++;
        console.log(
          `[Session ${sessionId}] Processing audio interaction ${resultCount} from stream`,
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

          const isTimeout =
            errorData?.code === 4 || errorData?.message?.includes('timed out');
          const isGraphNotRunning =
            errorData?.code === 9 || errorData?.message?.includes('Graph executor is not running');

          const effectiveInteractionId = currentGraphInteractionId || v4();
          const errorObj = new Error(
            errorData?.message || 'Graph processing error',
          );
          this.send(EventFactory.error(errorObj, effectiveInteractionId));

          if (isTimeout || isGraphNotRunning) {
            console.error(
              `[Session ${sessionId}] ⚠️ ${isTimeout ? 'TIMEOUT' : 'GRAPH NOT RUNNING'} DETECTED - Closing audio session and clearing graph`,
            );
            // Clear the session's graph
            this.inworldApp.clearGraphCache(sessionId);
            if (audioStreamManager) {
              audioStreamManager.end();
            }
            outputStream.abort();
            break;
          }
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
    const resultType = result?.data?.constructor?.name || typeof result?.data;
    console.log(`[Session ${sessionId}] Processing result type: ${resultType}`);

    try {
      await result.processResponse({
        TTSOutputStream: async (ttsStream: GraphTypes.TTSOutputStream) => {
          for await (const chunk of ttsStream) {
            if (!chunk.audio?.data) {
              console.warn(
                `[Session ${sessionId}] Skipping chunk with missing audio data`,
              );
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
              console.error(
                `[Session ${sessionId}] Unsupported audio data type:`,
                typeof chunk.audio.data,
              );
              continue;
            }

            if (audioBuffer.byteLength === 0) {
              console.warn(
                `[Session ${sessionId}] Skipping chunk with zero-length audio buffer`,
              );
              continue;
            }

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
        },
        Custom: async (customData: GraphTypes.Custom<any>) => {
          // Speech complete event
          if (customData.type === 'SPEECH_COMPLETE') {
            const effectiveInteractionId =
              customData.interactionId || String(customData.iteration);
            console.log(
              `User speech complete (VAD) - Interaction: ${effectiveInteractionId}`,
            );

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

          // Interruption detection
          if ('isInterrupted' in customData && customData.isInterrupted) {
            const effectiveInteractionId =
              customData.interactionId || currentGraphInteractionId || v4();
            console.log(
              'Interruption detected, sending cancel for interactionId:',
              effectiveInteractionId,
            );
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

            currentGraphInteractionId = customData.interactionId;
            console.log(
              `Updated currentGraphInteractionId to: ${currentGraphInteractionId} (from ${role} message)`,
            );

            if (connection?.unloaded) {
              throw Error(`Session unloaded for sessionId:${sessionId}`);
            }

            this.send(
              EventFactory.text(text, currentGraphInteractionId || v4(), {
                isUser: role === 'user',
              }),
            );
          }
        },
        error: async (error: GraphTypes.GraphError) => {
          console.error(`[Session ${sessionId}] Graph error:`, error.message);

          const effectiveInteractionId =
            currentGraphInteractionId || interactionId || v4();

          if (!error.message.includes('recognition produced no text')) {
            const errorObj = new Error(error.message);
            this.send(EventFactory.error(errorObj, effectiveInteractionId));
          }

          if (error.code === 4 || error.message.includes('timed out')) {
            const audioConnection = this.inworldApp.connections[sessionId];
            if (audioConnection?.audioStreamManager) {
              audioConnection.audioStreamManager.end();
            }
          }
        },
        default: (data: any) => {
          console.log('Unprocessed data', data);
        },
      });
    } catch (error) {
      console.error(
        `[Session ${sessionId}] Error processing result:`,
        error,
      );

      const effectiveInteractionId =
        currentGraphInteractionId || interactionId || v4();

      if (
        error instanceof Error &&
        !error.message.includes('recognition produced no text')
      ) {
        this.send(EventFactory.error(error, effectiveInteractionId));
      }
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
