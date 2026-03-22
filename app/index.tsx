/**
 * Main screen - Three-zone layout
 * Region A: English transcript
 * Region B: Chinese translation
 * Region C: Vocabulary (collapsible)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusIndicator } from '../components/StatusIndicator';
import { EnglishTranscript } from '../components/EnglishTranscript';
import { ChineseTranslation } from '../components/ChineseTranslation';
import { ControlButtons } from '../components/ControlButtons';
import { VocabularyCard } from '../components/VocabularyCard';
import { VocabularySection } from '../components/VocabularySection';
import { DebugPanel } from '../components/DebugPanel';

export default function MainScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Status */}
        <StatusIndicator />

        {/* Region A: English transcript */}
        <View style={styles.englishZone}>
          <EnglishTranscript />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Region B: Chinese translation */}
        <View style={styles.chineseZone}>
          <ChineseTranslation />
        </View>

        {/* Region C: Vocabulary (collapsible) */}
        <VocabularySection />

        {/* Control buttons */}
        <ControlButtons />
      </View>

      {/* Vocabulary card modal */}
      <VocabularyCard />

      {/* Debug panel - triple-tap bottom-right dot to toggle */}
      <DebugPanel />
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
  englishZone: {
    flex: 3,
    paddingHorizontal: 16,
  },
  divider: {
    height: 2,
    backgroundColor: '#333',
    marginHorizontal: 16,
  },
  chineseZone: {
    flex: 3,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
