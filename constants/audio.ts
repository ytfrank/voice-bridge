/**
 * Audio recording configuration constants
 */

// Chunk duration in milliseconds
// 5s gives best balance of accuracy vs latency (tested: 1s=20%, 3s=50%, 5s=65%+)
export const CHUNK_DURATION_MS = 5000;

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
export const SENTENCE_END_REGEX = /[.!?]\s*$/;
export const PAUSE_THRESHOLD_MS = 800; // Silence > 0.8s = sentence boundary
