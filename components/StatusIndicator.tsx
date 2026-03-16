/**
 * StatusIndicator - Shows current app status at top
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranscriptStore } from '../store/transcriptStore';

export function StatusIndicator() {
  const { isRecording, isTranslating } = useTranscriptStore();

  let statusText = '准备就绪';
  let statusColor = '#888';

  if (isRecording && isTranslating) {
    statusText = '录音中 · 翻译中...';
    statusColor = '#ffd93d';
  } else if (isRecording) {
    statusText = '正在聆听...';
    statusColor = '#4fc3f7';
  } else if (isTranslating) {
    statusText = '翻译中...';
    statusColor = '#ffd93d';
  }

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: statusColor }]} />
      <Text style={[styles.text, { color: statusColor }]}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});
