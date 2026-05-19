#!/usr/bin/env node
/**
 * Latency benchmark for quality_gate.js — V2.0 P0 latency instrumentation check.
 *
 * Usage:  node tests/scripts/benchmark_quality_gate.js
 *
 * Measures throughput and per-call latency of assessTextQuality so that the
 * gate never becomes a bottleneck in the real-time pipeline.
 * Target: p95 < 1ms per call (pure JS, no I/O).
 */

'use strict';

const { assessTextQuality, buildAsrResponse } = require('../../backend/quality_gate');

const WARMUP_REPS = 200;
const BENCH_REPS = 2000;

const CASES = [
  { label: 'empty (silence)',        text: '',                         meta: {} },
  { label: 'filler (uh um)',         text: 'uh um',                   meta: {} },
  { label: 'repetitive text',        text: 'ha ha ha ha ha ha ha ha', meta: {} },
  { label: 'mismatch (fast chars)',  text: 'Hello world this is a test.', meta: { durationSec: 0.3 } },
  { label: 'valid short sentence',   text: 'Hello, how are you today?',   meta: { durationSec: 1.5 } },
  { label: 'valid long sentence',    text: 'The quick brown fox jumps over the lazy dog near the river bank.', meta: { durationSec: 4.0 } },
  {
    label: 'full ASR metadata',
    text: 'Welcome to the evening broadcast.',
    meta: { durationSec: 2.2, avgLogprob: -0.4, maxNoSpeechProb: 0.03, languageProbability: 0.97, whisperMs: 1100 },
  },
];

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function bench(label, fn, reps) {
  // warmup
  for (let i = 0; i < WARMUP_REPS; i++) fn();

  const samples = [];
  for (let i = 0; i < reps; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6); // ms
  }
  samples.sort((a, b) => a - b);

  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const p50  = percentile(samples, 50);
  const p95  = percentile(samples, 95);
  const p99  = percentile(samples, 99);

  const pass = p95 < 1.0;
  const status = pass ? 'PASS' : 'WARN';

  console.log(`[${status}] ${label}`);
  console.log(`       mean=${mean.toFixed(4)}ms  p50=${p50.toFixed(4)}ms  p95=${p95.toFixed(4)}ms  p99=${p99.toFixed(4)}ms  n=${reps}`);
  return { label, mean, p50, p95, p99, pass };
}

console.log('=== quality_gate latency benchmark (V2.0 P0) ===');
console.log(`reps=${BENCH_REPS}  node=${process.version}\n`);

const results = [];

for (const { label, text, meta } of CASES) {
  const r = bench(label, () => assessTextQuality(text, meta), BENCH_REPS);
  results.push(r);
}

// buildAsrResponse passthrough
results.push(bench('buildAsrResponse (pass)', () => {
  const meta = { durationSec: 2.0, whisperMs: 900 };
  const q = assessTextQuality('Good morning everyone.', meta);
  return buildAsrResponse({ text: 'Good morning everyone.', quality: q, metadata: meta });
}, BENCH_REPS));

console.log('\n--- summary ---');
const allPass = results.every((r) => r.pass);
for (const r of results) {
  const flag = r.pass ? '✓' : '✗';
  console.log(`  ${flag} ${r.label.padEnd(35)} p95=${r.p95.toFixed(4)}ms`);
}

console.log(`\nOverall: ${allPass ? 'PASS — all p95 < 1ms' : 'WARN — some p95 ≥ 1ms (review above)'}`);
process.exit(allPass ? 0 : 1);
