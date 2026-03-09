/**
 * Cloudflare Worker — CORS Proxy for WorldVibes
 *
 * Usage: GET /proxy?url=<encoded-target-url>
 * Returns the target response with Access-Control-Allow-Origin: *
 */

const ALLOWED_DOMAINS = new Set([
  // ── RSS Feeds ──────────────────────────────────────────────────────────────
  'feeds.bbci.co.uk',
  'feeds.reuters.com',
  'www.aljazeera.com',
  'www.theguardian.com',
  'feeds.npr.org',
  'feeds.apnews.com',
  'rss.dw.com',
  'www.france24.com',
  'feeds.folha.uol.com.br',
  'g1.globo.com',
  'feeds.elpais.com',
  'www3.nhk.or.jp',
  'www.scmp.com',
  'allafrica.com',
  'www.theafricareport.com',
  'www.arabnews.com',
  'www.jpost.com',
  'feeds.arstechnica.com',
  'hnrss.org',
  'www.technologyreview.com',
  'venturebeat.com',
  'api.quantamagazine.org',
  'spectrum.ieee.org',
  // ── OSINT Sources ─────────────────────────────────────────────────────────
  'www.gdacs.org',
  'gdacs.org',
  'www.who.int',
  'api.reliefweb.int',
  'ioda.inetintel.cc.gatech.edu',
  'api.ioda.inetintel.cc.gatech.edu',
  'earthquake.usgs.gov',
  'services.swpc.noaa.gov',
  'api.frankfurter.app',
  'en.wikipedia.org',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const target = searchParams.get('url');

    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: CORS_HEADERS });
    }

    // Validate target URL
    let targetURL;
    try {
      targetURL = new URL(target);
    } catch {
      return new Response('Invalid URL', { status: 400, headers: CORS_HEADERS });
    }

    // Enforce allowlist
    if (!ALLOWED_DOMAINS.has(targetURL.hostname)) {
      return new Response(`Domain not allowed: ${targetURL.hostname}`, { status: 403, headers: CORS_HEADERS });
    }

    // Only allow http/https
    if (targetURL.protocol !== 'https:' && targetURL.protocol !== 'http:') {
      return new Response('Protocol not allowed', { status: 403, headers: CORS_HEADERS });
    }

    try {
      const upstream = await fetch(target, {
        headers: {
          'User-Agent': 'WorldVibes/2.0 (+https://world-vibes.pages.dev)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
        },
        redirect: 'follow',
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      const body = await upstream.arrayBuffer();
      const contentType = upstream.headers.get('Content-Type') || 'text/xml; charset=utf-8';

      return new Response(body, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=300',
          'X-Proxied-From': targetURL.hostname,
        },
      });
    } catch (err) {
      return new Response(`Upstream fetch error: ${err.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },
};
