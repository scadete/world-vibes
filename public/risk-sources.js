/**
 * OSINT risk signal sources — browser-side port of src/risk.js
 * All external fetches go through the CORS proxy.
 */

export const SOURCE_META = [
  { source: 'GDACS',     category: 'disaster',     description: 'Desastres naturais (GDACS/UN-OCHA)' },
  { source: 'WHO',       category: 'health',        description: 'Surtos de doenças (OMS)' },
  { source: 'ReliefWeb', category: 'humanitarian',  description: 'Crises humanitárias (OCHA)' },
  { source: 'IODA',      category: 'internet',      description: 'Interrupções de internet (Georgia Tech)' },
  { source: 'USGS',      category: 'seismic',       description: 'Actividade sísmica (USGS)' },
  { source: 'NOAA',      category: 'space',         description: 'Clima espacial (NOAA/SWPC)' },
  { source: 'FOREX',     category: 'economic',      description: 'Stress cambial — moedas vs USD (BCE/Frankfurter)' },
  { source: 'DOOMSDAY',  category: 'geopolitical',  description: 'Relógio do Apocalipse (Boletim dos Cientistas Atómicos)' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreToLevel(score) {
  if (score >= 4) return 'CRÍTICO';
  if (score >= 3) return 'ALTO';
  if (score >= 2) return 'MÉDIO';
  return 'BAIXO';
}

function safeDate(val) {
  if (!val) return new Date().toISOString();
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function proxyFetch(proxyBase, url, opts = {}) {
  return fetch(`${proxyBase}?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15000),
    ...opts,
  });
}

/** Parse an RSS/Atom XML document via DOMParser and return items as plain objects */
function parseRSSXML(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const items = [...doc.querySelectorAll('item, entry')];
  return items.map(el => {
    // Handle namespace for gdacs: attributes
    const ns = el.ownerDocument;

    function text(selector) {
      return el.querySelector(selector)?.textContent?.trim() || '';
    }
    function nsText(ns_, local) {
      try {
        return el.getElementsByTagNameNS(ns_, local)[0]?.textContent?.trim() || '';
      } catch { return ''; }
    }

    const isAtomEntry = el.tagName === 'entry';
    const link = isAtomEntry
      ? (el.querySelector('link[rel="alternate"]')?.getAttribute('href') || el.querySelector('link')?.getAttribute('href') || text('link'))
      : text('link');

    return {
      title:       text('title'),
      link,
      description: text('summary') || text('description') || text('content'),
      pubDate:     text('published') || text('updated') || text('pubDate'),
      guid:        text('id') || text('guid') || link,
      // GDACS custom namespace fields
      alertlevel:  nsText('http://www.gdacs.org', 'alertlevel') || text('alertlevel'),
      gdacsCountry: nsText('http://www.gdacs.org', 'country') || text('country'),
    };
  });
}

// ── GDACS ─────────────────────────────────────────────────────────────────────

async function fetchGDACS(proxyBase) {
  const res = await proxyFetch(proxyBase, 'https://www.gdacs.org/xml/rss.xml');
  const text = await res.text();
  const items = parseRSSXML(text);

  return items.map(item => {
    const levelStr = (item.alertlevel || 'green').toLowerCase();
    const score = levelStr === 'red' ? 4 : levelStr === 'orange' ? 3 : 2;
    return {
      guid:        `gdacs-${item.guid || item.link || item.title}`,
      source:      'GDACS',
      category:    'disaster',
      title:       item.title || 'Disaster alert',
      description: item.description || null,
      level:       scoreToLevel(score),
      score,
      url:         item.link || null,
      location:    item.gdacsCountry || '',
      event_at:    safeDate(item.pubDate),
    };
  });
}

// ── WHO ───────────────────────────────────────────────────────────────────────

async function fetchWHO(proxyBase) {
  const res = await proxyFetch(proxyBase, 'https://www.who.int/feeds/entity/csr/don/en/rss.xml');
  const text = await res.text();
  const items = parseRSSXML(text);

  return items.map(item => {
    const title = item.title || 'Disease alert';
    const location = title.includes('—')
      ? title.split('—').pop().trim()
      : title.includes('-')
      ? title.split('-').pop().trim()
      : '';
    return {
      guid:        `who-${item.guid || item.link || title}`,
      source:      'WHO',
      category:    'health',
      title,
      description: item.description || null,
      level:       'MÉDIO',
      score:       2,
      url:         item.link || null,
      location,
      event_at:    safeDate(item.pubDate),
    };
  });
}

// ── ReliefWeb ─────────────────────────────────────────────────────────────────

async function fetchReliefWeb(proxyBase) {
  const url =
    'https://api.reliefweb.int/v1/disasters?appname=worldvibes&limit=20' +
    '&sort[]=date:desc' +
    '&fields[include][]=name&fields[include][]=status' +
    '&fields[include][]=glide&fields[include][]=country' +
    '&fields[include][]=type&fields[include][]=date';

  const res = await proxyFetch(proxyBase, url);
  const json = await res.json();

  return (json.data || []).map(item => {
    const fields = item.fields || {};
    const status = fields.status || '';
    const score = status === 'ongoing' ? 3 : 2;
    const countries = (fields.country || []).map(c => c.name).join(', ');
    const disasterType = (fields.type || []).map(t => t.name).join(', ');
    const eventDate = (fields.date || {}).disaster || (fields.date || {}).created || null;
    const title = fields.name || 'Humanitarian situation';
    const fullTitle = disasterType ? `${disasterType} — ${title}` : title;
    const link = ((item.links || {}).self || {}).href || null;
    return {
      guid:        `reliefweb-${item.id}`,
      source:      'ReliefWeb',
      category:    'humanitarian',
      title:       fullTitle,
      description: null,
      level:       scoreToLevel(score),
      score,
      url:         link,
      location:    countries,
      event_at:    safeDate(eventDate),
    };
  });
}

// ── IODA ──────────────────────────────────────────────────────────────────────

async function fetchIODA(proxyBase) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 48 * 3600;
  const url =
    `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts` +
    `?from=${from}&until=${now}&entityType=country`;

  const res = await proxyFetch(proxyBase, url);
  const json = await res.json();

  const alerts = (json.data || {}).alerts || [];
  return alerts
    .filter(a => a.entityType === 'country' && a.ongoingAlert !== false)
    .map(a => {
      const strength = typeof a.signalStrength === 'number' ? a.signalStrength : 3;
      const score = strength > 6 ? 4 : strength > 3 ? 3 : 2;
      const countryName = a.entityName || a.entityCode || 'Unknown';
      return {
        guid:        `ioda-${a.alertId || a.entityCode + '-' + a.startTime}`,
        source:      'IODA',
        category:    'internet',
        title:       `Interrupção de internet detectada — ${countryName}`,
        description: a.anomalyType || a.alarmClass || null,
        level:       scoreToLevel(score),
        score,
        url:         `https://ioda.inetintel.cc.gatech.edu/country/${a.entityCode}`,
        location:    countryName,
        event_at:    safeDate(a.startTime ? new Date(a.startTime * 1000).toISOString() : null),
      };
    });
}

// ── USGS ──────────────────────────────────────────────────────────────────────

async function fetchUSGS(proxyBase) {
  const url =
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson';
  const res = await proxyFetch(proxyBase, url);
  const json = await res.json();

  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  return (json.features || [])
    .filter(f => f.properties.time >= cutoff)
    .map(f => {
      const p = f.properties;
      const alertStr = (p.alert || '').toLowerCase();
      let score;
      if (alertStr === 'red')         score = 4;
      else if (alertStr === 'orange') score = 3;
      else if (alertStr === 'yellow') score = 2;
      else {
        const mag = p.mag || 0;
        score = mag >= 7.5 ? 4 : mag >= 6.5 ? 3 : mag >= 5.5 ? 2 : 1;
      }
      const mag = p.mag ? `M${p.mag.toFixed(1)}` : '';
      const place = p.place || 'Unknown region';
      return {
        guid:        `usgs-${f.id || p.time}`,
        source:      'USGS',
        category:    'seismic',
        title:       `Terremoto ${mag} — ${place}`,
        description: p.type || null,
        level:       scoreToLevel(score),
        score,
        url:         p.url || null,
        location:    place,
        event_at:    safeDate(p.time ? new Date(p.time).toISOString() : null),
      };
    });
}

// ── NOAA ──────────────────────────────────────────────────────────────────────

function noaaToISO(dt) {
  if (!dt) return null;
  const s = dt.replace(' ', 'T');
  return s.endsWith('Z') || /[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z';
}

async function fetchNOAA(proxyBase) {
  const url = 'https://services.swpc.noaa.gov/products/alerts.json';
  const res = await proxyFetch(proxyBase, url);
  const json = await res.json();

  const cutoff = Date.now() - 48 * 3600 * 1000;
  return (Array.isArray(json) ? json : [])
    .filter(a => {
      if (!a.issue_datetime) return false;
      const t = new Date(noaaToISO(a.issue_datetime)).getTime();
      return !isNaN(t) && t >= cutoff;
    })
    .map((a, idx) => {
      const msg = a.message || '';
      const lines = msg.split('\n').map(l => l.trim()).filter(Boolean);
      const productLine = lines[0] || 'Space Weather Alert';

      let score = 2;
      const gMatch = msg.match(/G(\d)/);
      const xMatch = /X-class|X[0-9]/i.test(msg);
      const mMatch = /M-class|M[0-9]/i.test(msg);
      const sMatch = msg.match(/S(\d)/);
      if (xMatch || (gMatch && parseInt(gMatch[1]) >= 4) || (sMatch && parseInt(sMatch[1]) >= 4)) score = 4;
      else if (mMatch || (gMatch && parseInt(gMatch[1]) >= 3) || (sMatch && parseInt(sMatch[1]) >= 3)) score = 3;
      else if (gMatch || sMatch) score = 2;

      return {
        guid:        `noaa-${a.issue_datetime || idx}`,
        source:      'NOAA',
        category:    'space',
        title:       productLine,
        description: lines.slice(1, 3).join(' ').slice(0, 300) || null,
        level:       scoreToLevel(score),
        score,
        url:         'https://www.swpc.noaa.gov/products/alerts-watches-and-warnings',
        location:    'Clima Espacial Global',
        event_at:    safeDate(noaaToISO(a.issue_datetime)),
      };
    });
}

// ── FOREX ─────────────────────────────────────────────────────────────────────

const FOREX_CURRENCIES = ['TRY', 'BRL', 'ZAR', 'PLN', 'MXN', 'CNY', 'HUF'];
const FOREX_COUNTRY = {
  TRY: 'Turquia', BRL: 'Brasil', ZAR: 'África do Sul',
  PLN: 'Polónia', MXN: 'México', CNY: 'China', HUF: 'Hungria',
};

async function fetchForex(proxyBase) {
  const sym = FOREX_CURRENCIES.join(',');
  const prevDate = new Date(Date.now() - 3 * 24 * 3600 * 1000)
    .toISOString().split('T')[0];

  const [today, prev] = await Promise.all([
    proxyFetch(proxyBase, `https://api.frankfurter.app/latest?from=USD&to=${sym}`).then(r => r.json()),
    proxyFetch(proxyBase, `https://api.frankfurter.app/${prevDate}?from=USD&to=${sym}`).then(r => r.json()),
  ]);

  const todayRates = today.rates || {};
  const prevRates  = prev.rates  || {};

  return FOREX_CURRENCIES
    .map(c => {
      const rate = todayRates[c];
      const base = prevRates[c];
      if (!rate || !base) return null;

      const changePct = ((rate - base) / base) * 100;
      if (Math.abs(changePct) < 0.5) return null;

      const score = Math.abs(changePct) > 5 ? 4
                  : Math.abs(changePct) > 2 ? 3
                  : 2;
      const sign = changePct > 0 ? '+' : '';
      return {
        guid:        `forex-${c}-${today.date}`,
        source:      'FOREX',
        category:    'economic',
        title:       `USD/${c}: ${rate.toFixed(3)} (${sign}${changePct.toFixed(2)}% vs ${prevDate})`,
        description: changePct > 0
          ? `${FOREX_COUNTRY[c] || c}: moeda depreciou ${Math.abs(changePct).toFixed(2)}% face ao dólar`
          : `${FOREX_COUNTRY[c] || c}: moeda valorizou ${Math.abs(changePct).toFixed(2)}% face ao dólar`,
        level:       scoreToLevel(score),
        score,
        url:         `https://api.frankfurter.app/latest?from=USD&to=${c}`,
        location:    FOREX_COUNTRY[c] || c,
        event_at:    safeDate(today.date ? today.date + 'T12:00:00Z' : null),
      };
    })
    .filter(Boolean);
}

// ── Doomsday Clock ────────────────────────────────────────────────────────────

const DOOMSDAY_FALLBACK = { current: { year: 2026, seconds: 85 }, previous: { year: 2025, seconds: 89 } };

/**
 * Parse current and previous clock times from doomsdayclock.net HTML.
 * Returns { current: {year, seconds}, previous: {year, seconds} } or null.
 */
function parseDoomsdayClockNet(html) {
  // Extract all "X seconds to midnight" occurrences (ordered by appearance)
  const allMatches = [...html.matchAll(/(\d+)\s*seconds?\s+to\s+midnight/gi)];
  const times = allMatches
    .map(m => parseInt(m[1], 10))
    .filter(s => s >= 10 && s <= 3600);

  if (!times.length) return null;

  const current = times[0];

  // Try to find a year associated with current time
  const yearNearCurrent = html.match(/(?:current|now|today|(?:20\d{2}))[^<]{0,60}(\d+)\s*seconds?\s+to\s+midnight/i)
    || html.match(/(\d+)\s*seconds?\s+to\s+midnight[^<]{0,60}(20\d{2})/i);

  // Try to find explicit "previous" or second occurrence
  const prevSeconds = times.length > 1 ? times[1] : null;

  // Extract years mentioned near the times
  const yearMatches = [...html.matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1], 10))
    .filter(y => y >= 2017 && y <= new Date().getFullYear());

  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  return {
    current:  { year: currentYear, seconds: current },
    previous: prevSeconds
      ? { year: previousYear, seconds: prevSeconds }
      : null,
  };
}

async function fetchDoomsday(proxyBase) {
  let result = null;

  // Primary: doomsdayclock.net
  try {
    const html = await proxyFetch(proxyBase, 'https://www.doomsdayclock.net/').then(r => r.text());
    result = parseDoomsdayClockNet(html);
  } catch { /* try fallback */ }

  // Secondary: Wikipedia
  if (!result) {
    try {
      const data = await proxyFetch(
        proxyBase,
        'https://en.wikipedia.org/api/rest_v1/page/summary/Doomsday_Clock'
      ).then(r => r.json());
      const match = (data.extract || '').match(/(\d+)\s*seconds?\s+to\s+midnight/i);
      if (match) {
        const live = parseInt(match[1], 10);
        if (live >= 10 && live <= 3600) {
          result = { current: { year: new Date().getFullYear(), seconds: live }, previous: null };
        }
      }
    } catch { /* fall back to hardcoded */ }
  }

  const { current, previous } = result || DOOMSDAY_FALLBACK;
  const prev = previous || DOOMSDAY_FALLBACK.previous;

  const s     = current.seconds;
  const score = s < 60 ? 4 : s < 120 ? 3 : s < 180 ? 2 : 1;

  let trend = '';
  if (s < prev.seconds)      trend = ` ▼ -${prev.seconds - s}s vs ${prev.year}`;
  else if (s > prev.seconds) trend = ` ▲ +${s - prev.seconds}s vs ${prev.year}`;
  else                       trend = ` = sem alteração vs ${prev.year}`;

  return [{
    guid:        `doomsday-${current.year}`,
    source:      'DOOMSDAY',
    category:    'geopolitical',
    title:       `Relógio do Apocalipse: ${s}s até à meia-noite (${current.year})${trend}`,
    description: 'Boletim dos Cientistas Atómicos — avaliação anual do risco existencial global',
    level:       scoreToLevel(score),
    score,
    url:         'https://www.doomsdayclock.net/',
    location:    'Global',
    event_at:    new Date().toISOString(),
  }];
}

// ── Pizza Index ───────────────────────────────────────────────────────────────

function computePizzaIndex(signals) {
  const criticos = signals.filter(s => s.score >= 4).length;
  const altos    = signals.filter(s => s.score === 3).length;
  const medios   = signals.filter(s => s.score === 2).length;

  const pts    = criticos * 2 + altos + medios * 0.5;
  const slices = Math.min(5, Math.round(pts));

  const [label, desc] =
    slices === 0 ? ['×0 — linha base',      'sem sinais relevantes activos'] :
    slices === 1 ? ['×1 — pré-alerta',      `${signals.length} sinal(is) de baixa intensidade`] :
    slices === 2 ? ['×2 — tensão moderada', `${altos} alerta(s) alto(s), ${medios} médio(s)`] :
    slices === 3 ? ['×3 — meia pizza',      `${criticos} alerta(s) crítico(s) activo(s)`] :
    slices === 4 ? ['×4 — crise activa',    'múltiplos alertas críticos — resposta em curso'] :
                   ['×5 — caos total',      'todos os níveis de alerta activos simultaneamente'];

  const score = slices === 0 ? 1 : slices <= 2 ? 2 : slices <= 3 ? 3 : 4;
  const today = new Date().toISOString().split('T')[0];

  return {
    guid:        `pizza-${today}`,
    source:      'PIZZA',
    category:    'geopolitical',
    title:       `🍕 Pentagon Pizza Index: ${label}`,
    description: desc,
    level:       scoreToLevel(score),
    score,
    url:         null,
    location:    'Global',
    event_at:    new Date().toISOString(),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetch all OSINT risk signals using the given CORS proxy base URL.
 * Returns { signals, log } where log has per-source metadata.
 */
export async function fetchRiskSignals(proxyBase) {
  const fetchers = [
    fetchGDACS, fetchWHO, fetchReliefWeb, fetchIODA,
    fetchUSGS, fetchNOAA, fetchForex, fetchDoomsday,
  ];

  const results = await Promise.allSettled(fetchers.map(f => f(proxyBase)));

  const signals = [];
  const log = [];

  results.forEach((r, i) => {
    const meta  = SOURCE_META[i];
    const items = r.status === 'fulfilled' ? r.value : [];
    signals.push(...items);
    log.push({
      ...meta,
      signal_count: items.length,
      last_fetched_at: new Date().toISOString(),
      last_error: r.status === 'rejected'
        ? (r.reason?.message || String(r.reason)).slice(0, 200)
        : null,
    });
  });

  // Pizza Index — derived composite (only if at least one dynamic source returned data)
  if (signals.length > 0) {
    const pizza = computePizzaIndex(signals);
    signals.push(pizza);
    log.push({
      source:          'PIZZA',
      category:        'geopolitical',
      description:     'Pentagon Pizza Index — stress geopolítico composto',
      signal_count:    1,
      last_fetched_at: new Date().toISOString(),
      last_error:      null,
    });
  }

  return { signals, log };
}
