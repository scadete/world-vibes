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
`);

const insertArticle = db.prepare(`
  INSERT OR IGNORE INTO articles
    (guid, title, link, description, content, pub_date, author, feed_name, category, language)
  VALUES
    (@guid, @title, @link, @description, @content, @pub_date, @author, @feed_name, @category, @language)
`);

function saveArticles(articles) {
  const insertMany = db.transaction((items) => {
    let count = 0;
    for (const item of items) {
      const info = insertArticle.run(item);
      count += info.changes;
    }
    return count;
  });
  return insertMany(articles);
}

// Sanitize user input for FTS5 MATCH queries
function toFTSQuery(q) {
  return q
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" AND ");
}

function getArticles({ category, language, search, limit = 50, offset = 0 } = {}) {
  const params = [];

  if (search) {
    const ftsQuery = toFTSQuery(search);
    if (!ftsQuery) return [];

    let query = `
      SELECT a.* FROM articles a
      JOIN articles_fts ON a.id = articles_fts.rowid
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

    query += " ORDER BY bm25(articles_fts), a.pub_date DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    try {
      return db.prepare(query).all(...params);
    } catch {
      return [];
    }
  }

  // No search — use regular indexed query
  let query = "SELECT * FROM articles WHERE 1=1";

  if (category && category !== "all") {
    query += " AND category = ?";
    params.push(category);
  }
  if (language && language !== "all") {
    query += " AND language = ?";
    params.push(language);
  }

  query += " ORDER BY pub_date DESC, fetched_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function getCategories() {
  return db.prepare("SELECT DISTINCT category FROM articles ORDER BY category").all().map((r) => r.category);
}

function getStats() {
  return {
    total: db.prepare("SELECT COUNT(*) as c FROM articles").get().c,
    byCategory: db.prepare("SELECT category, COUNT(*) as count FROM articles GROUP BY category ORDER BY count DESC").all(),
    byLanguage: db.prepare("SELECT language, COUNT(*) as count FROM articles GROUP BY language ORDER BY count DESC").all(),
    lastFetch: db.prepare("SELECT MAX(fetched_at) as last FROM articles").get().last,
  };
}

// ── Trending keywords ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  // English
  "the","and","for","are","was","with","this","that","have","from","they",
  "will","been","their","said","what","which","when","were","also","into",
  "more","than","then","your","about","after","over","other","only","some",
  "just","most","like","time","would","could","should","there","these",
  "those","each","very","much","well","such","know","even","both","come",
  // Portuguese
  "para","como","uma","dos","das","mais","por","isso","este","esta","pelo",
  "pela","seus","suas","sobre","entre","antes","depois","ainda","pode",
  "pois","quando","onde","numa","quem","qual","tudo","toda","todos","todas",
  "novo","nova","novos","novas","anos","sendo","foram","têm","após","caso",
  // Spanish
  "para","como","los","las","sus","del","pero","sido","estos","estas",
  "todo","toda","ellos","ellas","después","antes","sobre","también","puede",
  "están","tiene","tienen","según","través","contra","durante","mismo","hace",
]);

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
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, count]) => ({ term, count }));
}

// ── Related articles ─────────────────────────────────────────────────────────

function getRelated(articleId, limit = 5) {
  const article = db.prepare("SELECT id, title, description, category, language FROM articles WHERE id = ?").get(articleId);
  if (!article) return [];

  // Extract keywords from title + description for richer context
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
    // First pass: strict AND match + same language
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

    // Second pass: OR match, same language + category, excluding already found
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

module.exports = { saveArticles, getArticles, getCategories, getStats, getTrending, getRelated };
