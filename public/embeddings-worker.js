// Web Worker (module) — semantic clustering via Transformers.js in browser
// Model is downloaded once and cached by the browser automatically.

const SIMILARITY_THRESHOLD = 0.76;
const IDB_NAME  = 'wv-embeddings';
const IDB_STORE = 'emb';
const IDB_VER   = 1;

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function idbGet(db, key) {
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function idbPut(db, key, val) {
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(val, key);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}

// ── Main message handler ──────────────────────────────────────────────────────

self.onmessage = async ({ data: { articles } }) => {
  try {
    self.postMessage({ type: 'status', msg: 'A carregar biblioteca…' });
    const { pipeline, env } = await import('/lib/transformers.min.js');
    env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';

    self.postMessage({ type: 'status', msg: 'A abrir cache local…' });
    const db = await openDB();

    self.postMessage({ type: 'status', msg: 'A inicializar modelo…' });
    const progressCb = (info) => {
      if (info.status === 'downloading') {
        self.postMessage({
          type: 'download',
          file: info.file,
          progress: Math.round(info.progress || 0),
        });
      } else if (info.status === 'initiate') {
        self.postMessage({ type: 'status', msg: 'A inicializar modelo (primeira vez: ~430MB)…' });
      }
    };
    let pipe;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        pipe = await pipeline(
          'feature-extraction',
          'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
          { progress_callback: progressCb }
        );
        break;
      } catch (modelErr) {
        if (attempt === 2) throw modelErr;
        const delay = 2000 * Math.pow(2, attempt);
        self.postMessage({ type: 'status', msg: `Erro ao carregar modelo — nova tentativa em ${delay / 1000}s…` });
        await new Promise(r => setTimeout(r, delay));
      }
    }

    self.postMessage({ type: 'status', msg: 'A analisar artigos…' });

    // Compute / load cached embeddings
    const embeddings = new Array(articles.length);
    for (let i = 0; i < articles.length; i++) {
      const art = articles[i];
      let emb = await idbGet(db, art.guid);
      if (!emb) {
        const text = `${art.title}. ${art.description || ''}`.slice(0, 512);
        const out  = await pipe(text, { pooling: 'mean', normalize: true });
        emb = new Float32Array(out.data);
        await idbPut(db, art.guid, emb).catch(() => {}); // non-fatal
      }
      embeddings[i] = emb;
      self.postMessage({ type: 'progress', done: i + 1, total: articles.length });
    }

    // Related articles map (lower threshold than clustering — topically related)
    const RELATED_THRESHOLD = 0.45;
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

    // Greedy cosine similarity clustering
    const assigned = new Map(); // article index → cluster id
    let nextCid = 0;

    for (let i = 0; i < articles.length; i++) {
      if (assigned.has(i)) continue;
      let bestJ = -1, bestSim = SIMILARITY_THRESHOLD;

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

    // Build cluster objects
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
    const isModelFetchError = err instanceof SyntaxError ||
      (err.message && (err.message.includes('JSON') || err.message.includes('Unexpected token')));
    const friendlyMsg = isModelFetchError
      ? 'modelo de IA indisponível — verifique sua conexão e tente novamente'
      : `${err.name}: ${err.message}`;
    self.postMessage({ type: 'error', msg: friendlyMsg });
  }
};
