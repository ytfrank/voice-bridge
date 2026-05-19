/**
 * useAudioRecording - manages audio recording with chunking
 * Phase 1: State machine + ordered queue + segment tracking + error recovery
 */

import { useRef, useCallback, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAudioRecorder, useAudioRecorderState, RecordingOptions, setAudioModeAsync, IOSOutputFormat, AudioQuality } from 'expo-audio';
import {
  CHUNK_DURATION_MS,
  CLIENT_CHUNK_MIN_PEAK_DB,
  SENTENCE_END_REGEX,
  PAUSE_THRESHOLD_MS,
  MIN_TRANSLATABLE_TEXT_LENGTH,
  LOW_SIGNAL_FILLERS,
} from '../constants/audio';
import { API } from '../constants/api';
import { useTranscriptStore } from '../store/transcriptStore';
import { transcribeAudio, TranscriptionResult } from '../services/transcriptionService';
import { translateText, translateTextStream } from '../services/translationService';
import { RecordingStateMachine, RecordingState } from '../utils/recordingStateMachine';
import { OrderedChunkQueue } from '../utils/orderedChunkQueue';
import { pipelineLogger } from '../utils/pipelineLogger';
import { wsService } from '../services/websocketService';
import { analytics } from '../services/analyticsService';

const WATCHDOG_INTERVAL_MS = 30000;
const RECOVERY_DELAY_MS = 500;
const BACKGROUND_RECOVERY_DELAY_MS = 1500;

// Recording options for expo-audio
const recordingOptions: RecordingOptions = {
  isMeteringEnabled: true,
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

function normalizeTranscriptionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function shouldSkipTranslation(text: string): { skip: boolean; reason?: string } {
  const normalized = normalizeTranscriptionText(text);
  const lowered = normalized.toLowerCase();
  const tokens = lowered.split(/\s+/).filter(Boolean);

  if (!normalized) {
    return { skip: true, reason: 'empty_text' };
  }

  if (normalized.length < MIN_TRANSLATABLE_TEXT_LENGTH) {
    return { skip: true, reason: 'too_short' };
  }

  if (tokens.length === 1 && LOW_SIGNAL_FILLERS.has(tokens[0])) {
    return { skip: true, reason: 'filler_only' };
  }

  if (/^(.)\1{5,}$/i.test(lowered.replace(/\s+/g, ''))) {
    return { skip: true, reason: 'repeated_chars' };
  }

  return { skip: false };
}

function shouldSkipAsrResult(result: TranscriptionResult, text: string): { skip: boolean; reason: string } {
  const decision = result.qualityDecision?.toUpperCase();
  if (result.skipped) {
    return { skip: true, reason: result.reason || result.reasons?.join(', ') || decision || 'backend_skipped' };
  }

  if (decision && decision !== 'PASS') {
    return { skip: true, reason: result.reason || result.reasons?.join(', ') || decision };
  }

  if (!text) {
    return { skip: true, reason: result.reason || 'empty_text' };
  }

  return { skip: false, reason: '' };
}

function shouldSkipClientChunk(peakMeteringDb: number | null): { skip: boolean; reason?: string } {
  if (peakMeteringDb === null || !Number.isFinite(peakMeteringDb)) return { skip: false };
  if (peakMeteringDb <= CLIENT_CHUNK_MIN_PEAK_DB) {
    return { skip: true, reason: 'client_low_signal' };
  }
  return { skip: false };
}

async function configureRecordingAudioMode() {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    shouldPlayInBackground: false,
  });
}

export function useAudioRecording() {
  const recorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(recorder, 200);
  const cycleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateSubscriptionRef = useRef<ReturnType<typeof AppState.addEventListener> | null>(null);
  const sentenceBufferRef = useRef<string>('');
  const segmentIdsBufferRef = useRef<number[]>([]);
  const lastTextTimeRef = useRef<number>(0);
  const lastChunkTimeRef = useRef<number>(Date.now());
  const lastTranscribeTimeRef = useRef<number>(0);
  const segmentCounterRef = useRef<number>(0);
  const isCycleRunningRef = useRef<boolean>(false);
  const stopRequestedRef = useRef<boolean>(false);
  const isStartStopBusyRef = useRef<boolean>(false);
  const currentChunkPeakDbRef = useRef<number | null>(null);

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

  useEffect(() => {
    const metering = recorderState.metering;
    if (typeof metering !== 'number' || !Number.isFinite(metering)) return;
    currentChunkPeakDbRef.current = Math.max(currentChunkPeakDbRef.current ?? metering, metering);
  }, [recorderState.metering]);

  const clearCycleTimer = useCallback(() => {
    if (cycleTimeoutRef.current) {
      clearTimeout(cycleTimeoutRef.current);
      cycleTimeoutRef.current = null;
    }
  }, []);

  const scheduleNextCycle = useCallback(() => {
    clearCycleTimer();
    if (stopRequestedRef.current) return;
    const sm = stateMachineRef.current;
    if (!sm.isRecording()) return;
    cycleTimeoutRef.current = setTimeout(() => {
      void cycleRecording();
    }, CHUNK_DURATION_MS);
  }, [clearCycleTimer]);

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
    async (sentence: string, segmentIds: number[], transcribeTime?: number) => {
      const normalizedSentence = normalizeTranscriptionText(sentence);
      if (!normalizedSentence) return;

      const translationGuard = shouldSkipTranslation(normalizedSentence);
      addTranscriptLine(normalizedSentence);

      if (translationGuard.skip) {
        analytics.track('translate_result', {
          segmentIds,
          skipped: true,
          reason: translationGuard.reason,
          textLength: normalizedSentence.length,
          textPreview: normalizedSentence.slice(0, 120),
        });
        if (segmentIds.length > 0) {
          pipelineLogger.log(segmentIds[0], 'translate_error', {
            skipped: true,
            reason: translationGuard.reason,
            text: normalizedSentence.slice(0, 60),
          });
        }
        const sm = stateMachineRef.current;
        if (sm.isRecording()) {
          setPipelineStatus('listening');
        }
        return;
      }

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
          textLength: normalizedSentence.length,
          textPreview: normalizedSentence.slice(0, 120),
        },
        requestId
      );

      if (segmentIds.length > 0) {
        pipelineLogger.log(segmentIds[0], 'translate_start', { sentence: normalizedSentence, requestId, sessionId });
      }

      addTranslation({
        id,
        segmentIds,
        englishText: normalizedSentence,
        chineseTranslation: '',
        words: [],
        timestamp: Date.now(),
        ...(transcribeTime !== undefined ? { transcribeTime } : {}),
      });

      try {
        const streamTranslation = await translateTextStream(
          normalizedSentence,
          (partial: string) => {
            updateTranslation(id, { chineseTranslation: partial });
          },
          { requestId, sessionId, segmentIds }
        );

        const translateTime = Date.now() - t0;
        const totalLatency = (transcribeTime ?? 0) + translateTime;

        updateTranslation(id, {
          chineseTranslation: streamTranslation || '翻译失败',
          translateTime,
          totalLatency,
        });

        analytics.track(
          'translate_result',
          {
            segmentIds,
            latencyMs: translateTime,
            textLength: normalizedSentence.length,
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
        try {
          const result = await translateText(normalizedSentence, { requestId, sessionId, segmentIds });
          const fallbackTranslateTime = Date.now() - t0;
          updateTranslation(id, {
            chineseTranslation: result.translation,
            words: result.words,
            translateTime: fallbackTranslateTime,
            totalLatency: (transcribeTime ?? 0) + fallbackTranslateTime,
          });
          analytics.track(
            'translate_result',
            {
              segmentIds,
              latencyMs: Date.now() - t0,
              textLength: normalizedSentence.length,
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
      let result: TranscriptionResult = { text: '', status: 0 };
      try {
        result = await transcribeAudio(uri, { segmentId, requestId, sessionId });
      } catch (asrErr) {
        analytics.trackError(asrErr, { phase: 'asr', segmentId, uriSuffix: uri.slice(-30) }, requestId);
        pipelineLogger.log(segmentId, 'asr_error', { error: String(asrErr).substring(0, 80), requestId });
        const sm = stateMachineRef.current;
        if (sm.isRecording()) setPipelineStatus('listening');
        return;
      }
      const transcribeTime = Date.now() - t0;
      lastTranscribeTimeRef.current = transcribeTime;
      const text = normalizeTranscriptionText(result.text || '');
      const asrGuard = shouldSkipAsrResult(result, text);

      if (asrGuard.skip) {
        // Skipped/blocked backend results must not enter subtitle or translation UI.
        analytics.track(
          'asr_result',
          {
            segmentId,
            latencyMs: transcribeTime,
            textLength: 0,
            empty: !text,
            skipped: true,
            reason: asrGuard.reason,
            qualityDecision: result.qualityDecision,
            status: result.status,
          },
          requestId
        );
        pipelineLogger.log(segmentId, 'asr_empty', {
          transcribeTime,
          requestId,
          skipped: true,
          reason: asrGuard.reason,
          qualityDecision: result.qualityDecision,
          status: result.status,
        });
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
          skipped: Boolean(result.skipped),
          reason: result.reason,
          qualityDecision: result.qualityDecision,
          status: result.status,
        },
        requestId
      );
      pipelineLogger.log(segmentId, 'asr_done', {
        ms: transcribeTime,
        text: text.substring(0, 60),
        requestId,
        skipped: Boolean(result.skipped),
        reason: result.reason,
        qualityDecision: result.qualityDecision,
      });

      lastTextTimeRef.current = Date.now();
      appendTranscript(text);
      segmentIdsBufferRef.current.push(segmentId);
      sentenceBufferRef.current += (sentenceBufferRef.current ? ' ' : '') + text;

      if (SENTENCE_END_REGEX.test(sentenceBufferRef.current)) {
        const sentence = sentenceBufferRef.current;
        const segIds = [...segmentIdsBufferRef.current];
        sentenceBufferRef.current = '';
        segmentIdsBufferRef.current = [];
        clearCurrentTranscript();
        void processSentence(sentence, segIds, transcribeTime);
      } else {
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
        pipelineLogger.log(-1, 'recovery_fail', { reason: 'max_retries', retryCount: sm.getRetryCount() });
        return false;
      }

      setPipelineStatus('retrying');
      pipelineLogger.log(-1, 'recovery_attempt', { retryCount: sm.getRetryCount() });
      console.log(`[Recovery] Attempting recovery (retry ${sm.getRetryCount()})`);

      await sleep(RECOVERY_DELAY_MS);

      try {
        await configureRecordingAudioMode();
        if (!sm.transition(RecordingState.PREPARING)) return false;
        await recorder.prepareToRecordAsync(recordingOptions);

        if (!sm.transition(RecordingState.RECORDING)) return false;
        currentChunkPeakDbRef.current = null;
        recorder.record();

        setPipelineStatus('listening');
        pipelineLogger.log(-1, 'recovery_success', {});
        scheduleNextCycle();
        console.log('[Recovery] Success, recording resumed');
        return true;
      } catch (retryErr) {
        console.error('[Recovery] Failed:', retryErr);
        sm.transition(RecordingState.ERROR);
        pipelineLogger.log(-1, 'recovery_fail', { error: String(retryErr).substring(0, 120) });
        return false;
      }
    },
    [recorder, scheduleNextCycle, setPipelineStatus]
  );

  /**
   * Cycle recording: stop current, start new, process chunk via ordered queue
   */
  const cycleRecording = useCallback(async () => {
    const sm = stateMachineRef.current;
    if (isCycleRunningRef.current || stopRequestedRef.current || !sm.isRecording()) return;

    isCycleRunningRef.current = true;

    try {
      const timeSinceLastText = Date.now() - lastTextTimeRef.current;
      if (timeSinceLastText > PAUSE_THRESHOLD_MS && sentenceBufferRef.current.trim()) {
        const sentence = sentenceBufferRef.current;
        const segIds = [...segmentIdsBufferRef.current];
        sentenceBufferRef.current = '';
        segmentIdsBufferRef.current = [];
        clearCurrentTranscript();
        void processSentence(sentence, segIds, lastTranscribeTimeRef.current || undefined);
      }

      if (!sm.transition(RecordingState.STOPPING)) return;
      await recorder.stop();
      const uri = recorder.uri;

      if (uri) {
        lastChunkTimeRef.current = Date.now();
        const segId = nextSegmentId();
        const peakMeteringDb = currentChunkPeakDbRef.current;
        const clientGuard = shouldSkipClientChunk(peakMeteringDb);
        analytics.track('chunk_generated', {
          segmentId: segId,
          uriSuffix: uri.substring(uri.length - 30),
          chunkDurationMs: CHUNK_DURATION_MS,
          peakMeteringDb,
          skipped: clientGuard.skip,
          reason: clientGuard.reason,
        });
        pipelineLogger.log(segId, 'chunk_recorded', {
          uri: uri.substring(uri.length - 30),
          chunkMs: CHUNK_DURATION_MS,
          peakMeteringDb,
        });
        if (clientGuard.skip) {
          pipelineLogger.log(segId, 'chunk_skipped', { reason: clientGuard.reason, peakMeteringDb });
        } else {
          pipelineLogger.log(segId, 'queue_enqueue');
          chunkQueueRef.current?.enqueue(segId, uri);
        }
      } else {
        pipelineLogger.log(-1, 'chunk_skipped', { reason: 'no_uri' });
      }

      if (stopRequestedRef.current) {
        if (sm.getState() === RecordingState.STOPPING) {
          sm.transition(RecordingState.IDLE);
        }
        return;
      }

      await configureRecordingAudioMode();
      if (!sm.transition(RecordingState.PREPARING)) return;
      await recorder.prepareToRecordAsync(recordingOptions);

      if (!sm.transition(RecordingState.RECORDING)) return;
      currentChunkPeakDbRef.current = null;
      recorder.record();
      scheduleNextCycle();
    } catch (err) {
      console.error('[Cycle] Error:', err);
      analytics.trackError(err, { phase: 'cycle_recording' });
      sm.transition(RecordingState.ERROR);

      const recovered = await attemptRecovery(sm);
      if (!recovered) {
        setPipelineStatus('error');
        clearCycleTimer();
        setRecording(false);
        sm.transition(RecordingState.IDLE);
      }
    } finally {
      isCycleRunningRef.current = false;
    }
  }, [
    recorder,
    nextSegmentId,
    clearCurrentTranscript,
    processSentence,
    attemptRecovery,
    setPipelineStatus,
    setRecording,
    clearCycleTimer,
    scheduleNextCycle,
  ]);

  /**
   * Start recording
   */
  const startRecording = useCallback(async () => {
    const sm = stateMachineRef.current;
    if (isStartStopBusyRef.current || !sm.isIdle()) return;
    isStartStopBusyRef.current = true;

    try {
      sm.reset();
      stopRequestedRef.current = false;
      isCycleRunningRef.current = false;
      segmentCounterRef.current = 0;
      sentenceBufferRef.current = '';
      segmentIdsBufferRef.current = [];
      lastTextTimeRef.current = Date.now();
      lastTranscribeTimeRef.current = 0;
      pipelineLogger.reset();
      clearCurrentTranscript();

      const sessionId = analytics.getSessionId();

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

      chunkQueueRef.current = new OrderedChunkQueue(processChunk);

      await configureRecordingAudioMode();

      if (!sm.transition(RecordingState.PREPARING)) {
        throw new Error('Failed to transition to PREPARING');
      }

      await recorder.prepareToRecordAsync(recordingOptions);

      if (!sm.transition(RecordingState.RECORDING)) {
        throw new Error('Failed to transition to RECORDING');
      }

      currentChunkPeakDbRef.current = null;
      recorder.record();
      setRecording(true);
      setSessionStartTime(Date.now());
      setSessionDurationMs(null);
      setPipelineStatus('listening');

      wsService.connect(API.WS);

      lastChunkTimeRef.current = Date.now();
      scheduleNextCycle();

      watchdogRef.current = setInterval(async () => {
        const watchdogSm = stateMachineRef.current;
        if (!watchdogSm.isRecording()) return;
        const elapsed = Date.now() - lastChunkTimeRef.current;
        if (elapsed > WATCHDOG_INTERVAL_MS) {
          pipelineLogger.log(-1, 'watchdog_trigger', { elapsedMs: elapsed });
          watchdogSm.transition(RecordingState.ERROR);
          const recovered = await attemptRecovery(watchdogSm);
          if (recovered) {
            lastChunkTimeRef.current = Date.now();
          } else {
            setPipelineStatus('error');
            clearCycleTimer();
            if (watchdogRef.current) {
              clearInterval(watchdogRef.current);
              watchdogRef.current = null;
            }
            setRecording(false);
            watchdogSm.transition(RecordingState.IDLE);
          }
        }
      }, WATCHDOG_INTERVAL_MS);

      appStateSubscriptionRef.current = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        if (nextState === 'background' || nextState === 'inactive') {
          pipelineLogger.log(-1, 'app_background', { state: nextState });
          clearCycleTimer();
          return;
        }

        if (nextState === 'active') {
          setTimeout(async () => {
            if (stopRequestedRef.current) return;
            const activeSm = stateMachineRef.current;
            if (activeSm.isRecording()) {
              scheduleNextCycle();
              setPipelineStatus('listening');
              pipelineLogger.log(-1, 'audio_resumed_from_background', { recovered: false });
              return;
            }

            if (activeSm.getState() === RecordingState.ERROR) {
              const recovered = await attemptRecovery(activeSm);
              if (recovered) {
                setPipelineStatus('listening');
                pipelineLogger.log(-1, 'audio_resumed_from_background', { recovered: true });
              }
            }
          }, BACKGROUND_RECOVERY_DELAY_MS);
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
    } finally {
      isStartStopBusyRef.current = false;
    }
  }, [
    recorder,
    setRecording,
    setSessionStartTime,
    setSessionDurationMs,
    setPipelineStatus,
    processChunk,
    attemptRecovery,
    clearCycleTimer,
    clearCurrentTranscript,
    scheduleNextCycle,
  ]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(async () => {
    const sm = stateMachineRef.current;
    if (isStartStopBusyRef.current) return;
    isStartStopBusyRef.current = true;
    stopRequestedRef.current = true;

    try {
      clearCycleTimer();

      for (let i = 0; i < 20 && isCycleRunningRef.current; i++) {
        await sleep(100);
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

      if (sm.isRecording()) {
        sm.transition(RecordingState.STOPPING);
        await recorder.stop();
        const uri = recorder.uri;

        if (uri) {
          const segId = nextSegmentId();
          const peakMeteringDb = currentChunkPeakDbRef.current;
          const clientGuard = shouldSkipClientChunk(peakMeteringDb);
          pipelineLogger.log(segId, 'chunk_recorded', { uri: uri.substring(uri.length - 30), final: true, peakMeteringDb });
          if (clientGuard.skip) {
            pipelineLogger.log(segId, 'chunk_skipped', { final: true, reason: clientGuard.reason, peakMeteringDb });
          } else {
            pipelineLogger.log(segId, 'queue_enqueue', { final: true });
            chunkQueueRef.current?.enqueue(segId, uri);
          }
        }
      }

      if (sentenceBufferRef.current.trim()) {
        const sentence = sentenceBufferRef.current;
        const segIds = [...segmentIdsBufferRef.current];
        sentenceBufferRef.current = '';
        segmentIdsBufferRef.current = [];
        clearCurrentTranscript();
        await processSentence(sentence, segIds, lastTranscribeTimeRef.current || undefined);
      }

      sm.transition(RecordingState.IDLE);
      setRecording(false);
      const startedAt = useTranscriptStore.getState().sessionStartTime;
      const sessionDurationMs = startedAt ? Date.now() - startedAt : null;
      setSessionDurationMs(sessionDurationMs);
      setPipelineStatus('idle');
      analytics.track('recording_stop', { sessionDurationMs, pendingSentence: false });

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
    } finally {
      isCycleRunningRef.current = false;
      isStartStopBusyRef.current = false;
    }
  }, [
    recorder,
    setRecording,
    setSessionDurationMs,
    setPipelineStatus,
    nextSegmentId,
    clearCurrentTranscript,
    processSentence,
    clearCycleTimer,
  ]);

  return { startRecording, stopRecording };
}
