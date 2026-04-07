function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function tokenizeEnglish(text = '') {
  return normalizeText(text).toLowerCase().split(/[^a-zA-Z']+/).filter(Boolean);
}

const LOW_VALUE_TOKENS = new Set([
  'oh', 'uh', 'um', 'ah', 'huh', 'hmm', 'mm', 'mhm', 'eh', 'er', 'erm',
  'yo', 'yeah', 'yep', 'nope', 'you',
]);

const ARTICLE_TOKENS = new Set(['a', 'an', 'the']);
const VERB_HINT_TOKENS = new Set([
  'am', 'are', 'is', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'done',
  'have', 'has', 'had',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'go', 'goes', 'went', 'gone',
  'say', 'says', 'said',
  'make', 'makes', 'made',
  'take', 'takes', 'took',
  'come', 'comes', 'came',
  'get', 'gets', 'got',
  'see', 'sees', 'saw',
  'know', 'knows', 'knew',
  'think', 'thinks', 'thought',
  'look', 'looks', 'looked',
  'feel', 'feels', 'felt',
  'seem', 'seems', 'seemed',
  'jump', 'jumps', 'jumped',
  'sleep', 'sleeps', 'slept',
  'talk', 'talks', 'talked',
  'need', 'needs', 'needed',
]);
const FUNCTION_WORD_TOKENS = new Set([
  'and', 'or', 'but', 'if', 'so', 'because', 'that', 'which', 'who',
  'in', 'on', 'at', 'to', 'for', 'from', 'with', 'without', 'of', 'by', 'as',
  'over', 'under', 'into', 'onto', 'about', 'after', 'before',
]);

function buildTextRepetitionStats(text = '') {
  const tokens = tokenizeEnglish(text);
  if (!tokens.length) {
    return {
      tokenCount: 0,
      uniqueTokenRatio: 0,
      maxRepeatedRun: 0,
      repeatedBigramRatio: 0,
    };
  }

  let maxRepeatedRun = 1;
  let currentRun = 1;
  for (let idx = 1; idx < tokens.length; idx += 1) {
    if (tokens[idx] === tokens[idx - 1]) {
      currentRun += 1;
      maxRepeatedRun = Math.max(maxRepeatedRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  const bigrams = [];
  for (let idx = 0; idx < tokens.length - 1; idx += 1) {
    bigrams.push(`${tokens[idx]} ${tokens[idx + 1]}`);
  }

  return {
    tokenCount: tokens.length,
    uniqueTokenRatio: tokens.length ? new Set(tokens).size / tokens.length : 0,
    maxRepeatedRun,
    repeatedBigramRatio: bigrams.length ? (bigrams.length - new Set(bigrams).size) / bigrams.length : 0,
  };
}

function isLowValueUtterance(tokens = [], normalizedText = '') {
  if (!tokens.length) return false;
  if (tokens.length <= 2 && tokens.every((token) => LOW_VALUE_TOKENS.has(token))) return true;
  if (tokens.length === 1 && normalizedText.replace(/[^a-zA-Z]/g, '').length <= 4) return true;
  return false;
}

function hasVerbSignal(tokens = []) {
  return tokens.some((token, index) => {
    if (VERB_HINT_TOKENS.has(token)) return true;
    if (token.length >= 5 && /(ed|ing)$/.test(token)) return true;
    if (index > 0 && token.length >= 5 && /s$/.test(token) && !/ss$/.test(token)) return true;
    return false;
  });
}

function isArticleLedContentFragment(tokens = [], normalizedText = '', durationSec = null) {
  if (!tokens.length || durationSec === null) return false;
  if (!ARTICLE_TOKENS.has(tokens[0])) return false;
  if (tokens.length < 3 || tokens.length > 5) return false;
  if (!/[.!?]$/.test(normalizedText || '')) return false;
  if (durationSec > 3.2) return false;
  if (hasVerbSignal(tokens)) return false;

  const tailTokens = tokens.slice(1);
  if (tailTokens.some((token) => FUNCTION_WORD_TOKENS.has(token))) return false;

  return tailTokens.every((token) => /^[a-z]+(?:'[a-z]+)?$/.test(token) && token.length >= 3);
}

function isTruncatedShortPhrase(tokens = [], normalizedText = '', durationSec = null) {
  if (!tokens.length || durationSec === null) return false;
  const startsWithArticle = ARTICLE_TOKENS.has(tokens[0]);
  const shortAudio = durationSec <= 1.0;
  const shortPhrase = tokens.length <= 3;
  const looksSentenceFragment = /[.!?]$/.test(normalizedText || '');
  return (startsWithArticle && shortAudio && shortPhrase && looksSentenceFragment)
    || isArticleLedContentFragment(tokens, normalizedText, durationSec);
}

function assessTextQuality(text = '', metadata = {}) {
  // Shallow copy to avoid mutating the caller's object (B1 fix)
  metadata = { ...metadata };

  const normalizedText = normalizeText(text);
  const tokens = tokenizeEnglish(normalizedText);
  const stats = buildTextRepetitionStats(normalizedText);
  const durationSec = Number(metadata?.durationSec || metadata?.duration || 0) || null;
  const avgLogprob = metadata?.avgLogprob ?? null;
  const maxNoSpeechProb = metadata?.maxNoSpeechProb ?? null;
  const languageProbability = metadata?.languageProbability ?? null;
  const charsPerSecond = metadata?.charsPerSecond ?? (durationSec && normalizedText
    ? normalizedText.replace(/\s+/g, '').length / durationSec
    : null);

  if (!normalizedText && !metadata?.emptyReason) {
    metadata.emptyReason = maxNoSpeechProb !== null && maxNoSpeechProb > 0.7
      ? 'no_speech'
      : 'empty_transcript';
  }

  const reasons = [];
  if (!normalizedText) reasons.push('empty_text');
  if (metadata?.emptyReason) reasons.push(metadata.emptyReason);
  if (normalizedText.length > 0 && normalizedText.length < 2) reasons.push('text_too_short');
  if (avgLogprob !== null && avgLogprob < -1.1) reasons.push('low_logprob');
  if (maxNoSpeechProb !== null && maxNoSpeechProb > 0.7) reasons.push('high_no_speech_prob');
  if (languageProbability !== null && languageProbability < 0.45) reasons.push('language_uncertain');
  if (stats.maxRepeatedRun >= 4 || stats.repeatedBigramRatio >= 0.35) reasons.push('repetitive_text');
  if (charsPerSecond !== null && charsPerSecond > 22) reasons.push('text_audio_mismatch');
  if (durationSec !== null && durationSec >= 0.8 && stats.tokenCount <= 1) reasons.push('too_little_text_for_audio');
  if (isLowValueUtterance(tokens, normalizedText)) reasons.push('low_value_text');
  if (isTruncatedShortPhrase(tokens, normalizedText, durationSec)) reasons.push('truncated_short_phrase');

  const uniqueReasons = [...new Set(reasons.filter(Boolean))];
  let decision = 'PASS';
  if (uniqueReasons.length > 0) {
    if (uniqueReasons.includes('empty_text') || uniqueReasons.includes('high_no_speech_prob') || uniqueReasons.includes('low_value_text')) {
      decision = 'HARD_BLOCK';
    } else {
      decision = 'SOFT_BLOCK';
    }
  }

  return {
    allowed: uniqueReasons.length === 0,
    decision,
    primaryReason: uniqueReasons[0] || null,
    reasons: uniqueReasons,
    stats: {
      ...stats,
      charsPerSecond: charsPerSecond === null ? null : Number(charsPerSecond.toFixed(4)),
      isLowValueUtterance: isLowValueUtterance(tokens, normalizedText),
      hasVerbSignal: hasVerbSignal(tokens),
      isArticleLedContentFragment: isArticleLedContentFragment(tokens, normalizedText, durationSec),
      isTruncatedShortPhrase: isTruncatedShortPhrase(tokens, normalizedText, durationSec),
    },
    normalizedText,
  };
}

function buildAsrResponse({ text = '', quality, metadata = {}, trace, requestId, sessionId, skipped = false }) {
  const normalizedText = normalizeText(text);
  const finalSkipped = Boolean(skipped || !normalizedText);
  const finalReason = metadata?.emptyReason || quality?.primaryReason || (finalSkipped ? 'filtered' : null);

  return {
    text: normalizedText,
    skipped: finalSkipped,
    reason: finalReason,
    reasons: finalSkipped ? (quality?.reasons || (finalReason ? [finalReason] : [])) : [],
    qualityDecision: quality?.decision || (finalSkipped ? 'SOFT_BLOCK' : 'PASS'),
    requestId: requestId || trace?.requestId,
    sessionId: sessionId || trace?.sessionId || undefined,
    asr: {
      metadata,
      quality,
    },
  };
}

module.exports = {
  normalizeText,
  tokenizeEnglish,
  buildTextRepetitionStats,
  isLowValueUtterance,
  hasVerbSignal,
  isArticleLedContentFragment,
  isTruncatedShortPhrase,
  assessTextQuality,
  buildAsrResponse,
};
