/**
 * ControlButtons - Start / Stop / Save buttons at bottom
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTranscriptStore } from '../store/transcriptStore';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { saveSession } from '../services/saveService';

export function ControlButtons() {
  const { isRecording, transcriptLines, translations, reset } =
    useTranscriptStore();
  const { startRecording, stopRecording } = useAudioRecording();
  const [isSaving, setIsSaving] = useState(false);

  const handleStartStop = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleSave = async () => {
    if (transcriptLines.length === 0 && translations.length === 0) {
      Alert.alert('提示', '暂无内容可保存');
      return;
    }

    setIsSaving(true);
    try {
      const filepath = await saveSession(transcriptLines, translations);
      Alert.alert('保存成功', `文件已保存到本地\n${filepath.split('/').pop()}`);
    } catch (err) {
      Alert.alert('保存失败', '请重试');
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewSession = () => {
    if (isRecording) {
      Alert.alert('提示', '请先停止录音');
      return;
    }
    Alert.alert('新建会话', '确定要清除当前内容吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定', onPress: () => reset() },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Start / Stop button */}
      <TouchableOpacity
        style={[
          styles.button,
          isRecording ? styles.stopButton : styles.startButton,
        ]}
        onPress={handleStartStop}
      >
        <Text style={styles.buttonEmoji}>
          {isRecording ? '⏹' : '🎙'}
        </Text>
        <Text style={styles.buttonText}>
          {isRecording ? '结束' : '开始'}
        </Text>
      </TouchableOpacity>

      {/* Save button */}
      <TouchableOpacity
        style={[styles.button, styles.saveButton]}
        onPress={handleSave}
        disabled={isSaving}
      >
        <Text style={styles.buttonEmoji}>💾</Text>
        <Text style={styles.buttonText}>
          {isSaving ? '保存中...' : '保存'}
        </Text>
      </TouchableOpacity>

      {/* New Session */}
      <TouchableOpacity
        style={[styles.button, styles.newButton]}
        onPress={handleNewSession}
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
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 0.5,
    borderTopColor: '#333',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    minWidth: 90,
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
  newButton: {
    backgroundColor: '#333',
  },
  buttonEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
