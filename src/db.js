const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "..", "data", "news.db");

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guid        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    link        TEXT NOT NULL,
    description TEXT,
    content     TEXT,
    pub_date    TEXT,
    author      TEXT,
    feed_name   TEXT NOT NULL,
    category    TEXT NOT NULL,
    language    TEXT DEFAULT 'en',
    fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_articles_pub_date  ON articles(pub_date DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_category  ON articles(category);
  CREATE INDEX IF NOT EXISTS idx_articles_language  ON articles(language);
  CREATE INDEX IF NOT EXISTS idx_articles_feed_name ON articles(feed_name);

  CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
    title, description, content,
    content='articles', content_rowid='id'
  );

  CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
    INSERT INTO articles_fts(rowid, title, description, content)
    VALUES (new.id, COALESCE(new.title,''), COALESCE(new.description,''), COALESCE(new.content,''));
  END;

  CREATE TABLE IF NOT EXISTS clusters (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    article_count INTEGER NOT NULL DEFAULT 1,
    source_count  INTEGER NOT NULL DEFAULT 1,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Risk signals table ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS risk_signals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guid        TEXT UNIQUE NOT NULL,
    source      TEXT NOT NULL,
    category    TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    level       TEXT NOT NULL,
    score       INTEGER NOT NULL,
    url         TEXT,
    location    TEXT,
    event_at    TEXT,
    fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_risk_score ON risk_signals(score DESC, event_at DESC);
`);

// Add cluster_id column to articles if not yet present (idempotent migration)
try {
  db.exec("ALTER TABLE articles ADD COLUMN cluster_id INTEGER REFERENCES clusters(id)");
} catch { /* column already exists */ }

// Add embedding column for ML-based clustering (idempotent migration)
try {
  db.exec("ALTER TABLE articles ADD COLUMN embedding BLOB");
} catch { /* column already exists */ }

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_articles_cluster_id ON articles(cluster_id);
`);

const insertArticle = db.prepare(`
  INSERT OR IGNORE INTO articles
    (guid, title, link, description, content, pub_date, author, feed_name, category, language)
  VALUES
    (@guid, @title, @link, @description, @content, @pub_date, @author, @feed_name, @category, @language)
`);

// ── Stopwords ─────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  // English — function words
  "the","and","for","are","was","with","this","that","have","from","they",
  "will","been","their","said","what","which","when","were","also","into",
  "more","than","then","your","about","after","over","other","only","some",
  "just","most","like","time","would","could","should","there","these",
  "those","each","very","much","well","such","know","even","both","come",
  "here","its","has","his","her","our","any","all","now","new","can",
  "may","one","two","three","how","who","but","not","yet","still",
  // English — days & months
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
  "january","february","march","april","june","july","august",
  "september","october","november","december",
  // English — common news verbs (low signal)
  "says","say","said","told","tell","tells","report","reports","reported",
  "calls","called","asks","asked","makes","made","take","took","give","gave",
  "held","left","gets","sets","hits","puts","runs","goes","went","come",
  "came","seen","sees","keep","kept","used","uses","want","wants","need",
  "needs","show","shows","find","found","help","helps","plan","plans",
  "move","moves","turn","turns","face","faces","lead","leads","meet","meets",
  "hold","holds","open","opens","push","claim","claims","warn","warns",
  "urge","urges","seek","seeks","back","draw","drawn","sign","vote","votes",
  "raise","raised","lower","lowered","named","amid","despite","according",
  // English — generic news nouns (low signal)
  "news","year","years","week","weeks","days","today","month","months",
  "time","times","people","world","country","countries","state","states",
  "government","president","minister","official","officials","statement",
  "first","last","next","high","away","live","deal","talk","talks",
  "says","call","calls","case","cases","part","parts","group","groups",
  "area","areas","home","city","cities","place","places","point","points",
  "right","rights","side","sides","life","lives","line","lines","long",
  "number","numbers","major","major","latest","former","senior","amid",
  // English — RSS/blog boilerplate
  "reading","read","continue","continued","click","subscribe","follow",
  "comment","comments","leave","share","tweet","posted","post","appeared",
  "https","http","www","via","full","story","article","source","author",
  "million","billion","trillion","thousand","percent",
  // Portuguese — function words
  "para","como","uma","dos","das","mais","por","isso","este","esta","pelo",
  "pela","seus","suas","sobre","entre","antes","depois","ainda","pode",
  "pois","quando","onde","numa","quem","qual","tudo","toda","todos","todas",
  "novo","nova","novos","novas","anos","sendo","foram","têm","após","caso",
  // Portuguese — days & months
  "segunda","terça","quarta","quinta","sexta","sábado","domingo",
  "janeiro","fevereiro","março","abril","maio","junho","julho","agosto",
  "setembro","outubro","novembro","dezembro",
  // Portuguese — common news verbs & nouns
  "disse","afirmou","segundo","conforme","durante","enquanto","através",
  "governo","presidente","ministro","primeiro","última","último",
  "declarou","anunciou","informou","pessoas","mundo","país","países",
  "estado","estados","cidade","cidades","semana","meses","hoje","ontem",
  "desta","deste","nesta","neste","pelo","pela","pelos","pelas",
  // Portuguese — RSS/blog boilerplate
  "leia","clique","acesse","saiba","veja","confira","matéria","notícia",
  "feira","leia","conteúdo","texto","artigo","postagem","publicado",
  "continua","continue","clique","aqui","mais","fonte","autor",
  // Spanish — function words
  "para","como","los","las","sus","del","pero","sido","estos","estas",
  "todo","toda","ellos","ellas","después","antes","sobre","también","puede",
  "están","tiene","tienen","según","través","contra","durante","mismo","hace",
  // Spanish — days & months
  "lunes","martes","miércoles","jueves","viernes","sábado","domingo",
  "enero","febrero","marzo","abril","mayo","junio","julio","agosto",
  "septiembre","octubre","noviembre","diciembre",
  // Spanish — common news verbs & nouns
  "dice","dijo","afirmó","señaló","aseguró","informó","anunció",
  "gobierno","presidente","ministro","primero","nueva","nuevo",
  "personas","mundo","país","países","estado","estados","ciudad",
  "ciudades","semana","meses","hoy","ayer","esta","este","estos",
]);

// ── Story clustering (embedding-based) ────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.78;

const stmtSetCluster    = db.prepare("UPDATE articles SET cluster_id = ? WHERE id = ?");
const stmtInsertCluster = db.prepare(
  "INSERT INTO clusters (article_count, source_count) VALUES (?, ?)"
);
const stmtRecalcCluster = db.prepare(`
  UPDATE clusters SET
    article_count = (SELECT COUNT(*)                  FROM articles WHERE cluster_id = ?),
    source_count  = (SELECT COUNT(DISTINCT feed_name) FROM articles WHERE cluster_id = ?),
    updated_at    = datetime('now')
  WHERE id = ?
`);
const stmtGetCandidates = db.prepare(`
  SELECT id, cluster_id, embedding FROM articles
  WHERE pub_date >= datetime('now', '-48 hours')
    AND id != ?
    AND language = ?
    AND feed_name != ?
    AND embedding IS NOT NULL
`);

function cosineSim(bufA, bufB) {
  const a = new Float32Array(bufA.buffer, bufA.byteOffset, bufA.byteLength / 4);
  const b = new Float32Array(bufB.buffer, bufB.byteOffset, bufB.byteLength / 4);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function clusterArticle(articleId) {
  const article = db.prepare(
    "SELECT id, language, feed_name, cluster_id, embedding FROM articles WHERE id = ?"
  ).get(articleId);
  if (!article || !article.embedding) return;

  const candidates = stmtGetCandidates.all(articleId, article.language, article.feed_name);

  let bestMatch = null;
  let bestSim   = SIMILARITY_THRESHOLD;

  for (const cand of candidates) {
    if (!cand.embedding) continue;
    const sim = cosineSim(article.embedding, cand.embedding);
    if (sim > bestSim) {
      bestSim   = sim;
      bestMatch = cand;
    }
  }

  if (!bestMatch) return;

  if (bestMatch.cluster_id) {
    stmtSetCluster.run(bestMatch.cluster_id, articleId);
    stmtRecalcCluster.run(bestMatch.cluster_id, bestMatch.cluster_id, bestMatch.cluster_id);
  } else {
    const cid = stmtInsertCluster.run(2, 2).lastInsertRowid;
    stmtSetCluster.run(cid, articleId);
    stmtSetCluster.run(cid, bestMatch.id);
    stmtRecalcCluster.run(cid, cid, cid);
  }
}

// ── Save articles ─────────────────────────────────────────────────────────────

function saveArticles(articles) {
  return db.transaction((items) => {
    let count = 0;
    for (const item of items) {
      if (insertArticle.run(item).changes > 0) count++;
    }
    return count;
  })(articles);
}

// ── Embed new articles and cluster them (called after each fetchAll) ───────────

async function embedAndCluster() {
  const { embed } = require("./embeddings");
  const unembedded = db.prepare(
    "SELECT id, title, description FROM articles WHERE embedding IS NULL ORDER BY fetched_at DESC"
  ).all();

  if (unembedded.length === 0) return;
  console.log(`[embeddings] Processing ${unembedded.length} articles…`);

  const stmtSaveEmb = db.prepare("UPDATE articles SET embedding = ? WHERE id = ?");

  for (const article of unembedded) {
    const text = `${article.title}. ${article.description || ""}`.slice(0, 512);
    try {
      const buf = await embed(text);
      stmtSaveEmb.run(buf, article.id);
      clusterArticle(article.id);
    } catch (err) {
      console.error(`[embeddings] article ${article.id}: ${err.message}`);
    }
  }
  console.log("[embeddings] Done.");
}

// ── FTS query sanitizer ───────────────────────────────────────────────────────

function toFTSQuery(q) {
  return q
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" AND ");
}

// ── Get articles ──────────────────────────────────────────────────────────────

function getArticles({ category, language, search, hours, limit = 50, offset = 0 } = {}) {
  const params = [];
  const since = hours ? new Date(Date.now() - hours * 3600000).toISOString() : null;

  if (search) {
    const ftsQuery = toFTSQuery(search);
    if (!ftsQuery) return [];

    let query = `
      SELECT a.*, COALESCE(c.source_count, 1) AS source_count
      FROM articles a
      JOIN articles_fts ON a.id = articles_fts.rowid
      LEFT JOIN clusters c ON a.cluster_id = c.id
      WHERE articles_fts MATCH ?
    `;
    params.push(ftsQuery);

    if (since) {
      query += " AND a.pub_date >= ?";
      params.push(since);
    }
    if (category && category !== "all") {
      query += " AND a.category = ?";
      params.push(category);
    }
    if (language && language !== "all") {
      query += " AND a.language = ?";
      params.push(language);
    }

    query += " ORDER BY bm25(articles_fts), a.pub_date DESC, COALESCE(c.source_count, 1) DESC";
    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    try {
      return db.prepare(query).all(...params);
    } catch {
      return [];
    }
  }

  // No search — use regular indexed query
  let query = `
    SELECT a.*, COALESCE(c.source_count, 1) AS source_count
    FROM articles a
    LEFT JOIN clusters c ON a.cluster_id = c.id
    WHERE 1=1
  `;

  if (since) {
    query += " AND a.pub_date >= ?";
    params.push(since);
  }
  if (category && category !== "all") {
    query += " AND a.category = ?";
    params.push(category);
  }
  if (language && language !== "all") {
    query += " AND a.language = ?";
    params.push(language);
  }

  query += " ORDER BY a.pub_date DESC, COALESCE(c.source_count, 1) DESC, a.fetched_at DESC";
  query += " LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

// ── Top story clusters ────────────────────────────────────────────────────────

function getTopClusters(limit = 20) {
  return db.prepare(`
    SELECT
      c.id,
      c.source_count,
      c.article_count,
      c.updated_at,
      GROUP_CONCAT(DISTINCT a.feed_name) AS sources,
      (SELECT title FROM articles WHERE cluster_id = c.id ORDER BY pub_date DESC LIMIT 1) AS sample_title,
      (SELECT link  FROM articles WHERE cluster_id = c.id ORDER BY pub_date DESC LIMIT 1) AS sample_link
    FROM clusters c
    JOIN articles a ON a.cluster_id = c.id
    WHERE c.source_count >= 2
    GROUP BY c.id
    ORDER BY c.source_count DESC, c.updated_at DESC
    LIMIT ?
  `).all(limit);
}

// ── Categories / Stats ────────────────────────────────────────────────────────

function getCategories() {
  return db.prepare("SELECT DISTINCT category FROM articles ORDER BY category").all().map((r) => r.category);
}

function getStats() {
  const clusterStats = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN source_count >= 2 THEN 1 ELSE 0 END) as multi FROM clusters"
  ).get();
  return {
    total: db.prepare("SELECT COUNT(*) as c FROM articles").get().c,
    byCategory: db.prepare("SELECT category, COUNT(*) as count FROM articles GROUP BY category ORDER BY count DESC").all(),
    byLanguage: db.prepare("SELECT language, COUNT(*) as count FROM articles GROUP BY language ORDER BY count DESC").all(),
    lastFetch: db.prepare("SELECT MAX(fetched_at) as last FROM articles").get().last,
    clusters: {
      total: clusterStats.total || 0,
      multiSource: clusterStats.multi || 0,
    },
  };
}

// ── Trending keywords ─────────────────────────────────────────────────────────

function getTrending(hours = 24, topN = 20) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const rows = db.prepare(
    "SELECT title, description FROM articles WHERE fetched_at >= ?"
  ).all(since);

  const freq = {};
  for (const row of rows) {
    const text = `${row.title || ""} ${row.description || ""}`;
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .forEach((w) => {
        if (w.length > 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) {
          freq[w] = (freq[w] || 0) + 1;
        }
      });
  }

  return Object.entries(freq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, count]) => ({ term, count }));
}

// ── Related articles ──────────────────────────────────────────────────────────

function getRelated(articleId, limit = 5) {
  const article = db.prepare("SELECT id, title, description, category, language FROM articles WHERE id = ?").get(articleId);
  if (!article) return [];

  const text = `${article.title} ${article.description || ""}`;
  const seen = new Set();
  const keywords = [];
  for (const w of text.replace(/[^\w\s]/g, " ").split(/\s+/)) {
    const lower = w.toLowerCase();
    if (w.length > 3 && !STOPWORDS.has(lower) && !/^\d+$/.test(w) && !seen.has(lower)) {
      seen.add(lower);
      keywords.push(`"${w}"`);
    }
    if (keywords.length >= 8) break;
  }

  if (!keywords.length) return [];

  const andQuery = keywords.join(" AND ");
  const orQuery  = keywords.join(" OR ");

  try {
    const results = db.prepare(`
      SELECT a.* FROM articles a
      JOIN articles_fts ON a.id = articles_fts.rowid
      WHERE articles_fts MATCH ?
        AND a.id != ?
        AND a.language = ?
      ORDER BY bm25(articles_fts)
      LIMIT ?
    `).all(andQuery, articleId, article.language, limit);

    if (results.length >= limit) return results;

    const excludeIds = [articleId, ...results.map((r) => r.id)];
    const placeholders = excludeIds.map(() => "?").join(",");
    const extra = db.prepare(`
      SELECT a.* FROM articles a
      JOIN articles_fts ON a.id = articles_fts.rowid
      WHERE articles_fts MATCH ?
        AND a.id NOT IN (${placeholders})
        AND a.language = ?
        AND a.category = ?
      ORDER BY bm25(articles_fts)
      LIMIT ?
    `).all(orQuery, ...excludeIds, article.language, article.category, limit - results.length);

    return [...results, ...extra];
  } catch {
    return [];
  }
}

// ── Risk signals ──────────────────────────────────────────────────────────────

const insertRiskSignal = db.prepare(`
  INSERT OR REPLACE INTO risk_signals
    (guid, source, category, title, description, level, score, url, location, event_at)
  VALUES
    (@guid, @source, @category, @title, @description, @level, @score, @url, @location, @event_at)
`);

function saveRiskSignals(signals) {
  const insert = db.transaction((rows) => {
    for (const s of rows) insertRiskSignal(s);
  });
  insert(signals);
}

function getRiskSignals(limit = 30) {
  return db.prepare(`
    SELECT * FROM risk_signals
    WHERE event_at >= datetime('now', '-72 hours')
       OR fetched_at >= datetime('now', '-24 hours')
    ORDER BY score DESC, event_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  saveArticles,
  embedAndCluster,
  getArticles,
  getCategories,
  getStats,
  getTrending,
  getRelated,
  getTopClusters,
  saveRiskSignals,
  getRiskSignals,
};
