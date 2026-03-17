/**
 * VocabularySection - Collapsible vocabulary zone (Region C)
 * Shows accumulated words from all translations
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useTranscriptStore, VocabularyWord } from '../store/transcriptStore';

export function VocabularySection() {
  const { allWords, isVocabExpanded, setVocabExpanded, setSelectedWord } =
    useTranscriptStore();

  const handleWordPress = (word: VocabularyWord) => {
    setSelectedWord(word);
  };

  const toggleExpanded = () => {
    setVocabExpanded(!isVocabExpanded);
  };

  const wordCount = allWords.length;

  return (
    <View style={styles.container}>
      {/* Header - always visible, tappable to expand/collapse */}
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <Text style={styles.headerIcon}>📖</Text>
        <Text style={styles.headerText}>
          {wordCount > 0 ? `${wordCount}个生词` : '暂无生词'}
        </Text>
        <Text style={styles.expandIcon}>{isVocabExpanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {/* Word list - only when expanded */}
      {isVocabExpanded && wordCount > 0 && (
        <ScrollView style={styles.wordList} showsVerticalScrollIndicator={false}>
          <View style={styles.wordGrid}>
            {allWords.map((word, idx) => (
              <TouchableOpacity
                key={`${word.word}-${idx}`}
                style={styles.wordChip}
                onPress={() => handleWordPress(word)}
              >
                <Text style={styles.wordChipText}>{word.word}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Empty state when expanded */}
      {isVocabExpanded && wordCount === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>翻译时将自动提取生词</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1a2e',
  },
  headerIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  headerText: {
    flex: 1,
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  expandIcon: {
    color: '#666',
    fontSize: 12,
  },
  wordList: {
    maxHeight: 120,
    backgroundColor: '#0a0a0a',
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
  },
  wordChip: {
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  wordChipText: {
    color: '#4fc3f7',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  emptyText: {
    color: '#555',
    fontSize: 13,
    fontStyle: 'italic',
  },
});
