// Web Worker (module) — clustering via multilingual word equivalency dictionary.
// No model download, no WASM. Articles are tokenised, normalised, and any
// surface form found in multilingual-dictionary.js collapses to its canonical
// concept id. Articles that share many concept ids are clustered together,
// even when they were written in different languages.
//
// Same message protocol as embeddings-worker.js.

import { STOPWORDS, LIGHT_STEM, REVERSE_INDEX } from '/multilingual-dictionary.js';

const CLUSTER_THRESHOLD = 0.30; // overlap-coefficient threshold for clustering
const RELATED_THRESHOLD = 0.18;
const MIN_TOKENS = 3;           // skip articles with too few signal tokens

// ── Language detection (very cheap: codepoint-class heuristic) ───────────────

function detectLang(text, hint) {
  if (hint && STOPWORDS[hint]) return hint;
  let han = 0, kana = 0, cyr = 0, latin = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x3040 && c <= 0x30ff)      kana++;       // Hiragana + Katakana
    else if (c >= 0x4e00 && c <= 0x9fff) han++;        // CJK Unified
    else if (c >= 0x0400 && c <= 0x04ff) cyr++;        // Cyrillic
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  if (kana > 0)             return 'ja';
  if (han > kana && han > 4) return 'zh';
  if (cyr > latin)          return 'ru';
  return 'en'; // EN is the default for Latin script (close enough for PT/ES too)
}

// ── Tokenisation ─────────────────────────────────────────────────────────────

const SEGMENTER = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter([], { granularity: 'word' })
  : null;

const CJK_RE = /[一-鿿぀-ヿ]/;

function tokenize(text) {
  const lower = text.toLowerCase().normalize('NFKD').replace(/\p{Mn}+/gu, '');
  const out = [];
  if (SEGMENTER) {
    for (const seg of SEGMENTER.segment(lower)) {
      if (!seg.isWordLike) continue;
      const t = seg.segment.trim();
      if (t.length < 2) continue;
      out.push(t);
    }
  } else {
    for (const t of lower.split(/[^\p{L}\p{N}]+/u)) {
      if (t.length >= 2) out.push(t);
    }
  }
  // Add CJK bigrams alongside the segmenter output — improves recall against
  // multi-character concept terms that the segmenter may split.
  for (let i = 0; i < lower.length - 1; i++) {
    const a = lower[i], b = lower[i + 1];
    if (CJK_RE.test(a) && CJK_RE.test(b)) out.push(a + b);
  }
  return out;
}

function canonicalize(article) {
  const text = `${article.title || ''} ${article.description || ''}`;
  const lang = detectLang(text, article.language);
  const stops = STOPWORDS[lang] || STOPWORDS.en;
  const stem = LIGHT_STEM[lang] || (t => t);
  const idx = REVERSE_INDEX[lang] || REVERSE_INDEX.en;

  const set = new Set();
  for (const raw of tokenize(text)) {
    if (stops.has(raw)) continue;
    // 1. exact dictionary hit on the surface form
    let id = idx.get(raw);
    if (!id) {
      // 2. dictionary hit on the lightly-stemmed form
      const stemmed = stem(raw);
      id = idx.get(stemmed) || stemmed;
    }
    if (id.length < 2) continue;
    set.add(id);
  }
  return set;
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (large.has(x)) inter++;
  return inter / small.size; // overlap coefficient
}

// ── Main ─────────────────────────────────────────────────────────────────────

self.onmessage = ({ data: { articles } }) => {
  try {
    self.postMessage({ type: 'status', msg: 'A tokenizar artigos…' });

    const sets = new Array(articles.length);
    for (let i = 0; i < articles.length; i++) {
      sets[i] = canonicalize(articles[i]);
      if (i % 25 === 0 || i === articles.length - 1) {
        self.postMessage({ type: 'progress', done: i + 1, total: articles.length });
      }
    }

    // Related-articles map
    const relatedData = {};
    for (let i = 0; i < articles.length; i++) {
      if (sets[i].size < MIN_TOKENS) continue;
      for (let j = i + 1; j < articles.length; j++) {
        if (sets[j].size < MIN_TOKENS) continue;
        if (articles[i].feed_name === articles[j].feed_name) continue;
        const sim = overlap(sets[i], sets[j]);
        if (sim > RELATED_THRESHOLD) {
          const gi = articles[i].guid, gj = articles[j].guid;
          (relatedData[gi] = relatedData[gi] || []).push(articles[j]);
          (relatedData[gj] = relatedData[gj] || []).push(articles[i]);
        }
      }
    }
    self.postMessage({ type: 'related', data: relatedData });

    // Greedy clustering
    const assigned = new Map();
    let nextCid = 0;
    for (let i = 0; i < articles.length; i++) {
      if (assigned.has(i)) continue;
      if (sets[i].size < MIN_TOKENS) continue;
      let bestJ = -1, bestSim = CLUSTER_THRESHOLD;
      for (let j = 0; j < i; j++) {
        if (sets[j].size < MIN_TOKENS) continue;
        if (articles[j].feed_name === articles[i].feed_name) continue;
        const sim = overlap(sets[i], sets[j]);
        if (sim > bestSim) { bestSim = sim; bestJ = j; }
      }
      if (bestJ === -1) continue;
      const cid = assigned.has(bestJ) ? assigned.get(bestJ) : nextCid++;
      assigned.set(i, cid);
      assigned.set(bestJ, cid);
    }

    const groups = new Map();
    for (const [idx, cid] of assigned) {
      if (!groups.has(cid)) groups.set(cid, []);
      groups.get(cid).push(articles[idx]);
    }

    const clusters = [...groups.values()]
      .map(arts => {
        const feeds = [...new Set(arts.map(a => a.feed_name))];
        if (feeds.length < 2) return null;
        return {
          source_count: feeds.length,
          article_count: arts.length,
          sources: feeds.join(','),
          sample_title: arts[0].title,
          sample_link:  arts[0].link,
          articles: arts,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.source_count - a.source_count || b.article_count - a.article_count);

    self.postMessage({ type: 'clusters', data: clusters });
  } catch (err) {
    self.postMessage({ type: 'error', msg: `${err.name}: ${err.message || err}` });
  }
};
