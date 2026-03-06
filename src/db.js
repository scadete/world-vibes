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

// Add cluster_id column to articles if not yet present (idempotent migration)
try {
  db.exec("ALTER TABLE articles ADD COLUMN cluster_id INTEGER REFERENCES clusters(id)");
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

// ── Story clustering ──────────────────────────────────────────────────────────

const stmtGetArticleForCluster = db.prepare(
  "SELECT id, title, language, feed_name, cluster_id FROM articles WHERE id = ?"
);
const stmtFindClusterMatch = db.prepare(`
  SELECT a.id, a.cluster_id FROM articles a
  JOIN articles_fts ON a.id = articles_fts.rowid
  WHERE articles_fts MATCH ?
    AND a.id != ?
    AND a.language = ?
    AND a.feed_name != ?
    AND a.pub_date >= datetime('now', '-48 hours')
  ORDER BY bm25(articles_fts)
  LIMIT 1
`);
const stmtSetCluster   = db.prepare("UPDATE articles SET cluster_id = ? WHERE id = ?");
const stmtInsertCluster = db.prepare(
  "INSERT INTO clusters (article_count, source_count) VALUES (?, ?)"
);
const stmtRecalcCluster = db.prepare(`
  UPDATE clusters SET
    article_count = (SELECT COUNT(*)               FROM articles WHERE cluster_id = ?),
    source_count  = (SELECT COUNT(DISTINCT feed_name) FROM articles WHERE cluster_id = ?),
    updated_at    = datetime('now')
  WHERE id = ?
`);

function clusterArticle(articleId) {
  const article = stmtGetArticleForCluster.get(articleId);
  if (!article) return;

  // Extract top-3 significant keywords from the title for strict AND matching
  const keywords = article.title
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 4 && !STOPWORDS.has(w.toLowerCase()) && !/^\d+$/.test(w))
    .slice(0, 3)
    .map(w => `"${w}"`);

  if (keywords.length < 2) return; // not enough signal

  let match;
  try {
    match = stmtFindClusterMatch.get(
      keywords.join(" AND "),
      articleId,
      article.language,
      article.feed_name
    );
  } catch {
    return; // FTS query error (e.g. special chars) — skip clustering
  }

  if (!match) return;

  if (match.cluster_id) {
    // Join the existing cluster
    stmtSetCluster.run(match.cluster_id, articleId);
    stmtRecalcCluster.run(match.cluster_id, match.cluster_id, match.cluster_id);
  } else {
    // Create a new cluster for both articles
    const cid = stmtInsertCluster.run(2, 2).lastInsertRowid;
    stmtSetCluster.run(cid, articleId);
    stmtSetCluster.run(cid, match.id);
    stmtRecalcCluster.run(cid, cid, cid);
  }
}

// ── Save articles ─────────────────────────────────────────────────────────────

function saveArticles(articles) {
  const newIds = [];
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      const info = insertArticle.run(item);
      if (info.changes > 0) newIds.push(info.lastInsertRowid);
    }
    return newIds.length;
  });
  const count = insertMany(articles);
  // Run clustering outside transaction (FTS reads can't be inside a write tx)
  for (const id of newIds) clusterArticle(id);
  return count;
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

function getArticles({ category, language, search, sort, limit = 50, offset = 0 } = {}) {
  const params = [];
  const byRelevance = sort === "relevance";

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

    if (category && category !== "all") {
      query += " AND a.category = ?";
      params.push(category);
    }
    if (language && language !== "all") {
      query += " AND a.language = ?";
      params.push(language);
    }

    query += byRelevance
      ? " ORDER BY COALESCE(c.source_count, 1) DESC, bm25(articles_fts), a.pub_date DESC"
      : " ORDER BY bm25(articles_fts), a.pub_date DESC";
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

  if (category && category !== "all") {
    query += " AND a.category = ?";
    params.push(category);
  }
  if (language && language !== "all") {
    query += " AND a.language = ?";
    params.push(language);
  }

  query += byRelevance
    ? " ORDER BY COALESCE(c.source_count, 1) DESC, a.pub_date DESC, a.fetched_at DESC"
    : " ORDER BY a.pub_date DESC, a.fetched_at DESC";
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

module.exports = {
  saveArticles,
  getArticles,
  getCategories,
  getStats,
  getTrending,
  getRelated,
  getTopClusters,
};
