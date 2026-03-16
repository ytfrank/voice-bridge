/**
 * useAudioRecording - manages audio recording with chunking
 * Records in .m4a format, splits into 2.5s chunks for ASR processing.
 */

import { useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { CHUNK_DURATION_MS, RECORDING_OPTIONS } from '../constants/audio';
import { useTranscriptStore } from '../store/transcriptStore';
import { transcribeAudio } from '../services/transcriptionService';
import { translateText } from '../services/translationService';
import { SENTENCE_END_REGEX, PAUSE_THRESHOLD_MS } from '../constants/audio';

export function useAudioRecording() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentenceBufferRef = useRef<string>('');
  const lastTextTimeRef = useRef<number>(0);

  const {
    setRecording,
    appendTranscript,
    addTranscriptLine,
    addTranslation,
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

    try {
      const result = await translateText(sentence.trim());
      addTranslation({
        id: Date.now().toString(),
        englishText: sentence.trim(),
        chineseTranslation: result.translation,
        words: result.words,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setTranslating(false);
    }
  }, [addTranscriptLine, addTranslation, setTranslating]);

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
    if (!recordingRef.current) return;

    try {
      // Check for pause-based sentence boundary
      const timeSinceLastText = Date.now() - lastTextTimeRef.current;
      if (timeSinceLastText > PAUSE_THRESHOLD_MS && sentenceBufferRef.current.trim()) {
        const sentence = sentenceBufferRef.current;
        sentenceBufferRef.current = '';
        clearCurrentTranscript();
        processSentence(sentence);
      }

      // Stop current recording
      const currentRecording = recordingRef.current;
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      // Immediately start new recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        RECORDING_OPTIONS as any
      );
      recordingRef.current = newRecording;

      // Process the completed chunk asynchronously
      if (uri) {
        processChunk(uri).catch(console.error);
      }
    } catch (err) {
      console.error('Cycle recording error:', err);
    }
  }, [processChunk, clearCurrentTranscript, processSentence]);

  /**
   * Start recording
   */
  const startRecording = useCallback(async () => {
    try {
      // Request permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        console.error('Microphone permission not granted');
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start first recording
      const { recording } = await Audio.Recording.createAsync(
        RECORDING_OPTIONS as any
      );
      recordingRef.current = recording;
      sentenceBufferRef.current = '';
      lastTextTimeRef.current = Date.now();
      setRecording(true);

      // Start chunk cycle timer
      timerRef.current = setInterval(cycleRecording, CHUNK_DURATION_MS);
    } catch (err) {
      console.error('Start recording error:', err);
      setRecording(false);
    }
  }, [setRecording, cycleRecording]);

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
      if (recordingRef.current) {
        const currentRecording = recordingRef.current;
        recordingRef.current = null;
        await currentRecording.stopAndUnloadAsync();
        const uri = currentRecording.getURI();

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
  }, [setRecording, processChunk, clearCurrentTranscript, processSentence]);

  return { startRecording, stopRecording };
}
