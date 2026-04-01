/**
 * useAudioRecording - manages audio recording with chunking
 * Phase 1: State machine + ordered queue + segment tracking + error recovery
 */

import { useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAudioRecorder, RecordingOptions, setAudioModeAsync, IOSOutputFormat, AudioQuality } from 'expo-audio';
import { CHUNK_DURATION_MS, SENTENCE_END_REGEX, PAUSE_THRESHOLD_MS } from '../constants/audio';
import { API } from '../constants/api';
import { useTranscriptStore } from '../store/transcriptStore';
import { transcribeAudio } from '../services/transcriptionService';
import { translateText, translateTextStream } from '../services/translationService';
import { RecordingStateMachine, RecordingState } from '../utils/recordingStateMachine';
import { OrderedChunkQueue } from '../utils/orderedChunkQueue';
import { pipelineLogger } from '../utils/pipelineLogger';
import { wsService } from '../services/websocketService';
import { analytics } from '../services/analyticsService';

const WATCHDOG_INTERVAL_MS = 30000;

const RECOVERY_DELAY_MS = 500;

// Recording options for expo-audio
const recordingOptions: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 44100,
  },
  ios: {
    extension: '.m4a',
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
    sampleRate: 44100,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Note: empty audio filtering is done server-side (backend/server.js checks <1KB)
// Frontend FileSystem.getInfoAsync is unreliable with expo-audio URIs

export function useAudioRecording() {
  const recorder = useAudioRecorder(recordingOptions);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateSubscriptionRef = useRef<ReturnType<typeof AppState.addEventListener> | null>(null);
  const sentenceBufferRef = useRef<string>('');
  const segmentIdsBufferRef = useRef<number[]>([]);
  const lastTextTimeRef = useRef<number>(0);
  const lastChunkTimeRef = useRef<number>(Date.now());
  const segmentCounterRef = useRef<number>(0);

  const stateMachineRef = useRef<RecordingStateMachine>(
    new RecordingStateMachine(3)
  );
  const chunkQueueRef = useRef<OrderedChunkQueue | null>(null);

  const {
    setRecording,
    setSessionStartTime,
    setSessionDurationMs,
    setPipelineStatus,
    appendTranscript,
    addTranscriptLine,
    addTranslation,
    updateTranslation,
    setTranslating,
    clearCurrentTranscript,
  } = useTranscriptStore();

  /**
   * Get next segment ID (monotonically increasing)
   */
  const nextSegmentId = useCallback((): number => {
    return segmentCounterRef.current++;
  }, []);

  /**
   * Process a completed sentence - translate it
   */
  const processSentence = useCallback(
    async (sentence: string, segmentIds: number[]) => {
      if (!sentence.trim()) return;

      addTranscriptLine(sentence.trim());
      setTranslating(true);
      setPipelineStatus('translating');

      const id = Date.now().toString();
      const t0 = Date.now();
      const requestId = analytics.nextRequestId('translate');
      const sessionId = analytics.getSessionId();

      analytics.track(
        'translation_requested',
        {
          segmentIds,
          textLength: sentence.trim().length,
          textPreview: sentence.trim().slice(0, 120),
        },
        requestId
      );

      // Log translate start for first segment
      if (segmentIds.length > 0) {
        pipelineLogger.log(segmentIds[0], 'translate_start', { sentence: sentence.trim(), requestId, sessionId });
      }

      addTranslation({
        id,
        segmentIds,
        englishText: sentence.trim(),
        chineseTranslation: '',
        words: [],
        timestamp: Date.now(),
      });

      try {
        // Use streaming translation for faster perceived response
        const streamTranslation = await translateTextStream(
          sentence.trim(),
          (partial: string) => {
            // Update translation incrementally as tokens arrive
            updateTranslation(id, { chineseTranslation: partial });
          },
          { requestId, sessionId, segmentIds }
        );

        const translateTime = Date.now() - t0;

        // Final update with complete translation
        updateTranslation(id, {
          chineseTranslation: streamTranslation || '翻译失败',
          translateTime,
        });

        analytics.track(
          'translate_result',
          {
            segmentIds,
            latencyMs: translateTime,
            textLength: sentence.trim().length,
            translationLength: (streamTranslation || '').length,
            translationPreview: (streamTranslation || '').slice(0, 120),
          },
          requestId
        );

        if (segmentIds.length > 0) {
          pipelineLogger.log(segmentIds[0], 'translate_done', {
            translateTime,
            translation: (streamTranslation || '').substring(0, 50),
            requestId,
          });
        }
      } catch (err) {
        console.error('Translation failed:', err);
        // Fallback to non-streaming
        try {
          const result = await translateText(sentence.trim(), { requestId, sessionId, segmentIds });
          updateTranslation(id, {
            chineseTranslation: result.translation,
            words: result.words,
            translateTime: Date.now() - t0,
          });
          analytics.track(
            'translate_result',
            {
              segmentIds,
              latencyMs: Date.now() - t0,
              textLength: sentence.trim().length,
              translationLength: result.translation.length,
              translationPreview: result.translation.slice(0, 120),
              fallback: true,
            },
            requestId
          );
        } catch {
          updateTranslation(id, { chineseTranslation: '翻译失败' });
        }
        analytics.trackError(err, { phase: 'translate', segmentIds }, requestId);
        if (segmentIds.length > 0) {
          pipelineLogger.log(segmentIds[0], 'error', { phase: 'translate', error: String(err), requestId });
        }
      } finally {
        setTranslating(false);
        // Only set back to listening if still recording
        const sm = stateMachineRef.current;
        if (sm.isRecording()) {
          setPipelineStatus('listening');
        }
      }
    },
    [addTranscriptLine, addTranslation, updateTranslation, setTranslating, setPipelineStatus]
  );

  /**
   * Process an audio chunk - transcribe and detect sentences
   * Called in order by OrderedChunkQueue
   */
  const processChunk = useCallback(
    async (segmentId: number, uri: string) => {
      setPipelineStatus('recognizing');
      pipelineLogger.log(segmentId, 'asr_start', { uri: uri.substring(uri.length - 25) });

      const t0 = Date.now();
      const requestId = analytics.nextRequestId('asr');
      const sessionId = analytics.getSessionId();
      let text = '';
      try {
        text = await transcribeAudio(uri, { segmentId, requestId, sessionId });
      } catch (asrErr) {
        analytics.trackError(asrErr, { phase: 'asr', segmentId, uriSuffix: uri.slice(-30) }, requestId);
        pipelineLogger.log(segmentId, 'asr_error', { error: String(asrErr).substring(0, 80), requestId });
        const sm = stateMachineRef.current;
        if (sm.isRecording()) setPipelineStatus('listening');
        return;
      }
      const transcribeTime = Date.now() - t0;

      if (!text.trim()) {
        analytics.track('asr_result', { segmentId, latencyMs: transcribeTime, textLength: 0, empty: true }, requestId);
        pipelineLogger.log(segmentId, 'asr_empty', { transcribeTime, requestId });
        const sm = stateMachineRef.current;
        if (sm.isRecording()) {
          setPipelineStatus('listening');
        }
        return;
      }

      analytics.track(
        'asr_result',
        {
          segmentId,
          latencyMs: transcribeTime,
          textLength: text.length,
          textPreview: text.substring(0, 120),
        },
        requestId
      );
      pipelineLogger.log(segmentId, 'asr_done', { ms: transcribeTime, text: text.substring(0, 60), requestId });

      lastTextTimeRef.current = Date.now();
      appendTranscript(text);

      // Accumulate segment IDs for sentence tracking
      segmentIdsBufferRef.current.push(segmentId);
      sentenceBufferRef.current += (sentenceBufferRef.current ? ' ' : '') + text;

      // Check for sentence boundary
      if (SENTENCE_END_REGEX.test(sentenceBufferRef.current)) {
        const sentence = sentenceBufferRef.current;
        const segIds = [...segmentIdsBufferRef.current];
        sentenceBufferRef.current = '';
        segmentIdsBufferRef.current = [];
        clearCurrentTranscript();
        processSentence(sentence, segIds);
      } else {
        // Still accumulating, show listening
        const sm = stateMachineRef.current;
        if (sm.isRecording()) {
          setPipelineStatus('listening');
        }
      }
    },
    [appendTranscript, clearCurrentTranscript, processSentence, setPipelineStatus]
  );

  /**
   * Attempt to recover from error state
   */
  const attemptRecovery = useCallback(
    async (sm: RecordingStateMachine): Promise<boolean> => {
      if (!sm.canRetry()) {
        console.error(`[Recovery] Max retries (${sm.getRetryCount()}) reached, stopping`);
        return false;
      }

      setPipelineStatus('retrying');
      console.log(`[Recovery] Attempting recovery (retry ${sm.getRetryCount()})`);

      await sleep(RECOVERY_DELAY_MS);

      try {
        if (!sm.transition(RecordingState.PREPARING)) return false;
        await recorder.prepareToRecordAsync(recordingOptions);

        if (!sm.transition(RecordingState.RECORDING)) return false;
        recorder.record();

        setPipelineStatus('listening');
        console.log('[Recovery] Success, recording resumed');
        return true;
      } catch (retryErr) {
        console.error('[Recovery] Failed:', retryErr);
        sm.transition(RecordingState.ERROR);
        return false;
      }
    },
    [recorder, setPipelineStatus]
  );

  /**
   * Cycle recording: stop current, start new, process chunk via ordered queue
   */
  const cycleRecording = useCallback(async () => {
    const sm = stateMachineRef.current;
    if (!sm.isRecording()) return;

    try {
      // Check for pause-based sentence boundary
      const timeSinceLastText = Date.now() - lastTextTimeRef.current;
      if (timeSinceLastText > PAUSE_THRESHOLD_MS && sentenceBufferRef.current.trim()) {
        const sentence = sentenceBufferRef.current;
        const segIds = [...segmentIdsBufferRef.current];
        sentenceBufferRef.current = '';
        segmentIdsBufferRef.current = [];
        clearCurrentTranscript();
        processSentence(sentence, segIds);
      }

      // RECORDING → STOPPING
      if (!sm.transition(RecordingState.STOPPING)) return;
      await recorder.stop();
      const uri = recorder.uri;

      // Enqueue chunk for ordered processing
      if (uri) {
        lastChunkTimeRef.current = Date.now();
        const segId = nextSegmentId();
        analytics.track('chunk_generated', {
          segmentId: segId,
          uriSuffix: uri.substring(uri.length - 30),
          chunkDurationMs: CHUNK_DURATION_MS,
        });
        pipelineLogger.log(segId, 'chunk_recorded', { uri: uri.substring(uri.length - 30) });
        pipelineLogger.log(segId, 'queue_enqueue');
        chunkQueueRef.current?.enqueue(segId, uri);
      } else {
        pipelineLogger.log(-1, 'chunk_skipped', { reason: 'no_uri' });
      }

      // STOPPING → PREPARING → RECORDING
      if (!sm.transition(RecordingState.PREPARING)) return;
      await recorder.prepareToRecordAsync(recordingOptions);

      if (!sm.transition(RecordingState.RECORDING)) return;
      recorder.record();
    } catch (err) {
      console.error('[Cycle] Error:', err);
      analytics.trackError(err, { phase: 'cycle_recording' });
      sm.transition(RecordingState.ERROR);

      // Attempt recovery
      const recovered = await attemptRecovery(sm);
      if (!recovered) {
        setPipelineStatus('error');
        // Stop recording gracefully
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecording(false);
        sm.transition(RecordingState.IDLE);
      }
    }
  }, [recorder, nextSegmentId, clearCurrentTranscript, processSentence, attemptRecovery, setPipelineStatus, setRecording]);

  /**
   * Start recording
   */
  const startRecording = useCallback(async () => {
    const sm = stateMachineRef.current;

    try {
      // Reset state
      sm.reset();
      segmentCounterRef.current = 0;
      sentenceBufferRef.current = '';
      segmentIdsBufferRef.current = [];
      lastTextTimeRef.current = Date.now();
      pipelineLogger.reset();

      const sessionId = analytics.getSessionId();

      // Log environment info for debugging
      pipelineLogger.log(-1, 'env_info', {
        chunkMs: CHUNK_DURATION_MS,
        bffUrl: API?.TRANSCRIBE || 'not_set',
        sessionId,
      });
      analytics.track('recording_start', {
        audioConfig: {
          sampleRate: recordingOptions.sampleRate,
          extension: recordingOptions.extension,
          bitRate: recordingOptions.bitRate,
          channels: recordingOptions.numberOfChannels,
        },
        chunkDurationMs: CHUNK_DURATION_MS,
      });

      // Initialize ordered queue
      chunkQueueRef.current = new OrderedChunkQueue(processChunk);

      // Configure audio mode for iOS
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
      });

      // IDLE → PREPARING
      if (!sm.transition(RecordingState.PREPARING)) {
        throw new Error('Failed to transition to PREPARING');
      }

      await recorder.prepareToRecordAsync(recordingOptions);

      // PREPARING → RECORDING
      if (!sm.transition(RecordingState.RECORDING)) {
        throw new Error('Failed to transition to RECORDING');
      }

      recorder.record();
      setRecording(true);
      setSessionStartTime(Date.now());
      setSessionDurationMs(null);
      setPipelineStatus('listening');

      // Connect WebSocket heartbeat
      wsService.connect(API.WS);

      // Start chunk cycle timer
      timerRef.current = setInterval(cycleRecording, CHUNK_DURATION_MS);

      // Start watchdog: if no new chunk for 30s while recording, attempt recovery
      lastChunkTimeRef.current = Date.now();
      watchdogRef.current = setInterval(async () => {
        const sm = stateMachineRef.current;
        if (!sm.isRecording()) return;
        const elapsed = Date.now() - lastChunkTimeRef.current;
        if (elapsed > WATCHDOG_INTERVAL_MS) {
          pipelineLogger.log(-1, 'watchdog_trigger', { elapsedMs: elapsed });
          sm.transition(RecordingState.ERROR);
          const recovered = await attemptRecovery(sm);
          if (recovered) {
            lastChunkTimeRef.current = Date.now();
          } else {
            setPipelineStatus('error');
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            if (watchdogRef.current) {
              clearInterval(watchdogRef.current);
              watchdogRef.current = null;
            }
            setRecording(false);
            sm.transition(RecordingState.IDLE);
          }
        }
      }, WATCHDOG_INTERVAL_MS);

      // Handle app background / call interruption
      appStateSubscriptionRef.current = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        if (nextState === 'background' || nextState === 'inactive') {
          setPipelineStatus('idle');
          pipelineLogger.log(-1, 'app_background', {});
        } else if (nextState === 'active') {
          setTimeout(async () => {
            const sm = stateMachineRef.current;
            if (!sm.isRecording() && sm.getState() === RecordingState.ERROR) {
              const recovered = await attemptRecovery(sm);
              if (recovered) {
                setPipelineStatus('listening');
                pipelineLogger.log(-1, 'audio_resumed_from_background', {});
              }
            }
          }, 5000);
        }
      });

      console.log('[Start] Recording started successfully');
    } catch (err) {
      console.error('[Start] Error:', err);
      analytics.trackError(err, { phase: 'start_recording' });
      sm.transition(RecordingState.ERROR);
      sm.transition(RecordingState.IDLE);
      setRecording(false);
      setPipelineStatus('error');
    }
  }, [recorder, setRecording, setSessionStartTime, setSessionDurationMs, setPipelineStatus, cycleRecording, processChunk]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(async () => {
    const sm = stateMachineRef.current;

    try {
      // Clear timers and subscriptions
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (appStateSubscriptionRef.current) {
        appStateSubscriptionRef.current.remove();
        appStateSubscriptionRef.current = null;
      }
      wsService.disconnect();

      // Stop recording if active
      if (sm.isRecording() || sm.getState() === RecordingState.PREPARING) {
        sm.transition(RecordingState.STOPPING);
        await recorder.stop();
        const uri = recorder.uri;

        // Process final chunk
        if (uri) {
          const segId = nextSegmentId();
          pipelineLogger.log(segId, 'chunk_recorded', { uri, final: true });
          chunkQueueRef.current?.enqueue(segId, uri);
        }
      }

      // Process any remaining sentence buffer
      if (sentenceBufferRef.current.trim()) {
        const sentence = sentenceBufferRef.current;
        const segIds = [...segmentIdsBufferRef.current];
        sentenceBufferRef.current = '';
        segmentIdsBufferRef.current = [];
        clearCurrentTranscript();
        processSentence(sentence, segIds);
      }

      sm.transition(RecordingState.IDLE);
      setRecording(false);
      const startedAt = useTranscriptStore.getState().sessionStartTime;
      const sessionDurationMs = startedAt ? Date.now() - startedAt : null;
      setSessionDurationMs(sessionDurationMs);
      setPipelineStatus('idle');
      analytics.track('recording_stop', { sessionDurationMs, pendingSentence: !!sentenceBufferRef.current.trim() });

      console.log('[Stop] Recording stopped');
    } catch (err) {
      console.error('[Stop] Error:', err);
      analytics.trackError(err, { phase: 'stop_recording' });
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (appStateSubscriptionRef.current) {
        appStateSubscriptionRef.current.remove();
        appStateSubscriptionRef.current = null;
      }
      wsService.disconnect();
      sm.reset();
      setRecording(false);
      setPipelineStatus('idle');
    }
  }, [recorder, setRecording, setSessionDurationMs, setPipelineStatus, nextSegmentId, clearCurrentTranscript, processSentence]);

  return { startRecording, stopRecording };
}
