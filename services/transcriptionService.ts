/**
 * Transcription service - sends audio to BFF for ASR
 * Includes retry logic and segment tracking.
 */

import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { API } from '../constants/api';
import { errorReporter } from './errorReporter';
import { pipelineLogger } from '../utils/pipelineLogger';
import { analytics } from './analyticsService';

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1000;

interface TranscribeOptions {
  segmentId?: number;
  requestId?: string;
  sessionId?: string;
}

export interface TranscriptionResult {
  text: string;
  skipped?: boolean;
  reason?: string;
  reasons?: string[];
  status: number;
}

/**
 * Send an audio file to BFF for transcription
 * Retries once on failure (covers transient TLS/network errors)
 * @param audioUri - local file URI of the .m4a audio chunk
 * @returns structured transcription result
 */
export async function transcribeAudio(
  audioUri: string,
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const { segmentId, requestId, sessionId } = options;
  const t0 = Date.now();

  pipelineLogger.log(segmentId ?? -1, 'asr_start', {
    uri: audioUri.substring(audioUri.length - 30),
    bffUrl: API.TRANSCRIBE,
    requestId,
    sessionId,
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const uploadT0 = Date.now();
      const response = await uploadAsync(API.TRANSCRIBE, audioUri, {
        fieldName: 'audio',
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        mimeType: 'audio/m4a',
        parameters: {
          ...(segmentId !== undefined ? { segment_id: String(segmentId) } : {}),
          ...(sessionId ? { session_id: sessionId } : {}),
          ...(requestId ? { request_id: requestId } : {}),
        },
        headers: {
          ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
          ...(requestId ? { 'X-Request-Id': requestId } : {}),
        },
      });
      const uploadMs = Date.now() - uploadT0;

      analytics.track(
        'chunk_uploaded',
        {
          segmentId,
          uploadMs,
          httpStatus: response.status,
          audioUriSuffix: audioUri.substring(audioUri.length - 30),
          attempt: attempt + 1,
        },
        requestId
      );

      if (response.status === 200) {
        const data = JSON.parse(response.body || '{}');
        const text = typeof data.text === 'string' ? data.text : '';
        const skipped = Boolean(data.skipped);
        const reason = typeof data.reason === 'string' ? data.reason : undefined;
        const reasons = Array.isArray(data.reasons) ? data.reasons : undefined;

        pipelineLogger.log(segmentId ?? -1, text ? 'asr_done' : 'asr_empty', {
          ms: uploadMs,
          textLen: text.length,
          text: text.substring(0, 60),
          skipped,
          reason: reason || (reasons ? reasons.join(', ') : undefined),
          reasons,
          attempt: attempt + 1,
          requestId,
        });

        return {
          text,
          skipped,
          reason: reason || (reasons ? reasons.join(', ') : undefined),
          reasons,
          status: response.status,
        };
      }

      if (response.status === 530) {
        pipelineLogger.log(segmentId ?? -1, 'asr_530_retry', { attempt: attempt + 1, requestId });
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      const errMsg = `ASR HTTP ${response.status} (attempt ${attempt + 1})`;
      pipelineLogger.log(segmentId ?? -1, 'asr_error', {
        status: response.status,
        body: response.body?.substring(0, 100),
        attempt: attempt + 1,
        ms: uploadMs,
        requestId,
      });
      errorReporter.report(errMsg, { segmentId, status: response.status, requestId, sessionId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      pipelineLogger.log(segmentId ?? -1, 'asr_error', {
        error: errMsg.substring(0, 80),
        attempt: attempt + 1,
        ms: Date.now() - t0,
        requestId,
      });
      errorReporter.report(err instanceof Error ? err : new Error(errMsg), {
        segmentId,
        attempt: attempt + 1,
        phase: 'transcribe',
        requestId,
        sessionId,
      });
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return {
    text: '',
    status: 0,
    reason: 'request_failed',
  };
}
