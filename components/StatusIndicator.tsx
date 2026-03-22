/**
 * StatusIndicator - Shows current pipeline status (6-state)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranscriptStore, PipelineStatus } from '../store/transcriptStore';

const STATUS_MAP: Record<PipelineStatus, { text: string; color: string }> = {
  idle: { text: '准备就绪', color: '#888' },
  listening: { text: '正在聆听...', color: '#4fc3f7' },
  recognizing: { text: '识别中...', color: '#81c784' },
  translating: { text: '翻译中...', color: '#ffd93d' },
  error: { text: '异常，正在恢复...', color: '#e57373' },
  retrying: { text: '重试中...', color: '#ffb74d' },
};

export function StatusIndicator() {
  const { pipelineStatus } = useTranscriptStore();

  const { text, color } = STATUS_MAP[pipelineStatus] || STATUS_MAP.idle;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{text}</Text>
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
