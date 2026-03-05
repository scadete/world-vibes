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

function getArticles({ category, language, search, limit = 50, offset = 0 } = {}) {
  let query = "SELECT * FROM articles WHERE 1=1";
  const params = [];

  if (category && category !== "all") {
    query += " AND category = ?";
    params.push(category);
  }
  if (language && language !== "all") {
    query += " AND language = ?";
    params.push(language);
  }
  if (search) {
    query += " AND (title LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
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

module.exports = { saveArticles, getArticles, getCategories, getStats };
