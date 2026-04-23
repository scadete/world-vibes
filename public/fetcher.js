/**
 * WorldVibes — browser-side RSS fetcher
 * Fetches all feeds through the CORS proxy and stores in IndexedDB.
 */

import { FEEDS } from './feeds.js';
import { saveArticles } from './db.js';

// ── XML Parsing ───────────────────────────────────────────────────────────────

function getText(el, selector) {
  return el.querySelector(selector)?.textContent?.trim() || '';
}

function getAttrOrText(el, selector, attr) {
  const node = el.querySelector(selector);
  if (!node) return '';
  return node.getAttribute(attr) || node.textContent?.trim() || '';
}

function sanitize(str, maxLen = 1000) {
  if (!str) return '';
  // Strip HTML tags
  const tmp = document.createElement('div');
  tmp.innerHTML = str;
  return (tmp.textContent || tmp.innerText || '').slice(0, maxLen).trim();
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

/**
 * Parse RSS 2.0 or Atom feed XML text into article objects.
 * @param {string} xmlText
 * @param {object} feed  — { name, category, language }
 * @returns {object[]}
 */
export function parseXML(xmlText, feed) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

  // Check for parse error
  const parseError = doc.querySelector('parsererror');
  if (parseError) return [];

  const isAtom = !!doc.querySelector('feed > entry, feed');
  const items = isAtom
    ? [...doc.querySelectorAll('feed > entry')]
    : [...doc.querySelectorAll('channel > item, item')];

  return items.map(el => {
    let link, guid, pubDate, description, author;

    if (isAtom) {
      link = el.querySelector('link[rel="alternate"]')?.getAttribute('href')
          || el.querySelector('link:not([rel="self"])')?.getAttribute('href')
          || getText(el, 'link');
      guid    = getText(el, 'id') || link;
      pubDate = getText(el, 'published') || getText(el, 'updated');
      description = sanitize(getText(el, 'summary') || getText(el, 'content'));
      author      = getText(el, 'author > name') || getText(el, 'author');
    } else {
      link = getText(el, 'link');
      if (!link) {
        // Some feeds put link as CDATA or next sibling text node
        const linkEl = el.getElementsByTagName('link')[0];
        link = linkEl?.textContent?.trim() || linkEl?.getAttribute('href') || '';
      }
      guid    = getText(el, 'guid') || link;
      pubDate = getText(el, 'pubDate') || getText(el, 'dc\\:date') || getText(el, 'date');
      description = sanitize(getText(el, 'description'));
      author = getText(el, 'dc\\:creator') || getText(el, 'creator') || getText(el, 'author');
    }

    return {
      guid:        guid || `${feed.name}::${getText(el, 'title')}`,
      title:       getText(el, 'title'),
      link:        link || null,
      description: description || '',
      pub_date:    safeDate(pubDate),
      author:      author || '',
      feed_name:   feed.name,
      category:    feed.category,
      language:    feed.language,
      fetched_at:  new Date().toISOString(),
    };
  }).filter(a => a.title && a.guid);
}

// ── Fetch single feed ─────────────────────────────────────────────────────────

/**
 * Fetch one feed through the CORS proxy and parse it.
 * @param {object} feed
 * @param {string} proxyBase  — e.g. "https://world-vibes-proxy.workers.dev/proxy"
 * @returns {Promise<object[]>}
 */
export async function fetchFeed(feed, proxyBase) {
  const url = `${proxyBase}?url=${encodeURIComponent(feed.url)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();

  // Detect charset from Content-Type header (e.g. "text/xml; charset=ISO-8859-1")
  const contentType = res.headers.get('Content-Type') || '';
  const ctCharset = contentType.match(/charset=([^\s;]+)/i)?.[1] || 'utf-8';

  // Decode with Content-Type charset first so we can read the XML declaration
  let text;
  try {
    text = new TextDecoder(ctCharset).decode(buffer);
  } catch {
    text = new TextDecoder('utf-8').decode(buffer);
  }

  // XML declaration may override: <?xml version="1.0" encoding="ISO-8859-1"?>
  const xmlEncoding = text.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i)?.[1];
  if (xmlEncoding && xmlEncoding.toLowerCase() !== ctCharset.toLowerCase()) {
    try {
      text = new TextDecoder(xmlEncoding).decode(buffer);
    } catch {
      // keep the already-decoded text
    }
  }

  return parseXML(text, feed);
}

// ── Fetch all feeds ───────────────────────────────────────────────────────────

/**
 * Fetch all configured feeds, save new articles to IndexedDB.
 * @param {string} proxyBase
 * @param {function} onProgress  — called with { done, total, currentFeed, totalSaved, errors }
 * @returns {Promise<{ saved: number, errors: string[] }>}
 */
export async function fetchAll(proxyBase, onProgress) {
  const total = FEEDS.length;
  let done = 0;
  let totalSaved = 0;
  const errors = [];

  const results = await Promise.allSettled(
    FEEDS.map(async feed => {
      const articles = await fetchFeed(feed, proxyBase);
      const saved = await saveArticles(articles);
      done++;
      totalSaved += saved;
      onProgress?.({ done, total, currentFeed: feed.name, totalSaved, errors });
      return { feed: feed.name, count: articles.length, saved };
    })
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      const msg = r.reason?.message || String(r.reason);
      errors.push(msg);
    }
  }

  return { saved: totalSaved, errors };
}
