/**
 * useAudioRecording - manages audio recording with chunking
 * Phase 1: State machine + ordered queue + segment tracking + error recovery
 */

import { useRef, useCallback } from 'react';
import { useAudioRecorder, RecordingOptions, setAudioModeAsync, IOSOutputFormat, AudioQuality } from 'expo-audio';
import { CHUNK_DURATION_MS, SENTENCE_END_REGEX, PAUSE_THRESHOLD_MS } from '../constants/audio';
import { useTranscriptStore } from '../store/transcriptStore';
import { transcribeAudio } from '../services/transcriptionService';
import { translateText } from '../services/translationService';
import { RecordingStateMachine, RecordingState } from '../utils/recordingStateMachine';
import { OrderedChunkQueue } from '../utils/orderedChunkQueue';
import { pipelineLogger } from '../utils/pipelineLogger';

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

export function useAudioRecording() {
  const recorder = useAudioRecorder(recordingOptions);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentenceBufferRef = useRef<string>('');
  const segmentIdsBufferRef = useRef<number[]>([]);
  const lastTextTimeRef = useRef<number>(0);
  const segmentCounterRef = useRef<number>(0);

  const stateMachineRef = useRef<RecordingStateMachine>(
    new RecordingStateMachine(3)
  );
  const chunkQueueRef = useRef<OrderedChunkQueue | null>(null);

  const {
    setRecording,
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

      // Log translate start for first segment
      if (segmentIds.length > 0) {
        pipelineLogger.log(segmentIds[0], 'translate_start', { sentence: sentence.trim() });
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
        const result = await translateText(sentence.trim());
        const translateTime = Date.now() - t0;

        updateTranslation(id, {
          chineseTranslation: result.translation,
          words: result.words,
          translateTime,
        });

        if (segmentIds.length > 0) {
          pipelineLogger.log(segmentIds[0], 'translate_done', {
            translateTime,
            translation: result.translation.substring(0, 50),
          });
        }
      } catch (err) {
        console.error('Translation failed:', err);
        updateTranslation(id, { chineseTranslation: '翻译失败' });
        if (segmentIds.length > 0) {
          pipelineLogger.log(segmentIds[0], 'error', { phase: 'translate', error: String(err) });
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
      pipelineLogger.log(segmentId, 'asr_start');

      const t0 = Date.now();
      const text = await transcribeAudio(uri, segmentId);
      const transcribeTime = Date.now() - t0;

      pipelineLogger.log(segmentId, 'asr_done', { transcribeTime, text: text.substring(0, 80) });

      if (!text.trim()) {
        // No speech detected, back to listening
        const sm = stateMachineRef.current;
        if (sm.isRecording()) {
          setPipelineStatus('listening');
        }
        return;
      }

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
        const segId = nextSegmentId();
        pipelineLogger.log(segId, 'chunk_recorded', { uri });
        chunkQueueRef.current?.enqueue(segId, uri);
      }

      // STOPPING → PREPARING → RECORDING
      if (!sm.transition(RecordingState.PREPARING)) return;
      await recorder.prepareToRecordAsync(recordingOptions);

      if (!sm.transition(RecordingState.RECORDING)) return;
      recorder.record();
    } catch (err) {
      console.error('[Cycle] Error:', err);
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
      setPipelineStatus('listening');

      // Start chunk cycle timer
      timerRef.current = setInterval(cycleRecording, CHUNK_DURATION_MS);

      console.log('[Start] Recording started successfully');
    } catch (err) {
      console.error('[Start] Error:', err);
      sm.transition(RecordingState.ERROR);
      sm.transition(RecordingState.IDLE);
      setRecording(false);
      setPipelineStatus('error');
    }
  }, [recorder, setRecording, setPipelineStatus, cycleRecording, processChunk]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(async () => {
    const sm = stateMachineRef.current;

    try {
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

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
      setPipelineStatus('idle');

      console.log('[Stop] Recording stopped');
    } catch (err) {
      console.error('[Stop] Error:', err);
      sm.reset();
      setRecording(false);
      setPipelineStatus('idle');
    }
  }, [recorder, setRecording, setPipelineStatus, nextSegmentId, clearCurrentTranscript, processSentence]);

  return { startRecording, stopRecording };
}
