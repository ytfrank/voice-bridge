/**
 * Save service - saves transcript + translation to local file
 */

import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  readDirectoryAsync,
  readAsStringAsync,
} from 'expo-file-system/legacy';
import { TranslationEntry } from '../store/transcriptStore';

export interface SessionData {
  savedAt: string;
  transcriptLines: string[];
  translations: Array<{
    english: string;
    chinese: string;
    words: any[];
    timestamp: number;
  }>;
}

const SAVE_DIR = `${documentDirectory}voice-bridge/`;

/**
 * Ensure save directory exists
 */
async function ensureDir() {
  const info = await getInfoAsync(SAVE_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(SAVE_DIR, { intermediates: true });
  }
}

/**
 * Save current session to a local JSON file
 */
export async function saveSession(
  transcriptLines: string[],
  translations: TranslationEntry[]
): Promise<string> {
  await ensureDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `session-${timestamp}.json`;
  const filepath = `${SAVE_DIR}${filename}`;

  const data = {
    savedAt: new Date().toISOString(),
    transcriptLines,
    translations: translations.map((t) => ({
      english: t.englishText,
      chinese: t.chineseTranslation,
      words: t.words,
      timestamp: t.timestamp,
    })),
  };

  await writeAsStringAsync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

/**
 * List saved sessions
 */
export async function listSavedSessions(): Promise<string[]> {
  await ensureDir();
  const files = await readDirectoryAsync(SAVE_DIR);
  return files.filter((f) => f.endsWith('.json')).sort().reverse();
}

/**
 * Load a saved session by filename
 */
export async function loadSession(filename: string): Promise<SessionData> {
  await ensureDir();
  const filepath = `${SAVE_DIR}${filename}`;
  const json = await readAsStringAsync(filepath);
  return JSON.parse(json) as SessionData;
}
