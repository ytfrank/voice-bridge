/**
 * Audio recording configuration constants
 */

const chunkDurationFromEnv = Number(process.env.EXPO_PUBLIC_CHUNK_DURATION_MS);

// Chunk duration in milliseconds.
// Default stays conservative for accuracy, but Phase 1 allows shorter client-driven chunks via env.
export const CHUNK_DURATION_MS =
  Number.isFinite(chunkDurationFromEnv) && chunkDurationFromEnv >= 1500 && chunkDurationFromEnv <= 5000
    ? chunkDurationFromEnv
    : 5000;

// Minimum audio file size in bytes — below this is empty/silent, skip sending
export const MIN_AUDIO_SIZE = 2048;

// Silence threshold in dB — below this is silence (expo-audio metering range: -160 to 0)
export const SILENCE_THRESHOLD_DB = -50;

// Recording options for expo-av (.m4a format)
export const RECORDING_OPTIONS = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 2, // MPEG_4
    audioEncoder: 3, // AAC
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'aac' as const,
    audioQuality: 127, // MAX
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

// Sentence detection
export const SENTENCE_END_REGEX = /[.!?。！？]\s*$/;
export const PAUSE_THRESHOLD_MS = 1000; // brief pause flush for unfinished sentence

// Client-side quality guard before translation.
export const MIN_TRANSLATABLE_TEXT_LENGTH = 3;
export const LOW_SIGNAL_FILLERS = new Set([
  'oh',
  'ah',
  'uh',
  'um',
  'huh',
  'mm',
  'hmm',
  'erm',
  'uhh',
  'hmm.',
  'oh.',
  'ah.',
]);
