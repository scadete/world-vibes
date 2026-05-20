# WorldVibes — Original Project Requirements

## Project Overview

WorldVibes is a global RSS news aggregator with embedded OSINT risk analysis, semantic
clustering, and Progressive Web App (PWA) support. The core requirement was a **100% static
web application** — no backend server, no database server, no build step — that runs entirely
in the browser and can be deployed to a static hosting platform.

---

## Functional Requirements

### 1. RSS Feed Aggregation

- Aggregate news from **at least 20 RSS/Atom feeds** covering every major world region
- Minimum **2 sources per macro-region** to avoid single-source bias
- Support **multilingual feeds** (English, Portuguese, Spanish)
- Parse both RSS 2.0 and Atom feed formats
- Detect and handle varying character encodings (UTF-8, ISO-8859-1, etc.)
- Deduplicate articles by GUID to avoid showing the same story twice
- Persist articles in **IndexedDB** with a **7-day retention window**
- **Auto-refresh every 30 minutes** with a manual refresh option

#### Required Feed Categories and Sources

| Category | Sources |
|----------|---------|
| Global/World | BBC News, Reuters, Al Jazeera, The Guardian |
| North America | NPR, AP News |
| Europe | Deutsche Welle, France 24 |
| Brazil/Latin America | Folha de S.Paulo, G1, El País |
| Asia-Pacific | NHK World, South China Morning Post |
| Africa | AllAfrica, The Africa Report |
| Middle East | Arab News, Jerusalem Post |
| Technology | Ars Technica, Hacker News |
| Artificial Intelligence | MIT Technology Review AI, VentureBeat AI |
| Quantum Computing | Quanta Magazine, IEEE Spectrum |

### 2. OSINT Risk Signal Ingestion

Fetch and score **real-time risk signals** from open-source intelligence sources. Each signal
must be assigned a **severity level on a 1–4 scale**:

| Level | Label | Meaning |
|-------|-------|---------|
| 1 | BAIXO | Low — informational |
| 2 | MÉDIO | Medium — monitor |
| 3 | ALTO | High — significant event |
| 4 | CRÍTICO | Critical — major incident |

#### Required OSINT Sources

| Source | Type | Data |
|--------|------|------|
| GDACS (UN-OCHA) | RSS | Natural disasters — earthquakes, floods, cyclones (level 1–3) |
| WHO | RSS | Global disease outbreaks and health alerts |
| ReliefWeb (OCHA) | REST API (JSON) | Humanitarian crises worldwide |
| IODA (Georgia Tech) | REST API (JSON) | Internet outages and connectivity disruptions |
| USGS | GeoJSON | Seismic activity — earthquakes M≥2.5 in last 24 h |
| NOAA/SWPC | JSON | Space weather — geomagnetic storms (Kp index) |
| Frankfurter | REST API (JSON) | Foreign exchange stress (currency volatility vs USD) |
| Bulletin of the Atomic Scientists | HTML scrape | Doomsday Clock (minutes to midnight) |

- All OSINT fetches must use `Promise.allSettled` so a single failing source does not block others
- Each individual fetch must timeout after **15 seconds**
- The Doomsday Clock fetch must fall back to Wikipedia, and then to a hardcoded value if both fail

### 3. Semantic Clustering

- Group related articles from different sources using **semantic similarity**
- Run clustering in a **Web Worker** to avoid blocking the main thread
- Use **Transformers.js** (`Xenova/multilingual-e5-small`, quantized `q8`) for embeddings
- Similarity threshold: **0.76 cosine similarity**
- Cache computed embeddings in IndexedDB (`wv-embeddings` store) to avoid recomputing on reload
- Implement retry logic (3 attempts with exponential backoff) for model loading

### 4. Progressive Web App (PWA)

- Register a **Service Worker** for offline support
- Cache static assets (network-first for navigation, cache-first for assets)
- Provide a `manifest.json` for installability on desktop and mobile
- Support iOS home-screen installation (`apple-mobile-web-app-capable`)

### 5. User Interface

- **Dark retro terminal aesthetic**: green-on-black (`#00ff41` on `#000900`), monospace font,
  scanline overlay
- Display articles grouped by cluster or chronologically
- Show trending tags derived from article keywords (filter common stopwords per language)
- Expose an **OSINT risk panel / modal** showing the live signals and their severity
- Display a **version/config modal** with app metadata
- Responsive layout suitable for desktop and mobile screens

---

## Architecture Requirements

### No Backend, No Build Step

- The frontend (`public/`) is a plain **ES-module SPA** — no bundler (Webpack, Vite, etc.)
- All processing (feed parsing, risk scoring, clustering) happens **in the browser**
- No Node.js server, no Python backend, no SQL database

### CORS Proxy (Cloudflare Worker)

- A **Cloudflare Worker** acts as a lightweight CORS proxy for external feeds and OSINT APIs
- The Worker must validate target URLs against a **domain allowlist** (whitelist of ~33 domains)
- Only `GET` requests are proxied; `OPTIONS` preflight is handled for CORS
- Cache TTL: 300 seconds via Cloudflare edge cache
- The Worker URL is configured at runtime via `window.WV_PROXY`; it falls back to
  `http://localhost:8787/proxy` for local development

### Hosting

- Frontend hosted on **Cloudflare Pages** (serves `public/` as-is, no build command)
- Worker deployed via **Wrangler CLI** (`npx wrangler deploy`)
- GitHub push triggers automatic Pages deployment (CI/CD via Cloudflare Git integration)

### Data Persistence

- **IndexedDB** is the only storage layer — all data stays in the user's browser
- Three object stores: `articles`, `risk_signals`, `meta`
- Prune articles older than 3–7 days on each open

---

## Non-functional Requirements

### Performance

- Fetch all 22 feeds **in parallel** with `Promise.allSettled`
- Show progress feedback during the initial load
- Embeddings model (~60 MB) is downloaded once and cached by the browser

### Compatibility

- Must work on **iOS Safari** (WASM memory constraints):
  - Use a quantized, lightweight ML model (`q8` instead of full-precision)
  - Release WASM worker memory after clustering completes
  - Stagger ML startup to avoid memory spikes on page load
- Must work on all modern browsers (Chrome, Firefox, Safari, Edge)

### Privacy

- No analytics, no tracking, no server-side logging
- No user accounts or authentication
- All article data and embeddings remain **local to the user's device**

### Extensibility

- Adding a new RSS feed requires only:
  1. Adding an entry to `public/feeds.js`
  2. Adding the domain to the allowlist in `worker/index.js`
  3. Redeploying the Worker and frontend

---

## Deliverables

| Deliverable | Location |
|-------------|----------|
| SPA entry point | `public/index.html` |
| Feed list (22 feeds) | `public/feeds.js` |
| OSINT fetchers + scoring | `public/risk-sources.js` |
| IndexedDB layer | `public/db.js` |
| RSS/Atom parser | `public/fetcher.js` |
| Service Worker | `public/sw.js` |
| Semantic clustering worker | `public/embeddings-worker.js` |
| PWA manifest | `public/manifest.json` |
| CORS proxy Worker | `worker/index.js` |
| Worker config | `wrangler.toml` |
| Run/deploy instructions | `README.md` |
