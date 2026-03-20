/**
 * Transcription service - sends audio to BFF for ASR
 * Includes retry logic and segment tracking.
 */

import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { API } from '../constants/api';

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1000;

/**
 * Send an audio file to BFF for transcription
 * Retries once on failure (covers transient TLS/network errors)
 * @param audioUri - local file URI of the .m4a audio chunk
 * @param segmentId - optional segment ID for tracking
 * @returns transcribed text
 */
export async function transcribeAudio(audioUri: string, segmentId?: number): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await uploadAsync(API.TRANSCRIBE, audioUri, {
        fieldName: 'audio',
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        mimeType: 'audio/m4a',
        parameters: segmentId !== undefined ? { segment_id: String(segmentId) } : undefined,
      });

      if (response.status === 200) {
        const data = JSON.parse(response.body);
        return data.text || '';
      }

      console.error(`Transcription error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, response.status, response.body);
    } catch (err) {
      console.error(`Transcription failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, err);
    }

    // Retry after delay (skip delay on last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return '';
}
