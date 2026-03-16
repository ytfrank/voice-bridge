/**
 * Transcription service - sends audio to BFF for ASR
 */

import * as FileSystem from 'expo-file-system';
import { API } from '../constants/api';

/**
 * Send an audio file to BFF for transcription
 * @param audioUri - local file URI of the .m4a audio chunk
 * @returns transcribed text
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  try {
    const response = await FileSystem.uploadAsync(API.TRANSCRIBE, audioUri, {
      fieldName: 'audio',
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      mimeType: 'audio/m4a',
    });

    if (response.status !== 200) {
      console.error('Transcription error:', response.status, response.body);
      return '';
    }

    const data = JSON.parse(response.body);
    return data.text || '';
  } catch (err) {
    console.error('Transcription failed:', err);
    return '';
  }
}
