/**
 * WorldVibes — IndexedDB layer
 * Stores articles, risk signals, and metadata in the browser.
 */

const DB_NAME = 'world-vibes';
const DB_VERSION = 1;
const PRUNE_DAYS = 3;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      // Articles store
      if (!db.objectStoreNames.contains('articles')) {
        const articles = db.createObjectStore('articles', { keyPath: 'guid' });
        articles.createIndex('pub_date',   'pub_date',   { unique: false });
        articles.createIndex('category',   'category',   { unique: false });
        articles.createIndex('language',   'language',   { unique: false });
        articles.createIndex('feed_name',  'feed_name',  { unique: false });
        articles.createIndex('fetched_at', 'fetched_at', { unique: false });
      }

      // Risk signals store
      if (!db.objectStoreNames.contains('risk_signals')) {
        const risk = db.createObjectStore('risk_signals', { keyPath: 'guid' });
        risk.createIndex('score',    'score',    { unique: false });
        risk.createIndex('event_at', 'event_at', { unique: false });
        risk.createIndex('source',   'source',   { unique: false });
      }

      // Meta store (key-value)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    req.onsuccess = e => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Articles ──────────────────────────────────────────────────────────────────

/**
 * Save an array of article objects. Skips duplicates (guid is primary key).
 * Returns the count of newly inserted articles.
 */
export async function saveArticles(articles) {
  if (!articles.length) return 0;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('articles', 'readwrite');
    const store = tx.objectStore('articles');
    let saved = 0;
    for (const article of articles) {
      const req = store.add(article);
      req.onsuccess = () => { saved++; };
      // Ignore ConstraintError (duplicate guid)
      req.onerror = e => { e.preventDefault(); };
    }
    tx.oncomplete = () => resolve(saved);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get articles with optional filters.
 * @param {object} opts
 * @param {string} [opts.category]
 * @param {string} [opts.language]
 * @param {string} [opts.search]   — simple substring match on title+description
 * @param {number} [opts.hours=48]
 * @param {number} [opts.limit=48]
 * @param {number} [opts.offset=0]
 */
export async function getArticles(opts = {}) {
  const {
    category,
    language,
    search,
    hours = 48,
    limit = 48,
    offset = 0,
  } = opts;

  const db = await openDB();
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('articles', 'readonly');
    const index = tx.objectStore('articles').index('pub_date');
    const results = [];
    const normalSearch = search ? search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : null;

    // Cursor in descending pub_date order
    const range = IDBKeyRange.lowerBound(cutoff);
    const req = index.openCursor(range, 'prev');

    let skipped = 0;

    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { resolve(results); return; }

      const a = cursor.value;

      // Apply filters
      if (category && a.category !== category) { cursor.continue(); return; }
      if (language && a.language !== language) { cursor.continue(); return; }
      if (normalSearch) {
        const haystack = ((a.title || '') + ' ' + (a.description || ''))
          .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!haystack.includes(normalSearch)) { cursor.continue(); return; }
      }

      if (skipped < offset) { skipped++; cursor.continue(); return; }
      if (results.length >= limit) { resolve(results); return; }

      results.push(a);
      cursor.continue();
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Return up to maxTotal articles, taking at most perSource from each feed,
 * ordered by pub_date descending.
 * @param {object} opts
 * @param {number} [opts.hours=48]
 * @param {number} [opts.perSource=10]
 * @param {number} [opts.maxTotal=200]
 */
export async function getArticlesPerSource(opts = {}) {
  const { hours = 48, perSource = 10, maxTotal = 200 } = opts;

  const db = await openDB();
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('articles', 'readonly');
    const index = tx.objectStore('articles').index('pub_date');
    const results = [];
    const countPerSource = {};

    const range = IDBKeyRange.lowerBound(cutoff);
    const req = index.openCursor(range, 'prev');

    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor || results.length >= maxTotal) { resolve(results); return; }

      const a = cursor.value;
      const src = a.feed_name || '';
      const count = countPerSource[src] || 0;

      if (count < perSource) {
        countPerSource[src] = count + 1;
        results.push(a);
      }

      cursor.continue();
    };

    req.onerror = () => reject(req.error);
  });
}

/** Return all distinct categories from stored articles */
export async function getCategories() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('articles', 'readonly');
    const index = tx.objectStore('articles').index('category');
    const categories = new Set();
    const req = index.openKeyCursor(null, 'nextunique');
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { resolve([...categories].sort()); return; }
      categories.add(cursor.key);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Aggregate counts: total, by_category, by_language */
export async function getStats() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('articles', 'readonly');
    const store = tx.objectStore('articles');
    const req = store.openCursor();

    let total = 0;
    const by_category = {};
    const by_language = {};
    const by_feed = {};

    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve({ total, by_category, by_language, by_feed });
        return;
      }
      const a = cursor.value;
      total++;
      by_category[a.category] = (by_category[a.category] || 0) + 1;
      by_language[a.language] = (by_language[a.language] || 0) + 1;
      by_feed[a.feed_name] = (by_feed[a.feed_name] || 0) + 1;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Compute trending keywords from the last `hours` hours.
 * Returns array of { word, count } sorted by count desc.
 */
export async function getTrending(hours = 24) {
  const db = await openDB();
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  // Tokens are NFD-stripped of accents before this check, so entries here
  // must be accent-free to match.
  const STOPWORDS = new Set([
    // EN
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'is','are','was','were','be','been','has','have','had','will','would',
    'can','could','do','does','did','not','by','as','from','this','that',
    'it','its','he','she','they','we','you','said','says','new','one','two',
    'may','also','after','before','about','more','over','up','out','into',
    'who','what','when','where','why','how','than','then','so','if','no',
    'comments','comment','continue','reading','read',
    // PT
    'o','a','os','as','um','uma','uns','umas','de','do','da','dos','das',
    'em','no','na','nos','nas','por','para','com','ao','aos',
    'que','se','nao','foi','sao','esta','ser','ter','e','ou','mas',
    'mais','ja','ele','ela','eles','elas','seu','sua','seus','suas',
    'pelo','pelos','pela','pelas','sobre','segundo','entre','contra','ate',
    'este','estes','estas','esse','essa','esses','essas','isso','isto',
    'neste','nesta','nestes','nestas','nesse','nessa','nesses','nessas',
    'deste','desta','desse','dessa',
    'ainda','quando','onde','entao','tambem','depois','antes','durante',
    'como','anos','ano','dia','dias','semana','apos','feira',
    'leia','clique','veja','aqui',
    'segunda','terca','quarta','quinta','sexta','sabado','domingo',
    'hoje','ontem','amanha','noticia','noticias','comentarios',
    // ES
    'el','la','los','las','un','una','del','al','con','por','para','que',
    'en','no','es','son','fue','han','esta','se','su','sus','y','o',
    'pero','mas','muy','como','este','estos','estas','tambien',
    'sobre','segun','entre','contra',
  ]);

  return new Promise((resolve, reject) => {
    const tx = db.transaction('articles', 'readonly');
    const index = tx.objectStore('articles').index('pub_date');
    const range = IDBKeyRange.lowerBound(cutoff);
    const freq = {};

    const req = index.openCursor(range);
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) {
        const words = Object.entries(freq)
          .filter(([, c]) => c >= 2)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 30)
          .map(([word, count]) => ({ word, count }));
        resolve(words);
        return;
      }
      const a = cursor.value;
      const text = `${a.title || ''} ${a.description || ''}`;
      const tokens = text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !STOPWORDS.has(w));
      for (const w of tokens) {
        freq[w] = (freq[w] || 0) + 1;
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Risk Signals ──────────────────────────────────────────────────────────────

/** Save risk signals, replacing existing ones by guid */
export async function saveRiskSignals(signals) {
  if (!signals.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('risk_signals', 'readwrite');
    const store = tx.objectStore('risk_signals');
    for (const s of signals) {
      store.put({ ...s, fetched_at: new Date().toISOString() });
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/** Get risk signals from the last 5 days, sorted by event_at desc (latest changes first) */
export async function getRiskSignals() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('risk_signals', 'readonly');
    const req = tx.objectStore('risk_signals').getAll();
    req.onsuccess = () => {
      const cutoff = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
      const signals = req.result
        .filter(s => s.event_at >= cutoff)
        .sort((a, b) => b.event_at > a.event_at ? 1 : b.event_at < a.event_at ? -1 : 0);
      resolve(signals);
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Maintenance ───────────────────────────────────────────────────────────────

/** Delete articles older than `days` days */
export async function pruneOld(days = PRUNE_DAYS) {
  const db = await openDB();
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('articles', 'readwrite');
    const index = tx.objectStore('articles').index('pub_date');
    const range = IDBKeyRange.upperBound(cutoff);
    const req = index.openCursor(range);
    let deleted = 0;

    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { resolve(deleted); return; }
      cursor.delete();
      deleted++;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete all risk signals older than `days` days (by event_at) */
export async function pruneRiskSignals(days = 3) {
  const db = await openDB();
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('risk_signals', 'readwrite');
    const index = tx.objectStore('risk_signals').index('event_at');
    const range = IDBKeyRange.upperBound(cutoff);
    const req = index.openCursor(range);
    let deleted = 0;

    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { resolve(deleted); return; }
      cursor.delete();
      deleted++;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
