/**
 * ControlButtons - Start / Stop / Save / History / New buttons at bottom
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useTranscriptStore } from '../store/transcriptStore';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { saveSession } from '../services/saveService';
import { analytics } from '../services/analyticsService';

export function ControlButtons() {
  const {
    isRecording,
    transcriptLines,
    translations,
    sessionStartTime,
    sessionDurationMs,
    reset,
  } = useTranscriptStore();
  const { startRecording, stopRecording } = useAudioRecording();
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingRecording, setIsTogglingRecording] = useState(false);

  const handleStartStop = async () => {
    if (isTogglingRecording) return;
    setIsTogglingRecording(true);
    try {
      if (isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch (err) {
      analytics.trackError(err, { phase: 'recording_toggle', isRecording });
      Alert.alert('录音操作失败', isRecording ? '停止录音失败，请重试' : '开始录音失败，请检查麦克风权限后重试');
    } finally {
      setIsTogglingRecording(false);
    }
  };

  const handleSave = async () => {
    if (transcriptLines.length === 0 && translations.length === 0) {
      Alert.alert('提示', '暂无内容可保存');
      return;
    }

    setIsSaving(true);
    try {
      const effectiveStartTime =
        sessionStartTime ??
        (translations.length > 0 ? Math.min(...translations.map((t) => t.timestamp)) : Date.now());
      const effectiveDurationMs =
        sessionDurationMs ?? Math.max(0, Date.now() - effectiveStartTime);
      const filepath = await saveSession(
        transcriptLines,
        translations,
        effectiveStartTime,
        effectiveDurationMs
      );
      analytics.track('export', {
        format: 'json',
        transcriptCount: transcriptLines.length,
        translationCount: translations.length,
        contentLength: JSON.stringify({ transcriptLines, translations }).length,
        durationMs: effectiveDurationMs,
        fileName: filepath.split('/').pop() || filepath,
      });
      Alert.alert('保存成功', `文件已保存到本地\n${filepath.split('/').pop()}`);
    } catch (err) {
      analytics.trackError(err, {
        phase: 'export',
        transcriptCount: transcriptLines.length,
        translationCount: translations.length,
      });
      Alert.alert('保存失败', '请重试');
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleHistory = () => {
    router.push('/history');
  };

  const handleNewSession = () => {
    if (isRecording || isTogglingRecording) {
      Alert.alert('提示', '请先停止录音');
      return;
    }
    Alert.alert('新建会话', '确定要清除当前内容吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        onPress: () => {
          analytics.track('session_reset', {
            transcriptCount: transcriptLines.length,
            translationCount: translations.length,
          });
          reset();
        },
      },
    ]);
  };

  const startStopDisabled = isTogglingRecording || isSaving;

  return (
    <View style={styles.container}>
      {/* Start / Stop button */}
      <TouchableOpacity
        style={[
          styles.button,
          isRecording ? styles.stopButton : styles.startButton,
          startStopDisabled && styles.disabledButton,
        ]}
        onPress={handleStartStop}
        disabled={startStopDisabled}
      >
        <Text style={styles.buttonEmoji}>
          {isRecording ? '⏹' : '🎙'}
        </Text>
        <Text style={styles.buttonText}>
          {isTogglingRecording ? (isRecording ? '停止中...' : '启动中...') : isRecording ? '结束' : '开始'}
        </Text>
      </TouchableOpacity>

      {/* Save button */}
      <TouchableOpacity
        style={[styles.button, styles.saveButton, isSaving && styles.disabledButton]}
        onPress={handleSave}
        disabled={isSaving || isTogglingRecording}
      >
        <Text style={styles.buttonEmoji}>💾</Text>
        <Text style={styles.buttonText}>
          {isSaving ? '保存中...' : '保存'}
        </Text>
      </TouchableOpacity>

      {/* History button */}
      <TouchableOpacity
        style={[styles.button, styles.historyButton]}
        onPress={handleHistory}
        disabled={isTogglingRecording}
      >
        <Text style={styles.buttonEmoji}>📋</Text>
        <Text style={styles.buttonText}>历史</Text>
      </TouchableOpacity>

      {/* New Session */}
      <TouchableOpacity
        style={[styles.button, styles.newButton]}
        onPress={handleNewSession}
        disabled={isTogglingRecording}
      >
        <Text style={styles.buttonEmoji}>🔄</Text>
        <Text style={styles.buttonText}>新建</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 0.5,
    borderTopColor: '#333',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 24,
    minWidth: 80,
  },
  startButton: {
    backgroundColor: '#2d6a4f',
  },
  stopButton: {
    backgroundColor: '#c62828',
  },
  saveButton: {
    backgroundColor: '#1565c0',
  },
  historyButton: {
    backgroundColor: '#4a4a4a',
  },
  newButton: {
    backgroundColor: '#333',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
