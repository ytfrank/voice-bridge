/**
 * API endpoint constants
 */

// BFF server URL - in dev, points to local BFF
export const BFF_URL = process.env.EXPO_PUBLIC_BFF_URL || 'http://localhost:3001';

export const API = {
  TRANSCRIBE: `${BFF_URL}/api/transcribe`,
  TRANSLATE: `${BFF_URL}/api/translate`,
  TRANSLATE_STREAM: `${BFF_URL}/api/translate/stream`,
  HEALTH: `${BFF_URL}/health`,
} as const;
