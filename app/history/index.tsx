/**
 * History list page - shows saved sessions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { listSavedSessions } from '../../services/saveService';

export default function HistoryListPage() {
  const [sessions, setSessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const files = await listSavedSessions();
      setSessions(files);
      setError(null);
    } catch (err) {
      setError('加载历史记录失败');
      console.error('Load sessions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionPress = (filename: string) => {
    // Navigate to detail page with filename as param
    router.push(`/history/${encodeURIComponent(filename)}` as any);
  };

  const formatFilename = (filename: string): string => {
    // session-2026-03-17T12-30-45-123Z.json -> 2026-03-17 12:30
    try {
      const match = filename.match(/session-(.+)\.json/);
      if (match) {
        const dateStr = match[1].replace(/-/g, ':').replace(/T/, ' ');
        return dateStr.substring(0, 16).replace(/:/g, (m, i) => i === 4 ? '-' : m);
      }
    } catch {}
    return filename;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>历史记录</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4fc3f7" />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadSessions} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>暂无历史记录</Text>
          <Text style={styles.emptyHint}>保存会话后将显示在这里</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {sessions.map((filename, idx) => (
            <TouchableOpacity
              key={filename}
              style={styles.sessionItem}
              onPress={() => handleSessionPress(filename)}
            >
              <Text style={styles.sessionIcon}>📄</Text>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionDate}>{formatFilename(filename)}</Text>
                <Text style={styles.sessionFilename}>{filename}</Text>
              </View>
              <Text style={styles.sessionArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backBtnText: {
    color: '#4fc3f7',
    fontSize: 16,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#4fc3f7',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginBottom: 8,
  },
  emptyHint: {
    color: '#555',
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  sessionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDate: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sessionFilename: {
    color: '#666',
    fontSize: 12,
  },
  sessionArrow: {
    color: '#666',
    fontSize: 24,
  },
});
