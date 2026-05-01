// Web Worker (module) — clustering via pure-JS feature hashing.
// No model download, no WASM. Designed as a lightweight alternative to
// embeddings-worker.js for memory-constrained devices (iOS Safari).
//
// Same message protocol as embeddings-worker.js so the main thread switches
// workers transparently:
//   in : { articles: [{ guid, title, description, feed_name }] }
//   out: { type: 'status' | 'progress' | 'related' | 'clusters' | 'error', ... }

import { GLOBAL_STOPWORDS } from '/multilingual-dictionary.js';

const CLUSTER_THRESHOLD = 0.32; // calibrated for hashed cosine on news titles
const RELATED_THRESHOLD = 0.18;
const DIM = 256;

// ── Tokenisation ─────────────────────────────────────────────────────────────

const SEGMENTER = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter([], { granularity: 'word' })
  : null;

const CJK_RE = /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿]/;

function tokenize(text) {
  const out = [];
  const lower = text.toLowerCase().normalize('NFKD').replace(/\p{Mn}+/gu, '');
  if (SEGMENTER) {
    for (const seg of SEGMENTER.segment(lower)) {
      if (!seg.isWordLike) continue;
      const t = seg.segment.trim();
      if (t.length < 2) continue;
      if (GLOBAL_STOPWORDS.has(t)) continue;
      out.push(t);
    }
  } else {
    // Fallback: whitespace + punctuation split (loses CJK granularity)
    for (const t of lower.split(/[^\p{L}\p{N}]+/u)) {
      if (t.length < 2 || GLOBAL_STOPWORDS.has(t)) continue;
      out.push(t);
    }
  }
  // Append CJK character bigrams to capture cross-source matches when
  // Intl.Segmenter splits Chinese/Japanese differently across sources.
  for (let i = 0; i < lower.length - 1; i++) {
    const a = lower[i], b = lower[i + 1];
    if (CJK_RE.test(a) && CJK_RE.test(b)) out.push(a + b);
  }
  return out;
}

// ── Hashing & embedding ──────────────────────────────────────────────────────

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function embed(text) {
  const v = new Float32Array(DIM);
  const tokens = tokenize(text);
  for (const t of tokens) {
    const h1 = fnv1a(t);
    const h2 = fnv1a('§' + t); // sign hash (Weinberger et al.)
    const sign = (h2 & 1) ? 1 : -1;
    v[h1 % DIM] += sign;
  }
  // L2 normalise so cosine = dot product
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
}

function cosineSim(a, b) {
  let dot = 0;
  for (let i = 0; i < DIM; i++) dot += a[i] * b[i];
  return dot; // both pre-normalised
}

// ── Main ─────────────────────────────────────────────────────────────────────

self.onmessage = ({ data: { articles } }) => {
  try {
    self.postMessage({ type: 'status', msg: 'A indexar artigos…' });

    const embeddings = new Array(articles.length);
    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      const text = `${a.title}. ${a.description || ''}`.slice(0, 512);
      embeddings[i] = embed(text);
      if (i % 25 === 0 || i === articles.length - 1) {
        self.postMessage({ type: 'progress', done: i + 1, total: articles.length });
      }
    }

    // Related-articles map (cross-source pairs above the lower threshold)
    const relatedData = {};
    for (let i = 0; i < articles.length; i++) {
      for (let j = i + 1; j < articles.length; j++) {
        if (articles[i].feed_name === articles[j].feed_name) continue;
        const sim = cosineSim(embeddings[i], embeddings[j]);
        if (sim > RELATED_THRESHOLD) {
          const gi = articles[i].guid, gj = articles[j].guid;
          (relatedData[gi] = relatedData[gi] || []).push(articles[j]);
          (relatedData[gj] = relatedData[gj] || []).push(articles[i]);
        }
      }
    }
    self.postMessage({ type: 'related', data: relatedData });

    // Greedy clustering (mirrors embeddings-worker.js)
    const assigned = new Map();
    let nextCid = 0;
    for (let i = 0; i < articles.length; i++) {
      if (assigned.has(i)) continue;
      let bestJ = -1, bestSim = CLUSTER_THRESHOLD;
      for (let j = 0; j < i; j++) {
        if (articles[j].feed_name === articles[i].feed_name) continue;
        const sim = cosineSim(embeddings[i], embeddings[j]);
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
