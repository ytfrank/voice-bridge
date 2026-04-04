const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessTextQuality,
  isArticleLedContentFragment,
  hasVerbSignal,
} = require('../quality_gate');

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
