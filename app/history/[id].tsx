/**
 * History detail page - show saved session
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { loadSession, SessionData, exportSessionMarkdown } from '../../services/saveService';

export default function HistoryDetailPage() {
  const { id } = useLocalSearchParams();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof id === 'string') {
      loadSessionData(id);
    }
  }, [id]);

  const loadSessionData = async (filename: string) => {
    try {
      setLoading(true);
      const data = await loadSession(filename);
      setSession(data);
      setError(null);
    } catch (err) {
      setError('加载会话失败');
      console.error('Load session error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!session) return;
    try {
      await exportSessionMarkdown(
        session.translations,
        session.sessionStartTime,
        session.sessionDurationMs
      );
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>会话详情</Text>
        <TouchableOpacity onPress={handleExport} style={styles.exportBtn}>
          <Text style={styles.exportBtnText}>导出</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4fc3f7" />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : session ? (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* 英中对照展示 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>会话记录</Text>
            {session.translations.length === 0 ? (
              <Text style={styles.emptyText}>暂无内容</Text>
            ) : (
              session.translations.map((t, idx) => (
                <View key={idx} style={styles.entryBlock}>
                  <Text style={styles.englishText}>{t.english}</Text>
                  <Text style={styles.chineseText}>{t.chinese}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      ) : null}
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
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  englishText: {
    color: '#e0e0e0',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 4,
  },
  chineseText: {
    color: '#ffd93d',
    fontSize: 16,
    lineHeight: 24,
  },
  emptyText: {
    color: '#555',
    fontStyle: 'italic',
  },
  entryBlock: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  exportBtn: {
    paddingVertical: 8,
    paddingLeft: 16,
  },
  exportBtnText: {
    color: '#4fc3f7',
    fontSize: 16,
  },
});
