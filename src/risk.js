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

// ── Source registry ───────────────────────────────────────────────────────────

const SOURCE_META = [
  { source: "GDACS",     category: "disaster",     description: "Desastres naturais (GDACS/UN-OCHA)" },
  { source: "WHO",       category: "health",        description: "Surtos de doenças (OMS)" },
  { source: "ReliefWeb", category: "humanitarian",  description: "Crises humanitárias (OCHA)" },
  { source: "IODA",      category: "internet",      description: "Interrupções de internet (Georgia Tech)" },
  { source: "USGS",      category: "seismic",       description: "Actividade sísmica (USGS)" },
  { source: "NOAA",      category: "space",         description: "Clima espacial (NOAA/SWPC)" },
];

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
  const from = now - 48 * 3600;
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

// ── USGS — Significant earthquakes ───────────────────────────────────────────

async function fetchUSGS() {
  const url =
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson";
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();

  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  return (json.features || [])
    .filter((f) => f.properties.time >= cutoff)
    .map((f) => {
      const p = f.properties;
      // PAGER alert takes precedence, then magnitude
      const alertStr = (p.alert || "").toLowerCase();
      let score;
      if (alertStr === "red")    score = 4;
      else if (alertStr === "orange") score = 3;
      else if (alertStr === "yellow") score = 2;
      else {
        const mag = p.mag || 0;
        score = mag >= 7.5 ? 4 : mag >= 6.5 ? 3 : mag >= 5.5 ? 2 : 1;
      }
      const mag = p.mag ? `M${p.mag.toFixed(1)}` : "";
      const place = p.place || "Unknown region";
      return {
        guid: `usgs-${f.id || p.time}`,
        source: "USGS",
        category: "seismic",
        title: `Terremoto ${mag} — ${place}`,
        description: p.type || null,
        level: scoreToLevel(score),
        score,
        url: p.url || null,
        location: place,
        event_at: safeDate(p.time ? new Date(p.time).toISOString() : null),
      };
    });
}

// ── NOAA — Space weather alerts ───────────────────────────────────────────────

async function fetchNOAA() {
  const url = "https://services.swpc.noaa.gov/products/alerts.json";
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();

  const cutoff = Date.now() - 48 * 3600 * 1000;
  return (Array.isArray(json) ? json : [])
    .filter((a) => {
      if (!a.issue_datetime) return false;
      return new Date(a.issue_datetime + "Z").getTime() >= cutoff;
    })
    .map((a, idx) => {
      const msg = a.message || "";
      // Extract product line (first non-empty line is usually the header)
      const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
      const productLine = lines[0] || "Space Weather Alert";

      // Score from geomagnetic storm level (G1-G5), solar flare class, radiation storm (S1-S5)
      let score = 2;
      const gMatch = msg.match(/G(\d)/);
      const xMatch = /X-class|X[0-9]/i.test(msg);
      const mMatch = /M-class|M[0-9]/i.test(msg);
      const sMatch = msg.match(/S(\d)/);
      if (xMatch || (gMatch && parseInt(gMatch[1]) >= 4) || (sMatch && parseInt(sMatch[1]) >= 4)) score = 4;
      else if (mMatch || (gMatch && parseInt(gMatch[1]) >= 3) || (sMatch && parseInt(sMatch[1]) >= 3)) score = 3;
      else if (gMatch || sMatch) score = 2;

      return {
        guid: `noaa-${a.issue_datetime || idx}`,
        source: "NOAA",
        category: "space",
        title: productLine,
        description: lines.slice(1, 3).join(" ").slice(0, 300) || null,
        level: scoreToLevel(score),
        score,
        url: "https://www.swpc.noaa.gov/products/alerts-watches-and-warnings",
        location: "Clima Espacial Global",
        event_at: safeDate(a.issue_datetime ? a.issue_datetime + "Z" : null),
      };
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function fetchRiskSignals() {
  console.log("[risk] Fetching OSINT risk signals…");
  const fetchers = [fetchGDACS, fetchWHO, fetchReliefWeb, fetchIODA, fetchUSGS, fetchNOAA];
  const results = await Promise.allSettled(fetchers.map((f) => f()));

  const signals = [];
  const logEntries = [];

  results.forEach((r, i) => {
    const meta = SOURCE_META[i];
    const items = r.status === "fulfilled" ? r.value : [];
    signals.push(...items);
    logEntries.push({ ...meta, signal_count: items.length });
    if (r.status === "rejected") {
      console.error(`[risk] ${meta.source} failed: ${r.reason?.message || r.reason}`);
    }
  });

  saveRiskSignals(signals, logEntries);
  console.log(`[risk] ${signals.length} signals saved across ${SOURCE_META.length} sources.`);
  return signals;
}

module.exports = { fetchRiskSignals };
