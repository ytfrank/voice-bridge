/**
 * Transcription service - sends audio to BFF for ASR
 * Includes retry logic and segment tracking.
 */

import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { API } from '../constants/api';
import { errorReporter } from './errorReporter';
import { pipelineLogger } from '../utils/pipelineLogger';

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
  const t0 = Date.now();
  pipelineLogger.log(segmentId ?? -1, 'asr_start', {
    uri: audioUri.substring(audioUri.length - 30),
    bffUrl: API.TRANSCRIBE,
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const uploadT0 = Date.now();
      const response = await uploadAsync(API.TRANSCRIBE, audioUri, {
        fieldName: 'audio',
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        mimeType: 'audio/m4a',
        parameters: segmentId !== undefined ? { segment_id: String(segmentId) } : undefined,
      });
      const uploadMs = Date.now() - uploadT0;

      if (response.status === 200) {
        const data = JSON.parse(response.body);
        const text = data.text || '';
        pipelineLogger.log(segmentId ?? -1, text ? 'asr_done' : 'asr_empty', {
          ms: uploadMs,
          textLen: text.length,
          text: text.substring(0, 60),
          attempt: attempt + 1,
        });
        return text;
      }

      if (response.status === 530) {
        // Cloudflare tunnel error - wait and retry
        pipelineLogger.log(segmentId ?? -1, 'asr_530_retry', { attempt: attempt + 1 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      const errMsg = `ASR HTTP ${response.status} (attempt ${attempt + 1})`;
      pipelineLogger.log(segmentId ?? -1, 'asr_error', {
        status: response.status,
        body: response.body?.substring(0, 100),
        attempt: attempt + 1,
        ms: uploadMs,
      });
      errorReporter.report(errMsg, { segmentId, status: response.status });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      pipelineLogger.log(segmentId ?? -1, 'asr_error', {
        error: errMsg.substring(0, 80),
        attempt: attempt + 1,
        ms: Date.now() - t0,
      });
      errorReporter.report(err instanceof Error ? err : new Error(errMsg), {
        segmentId,
        attempt: attempt + 1,
        phase: 'transcribe',
      });
    }

    // Retry after delay (skip delay on last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return '';
}
