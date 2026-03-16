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
