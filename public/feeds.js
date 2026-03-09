// RSS feed sources configuration
// Macro-region coverage: ≥2 sources per region
export const FEEDS = [
  // ── Global / World ──────────────────────────────────────────────────────────
  {
    name: 'BBC News - World',
    url: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    category: 'World',
    language: 'en',
  },
  {
    name: 'Reuters - Top News',
    url: 'https://feeds.reuters.com/reuters/topNews',
    category: 'Top News',
    language: 'en',
  },
  {
    name: 'Al Jazeera - World',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    category: 'World',
    language: 'en',
  },
  {
    name: 'The Guardian - World',
    url: 'https://www.theguardian.com/world/rss',
    category: 'World',
    language: 'en',
  },

  // ── North America (≥2 sources) ───────────────────────────────────────────────
  {
    name: 'NPR - News',
    url: 'https://feeds.npr.org/1001/rss.xml',
    category: 'North America',
    language: 'en',
  },
  {
    name: 'AP News - Top Headlines',
    url: 'https://feeds.apnews.com/rss/apf-topnews',
    category: 'North America',
    language: 'en',
  },

  // ── Europe (≥2 sources) ──────────────────────────────────────────────────────
  {
    name: 'Deutsche Welle - Top Stories',
    url: 'https://rss.dw.com/rdf/rss-en-top',
    category: 'Europe',
    language: 'en',
  },
  {
    name: 'France 24 - International',
    url: 'https://www.france24.com/en/rss',
    category: 'Europe',
    language: 'en',
  },

  // ── Brazil / LatAm (≥2 sources) ─────────────────────────────────────────────
  {
    name: 'Folha de S.Paulo',
    url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',
    category: 'Brazil',
    language: 'pt',
  },
  {
    name: 'G1 - Últimas Notícias',
    url: 'https://g1.globo.com/rss/g1/',
    category: 'Brazil',
    language: 'pt',
  },
  {
    name: 'El País - Internacional',
    url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada',
    category: 'Spain/LatAm',
    language: 'es',
  },

  // ── Asia-Pacific (≥2 sources) ────────────────────────────────────────────────
  {
    name: 'NHK World - Top Stories',
    url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
    category: 'Asia-Pacific',
    language: 'en',
  },
  {
    name: 'South China Morning Post - World',
    url: 'https://www.scmp.com/rss/4/feed',
    category: 'Asia-Pacific',
    language: 'en',
  },

  // ── Africa (≥2 sources) ──────────────────────────────────────────────────────
  {
    name: 'AllAfrica - Top Stories',
    url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
    category: 'Africa',
    language: 'en',
  },
  {
    name: 'The Africa Report',
    url: 'https://www.theafricareport.com/feed/',
    category: 'Africa',
    language: 'en',
  },

  // ── Middle East (≥2 sources) ─────────────────────────────────────────────────
  {
    name: 'Arab News',
    url: 'https://www.arabnews.com/rss.xml',
    category: 'Middle East',
    language: 'en',
  },
  {
    name: 'Jerusalem Post - World',
    url: 'https://www.jpost.com/rss/rssfeedsheadlines.aspx',
    category: 'Middle East',
    language: 'en',
  },

  // ── Technology ───────────────────────────────────────────────────────────────
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    category: 'Technology',
    language: 'en',
  },
  {
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    category: 'Technology',
    language: 'en',
  },

  // ── Inteligência Artificial (≥2 sources) ────────────────────────────────────
  {
    name: 'MIT Technology Review - AI',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed',
    category: 'Inteligência Artificial',
    language: 'en',
  },
  {
    name: 'VentureBeat - AI',
    url: 'https://venturebeat.com/category/ai/feed/',
    category: 'Inteligência Artificial',
    language: 'en',
  },

  // ── Computação Quântica (≥2 sources) ────────────────────────────────────────
  {
    name: 'Quanta Magazine',
    url: 'https://api.quantamagazine.org/feed/',
    category: 'Computação Quântica',
    language: 'en',
  },
  {
    name: 'IEEE Spectrum',
    url: 'https://spectrum.ieee.org/feeds/feed.rss',
    category: 'Computação Quântica',
    language: 'en',
  },
];
