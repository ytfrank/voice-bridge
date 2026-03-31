/**
 * Save service - saves transcript + translation to local file
 */

import {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  readDirectoryAsync,
  readAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { TranslationEntry } from '../store/transcriptStore';

export interface SessionData {
  savedAt: string;
  sessionStartTime: number;
  sessionDurationMs: number;
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
  translations: TranslationEntry[],
  sessionStartTime: number,
  sessionDurationMs: number
): Promise<string> {
  await ensureDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `session-${timestamp}.json`;
  const filepath = `${SAVE_DIR}${filename}`;

  const data = {
    savedAt: new Date().toISOString(),
    sessionStartTime,
    sessionDurationMs,
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
  const parsed = JSON.parse(json) as Partial<SessionData>;

  const fallbackStartTime =
    parsed.sessionStartTime ??
    parsed.translations?.[0]?.timestamp ??
    new Date(parsed.savedAt ?? Date.now()).getTime();
  const fallbackDurationMs =
    parsed.sessionDurationMs ??
    Math.max(
      0,
      (parsed.translations?.length
        ? (parsed.translations[parsed.translations.length - 1]?.timestamp ?? fallbackStartTime) - fallbackStartTime
        : new Date(parsed.savedAt ?? Date.now()).getTime() - fallbackStartTime)
    );

  return {
    savedAt: parsed.savedAt ?? new Date().toISOString(),
    sessionStartTime: fallbackStartTime,
    sessionDurationMs: fallbackDurationMs,
    transcriptLines: parsed.transcriptLines ?? [],
    translations: parsed.translations ?? [],
  };
}

/**
 * Export session as Markdown and share via system share sheet
 */
export async function exportSessionMarkdown(
  translations: Array<{ english: string; chinese: string; timestamp: number }>,
  sessionStartTime: number,
  sessionDurationMs: number
): Promise<void> {
  const startDate = new Date(sessionStartTime);
  const durationMs = sessionDurationMs;

  const formatTs = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const formatDur = (ms: number): string => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return hours > 0 ? `${hours}小时 ${minutes}分钟` : `${minutes}分钟`;
  };

  const formatDateTime = (date: Date): string => {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  };

  const lines = [
    '# voice-bridge 录音记录',
    `**录音时间**：${formatDateTime(startDate)}`,
    `**时长**：${formatDur(durationMs)}`,
    '',
    '---',
    '',
  ];

  for (const t of translations) {
    const ts = formatTs(t.timestamp - sessionStartTime);
    lines.push(`[${ts}] **EN**: ${t.english}`);
    lines.push(`[${ts}] **CN**: ${t.chinese}`);
    lines.push('');
  }

  const content = lines.join('\n');
  const now = new Date();
  const fn = `voice-bridge-${now.toISOString().slice(0, 16).replace('T', '-').replace(':', '-')}.md`;
  const filepath = `${cacheDirectory}${fn}`;
  await writeAsStringAsync(filepath, content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filepath, {
      mimeType: 'text/markdown',
      UTI: 'public.plain-text',
    });
  }
}
