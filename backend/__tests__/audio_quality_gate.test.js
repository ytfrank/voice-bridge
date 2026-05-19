/**
 * Tests for assessAudioSignalQuality — V2.0 audio signal gate (P0).
 *
 * This function is NOT yet exported from quality_gate.js.
 * Tests here define the expected contract so Backend Dev can implement it.
 *
 * Expected export:
 *   assessAudioSignalQuality(metadata) → {
 *     allowed:       boolean,
 *     decision:      'PASS' | 'HARD_BLOCK' | 'SOFT_BLOCK',
 *     primaryReason: string | null,
 *     reasons:       string[]
 *   }
 *
 * Expected metadata fields (all optional):
 *   fileSize                — bytes of the uploaded file
 *   durationSec             — probed audio duration in seconds
 *   estimatedBytesPerSecond — fileSize / durationSec; low value → near-silence
 *   rmsDb                   — RMS loudness in dBFS (-∞ to 0); very low → silence
 *   silentRatio             — fraction of VAD-silent frames (0–1)
 *
 * Blocking thresholds (suggested, tunable via env):
 *   fileSize < 512                   → file_too_small
 *   durationSec < 0.35               → duration_too_short
 *   estimatedBytesPerSecond < 800    → low_bytes_per_second
 *   rmsDb < -50                      → low_rms
 *   silentRatio > 0.85               → high_silent_ratio
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// If assessAudioSignalQuality is not yet exported, tests will fail with
// "TypeError: assessAudioSignalQuality is not a function" — that is expected
// and signals the implementation is pending.
const { assessAudioSignalQuality } = require('../quality_gate');

// ── tiny / zero-size file ────────────────────────────────────────────────

test('audio signal: file with 100 bytes is blocked as too small', () => {
  const result = assessAudioSignalQuality({ fileSize: 100 });

  assert.equal(result.allowed, false, 'tiny file must be blocked');
  assert.ok(
    result.reasons.some((r) => /small|tiny|file|size/.test(r)),
    `expected file-size reason, got: ${JSON.stringify(result.reasons)}`,
  );
});

test('audio signal: file with 400 bytes (below 512 threshold) is blocked', () => {
  const result = assessAudioSignalQuality({ fileSize: 400 });

  assert.equal(result.allowed, false);
});

test('audio signal: zero-byte file is blocked', () => {
  const result = assessAudioSignalQuality({ fileSize: 0 });

  assert.equal(result.allowed, false);
});

// ── short duration ────────────────────────────────────────────────────────

test('audio signal: duration 0.2s (below 0.35s threshold) is blocked', () => {
  const result = assessAudioSignalQuality({ fileSize: 10000, durationSec: 0.2 });

  assert.equal(result.allowed, false, 'sub-threshold duration must be blocked');
  assert.ok(
    result.reasons.some((r) => /duration|short/.test(r)),
    `expected duration reason, got: ${JSON.stringify(result.reasons)}`,
  );
});

test('audio signal: zero duration is blocked', () => {
  const result = assessAudioSignalQuality({ fileSize: 10000, durationSec: 0 });

  assert.equal(result.allowed, false);
});

// ── low bytes-per-second (near-silence signal density) ───────────────────

test('audio signal: 200 bytes/sec (well below 800 threshold) is blocked', () => {
  const result = assessAudioSignalQuality({
    fileSize: 1000,
    durationSec: 5.0,
    estimatedBytesPerSecond: 200,
  });

  assert.equal(result.allowed, false, 'low bytes/sec (near-silence) must be blocked');
  assert.ok(
    result.reasons.some((r) => /bytes|signal|low/.test(r)),
    `expected low-signal reason, got: ${JSON.stringify(result.reasons)}`,
  );
});

test('audio signal: 500 bytes/sec is blocked as low signal', () => {
  const result = assessAudioSignalQuality({
    fileSize: 2500,
    durationSec: 5.0,
    estimatedBytesPerSecond: 500,
  });

  assert.equal(result.allowed, false);
});

// ── low RMS (silence) ────────────────────────────────────────────────────

test('audio signal: rmsDb of -60dB (near-silence) is blocked', () => {
  const result = assessAudioSignalQuality({
    fileSize: 32000,
    durationSec: 2.0,
    estimatedBytesPerSecond: 16000,
    rmsDb: -60,
  });

  assert.equal(result.allowed, false, 'near-silence rmsDb must be blocked');
  assert.ok(
    result.reasons.some((r) => /rms|silent|energy|low/.test(r)),
    `expected rms/silence reason, got: ${JSON.stringify(result.reasons)}`,
  );
});

test('audio signal: rmsDb of -55dB is blocked', () => {
  const result = assessAudioSignalQuality({
    fileSize: 32000,
    durationSec: 2.0,
    rmsDb: -55,
  });

  assert.equal(result.allowed, false);
});

// ── high silent ratio ─────────────────────────────────────────────────────

test('audio signal: 92% silent ratio is blocked', () => {
  const result = assessAudioSignalQuality({
    fileSize: 32000,
    durationSec: 2.0,
    rmsDb: -30,
    silentRatio: 0.92,
  });

  assert.equal(result.allowed, false, 'mostly-silent audio must be blocked');
  assert.ok(
    result.reasons.some((r) => /silent|silence|ratio/.test(r)),
    `expected silent-ratio reason, got: ${JSON.stringify(result.reasons)}`,
  );
});

test('audio signal: 88% silent ratio is blocked', () => {
  const result = assessAudioSignalQuality({
    fileSize: 32000,
    durationSec: 2.0,
    rmsDb: -25,
    silentRatio: 0.88,
  });

  assert.equal(result.allowed, false);
});

// ── valid speech-like metadata → allowed ─────────────────────────────────

test('audio signal: typical speech metadata (good rms, low silent ratio) is allowed', () => {
  const result = assessAudioSignalQuality({
    fileSize: 64000,
    durationSec: 2.0,
    estimatedBytesPerSecond: 32000,
    rmsDb: -18,
    silentRatio: 0.1,
  });

  assert.equal(result.allowed, true, 'normal speech signal must be allowed');
  assert.equal(result.decision, 'PASS');
  assert.deepEqual(result.reasons, []);
});

test('audio signal: moderate speech signal (mid-level rms, moderate silent) is allowed', () => {
  const result = assessAudioSignalQuality({
    fileSize: 40000,
    durationSec: 2.5,
    estimatedBytesPerSecond: 16000,
    rmsDb: -25,
    silentRatio: 0.3,
  });

  assert.equal(result.allowed, true, 'moderate speech signal must be allowed');
});

test('audio signal: longer valid audio chunk is allowed', () => {
  const result = assessAudioSignalQuality({
    fileSize: 96000,
    durationSec: 3.0,
    estimatedBytesPerSecond: 32000,
    rmsDb: -15,
    silentRatio: 0.05,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.decision, 'PASS');
});

// ── partial metadata (graceful handling) ─────────────────────────────────

test('audio signal: adequate fileSize alone (no other signals) is tentatively allowed', () => {
  const result = assessAudioSignalQuality({ fileSize: 50000 });

  // Without rmsDb/silentRatio, energy checks cannot fire; file is large enough
  assert.ok(typeof result.allowed === 'boolean', 'must return boolean allowed');
  assert.ok(Array.isArray(result.reasons), 'must return reasons array');
  assert.equal(result.allowed, true, 'adequate file size with no contradicting signals should pass');
});

test('audio signal: empty metadata object does not throw and returns shape', () => {
  assert.doesNotThrow(() => assessAudioSignalQuality({}));

  const result = assessAudioSignalQuality({});
  assert.ok(typeof result.allowed === 'boolean', 'allowed must be boolean');
  assert.ok(typeof result.decision === 'string', 'decision must be a string');
  assert.ok(Array.isArray(result.reasons), 'reasons must be an array');
  assert.ok('primaryReason' in result, 'primaryReason key must exist');
});

test('audio signal: null metadata does not throw', () => {
  assert.doesNotThrow(() => assessAudioSignalQuality(null));
});
