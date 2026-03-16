/**
 * Save service - saves transcript + translation to local file
 */

import * as FileSystem from 'expo-file-system';
import { TranslationEntry } from '../store/transcriptStore';

const SAVE_DIR = `${FileSystem.documentDirectory}voice-bridge/`;

/**
 * Ensure save directory exists
 */
async function ensureDir() {
  const info = await FileSystem.getInfoAsync(SAVE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SAVE_DIR, { intermediates: true });
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

  await FileSystem.writeAsStringAsync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

/**
 * List saved sessions
 */
export async function listSavedSessions(): Promise<string[]> {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(SAVE_DIR);
  return files.filter((f) => f.endsWith('.json')).sort().reverse();
}
