/**
 * EnglishTranscript - Upper half screen showing real-time English subtitles
 */

import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranscriptStore } from '../store/transcriptStore';

export function EnglishTranscript() {
  const scrollRef = useRef<ScrollView>(null);
  const { transcriptLines, currentTranscript, isRecording, skipNotification } =
    useTranscriptStore();

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [transcriptLines, currentTranscript]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>英文字幕</Text>
        {isRecording && (
          <View style={styles.recordingDot}>
            <Text style={styles.recordingText}>● 录音中</Text>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {transcriptLines.length === 0 && !currentTranscript ? (
          <Text style={styles.placeholder}>
            {isRecording ? '正在聆听...' : '点击"开始"按钮开始录音'}
          </Text>
        ) : (
          <>
            {transcriptLines.map((line, idx) => (
              <Text key={idx} style={styles.completedLine}>
                {line}
              </Text>
            ))}
            {currentTranscript ? (
              <Text style={styles.currentLine}>
                {currentTranscript}
                <Text style={styles.cursor}>|</Text>
              </Text>
            ) : null}
            {skipNotification ? (
              <Text style={styles.skipNotice}>{skipNotification}</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
  recordingDot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  placeholder: {
    color: '#555',
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 40,
  },
  completedLine: {
    color: '#e0e0e0',
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 6,
  },
  currentLine: {
    color: '#4fc3f7',
    fontSize: 18,
    lineHeight: 28,
  },
  cursor: {
    color: '#4fc3f7',
    opacity: 0.6,
  },
  skipNotice: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 6,
  },
});
