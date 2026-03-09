const express = require("express");
const compression = require("compression");
const cron = require("node-cron");
const path = require("path");
const { fetchAll, fetchStatus } = require("./fetcher");
const { fetchRiskSignals } = require("./risk");
const { getArticles, getCategories, getStats, getTrending, getRelated, getRiskSignals } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.static(path.join(__dirname, "..", "public"), {
  maxAge: "1h",
  setHeaders(res, filePath) {
    // sw.js must always be fresh so the browser picks up cache version bumps
    if (filePath.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
  },
}));
app.use(express.json());

// ── In-memory caches for stable/slow-changing endpoints ─────────────────────

function makeCached(fn, ttlMs) {
  let cache = null, expiry = 0;
  return {
    get() {
      const now = Date.now();
      if (!cache || now > expiry) {
        cache = fn();
        expiry = now + ttlMs;
      }
      return cache;
    },
    invalidate() { cache = null; },
  };
}

const statsCache = makeCached(getStats,      5 * 60 * 1000);  // 5 minutes
const catsCache  = makeCached(getCategories, 60 * 60 * 1000); // 1 hour

function invalidateCaches() {
  statsCache.invalidate();
  catsCache.invalidate();
}

// ── API routes ──────────────────────────────────────────────────────────────

// GET /api/articles?category=&language=&search=&sort=&limit=&offset=
app.get("/api/articles", (req, res) => {
  const { category, language, search, hours, limit = 50, offset = 0 } = req.query;
  try {
    const articles = getArticles({
      category,
      language,
      search,
      hours: hours ? Math.min(parseInt(hours) || 48, 8760) : undefined,
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0,
    });
    res.json({ articles, count: articles.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categories  – cached 1 hour (changes only when new feeds added)
app.get("/api/categories", (req, res) => {
  res.json(catsCache.get());
});

// GET /api/stats  – cached 5 minutes
app.get("/api/stats", (req, res) => {
  res.json(statsCache.get());
});

// GET /api/trending?hours=24
app.get("/api/trending", (req, res) => {
  const hours = Math.min(parseInt(req.query.hours) || 24, 168);
  try {
    res.json(getTrending(hours));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:id/related
app.get("/api/articles/:id/related", (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  try {
    res.json(getRelated(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/risk-signals  – OSINT risk signals
app.get("/api/risk-signals", (req, res) => {
  try {
    res.json(getRiskSignals());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fetch-risk  – manually trigger OSINT risk signals fetch (awaits completion)
app.post("/api/fetch-risk", async (req, res) => {
  try {
    await fetchRiskSignals();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fetch-status  – current fetch progress
app.get("/api/fetch-status", (req, res) => {
  res.json(fetchStatus);
});

// POST /api/fetch  – trigger manual fetch
app.post("/api/fetch", async (req, res) => {
  res.json({ message: "Fetch started" });
  try {
    await fetchAll();
    invalidateCaches(); // stats and categories may have changed
  } catch (err) {
    console.error("Manual fetch error:", err);
  }
});

// ── Scheduler ───────────────────────────────────────────────────────────────
// Fetch RSS every 30 minutes
cron.schedule("*/30 * * * *", () => {
  console.log("[cron] Scheduled fetch triggered");
  fetchAll().then(invalidateCaches).catch(console.error);
});

// Fetch OSINT risk signals every hour
cron.schedule("0 * * * *", () => {
  console.log("[cron] Risk signals fetch triggered");
  fetchRiskSignals().catch(console.error);
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌍  WorldVibes RSS Aggregator running at http://localhost:${PORT}\n`);
  // Initial fetches on startup
  fetchAll().catch(console.error);
  fetchRiskSignals().catch(console.error);
});
