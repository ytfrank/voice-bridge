/**
 * Translation service - sends English text to BFF for GLM translation
 */

import { API } from '../constants/api';
import { VocabularyWord } from '../store/transcriptStore';

export interface TranslationResult {
  translation: string;
  words: VocabularyWord[];
}

/**
 * Translate English text to Chinese with vocabulary notes
 */
export async function translateText(text: string): Promise<TranslationResult> {
  try {
    const response = await fetch(API.TRANSLATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error('Translation error:', response.status);
      return { translation: '翻译失败', words: [] };
    }

    const data = await response.json();
    return {
      translation: data.translation || '翻译失败',
      words: (data.words || []).map((w: any) => ({
        word: w.word || '',
        phonetic: w.phonetic || '',
        homophone: w.homophone || '',
        meaning: w.meaning || '',
        example: w.example || '',
      })),
    };
  } catch (err) {
    console.error('Translation failed:', err);
    return { translation: '网络错误，翻译失败', words: [] };
  }
}

/**
 * Stream translation text via SSE. Best-effort: if streaming unsupported, fallback to non-stream.
 * Calls onUpdate with accumulated translation text.
 */
export async function translateTextStream(
  text: string,
  onUpdate: (partial: string) => void
): Promise<string> {
  try {
    const response = await fetch(API.TRANSLATE_STREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok || !response.body) {
      const result = await translateText(text);
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
    const result = await translateText(text);
    onUpdate(result.translation);
    return result.translation;
  }
}
