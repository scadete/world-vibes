const Parser = require("rss-parser");
const { saveRiskSignals } = require("./db");

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ["gdacs:alertlevel", "alertlevel"],
      ["gdacs:country", "gdacsCountry"],
      ["gdacs:eventtype", "eventtype"],
      ["gdacs:severity", "severity"],
    ],
  },
});

// ── Level helpers ─────────────────────────────────────────────────────────────

function scoreToLevel(score) {
  if (score >= 4) return "CRÍTICO";
  if (score >= 3) return "ALTO";
  if (score >= 2) return "MÉDIO";
  return "BAIXO";
}

function safeDate(val) {
  if (!val) return new Date().toISOString();
  try {
    return new Date(val).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// ── GDACS — Natural disasters ─────────────────────────────────────────────────

async function fetchGDACS() {
  const feed = await parser.parseURL("https://www.gdacs.org/xml/rss.xml");
  return feed.items.map((item) => {
    const levelStr = (item.alertlevel || "green").toLowerCase();
    const score = levelStr === "red" ? 4 : levelStr === "orange" ? 3 : 2;
    const eventtype = item.eventtype || "Event";
    const country = item.gdacsCountry || "";
    return {
      guid: `gdacs-${item.guid || item.link || item.title}`,
      source: "GDACS",
      category: "disaster",
      title: item.title || "Disaster alert",
      description: item.contentSnippet || item.description || null,
      level: scoreToLevel(score),
      score,
      url: item.link || null,
      location: country,
      event_at: safeDate(item.isoDate || item.pubDate),
    };
  });
}

// ── WHO — Disease outbreaks ───────────────────────────────────────────────────

async function fetchWHO() {
  const feed = await parser.parseURL(
    "https://www.who.int/feeds/entity/csr/don/en/rss.xml"
  );
  return feed.items.map((item) => {
    // Extract country from title (usually "Disease — Country")
    const title = item.title || "Disease alert";
    const location = title.includes("—")
      ? title.split("—").pop().trim()
      : title.includes("-")
      ? title.split("-").pop().trim()
      : "";
    return {
      guid: `who-${item.guid || item.link || title}`,
      source: "WHO",
      category: "health",
      title,
      description: item.contentSnippet || item.description || null,
      level: "MÉDIO",
      score: 2,
      url: item.link || null,
      location,
      event_at: safeDate(item.isoDate || item.pubDate),
    };
  });
}

// ── ReliefWeb — Humanitarian disasters ───────────────────────────────────────

async function fetchReliefWeb() {
  const url =
    "https://api.reliefweb.int/v1/disasters?appname=worldvibes&limit=20" +
    "&sort[]=date:desc" +
    "&fields[include][]=name&fields[include][]=status" +
    "&fields[include][]=glide&fields[include][]=country" +
    "&fields[include][]=type&fields[include][]=date";

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();

  return (json.data || []).map((item) => {
    const fields = item.fields || {};
    const status = fields.status || "";
    const score = status === "ongoing" ? 3 : 2;
    const countries = (fields.country || []).map((c) => c.name).join(", ");
    const disasterType = (fields.type || []).map((t) => t.name).join(", ");
    const eventDate =
      (fields.date || {}).disaster || (fields.date || {}).created || null;
    const title = fields.name || "Humanitarian situation";
    const fullTitle = disasterType ? `${disasterType} — ${title}` : title;
    const link = ((item.links || {}).self || {}).href || null;
    return {
      guid: `reliefweb-${item.id}`,
      source: "ReliefWeb",
      category: "humanitarian",
      title: fullTitle,
      description: null,
      level: scoreToLevel(score),
      score,
      url: link,
      location: countries,
      event_at: safeDate(eventDate),
    };
  });
}

// ── IODA — Internet outages ───────────────────────────────────────────────────

async function fetchIODA() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 48 * 3600; // last 48 hours
  const url =
    `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts` +
    `?from=${from}&until=${now}&entityType=country`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();

  const alerts = (json.data || {}).alerts || [];
  return alerts
    .filter((a) => a.entityType === "country" && a.ongoingAlert !== false)
    .map((a) => {
      const strength = typeof a.signalStrength === "number" ? a.signalStrength : 3;
      const score = strength > 6 ? 4 : strength > 3 ? 3 : 2;
      const countryName = a.entityName || a.entityCode || "Unknown";
      return {
        guid: `ioda-${a.alertId || a.entityCode + "-" + a.startTime}`,
        source: "IODA",
        category: "internet",
        title: `Interrupção de internet detectada — ${countryName}`,
        description: a.anomalyType || a.alarmClass || null,
        level: scoreToLevel(score),
        score,
        url: `https://ioda.inetintel.cc.gatech.edu/country/${a.entityCode}`,
        location: countryName,
        event_at: safeDate(
          a.startTime ? new Date(a.startTime * 1000).toISOString() : null
        ),
      };
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function fetchRiskSignals() {
  console.log("[risk] Fetching OSINT risk signals…");
  const results = await Promise.allSettled([
    fetchGDACS(),
    fetchWHO(),
    fetchReliefWeb(),
    fetchIODA(),
  ]);

  const signals = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  results.forEach((r, i) => {
    const names = ["GDACS", "WHO", "ReliefWeb", "IODA"];
    if (r.status === "rejected") {
      console.error(`[risk] ${names[i]} failed: ${r.reason?.message || r.reason}`);
    }
  });

  saveRiskSignals(signals);
  console.log(`[risk] ${signals.length} signals saved.`);
  return signals;
}

module.exports = { fetchRiskSignals };
