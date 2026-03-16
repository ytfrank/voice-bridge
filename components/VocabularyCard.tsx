/**
 * VocabularyCard - Modal card showing word details
 * Shows: meaning, phonetic, homophone, example sentence
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { useTranscriptStore } from '../store/transcriptStore';

export function VocabularyCard() {
  const { selectedWord, setSelectedWord } = useTranscriptStore();

  if (!selectedWord) return null;

  return (
    <Modal
      visible={!!selectedWord}
      transparent
      animationType="fade"
      onRequestClose={() => setSelectedWord(null)}
    >
      <Pressable
        style={styles.overlay}
        onPress={() => setSelectedWord(null)}
      >
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Word Title */}
          <View style={styles.titleRow}>
            <Text style={styles.wordTitle}>{selectedWord.word}</Text>
            {selectedWord.phonetic && (
              <Text style={styles.phonetic}>{selectedWord.phonetic}</Text>
            )}
          </View>

          {/* Homophone */}
          {selectedWord.homophone && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>🔊 谐音读法</Text>
              <Text style={styles.homophoneText}>
                {selectedWord.homophone}
              </Text>
            </View>
          )}

          {/* Meaning */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📝 释义</Text>
            <Text style={styles.meaningText}>{selectedWord.meaning}</Text>
          </View>

          {/* Example */}
          {selectedWord.example && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>💡 例句</Text>
              <Text style={styles.exampleText}>{selectedWord.example}</Text>
            </View>
          )}

          {/* Close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setSelectedWord(null)}
          >
            <Text style={styles.closeBtnText}>关闭</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#333',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  wordTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4fc3f7',
    marginRight: 12,
  },
  phonetic: {
    fontSize: 16,
    color: '#aaa',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
    fontWeight: '600',
  },
  homophoneText: {
    fontSize: 20,
    color: '#ffd93d',
    fontWeight: '600',
  },
  meaningText: {
    fontSize: 18,
    color: '#e0e0e0',
    lineHeight: 26,
  },
  exampleText: {
    fontSize: 15,
    color: '#bbb',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  closeBtn: {
    marginTop: 8,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
  },
});
