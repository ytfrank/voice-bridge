/**
 * ChineseTranslation - Lower half screen showing Chinese translations
 * with tappable vocabulary words
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useTranscriptStore, VocabularyWord } from '../store/transcriptStore';

export function ChineseTranslation() {
  const scrollRef = useRef<ScrollView>(null);
  const { translations, isTranslating, setSelectedWord } =
    useTranscriptStore();

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [translations, isTranslating]);

  const handleWordPress = (word: VocabularyWord) => {
    setSelectedWord(word);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>中文翻译</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {translations.length === 0 && !isTranslating ? (
          <Text style={styles.placeholder}>翻译将显示在这里</Text>
        ) : (
          <>
            {translations.map((entry) => (
              <View key={entry.id} style={styles.entryContainer}>
                <Text style={styles.translationText}>
                  {entry.chineseTranslation}
                </Text>
                {entry.words.length > 0 && (
                  <View style={styles.wordsRow}>
                    <Text style={styles.wordLabel}>📖 生词：</Text>
                    {entry.words.map((w, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleWordPress(w)}
                        style={styles.wordChip}
                      >
                        <Text style={styles.wordChipText}>{w.word}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {isTranslating && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#4fc3f7" />
            <Text style={styles.loadingText}>翻译中...</Text>
          </View>
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
    marginBottom: 8,
  },
  headerText: {
    fontSize: 14,
    color: '#888',
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
  entryContainer: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  translationText: {
    color: '#ffd93d',
    fontSize: 18,
    lineHeight: 28,
  },
  wordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
  },
  wordLabel: {
    color: '#888',
    fontSize: 12,
    marginRight: 6,
  },
  wordChip: {
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  wordChipText: {
    color: '#4fc3f7',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    color: '#4fc3f7',
    fontSize: 14,
    marginLeft: 8,
  },
});
