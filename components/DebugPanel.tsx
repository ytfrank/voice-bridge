/**
 * DebugPanel - Real-time pipeline debug overlay
 * Shows live logs on-screen. Toggle with triple-tap on status bar.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { pipelineLogger, PipelineLog } from '../utils/pipelineLogger';
import { API } from '../constants/api';
import { useAudioFileInput } from '../hooks/useAudioFileInput';

const MAX_VISIBLE = 20;

export function DebugPanel() {
  const [visible, setVisible] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [envInfo, setEnvInfo] = useState<string>('');
  const scrollRef = useRef<ScrollView>(null);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isProcessing, progress, lastResult, pickAndProcess } = useAudioFileInput();

  // Triple-tap to toggle
  const handleTap = useCallback(() => {
    tapCountRef.current++;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      if (tapCountRef.current >= 3) {
        setVisible((v) => !v);
      }
      tapCountRef.current = 0;
    }, 500);
  }, []);

  // Subscribe to pipeline logs
  useEffect(() => {
    // Log env info on mount
    const bffUrl = API.TRANSCRIBE?.replace('/api/transcribe', '') || 'unknown';
    setEnvInfo(`BFF: ${bffUrl}`);
    pipelineLogger.log(-1, 'env_info', { bffUrl });

    const unsubscribe = pipelineLogger.subscribe((log: PipelineLog) => {
      const formatted = pipelineLogger.formatLog(log);
      setLogs((prev) => [...prev.slice(-MAX_VISIBLE), formatted]);
    });

    // Load recent logs
    const recent = pipelineLogger.getRecent(MAX_VISIBLE);
    setLogs(recent.map((l) => pipelineLogger.formatLog(l)));

    return unsubscribe;
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (visible) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [logs, visible]);

  return (
    <>
      {/* Toggle button - always visible as small dot */}
      <TouchableOpacity
        style={styles.toggleBtn}
        onPress={handleTap}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleText}>{visible ? '🐛' : '·'}</Text>
      </TouchableOpacity>

      {/* Debug panel overlay */}
      {visible && (
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.headerText}>🐛 Debug</Text>
            <Text style={styles.envText}>{envInfo}</Text>
            <TouchableOpacity
              style={[styles.fileButton, isProcessing && styles.fileButtonDisabled]}
              onPress={pickAndProcess}
              disabled={isProcessing}
            >
              <Text style={styles.fileButtonText}>
                {isProcessing ? '⏳' : '📁'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setLogs([]); pipelineLogger.reset(); }}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {/* File processing status */}
          {(isProcessing || lastResult) && (
            <View style={styles.statusBar}>
              <Text style={styles.statusText}>
                {isProcessing ? progress : lastResult}
              </Text>
            </View>
          )}
          <ScrollView
            ref={scrollRef}
            style={styles.logArea}
            showsVerticalScrollIndicator={false}
          >
            {logs.length === 0 ? (
              <Text style={styles.logLine}>No logs yet. Start recording...</Text>
            ) : (
              logs.map((line, i) => (
                <Text key={i} style={[
                  styles.logLine,
                  line.includes('❌') || line.includes('🚨') ? styles.errorLine : null,
                  line.includes('✅') ? styles.successLine : null,
                  line.includes('"skipped":true') || line.includes('chunk_skipped') ? styles.skipLine : null,
                ]}>
                  {line.includes('"skipped":true') || line.includes('chunk_skipped') ? `[SKIP] ${line}` : line}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toggleBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  toggleText: {
    fontSize: 14,
    color: '#fff',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    zIndex: 9998,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerText: {
    color: '#0f0',
    fontSize: 13,
    fontWeight: '600',
  },
  envText: {
    color: '#888',
    fontSize: 10,
    flex: 1,
    marginLeft: 8,
  },
  clearText: {
    color: '#f66',
    fontSize: 12,
  },
  fileButton: {
    backgroundColor: '#2d6a4f',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  fileButtonDisabled: {
    opacity: 0.5,
  },
  fileButtonText: {
    fontSize: 14,
  },
  statusBar: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(45, 106, 79, 0.3)',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statusText: {
    color: '#6f6',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  logArea: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  logLine: {
    color: '#ccc',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  errorLine: {
    color: '#f66',
  },
  successLine: {
    color: '#6f6',
  },
  skipLine: {
    color: '#999',
    opacity: 0.8,
  },
});
