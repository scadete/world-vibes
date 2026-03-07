const Parser = require("rss-parser");
const { saveArticles, embedAndCluster } = require("./db");
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
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));

  const summary = results.map((r) => (r.status === "fulfilled" ? r.value : { error: r.reason }));
  const totalSaved = summary.reduce((acc, r) => acc + (r.saved || 0), 0);
  console.log(`\n[WorldVibes] Done. ${totalSaved} new articles saved.\n`);

  // Compute embeddings and run semantic clustering for new articles
  await embedAndCluster();

  return summary;
}

// Run directly: node src/fetcher.js
if (require.main === module) {
  fetchAll().catch(console.error);
}

module.exports = { fetchAll, fetchFeed };
