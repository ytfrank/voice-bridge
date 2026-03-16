/**
 * Main screen - split view with English transcript (top) and Chinese translation (bottom)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusIndicator } from '../components/StatusIndicator';
import { EnglishTranscript } from '../components/EnglishTranscript';
import { ChineseTranslation } from '../components/ChineseTranslation';
import { ControlButtons } from '../components/ControlButtons';
import { VocabularyCard } from '../components/VocabularyCard';

export default function MainScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Status */}
        <StatusIndicator />

        {/* Upper half: English transcript */}
        <View style={styles.topHalf}>
          <EnglishTranscript />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Lower half: Chinese translation */}
        <View style={styles.bottomHalf}>
          <ChineseTranslation />
        </View>

        {/* Control buttons */}
        <ControlButtons />
      </View>

      {/* Vocabulary card modal */}
      <VocabularyCard />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flex: 1,
  },
  topHalf: {
    flex: 1,
    paddingHorizontal: 16,
  },
  divider: {
    height: 2,
    backgroundColor: '#333',
    marginHorizontal: 16,
  },
  bottomHalf: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
