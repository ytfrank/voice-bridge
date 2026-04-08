/**
 * useAudioFileInput - Debug mode: pick an audio file and process it
 * Uses expo-document-picker to select a file, then sends to existing
 * /api/transcribe + /api/translate endpoints.
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { API } from '../constants/api';
import { useTranscriptStore } from '../store/transcriptStore';
import { translateText } from '../services/translationService';
import { pipelineLogger } from '../utils/pipelineLogger';
import { analytics } from '../services/analyticsService';

export interface FileInputState {
  isProcessing: boolean;
  progress: string;
  lastResult: string | null;
}

export function useAudioFileInput() {
  const [state, setState] = useState<FileInputState>({
    isProcessing: false,
    progress: '',
    lastResult: null,
  });

  const { addTranscriptLine, addTranslation } = useTranscriptStore();

  const pickAndProcess = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      const fileName = file.name || 'unknown';

      setState({ isProcessing: true, progress: `正在处理: ${fileName}`, lastResult: null });
      pipelineLogger.log(-1, 'debug_file_start', { fileName, fileSize: file.size });

      const t0 = Date.now();

      // Step 1: Transcribe via existing BFF endpoint
      setState((s) => ({ ...s, progress: `转录中: ${fileName}` }));

      const uploadResponse = await uploadAsync(API.TRANSCRIBE, file.uri, {
        fieldName: 'audio',
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        mimeType: file.mimeType || 'audio/mpeg',
        parameters: {
          session_id: `debug_${Date.now()}`,
        },
      });

      const uploadMs = Date.now() - t0;

      if (uploadResponse.status !== 200) {
        const errMsg = `转录失败 (HTTP ${uploadResponse.status})`;
        setState({ isProcessing: false, progress: '', lastResult: `❌ ${errMsg}` });
        pipelineLogger.log(-1, 'debug_file_error', { error: errMsg, status: uploadResponse.status });
        Alert.alert('转录失败', errMsg);
        return;
      }

      let transcriptData;
      try {
        transcriptData = typeof uploadResponse.body === 'string'
          ? JSON.parse(uploadResponse.body)
          : uploadResponse.body;
      } catch {
        transcriptData = { text: String(uploadResponse.body) };
      }

      const transcribedText = transcriptData.text || '';

      if (!transcribedText || transcriptData.skipped) {
        const reason = transcriptData.reason || transcriptData.reasons?.join(', ') || '未识别到语音';
        setState({ isProcessing: false, progress: '', lastResult: `⚠️ 跳过: ${reason}` });
        pipelineLogger.log(-1, 'debug_file_skipped', { reason, fileName });
        Alert.alert('转录结果', `音频被跳过: ${reason}`);
        return;
      }

      // Add transcript line
      addTranscriptLine(transcribedText);
      pipelineLogger.log(-1, 'debug_file_transcribed', {
        text: transcribedText.substring(0, 100),
        uploadMs,
      });

      // Step 2: Translate
      setState((s) => ({ ...s, progress: `翻译中: ${transcribedText.substring(0, 40)}...` }));

      const translation = await translateText(transcribedText);
      const totalMs = Date.now() - t0;

      if (translation) {
        addTranslation({
          id: `debug_${Date.now()}`,
          segmentIds: [-1],
          englishText: transcribedText,
          chineseTranslation: translation.translation || '',
          words: translation.words || [],
          timestamp: Date.now(),
          transcribeTime: uploadMs,
          translateTime: totalMs - uploadMs,
        });
      }

      setState({
        isProcessing: false,
        progress: '',
        lastResult: `✅ 完成 (${totalMs}ms) — 转录: ${uploadMs}ms`,
      });

      pipelineLogger.log(-1, 'debug_file_done', {
        totalMs,
        uploadMs,
        textLen: transcribedText.length,
        fileName,
      });

      analytics.track('debug_file_input', {
        fileName,
        fileSize: file.size,
        totalMs,
        uploadMs,
        textLength: transcribedText.length,
        hasTranslation: !!translation,
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      setState({ isProcessing: false, progress: '', lastResult: `❌ 错误: ${errMsg}` });
      pipelineLogger.log(-1, 'debug_file_error', { error: errMsg });
      Alert.alert('处理失败', errMsg);
    }
  }, [addTranscriptLine, addTranslation]);

  return { ...state, pickAndProcess };
}
