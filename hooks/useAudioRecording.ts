/**
 * useAudioRecording - manages audio recording with chunking
 * Uses expo-audio (replaces deprecated expo-av)
 * Records in .m4a format, splits into 1.5s chunks for ASR processing.
 */

import { useRef, useCallback } from 'react';
import { useAudioRecorder, RecordingOptions, setAudioModeAsync, IOSOutputFormat, AudioQuality } from 'expo-audio';
import { CHUNK_DURATION_MS } from '../constants/audio';
import { useTranscriptStore } from '../store/transcriptStore';
import { transcribeAudio } from '../services/transcriptionService';
import { translateText, translateTextStream } from '../services/translationService';
import { SENTENCE_END_REGEX, PAUSE_THRESHOLD_MS } from '../constants/audio';

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

export function useAudioRecording() {
  const recorder = useAudioRecorder(recordingOptions);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentenceBufferRef = useRef<string>('');
  const lastTextTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);

  const {
    setRecording,
    appendTranscript,
    addTranscriptLine,
    addTranslation,
    updateTranslation,
    addStreamingTranslation,
    setTranslating,
    clearCurrentTranscript,
  } = useTranscriptStore();

  /**
   * Process a completed sentence - translate it
   */
  const processSentence = useCallback(async (sentence: string) => {
    if (!sentence.trim()) return;

    addTranscriptLine(sentence.trim());
    setTranslating(true);

    const id = Date.now().toString();
    // Add initial translation entry (empty, streaming will update)
    addTranslation({
      id,
      englishText: sentence.trim(),
      chineseTranslation: '',
      words: [],
      timestamp: Date.now(),
    });

    try {
      // Stream translation text for fast feedback
      await translateTextStream(sentence.trim(), (partial) => {
        addStreamingTranslation(id, partial);
      });

      // Fetch full translation + words for final result
      const result = await translateText(sentence.trim());
      updateTranslation(id, {
        chineseTranslation: result.translation,
        words: result.words,
      });
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setTranslating(false);
    }
  }, [addTranscriptLine, addTranslation, updateTranslation, addStreamingTranslation, setTranslating]);

  /**
   * Process an audio chunk - transcribe and detect sentences
   */
  const processChunk = useCallback(async (uri: string) => {
    const text = await transcribeAudio(uri);
    if (!text.trim()) return;

    lastTextTimeRef.current = Date.now();
    appendTranscript(text);
    sentenceBufferRef.current += (sentenceBufferRef.current ? ' ' : '') + text;

    // Check for sentence boundary
    if (SENTENCE_END_REGEX.test(sentenceBufferRef.current)) {
      const sentence = sentenceBufferRef.current;
      sentenceBufferRef.current = '';
      clearCurrentTranscript();
      processSentence(sentence);
    }
  }, [appendTranscript, clearCurrentTranscript, processSentence]);

  /**
   * Cycle recording: stop current, start new, process chunk async
   */
  const cycleRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;

    try {
      // Check for pause-based sentence boundary
      const timeSinceLastText = Date.now() - lastTextTimeRef.current;
      if (timeSinceLastText > PAUSE_THRESHOLD_MS && sentenceBufferRef.current.trim()) {
        const sentence = sentenceBufferRef.current;
        sentenceBufferRef.current = '';
        clearCurrentTranscript();
        processSentence(sentence);
      }

      // Stop current recording, get URI from recorder property
      await recorder.stop();
      const uri = recorder.uri;
      isRecordingRef.current = false;

      // Process the completed chunk asynchronously
      if (uri) {
        processChunk(uri).catch(console.error);
      }

      // Immediately start new recording
      await recorder.prepareToRecordAsync(recordingOptions);
      recorder.record();
      isRecordingRef.current = true;
    } catch (err) {
      console.error('Cycle recording error:', err);
    }
  }, [recorder, processChunk, clearCurrentTranscript, processSentence]);

  /**
   * Start recording
   */
  const startRecording = useCallback(async () => {
    try {
      // Configure audio mode for iOS
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
      });

      // Prepare and start recording
      await recorder.prepareToRecordAsync(recordingOptions);
      recorder.record();
      isRecordingRef.current = true;

      sentenceBufferRef.current = '';
      lastTextTimeRef.current = Date.now();
      setRecording(true);

      // Start chunk cycle timer
      timerRef.current = setInterval(cycleRecording, CHUNK_DURATION_MS);
    } catch (err) {
      console.error('Start recording error:', err);
      setRecording(false);
    }
  }, [recorder, setRecording, cycleRecording]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(async () => {
    try {
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop recording
      if (isRecordingRef.current) {
        await recorder.stop();
        const uri = recorder.uri;
        isRecordingRef.current = false;

        // Process final chunk
        if (uri) {
          await processChunk(uri);
        }
      }

      // Process any remaining sentence buffer
      if (sentenceBufferRef.current.trim()) {
        const sentence = sentenceBufferRef.current;
        sentenceBufferRef.current = '';
        clearCurrentTranscript();
        processSentence(sentence);
      }

      setRecording(false);
    } catch (err) {
      console.error('Stop recording error:', err);
      setRecording(false);
    }
  }, [recorder, setRecording, processChunk, clearCurrentTranscript, processSentence]);

  return { startRecording, stopRecording };
}
