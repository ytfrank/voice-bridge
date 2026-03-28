/**
 * API endpoint constants
 */

// BFF server URL - in dev, points to local BFF
export const BFF_URL = process.env.EXPO_PUBLIC_BFF_URL || 'http://localhost:3001';

// BFF WebSocket URL for heartbeat
const wsProtocol = BFF_URL.startsWith('https') ? 'wss' : 'ws';
const wsHost = BFF_URL.replace(/^https?:\/\//, '');
export const WS_URL = `${wsProtocol}://${wsHost}`;

export const API = {
  TRANSCRIBE: `${BFF_URL}/api/transcribe`,
  TRANSLATE: `${BFF_URL}/api/translate`,
  TRANSLATE_STREAM: `${BFF_URL}/api/translate/stream`,
  HEALTH: `${BFF_URL}/health`,
  WS: WS_URL,
} as const;
