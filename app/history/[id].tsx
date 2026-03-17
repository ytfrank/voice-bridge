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
import { loadSession, SessionData } from '../../services/saveService';

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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>会话详情</Text>
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
        </View>
      ) : session ? (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* English */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>英文字幕</Text>
            {session.transcriptLines.length === 0 ? (
              <Text style={styles.emptyText}>暂无英文内容</Text>
            ) : (
              session.transcriptLines.map((line, idx) => (
                <Text key={idx} style={styles.englishText}>
                  {line}
                </Text>
              ))
            )}
          </View>

          {/* Chinese */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>中文翻译</Text>
            {session.translations.length === 0 ? (
              <Text style={styles.emptyText}>暂无中文翻译</Text>
            ) : (
              session.translations.map((t, idx) => (
                <Text key={idx} style={styles.chineseText}>
                  {t.chinese}
                </Text>
              ))
            )}
          </View>

          {/* Vocabulary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>生词列表</Text>
            {session.translations.flatMap((t) => t.words).length === 0 ? (
              <Text style={styles.emptyText}>暂无生词</Text>
            ) : (
              <View style={styles.wordList}>
                {session.translations.flatMap((t) => t.words).map((w, idx) => (
                  <View key={`${w.word}-${idx}`} style={styles.wordChip}>
                    <Text style={styles.wordChipText}>{w.word}</Text>
                  </View>
                ))}
              </View>
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
    marginBottom: 6,
  },
  chineseText: {
    color: '#ffd93d',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 6,
  },
  emptyText: {
    color: '#555',
    fontStyle: 'italic',
  },
  wordList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordChip: {
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  wordChipText: {
    color: '#4fc3f7',
    fontSize: 12,
    fontWeight: '600',
  },
});
