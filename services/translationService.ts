/**
 * Translation service - sends English text to BFF for GLM translation
 */

import { API } from '../constants/api';
import { VocabularyWord } from '../store/transcriptStore';
import { errorReporter } from './errorReporter';
import { pipelineLogger } from '../utils/pipelineLogger';

export interface TranslationResult {
  translation: string;
  words?: VocabularyWord[];
}

export interface TranslationRequestMeta {
  requestId?: string;
  sessionId?: string;
  segmentIds?: number[];
}

/**
 * Translate English text to Chinese with vocabulary notes
 */
export async function translateText(text: string, meta: TranslationRequestMeta = {}): Promise<TranslationResult> {
  const t0 = Date.now();
  pipelineLogger.log(meta.segmentIds?.[0] ?? -1, 'translate_start', {
    inputLen: text.length,
    text: text.substring(0, 50),
    requestId: meta.requestId,
    sessionId: meta.sessionId,
  });

  try {
    const response = await fetch(API.TRANSLATE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(meta.sessionId ? { 'X-Session-Id': meta.sessionId } : {}),
        ...(meta.requestId ? { 'X-Request-Id': meta.requestId } : {}),
      },
      body: JSON.stringify({
        text,
        sessionId: meta.sessionId,
        requestId: meta.requestId,
        segmentIds: meta.segmentIds,
      }),
    });

    if (!response.ok) {
      const ms = Date.now() - t0;
      pipelineLogger.log(meta.segmentIds?.[0] ?? -1, 'translate_error', {
        status: response.status,
        ms,
        requestId: meta.requestId,
      });
      errorReporter.report(`Translate HTTP ${response.status}`, {
        inputLen: text.length,
        requestId: meta.requestId,
        sessionId: meta.sessionId,
      });
      return { translation: '翻译失败', words: [] };
    }

    const data = await response.json();
    const ms = Date.now() - t0;
    pipelineLogger.log(meta.segmentIds?.[0] ?? -1, 'translate_done', {
      ms,
      translation: (data.translation || '').substring(0, 40),
      wordsCount: (data.words || []).length,
      requestId: meta.requestId,
    });

    return {
      translation: data.translation || '翻译失败',
      words: (data.words || []).map((w: any) => ({
        word: w.word || '',
        phonetic: w.phonetic || '',
        homophone: w.homophone || '',
        meaning: w.meaning || '',
        example: w.example || '',
      })) || [],
    };
  } catch (err) {
    const ms = Date.now() - t0;
    const errMsg = err instanceof Error ? err.message : String(err);
    pipelineLogger.log(meta.segmentIds?.[0] ?? -1, 'translate_error', {
      error: errMsg.substring(0, 80),
      ms,
      requestId: meta.requestId,
    });
    errorReporter.report(err instanceof Error ? err : new Error(errMsg), {
      phase: 'translate',
      requestId: meta.requestId,
      sessionId: meta.sessionId,
      segmentIds: meta.segmentIds,
    });
    return { translation: '网络错误，翻译失败', words: [] };
  }
}

/**
 * Stream translation text via SSE. Best-effort: if streaming unsupported, fallback to non-stream.
 * Calls onUpdate with accumulated translation text.
 */
export async function translateTextStream(
  text: string,
  onUpdate: (partial: string) => void,
  meta: TranslationRequestMeta = {}
): Promise<string> {
  try {
    const response = await fetch(API.TRANSLATE_STREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(meta.sessionId ? { 'X-Session-Id': meta.sessionId } : {}),
        ...(meta.requestId ? { 'X-Request-Id': meta.requestId } : {}),
      },
      body: JSON.stringify({
        text,
        sessionId: meta.sessionId,
        requestId: meta.requestId,
        segmentIds: meta.segmentIds,
      }),
    });

    if (!response.ok || !response.body) {
      const result = await translateText(text, meta);
      onUpdate(result.translation);
      return result.translation;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.replace(/^data:\s*/, '');
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta =
            json.choices?.[0]?.delta?.content ||
            json.choices?.[0]?.message?.content ||
            json.choices?.[0]?.text ||
            '';
          if (delta) {
            fullText += delta;
            onUpdate(fullText);
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }

    return fullText;
  } catch (err) {
    console.error('Stream translation failed:', err);
    const result = await translateText(text, meta);
    onUpdate(result.translation);
    return result.translation;
  }
}
