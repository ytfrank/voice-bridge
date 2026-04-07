/**
 * Zustand store for transcript and translation state
 * Includes pipeline status and segment tracking for Phase 1 stability optimization.
 */

import { create } from 'zustand';

export interface VocabularyWord {
  word: string;
  phonetic: string;
  homophone: string;
  meaning: string;
  example: string;
}

export interface TranslationEntry {
  id: string;
  segmentIds: number[];
  englishText: string;
  chineseTranslation: string;
  words: VocabularyWord[];
  timestamp: number;
  transcribeTime?: number;
  translateTime?: number;
}

export type PipelineStatus = 'idle' | 'listening' | 'recognizing' | 'translating' | 'error' | 'retrying';

interface TranscriptState {
  // Recording state
  isRecording: boolean;
  setRecording: (v: boolean) => void;
  sessionStartTime: number | null;
  setSessionStartTime: (v: number | null) => void;
  sessionDurationMs: number | null;
  setSessionDurationMs: (v: number | null) => void;

  // Pipeline status (6-state)
  pipelineStatus: PipelineStatus;
  setPipelineStatus: (s: PipelineStatus) => void;

  // Current partial transcript (being built from chunks)
  currentTranscript: string;
  appendTranscript: (text: string) => void;
  clearCurrentTranscript: () => void;

  // Full transcript lines (completed sentences)
  transcriptLines: string[];
  addTranscriptLine: (line: string) => void;

  // Translations
  translations: TranslationEntry[];
  addTranslation: (entry: TranslationEntry) => void;
  updateTranslation: (id: string, data: Partial<TranslationEntry>) => void;
  addStreamingTranslation: (id: string, partial: string) => void;
  isTranslating: boolean;
  setTranslating: (v: boolean) => void;

  // Accumulated vocabulary words (from all translations)
  allWords: VocabularyWord[];
  isVocabExpanded: boolean;
  setVocabExpanded: (v: boolean) => void;

  // Selected word (for card popup)
  selectedWord: VocabularyWord | null;
  setSelectedWord: (w: VocabularyWord | null) => void;

  // Skip notification (auto-cleared after display)
  skipNotification: string | null;
  showSkipNotification: (msg: string) => void;
  clearSkipNotification: () => void;

  // Reset
  reset: () => void;
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  isRecording: false,
  setRecording: (v) => set({ isRecording: v }),
  sessionStartTime: null,
  setSessionStartTime: (v) => set({ sessionStartTime: v }),
  sessionDurationMs: null,
  setSessionDurationMs: (v) => set({ sessionDurationMs: v }),

  pipelineStatus: 'idle' as PipelineStatus,
  setPipelineStatus: (s) => set({ pipelineStatus: s }),

  currentTranscript: '',
  appendTranscript: (text) =>
    set((s) => ({ currentTranscript: s.currentTranscript + (s.currentTranscript ? ' ' : '') + text })),
  clearCurrentTranscript: () => set({ currentTranscript: '' }),

  transcriptLines: [],
  addTranscriptLine: (line) =>
    set((s) => ({ transcriptLines: [...s.transcriptLines, line] })),

  translations: [],
  addTranslation: (entry) =>
    set((s) => ({
      translations: [...s.translations, entry],
      allWords: [...s.allWords, ...entry.words],
    })),
  updateTranslation: (id, data) =>
    set((s) => {
      const updated = s.translations.map((t) => (t.id === id ? { ...t, ...data } : t));
      const newWords = data.words ? data.words : [];
      return {
        translations: updated,
        allWords: newWords.length ? [...s.allWords, ...newWords] : s.allWords,
      };
    }),
  addStreamingTranslation: (id, partial) =>
    set((s) => ({
      translations: s.translations.map((t) =>
        t.id === id ? { ...t, chineseTranslation: partial } : t
      ),
    })),
  isTranslating: false,
  setTranslating: (v) => set({ isTranslating: v }),

  allWords: [],
  isVocabExpanded: false,
  setVocabExpanded: (v) => set({ isVocabExpanded: v }),

  selectedWord: null,
  setSelectedWord: (w) => set({ selectedWord: w }),

  skipNotification: null,
  showSkipNotification: (msg) => {
    set({ skipNotification: msg });
    setTimeout(() => set({ skipNotification: null }), 2500);
  },
  clearSkipNotification: () => set({ skipNotification: null }),

  reset: () =>
    set({
      isRecording: false,
      sessionStartTime: null,
      sessionDurationMs: null,
      pipelineStatus: 'idle' as PipelineStatus,
      currentTranscript: '',
      transcriptLines: [],
      translations: [],
      isTranslating: false,
      allWords: [],
      isVocabExpanded: false,
      selectedWord: null,
      skipNotification: null,
    }),
}));
