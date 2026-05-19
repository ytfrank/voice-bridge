const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessTextQuality,
  assessAudioSignalQuality,
  buildAsrResponse,
  buildTextRepetitionStats,
  isArticleLedContentFragment,
  isLowValueUtterance,
  hasVerbSignal,
} = require('../quality_gate');

// ── existing baseline tests ────────────────────────────────────────────────

test('flags truncated article-led fragment for short audio', () => {
  const quality = assessTextQuality('a quick brown.', { durationSec: 1.9 });

  assert.equal(quality.allowed, false);
  assert.equal(quality.decision, 'SOFT_BLOCK');
  assert.ok(quality.reasons.includes('truncated_short_phrase'));
  assert.equal(quality.stats.isArticleLedContentFragment, true);
});

test('flags article-led incomplete sentence variant with the', () => {
  const quality = assessTextQuality('the quick brown.', { durationSec: 2.2 });

  assert.equal(quality.allowed, false);
  assert.ok(quality.reasons.includes('truncated_short_phrase'));
});

test('keeps normal short sentence allowed', () => {
  const quality = assessTextQuality('Hello, how are you today?', { durationSec: 1.5 });

  assert.equal(quality.allowed, true);
  assert.equal(quality.decision, 'PASS');
  assert.deepEqual(quality.reasons, []);
});

test('does not classify short complete article-led sentence as fragment when verb exists', () => {
  const quality = assessTextQuality('The dog sleeps.', { durationSec: 1.8 });

  assert.equal(hasVerbSignal(['the', 'dog', 'sleeps']), true);
  assert.equal(isArticleLedContentFragment(['the', 'dog', 'sleeps'], 'The dog sleeps.', 1.8), false);
  assert.equal(quality.allowed, true);
});

// ── P0: silence / filler → zero output (HARD_BLOCK) ──────────────────────

test('filler-only two-token text is hard-blocked', () => {
  const result = assessTextQuality('uh um', {});

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(result.reasons.includes('low_value_text'), `reasons: ${JSON.stringify(result.reasons)}`);
});

test('single short filler word is hard-blocked', () => {
  const result = assessTextQuality('oh', {});

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(result.reasons.includes('low_value_text'));
});

test('empty text is hard-blocked with empty_text reason', () => {
  const result = assessTextQuality('', {});

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(result.reasons.includes('empty_text'));
});

test('whitespace-only text normalizes to empty and is hard-blocked', () => {
  const result = assessTextQuality('   ', {});

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(result.reasons.includes('empty_text'));
});

test('high no-speech probability produces hard-block with no_speech or high_no_speech_prob reason', () => {
  const result = assessTextQuality('', { maxNoSpeechProb: 0.9 });

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(
    result.reasons.some((r) => ['high_no_speech_prob', 'no_speech', 'empty_text'].includes(r)),
    `expected speech-absence reason, got: ${JSON.stringify(result.reasons)}`,
  );
});

test('isLowValueUtterance returns true for known filler tokens', () => {
  assert.equal(isLowValueUtterance(['uh'], 'uh'), true);
  assert.equal(isLowValueUtterance(['hmm', 'mm'], 'hmm mm'), true);
  assert.equal(isLowValueUtterance(['yeah'], 'yeah'), true);
});

test('isLowValueUtterance returns false for content tokens', () => {
  assert.equal(isLowValueUtterance(['hello', 'world'], 'hello world'), false);
  assert.equal(isLowValueUtterance(['the', 'dog', 'runs'], 'the dog runs'), false);
});

// ── P0: hallucination filter — repeated phrases ───────────────────────────

test('word repeated 4+ times consecutively is soft-blocked as repetitive', () => {
  const result = assessTextQuality('ha ha ha ha ha', {});

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('repetitive_text'), `reasons: ${JSON.stringify(result.reasons)}`);
  const stats = buildTextRepetitionStats('ha ha ha ha ha');
  assert.ok(stats.maxRepeatedRun >= 4, `maxRepeatedRun=${stats.maxRepeatedRun}`);
});

test('alternating bigram repetition triggers repetitive_text soft-block', () => {
  const result = assessTextQuality('the cat the cat the cat the cat', {});

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('repetitive_text'), `reasons: ${JSON.stringify(result.reasons)}`);
  const stats = buildTextRepetitionStats('the cat the cat the cat the cat');
  assert.ok(stats.repeatedBigramRatio >= 0.35, `repeatedBigramRatio=${stats.repeatedBigramRatio}`);
});

test('long repeated phrase pattern is soft-blocked as repetitive', () => {
  const phrase = 'thank you for coming thank you for coming thank you for coming';
  const result = assessTextQuality(phrase, {});

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('repetitive_text'));
});

test('normal varied text does not trigger repetitive_text', () => {
  const result = assessTextQuality('The weather today is sunny and warm with a light breeze.', { durationSec: 4.0 });

  assert.equal(result.reasons.includes('repetitive_text'), false);
});

// ── P0: hallucination filter — text / audio mismatch ─────────────────────

test('impossible chars-per-second for very short audio is soft-blocked', () => {
  // 30 non-space chars / 0.4s = 75 chars/sec, far above the 22 limit
  const result = assessTextQuality('Hello world this is a test sentence.', { durationSec: 0.4 });

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('text_audio_mismatch'), `reasons: ${JSON.stringify(result.reasons)}`);
  assert.ok(result.stats.charsPerSecond > 22, `charsPerSecond=${result.stats.charsPerSecond}`);
});

test('reasonable chars-per-second for normal-length audio is not mismatch-blocked', () => {
  // 20 non-space chars / 2.5s ≈ 8 chars/sec, well within limit
  const result = assessTextQuality('Good morning everyone.', { durationSec: 2.5 });

  assert.equal(result.reasons.includes('text_audio_mismatch'), false);
});

test('charsPerSecond is computed from text and duration when not supplied', () => {
  const result = assessTextQuality('Hello world.', { durationSec: 1.0 });

  assert.ok(typeof result.stats.charsPerSecond === 'number');
  assert.ok(result.stats.charsPerSecond > 0);
});

// ── P0: valid English audio / text path must pass ─────────────────────────

test('normal English sentence with varied content is allowed', () => {
  const result = assessTextQuality('The quick brown fox jumps over the lazy dog.', { durationSec: 3.0 });

  assert.equal(result.allowed, true);
  assert.equal(result.decision, 'PASS');
  assert.deepEqual(result.reasons, []);
});

test('multi-word technical sentence is allowed', () => {
  const result = assessTextQuality('Please connect to the voice bridge application.', { durationSec: 2.5 });

  assert.equal(result.allowed, true);
  assert.equal(result.decision, 'PASS');
});

test('high-confidence ASR metadata produces a PASS decision', () => {
  const result = assessTextQuality('Welcome to the broadcast.', {
    durationSec: 1.8,
    avgLogprob: -0.3,
    maxNoSpeechProb: 0.05,
    languageProbability: 0.98,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.decision, 'PASS');
});

test('low avgLogprob triggers low_logprob soft-block', () => {
  const result = assessTextQuality('Some words here.', { durationSec: 1.5, avgLogprob: -1.5 });

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('low_logprob'));
});

test('low language probability triggers language_uncertain soft-block', () => {
  const result = assessTextQuality('Some words here.', { durationSec: 1.5, languageProbability: 0.2 });

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('language_uncertain'));
});

// ── P0: latency instrumentation passthrough ───────────────────────────────

test('buildAsrResponse preserves whisperMs in asr.metadata', () => {
  const metadata = { whisperMs: 1350, provider: 'zhipu', durationSec: 2.0 };
  const quality = assessTextQuality('Welcome to the show.', metadata);
  const response = buildAsrResponse({ text: 'Welcome to the show.', quality, metadata });

  assert.equal(response.skipped, false);
  assert.equal(response.asr.metadata.whisperMs, 1350, 'whisperMs must be preserved in asr.metadata for latency dashboards');
  assert.equal(response.asr.metadata.provider, 'zhipu');
});

test('buildAsrResponse skipped=true when text is empty, reason is set', () => {
  const metadata = { emptyReason: 'audio_too_short' };
  const quality = assessTextQuality('', metadata);
  const response = buildAsrResponse({ text: '', quality, metadata, skipped: true });

  assert.equal(response.skipped, true);
  assert.equal(response.text, '');
  assert.ok(response.reason != null, 'reason must be non-null for skipped responses');
});

test('buildAsrResponse carries blocking qualityDecision for downstream suppression', () => {
  const metadata = { durationSec: 2.0, maxNoSpeechProb: 0.8 };
  const quality = assessTextQuality('', metadata);
  const response = buildAsrResponse({ text: '', quality, metadata, skipped: true });

  assert.ok(
    ['HARD_BLOCK', 'SOFT_BLOCK'].includes(response.qualityDecision),
    `qualityDecision must indicate blocking, got: ${response.qualityDecision}`,
  );
});

test('buildAsrResponse non-skipped path includes quality stats for observability', () => {
  const metadata = { durationSec: 3.0, whisperMs: 900 };
  const text = 'This is a normal test sentence with clear speech.';
  const quality = assessTextQuality(text, metadata);
  const response = buildAsrResponse({ text, quality, metadata });

  assert.equal(response.skipped, false);
  assert.equal(response.qualityDecision, 'PASS');
  assert.ok(response.asr.quality != null, 'asr.quality must be present');
  assert.ok(typeof response.asr.quality.stats === 'object', 'quality.stats must be an object');
  assert.ok(typeof response.asr.quality.stats.charsPerSecond === 'number', 'charsPerSecond must be a number');
});

test('buildAsrResponse does not mutate the caller metadata object', () => {
  const metadata = { durationSec: 2.0 };
  const before = { ...metadata };
  const quality = assessTextQuality('', metadata);
  buildAsrResponse({ text: '', quality, metadata, skipped: true });

  assert.deepEqual(metadata, before, 'buildAsrResponse must not mutate caller metadata');
});

// ── P0: audio signal quality gate ────────────────────────────────────────────

test('assessAudioSignalQuality: tiny file is hard-blocked as file_too_small', () => {
  const result = assessAudioSignalQuality({ fileSize: 200, durationSec: 1.0 });

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(result.reasons.includes('file_too_small'));
  assert.equal(result.primaryReason, 'file_too_small');
});

test('assessAudioSignalQuality: sub-threshold duration is hard-blocked as audio_too_short', () => {
  const result = assessAudioSignalQuality({ fileSize: 5000, durationSec: 0.2 });

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(result.reasons.includes('audio_too_short'));
});

test('assessAudioSignalQuality: low rmsDb (silence) is hard-blocked as low_signal', () => {
  const result = assessAudioSignalQuality({ fileSize: 20000, durationSec: 1.5, rmsDb: -60 });

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(result.reasons.includes('low_signal'), `reasons: ${JSON.stringify(result.reasons)}`);
});

test('assessAudioSignalQuality: high silentRatio is hard-blocked as mostly_silent', () => {
  const result = assessAudioSignalQuality({ fileSize: 20000, durationSec: 1.5, silentRatio: 0.95 });

  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'HARD_BLOCK');
  assert.ok(result.reasons.includes('mostly_silent'));
});

test('assessAudioSignalQuality: normal audio with valid size and duration is allowed', () => {
  const result = assessAudioSignalQuality({ fileSize: 32000, durationSec: 2.0 });

  assert.equal(result.allowed, true);
  assert.equal(result.decision, 'PASS');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.primaryReason, null);
});

test('assessAudioSignalQuality: normal audio with acceptable rmsDb is allowed', () => {
  const result = assessAudioSignalQuality({ fileSize: 32000, durationSec: 2.0, rmsDb: -20, silentRatio: 0.1 });

  assert.equal(result.allowed, true);
  assert.equal(result.decision, 'PASS');
});

test('assessAudioSignalQuality: stats object includes input fields', () => {
  const result = assessAudioSignalQuality({ fileSize: 16000, durationSec: 1.0, rmsDb: -30, silentRatio: 0.2 });

  assert.equal(result.stats.fileSize, 16000);
  assert.equal(result.stats.durationSec, 1.0);
  assert.equal(result.stats.rmsDb, -30);
  assert.equal(result.stats.silentRatio, 0.2);
  assert.ok(typeof result.stats.estimatedBytesPerSecond === 'number');
});
