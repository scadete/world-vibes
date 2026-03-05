// RSS feed sources configuration
const FEEDS = [
  {
    name: "BBC News - World",
    url: "http://feeds.bbci.co.uk/news/world/rss.xml",
    category: "World",
    language: "en",
  },
  {
    name: "Reuters - Top News",
    url: "https://feeds.reuters.com/reuters/topNews",
    category: "Top News",
    language: "en",
  },
  {
    name: "Al Jazeera - World",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    category: "World",
    language: "en",
  },
  {
    name: "NPR - News",
    url: "https://feeds.npr.org/1001/rss.xml",
    category: "US News",
    language: "en",
  },
  {
    name: "The Guardian - World",
    url: "https://www.theguardian.com/world/rss",
    category: "World",
    language: "en",
  },
  {
    name: "Deutsche Welle - Top Stories",
    url: "https://rss.dw.com/rdf/rss-en-top",
    category: "Europe",
    language: "en",
  },
  {
    name: "France 24 - International",
    url: "https://www.france24.com/en/rss",
    category: "Europe",
    language: "en",
  },
  {
    name: "Folha de S.Paulo",
    url: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml",
    category: "Brazil",
    language: "pt",
  },
  {
    name: "G1 - Últimas Notícias",
    url: "https://g1.globo.com/rss/g1/",
    category: "Brazil",
    language: "pt",
  },
  {
    name: "El País - Internacional",
    url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada",
    category: "Spain/LatAm",
    language: "es",
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    category: "Technology",
    language: "en",
  },
  {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    category: "Technology",
    language: "en",
  },
];

module.exports = FEEDS;
