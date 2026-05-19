const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  assessTextQuality,
  assessAudioSignalQuality,
  buildAsrResponse,
} = require('../quality_gate');

// V2.0 P0 regression contracts that sit between backend ASR quality gates and
// frontend translation triggering. These tests deliberately avoid external APIs.

test('V2.0 contract: silence-like audio is skipped before ASR and carries zero ASR timing', () => {
  const audioQuality = assessAudioSignalQuality({
    fileSize: 128,
    durationSec: 0.2,
    rmsDb: -62,
    silentRatio: 0.98,
  });
  const response = {
    ...buildAsrResponse({
      text: '',
      skipped: true,
      quality: audioQuality,
      metadata: audioQuality.stats,
    }),
    timings: { precheckMs: 3, asrMs: 0, totalMs: 3 },
  };

  assert.equal(audioQuality.allowed, false);
  assert.equal(response.skipped, true);
  assert.equal(response.text, '');
  assert.equal(response.timings.asrMs, 0, 'pre-ASR skipped audio must not spend ASR time');
  assert.ok(response.reasons.length > 0, 'skipped audio must be explainable');
});

test('V2.0 contract: short audio with implausibly long text is blocked and hidden downstream', () => {
  const quality = assessTextQuality('Hello world this is a surprisingly long hallucinated sentence.', {
    durationSec: 0.35,
    whisperMs: 900,
  });
  const response = buildAsrResponse({
    text: '',
    skipped: true,
    quality,
    metadata: { durationSec: 0.35, whisperMs: 900 },
  });

  assert.equal(quality.allowed, false);
  assert.ok(quality.reasons.includes('text_audio_mismatch'));
  assert.equal(response.skipped, true);
  assert.equal(response.text, '', 'blocked ASR text must not be exposed to UI/translation');
  assert.ok(['HARD_BLOCK', 'SOFT_BLOCK'].includes(response.qualityDecision));
  assert.equal(response.asr.metadata.whisperMs, 900);
});

test('V2.0 contract: repeated hallucination text is rejected as translation input', () => {
  const inputQuality = assessTextQuality('thank you for coming thank you for coming thank you for coming', {
    durationSec: 2.0,
  });

  assert.equal(inputQuality.allowed, false);
  assert.ok(inputQuality.reasons.includes('repetitive_text'));
  assert.notEqual(inputQuality.decision, 'PASS');
});

test('V2.0 contract: normal English broadcast sentence remains eligible for translation', () => {
  const inputQuality = assessTextQuality('The market opened higher today after several technology companies reported strong earnings.', {
    durationSec: 4.0,
    avgLogprob: -0.25,
    maxNoSpeechProb: 0.03,
    languageProbability: 0.98,
  });

  assert.equal(inputQuality.allowed, true);
  assert.equal(inputQuality.decision, 'PASS');
  assert.deepEqual(inputQuality.reasons, []);
});

test('V2.0 frontend guard: empty/skipped ASR branch returns before append/translation trigger', () => {
  const hookPath = path.join(__dirname, '..', '..', 'hooks', 'useAudioRecording.ts');
  const source = fs.readFileSync(hookPath, 'utf8');
  const emptyBranchIndex = source.indexOf('if (!text)');
  const appendIndex = source.indexOf('appendTranscript(text)');
  const processSentenceIndex = source.indexOf('void processSentence(sentence, segIds, transcribeTime)');

  assert.ok(emptyBranchIndex >= 0, 'useAudioRecording must explicitly handle empty/skipped ASR text');
  assert.ok(appendIndex > emptyBranchIndex, 'appendTranscript must be after empty/skipped guard');
  assert.ok(processSentenceIndex > emptyBranchIndex, 'translation trigger must be after empty/skipped guard');

  const emptyBranch = source.slice(emptyBranchIndex, appendIndex);
  assert.match(emptyBranch, /result\.skipped/, 'empty branch must inspect backend skipped flag for observability');
  assert.match(emptyBranch, /return;/, 'empty/skipped branch must return before appending or translating');
});
