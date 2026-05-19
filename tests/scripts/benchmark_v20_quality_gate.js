#!/usr/bin/env node
/*
 * Voice Bridge V2.0 offline quality-gate benchmark.
 *
 * Purpose: provide a fast, repeatable P0 smoke benchmark for ASR hallucination
 * controls without calling external ASR/translation APIs.
 *
 * Usage:
 *   node tests/scripts/benchmark_v20_quality_gate.js
 */

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const {
  assessTextQuality,
  assessAudioSignalQuality,
  buildAsrResponse,
} = require('../../backend/quality_gate');

const cases = [
  {
    name: 'silence_tiny_file',
    type: 'audio',
    metadata: { fileSize: 100, durationSec: 1.0, rmsDb: -65, silentRatio: 1.0 },
    expectAllowed: false,
  },
  {
    name: 'too_short_audio',
    type: 'audio',
    metadata: { fileSize: 12000, durationSec: 0.2 },
    expectAllowed: false,
  },
  {
    name: 'low_signal_audio',
    type: 'audio',
    metadata: { fileSize: 2500, durationSec: 5.0, estimatedBytesPerSecond: 500 },
    expectAllowed: false,
  },
  {
    name: 'normal_speech_audio',
    type: 'audio',
    metadata: { fileSize: 64000, durationSec: 2.0, estimatedBytesPerSecond: 32000, rmsDb: -18, silentRatio: 0.1 },
    expectAllowed: true,
  },
  {
    name: 'filler_text',
    type: 'text',
    text: 'uh um',
    metadata: { durationSec: 1.0 },
    expectAllowed: false,
  },
  {
    name: 'repeated_hallucination_text',
    type: 'text',
    text: 'thank you for coming thank you for coming thank you for coming',
    metadata: { durationSec: 2.0 },
    expectAllowed: false,
  },
  {
    name: 'short_audio_long_text_mismatch',
    type: 'text',
    text: 'Hello world this is a surprisingly long hallucinated sentence.',
    metadata: { durationSec: 0.35 },
    expectAllowed: false,
  },
  {
    name: 'normal_english_broadcast_text',
    type: 'text',
    text: 'The market opened higher today after several technology companies reported strong earnings.',
    metadata: { durationSec: 4.0, avgLogprob: -0.25, maxNoSpeechProb: 0.03, languageProbability: 0.98 },
    expectAllowed: true,
  },
];

const results = [];
const t0 = performance.now();

for (const c of cases) {
  const start = performance.now();
  const quality = c.type === 'audio'
    ? assessAudioSignalQuality(c.metadata)
    : assessTextQuality(c.text, c.metadata);
  const elapsedMs = performance.now() - start;

  try {
    assert.equal(quality.allowed, c.expectAllowed, `${c.name} allowed mismatch`);
    if (!quality.allowed) assert.ok(quality.reasons.length > 0, `${c.name} must expose reasons`);
    if (quality.allowed) assert.equal(quality.decision, 'PASS', `${c.name} allowed case must PASS`);
  } catch (err) {
    results.push({ name: c.name, ok: false, elapsedMs: Number(elapsedMs.toFixed(3)), error: err.message, quality });
    continue;
  }

  results.push({ name: c.name, ok: true, elapsedMs: Number(elapsedMs.toFixed(3)), decision: quality.decision, reasons: quality.reasons });
}

const blockedQuality = assessTextQuality('ha ha ha ha ha', { durationSec: 2.0, whisperMs: 750 });
const blockedResponse = buildAsrResponse({
  text: '',
  skipped: true,
  quality: blockedQuality,
  metadata: { durationSec: 2.0, whisperMs: 750 },
});
assert.equal(blockedResponse.skipped, true, 'blocked response must be skipped');
assert.equal(blockedResponse.text, '', 'blocked response must not expose text downstream');
assert.equal(blockedResponse.asr.metadata.whisperMs, 750, 'latency metadata must survive response wrapping');

const totalMs = performance.now() - t0;
const failed = results.filter((r) => !r.ok);
const report = {
  benchmark: 'v20_quality_gate_offline',
  totalMs: Number(totalMs.toFixed(3)),
  passed: failed.length === 0,
  cases: results,
};

console.log(JSON.stringify(report, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
