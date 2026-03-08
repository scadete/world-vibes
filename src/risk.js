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
  { source: "FOREX",     category: "economic",      description: "Stress cambial — moedas vs USD (BCE/Frankfurter)" },
  { source: "DOOMSDAY",  category: "geopolitical",  description: "Relógio do Apocalipse (Boletim dos Cientistas Atómicos)" },
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

  // NOAA issue_datetime is "YYYY-MM-DD HH:MM:SS.mmm" (space, no T, no timezone)
  function noaaToISO(dt) {
    if (!dt) return null;
    // Replace space with T and append Z if no timezone present
    const s = dt.replace(' ', 'T');
    return s.endsWith('Z') || /[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z';
  }

  const cutoff = Date.now() - 48 * 3600 * 1000;
  return (Array.isArray(json) ? json : [])
    .filter((a) => {
      if (!a.issue_datetime) return false;
      const t = new Date(noaaToISO(a.issue_datetime)).getTime();
      return !isNaN(t) && t >= cutoff;
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
        event_at: safeDate(noaaToISO(a.issue_datetime)),
      };
    });
}

// ── FOREX — Currency stress (Frankfurter.app / ECB data) ─────────────────────

const FOREX_CURRENCIES = ["TRY", "BRL", "ZAR", "PLN", "MXN", "CNY", "HUF"];
const FOREX_COUNTRY = {
  TRY: "Turquia", BRL: "Brasil", ZAR: "África do Sul",
  PLN: "Polónia", MXN: "México", CNY: "China", HUF: "Hungria",
};

async function fetchForex() {
  const sym = FOREX_CURRENCIES.join(",");

  // Use "previous business day" by requesting 3 calendar days back —
  // Frankfurter always returns the latest available trading day for any date range.
  const prevDate = new Date(Date.now() - 3 * 24 * 3600 * 1000)
    .toISOString().split("T")[0];

  const [today, prev] = await Promise.all([
    fetch(`https://api.frankfurter.app/latest?from=USD&to=${sym}`,
      { signal: AbortSignal.timeout(15000) }).then((r) => r.json()),
    fetch(`https://api.frankfurter.app/${prevDate}?from=USD&to=${sym}`,
      { signal: AbortSignal.timeout(15000) }).then((r) => r.json()),
  ]);

  const todayRates = today.rates || {};
  const prevRates  = prev.rates  || {};

  return FOREX_CURRENCIES
    .map((c) => {
      const rate = todayRates[c];
      const base = prevRates[c];
      if (!rate || !base) return null;

      // positive changePct = currency depreciated vs USD (more local units per $)
      const changePct = ((rate - base) / base) * 100;
      if (Math.abs(changePct) < 0.5) return null; // skip minor noise

      const score = Math.abs(changePct) > 5 ? 4
                  : Math.abs(changePct) > 2 ? 3
                  : 2;
      const sign = changePct > 0 ? "+" : "";
      return {
        guid:     `forex-${c}-${today.date}`,
        source:   "FOREX",
        category: "economic",
        title:    `USD/${c}: ${rate.toFixed(3)} (${sign}${changePct.toFixed(2)}% vs ${prevDate})`,
        description: changePct > 0
          ? `${FOREX_COUNTRY[c] || c}: moeda depreciou ${Math.abs(changePct).toFixed(2)}% face ao dólar`
          : `${FOREX_COUNTRY[c] || c}: moeda valorizou ${Math.abs(changePct).toFixed(2)}% face ao dólar`,
        level: scoreToLevel(score),
        score,
        url:      `https://api.frankfurter.app/latest?from=USD&to=${c}`,
        location: FOREX_COUNTRY[c] || c,
        event_at: safeDate(today.date ? today.date + "T12:00:00Z" : null),
      };
    })
    .filter(Boolean);
}

// ── Doomsday Clock — Bulletin of Atomic Scientists ───────────────────────────
// Fallback history — updated manually each January when BAS announces new value.
// Live value is fetched dynamically from the Wikipedia summary API.

const DOOMSDAY_HISTORY = [
  { year: 2020, seconds: 120 },
  { year: 2023, seconds: 90 },
  { year: 2024, seconds: 90 },
  { year: 2025, seconds: 89 },
  { year: 2026, seconds: 85 }, // BAS Jan 2026
];

async function fetchDoomsday() {
  // Last known value from hardcoded history (used as fallback + trend baseline)
  const histLast = DOOMSDAY_HISTORY[DOOMSDAY_HISTORY.length - 1];
  let current = histLast;

  // Try live value from Wikipedia summary API (free, no auth)
  try {
    const data = await fetch(
      "https://en.wikipedia.org/api/rest_v1/page/summary/Doomsday_Clock",
      { signal: AbortSignal.timeout(10000) }
    ).then((r) => r.json());
    const match = (data.extract || "").match(/(\d+)\s*seconds?\s+to\s+midnight/i);
    if (match) {
      const live = parseInt(match[1], 10);
      if (live >= 10 && live <= 3600) {
        current = { year: new Date().getFullYear(), seconds: live };
      }
    }
  } catch { /* fall back to hardcoded */ }

  const s     = current.seconds;
  const score = s < 60 ? 4 : s < 120 ? 3 : s < 180 ? 2 : 1;

  let trend = "";
  if (s < histLast.seconds)      trend = ` ▼ -${histLast.seconds - s}s vs ${histLast.year}`;
  else if (s > histLast.seconds) trend = ` ▲ +${s - histLast.seconds}s vs ${histLast.year}`;
  else                           trend = ` = sem alteração vs ${histLast.year}`;

  return [{
    guid:        `doomsday-${current.year}`,
    source:      "DOOMSDAY",
    category:    "geopolitical",
    title:       `Relógio do Apocalipse: ${s}s até à meia-noite (${current.year})${trend}`,
    description: "Boletim dos Cientistas Atómicos — avaliação anual do risco existencial global",
    level:       scoreToLevel(score),
    score,
    url:         "https://thebulletin.org/doomsday-clock/current-time/",
    location:    "Global",
    event_at:    safeDate(`${current.year}-01-15T00:00:00Z`),
  }];
}

// ── Pentagon Pizza Index — composite geopolitical stress ──────────────────────
// Informal indicator: when pizza deliveries to the Pentagon spike at odd hours,
// it correlates with active crisis response. Here we synthesise all OSINT sources
// into a single 0-5 slice stress score.

function computePizzaIndex(signals) {
  const criticos = signals.filter((s) => s.score >= 4).length;
  const altos    = signals.filter((s) => s.score === 3).length;
  const medios   = signals.filter((s) => s.score === 2).length;

  // Each CRÍTICO = 2pts, ALTO = 1pt, MÉDIO = 0.5pt
  const pts    = criticos * 2 + altos + medios * 0.5;
  const slices = Math.min(5, Math.round(pts));

  const [label, desc] =
    slices === 0 ? ["×0 — linha base",      "sem sinais relevantes activos"] :
    slices === 1 ? ["×1 — pré-alerta",      `${signals.length} sinal(is) de baixa intensidade`] :
    slices === 2 ? ["×2 — tensão moderada", `${altos} alerta(s) alto(s), ${medios} médio(s)`] :
    slices === 3 ? ["×3 — meia pizza",      `${criticos} alerta(s) crítico(s) activo(s)`] :
    slices === 4 ? ["×4 — crise activa",    "múltiplos alertas críticos — resposta em curso"] :
                   ["×5 — caos total",      "todos os níveis de alerta activos simultaneamente"];

  const score = slices === 0 ? 1 : slices <= 2 ? 2 : slices <= 3 ? 3 : 4;
  const today = new Date().toISOString().split("T")[0];

  return {
    guid:        `pizza-${today}`,
    source:      "PIZZA",
    category:    "geopolitical",
    title:       `🍕 Pentagon Pizza Index: ${label}`,
    description: desc,
    level:       scoreToLevel(score),
    score,
    url:         null,
    location:    "Global",
    event_at:    new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function fetchRiskSignals() {
  console.log("[risk] Fetching OSINT risk signals…");
  const fetchers = [fetchGDACS, fetchWHO, fetchReliefWeb, fetchIODA, fetchUSGS, fetchNOAA, fetchForex, fetchDoomsday];
  const results = await Promise.allSettled(fetchers.map((f) => f()));

  const signals = [];
  const logEntries = [];

  results.forEach((r, i) => {
    const meta = SOURCE_META[i];
    const items = r.status === "fulfilled" ? r.value : [];
    signals.push(...items);
    logEntries.push({
      ...meta,
      signal_count: items.length,
      last_error: r.status === "rejected"
        ? (r.reason?.message || String(r.reason)).slice(0, 200)
        : null,
    });
    if (r.status === "rejected") {
      console.error(`[risk] ${meta.source} failed: ${r.reason?.message || r.reason}`);
    }
  });

  // Pentagon Pizza Index — derived composite; always present, computed last
  const pizzaSignal = computePizzaIndex(signals);
  signals.push(pizzaSignal);
  logEntries.push({
    source:       "PIZZA",
    category:     "geopolitical",
    description:  "Pentagon Pizza Index — stress geopolítico composto",
    signal_count: 1,
    last_error:   null,
  });

  saveRiskSignals(signals, logEntries);
  console.log(`[risk] ${signals.length} signals saved across ${SOURCE_META.length + 1} sources.`);
  return signals;
}

module.exports = { fetchRiskSignals };
