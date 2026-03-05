const express = require("express");
const cron = require("node-cron");
const path = require("path");
const { fetchAll } = require("./fetcher");
const { getArticles, getCategories, getStats, getTrending, getRelated } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.json());

// ── API routes ──────────────────────────────────────────────────────────────

// GET /api/articles?category=&language=&search=&limit=&offset=
app.get("/api/articles", (req, res) => {
  const { category, language, search, limit = 50, offset = 0 } = req.query;
  try {
    const articles = getArticles({
      category,
      language,
      search,
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0,
    });
    res.json({ articles, count: articles.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categories
app.get("/api/categories", (req, res) => {
  res.json(getCategories());
});

// GET /api/stats
app.get("/api/stats", (req, res) => {
  res.json(getStats());
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

// POST /api/fetch  – trigger manual fetch
app.post("/api/fetch", async (req, res) => {
  res.json({ message: "Fetch started" });
  try {
    await fetchAll();
  } catch (err) {
    console.error("Manual fetch error:", err);
  }
});

// ── Scheduler ───────────────────────────────────────────────────────────────
// Fetch every 30 minutes
cron.schedule("*/30 * * * *", () => {
  console.log("[cron] Scheduled fetch triggered");
  fetchAll().catch(console.error);
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌍  WorldVibes RSS Aggregator running at http://localhost:${PORT}\n`);
  // Initial fetch on startup
  fetchAll().catch(console.error);
});
