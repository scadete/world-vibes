const Parser = require("rss-parser");
const { saveArticles } = require("./db");
const FEEDS = require("./feeds");

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "WorldVibes-RSS-Aggregator/1.0 (+https://github.com/world-vibes)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:creator", "dcCreator"],
    ],
  },
});

// ── Fetch status (exported for /api/fetch-status) ────────────────────────────
const fetchStatus = {
  running: false,
  phase: "",        // 'fetching' | 'embedding' | ''
  done: 0,
  total: 0,
  currentFeed: "",
  totalSaved: 0,
  errors: 0,
};

function sanitize(str) {
  if (!str) return null;
  // Strip HTML tags for description preview
  return str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000);
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const articles = parsed.items.map((item) => ({
      guid: item.guid || item.link || `${feed.name}::${item.title}`,
      title: item.title || "Untitled",
      link: item.link || "",
      description: sanitize(item.contentSnippet || item.summary || item.description),
      content: sanitize(item.contentEncoded || item.content),
      pub_date: item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()),
      author: item.creator || item.dcCreator || item.author || null,
      feed_name: feed.name,
      category: feed.category,
      language: feed.language,
    }));

    const saved = saveArticles(articles);
    console.log(`[✓] ${feed.name}: fetched ${articles.length}, saved ${saved} new`);
    return { feed: feed.name, fetched: articles.length, saved };
  } catch (err) {
    console.error(`[✗] ${feed.name}: ${err.message}`);
    return { feed: feed.name, fetched: 0, saved: 0, error: err.message };
  }
}

async function fetchAll() {
  console.log(`\n[WorldVibes] Fetching ${FEEDS.length} RSS feeds…\n`);

  fetchStatus.running = true;
  fetchStatus.phase = "fetching";
  fetchStatus.done = 0;
  fetchStatus.total = FEEDS.length;
  fetchStatus.currentFeed = "";
  fetchStatus.totalSaved = 0;
  fetchStatus.errors = 0;

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      fetchStatus.currentFeed = feed.name;
      const result = await fetchFeed(feed);
      fetchStatus.done++;
      if (result.error) fetchStatus.errors++;
      fetchStatus.totalSaved += result.saved || 0;
      return result;
    })
  );

  const summary = results.map((r) => (r.status === "fulfilled" ? r.value : { error: r.reason }));
  const totalSaved = summary.reduce((acc, r) => acc + (r.saved || 0), 0);
  console.log(`\n[WorldVibes] Done. ${totalSaved} new articles saved.\n`);

  fetchStatus.running = false;
  fetchStatus.phase = "";
  fetchStatus.currentFeed = "";

  return summary;
}

// Run directly: node src/fetcher.js
if (require.main === module) {
  fetchAll().catch(console.error);
}

module.exports = { fetchAll, fetchFeed, fetchStatus };
