/**
 * Zustand store for transcript and translation state
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
  englishText: string;
  chineseTranslation: string;
  words: VocabularyWord[];
  timestamp: number;
}

interface TranscriptState {
  // Recording state
  isRecording: boolean;
  setRecording: (v: boolean) => void;

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
  isTranslating: boolean;
  setTranslating: (v: boolean) => void;

  // Selected word (for card popup)
  selectedWord: VocabularyWord | null;
  setSelectedWord: (w: VocabularyWord | null) => void;

  // Reset
  reset: () => void;
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  isRecording: false,
  setRecording: (v) => set({ isRecording: v }),

  currentTranscript: '',
  appendTranscript: (text) =>
    set((s) => ({ currentTranscript: s.currentTranscript + (s.currentTranscript ? ' ' : '') + text })),
  clearCurrentTranscript: () => set({ currentTranscript: '' }),

  transcriptLines: [],
  addTranscriptLine: (line) =>
    set((s) => ({ transcriptLines: [...s.transcriptLines, line] })),

  translations: [],
  addTranslation: (entry) =>
    set((s) => ({ translations: [...s.translations, entry] })),
  isTranslating: false,
  setTranslating: (v) => set({ isTranslating: v }),

  selectedWord: null,
  setSelectedWord: (w) => set({ selectedWord: w }),

  reset: () =>
    set({
      isRecording: false,
      currentTranscript: '',
      transcriptLines: [],
      translations: [],
      isTranslating: false,
      selectedWord: null,
    }),
}));
