// Web Worker — heuristic + TF-IDF clustering, zero downloads, zero WASM
//
// Cross-language grouping: named-entity + number anchor overlap.
// Same-language grouping: TF-IDF cosine similarity on tokenised title+description.
// Supported scripts: Latin (EN/PT/ES/FR), Cyrillic (RU), Arabic, Chinese (ZH).

// ── Stopwords ─────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  // EN
  'the','and','for','not','but','with','this','that','from','have','been',
  'will','they','were','their','what','when','which','about','more','also',
  'into','over','after','before','other','some','such','just','than','then',
  'says','said','three','four','five','eight','nine',
  // PT
  'nao','dos','das','nos','nas','pelo','pela','numa','este','essa','esse',
  'todo','toda','todos','muito','como','para','sobre','entre','ainda','novo',
  'nova','pelo','pela','pelos','pelas','seria','sendo','foram','estar',
  // transliterated RU
  'posle','mezhdu','chto','eto','ikh','ili','togo','vsego','etogo',
]);

// ── Script detection ──────────────────────────────────────────────────────────
const hasCyrillic = s => /[Ѐ-ӿ]/.test(s);
const hasArabic   = s => /[؀-ۿ]/.test(s);
const hasChinese  = s => /[一-鿿㐀-䶿]/.test(s);

function detectScript(title) {
  if (hasChinese(title))  return 'zh';
  if (hasCyrillic(title)) return 'ru';
  if (hasArabic(title))   return 'ar';
  return 'latin';
}

// Arabic-Indic digit → ASCII
const toAsciiDigit = c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48);

// ── Cyrillic entity dict (substring → canonical English key) ─────────────────
const CYRILLIC_ENTITIES = [
  ['Россия','russia'],   ['России','russia'],   ['Российской','russia'],
  ['Украина','ukraine'], ['Украины','ukraine'], ['Украине','ukraine'],
  ['Москва','moscow'],   ['Кремль','kremlin'],
  ['США','usa'],         ['Вашингтон','washington'],
  ['Путин','putin'],     ['Зеленский','zelensky'], ['Зеленского','zelensky'],
  ['Байден','biden'],    ['Трамп','trump'],        ['Нетаньяху','netanyahu'],
  ['Макрон','macron'],   ['Эрдоган','erdogan'],
  ['Китай','china'],     ['Пекин','beijing'],
  ['Израиль','israel'],  ['Израиля','israel'],
  ['Палестина','palestine'], ['Газа','gaza'],
  ['Иран','iran'],       ['Ирак','iraq'],  ['Сирия','syria'], ['Ливан','lebanon'],
  ['Йемен','yemen'],     ['Судан','sudan'],
  ['НАТО','nato'],       ['ООН','un'],     ['Евросоюз','eu'],
  ['Германия','germany'],['Берлин','berlin'],
  ['Франция','france'],  ['Великобритания','uk'], ['Лондон','london'],
  ['Турция','turkey'],   ['Япония','japan'],       ['Индия','india'],
  ['Северная Корея','northkorea'], ['Ким Чен Ын','kimjongun'],
  ['Саудовская Аравия','saudiarabia'],
  ['Судан','sudan'],     ['Сомали','somalia'],     ['Афганистан','afghanistan'],
  ['Сирийской','syria'], ['Ливия','libya'],
];

// ── Arabic entity dict (substring → canonical English key) ───────────────────
const ARABIC_ENTITIES = [
  ['روسيا','russia'],    ['روسية','russia'],
  ['أمريكا','usa'],      ['الولايات المتحدة','usa'], ['أمريكي','usa'],
  ['الصين','china'],     ['الصينية','china'],
  ['أوكرانيا','ukraine'],['أوكراني','ukraine'],
  ['إسرائيل','israel'],  ['الإسرائيلي','israel'],
  ['فلسطين','palestine'],['الفلسطيني','palestine'],
  ['غزة','gaza'],
  ['إيران','iran'],      ['الإيراني','iran'],
  ['العراق','iraq'],     ['سوريا','syria'],  ['لبنان','lebanon'],
  ['اليمن','yemen'],     ['السودان','sudan'],
  ['السعودية','saudiarabia'], ['مصر','egypt'], ['تركيا','turkey'],
  ['ليبيا','libya'],     ['الصومال','somalia'], ['أفغانستان','afghanistan'],
  ['بريطانيا','uk'],     ['فرنسا','france'],   ['ألمانيا','germany'],
  ['بوتين','putin'],     ['ترامب','trump'],    ['زيلنسكي','zelensky'],
  ['نتنياهو','netanyahu'],['بايدن','biden'],   ['ماكرون','macron'],
  ['أردوغان','erdogan'],
  ['الناتو','nato'],     ['الأمم المتحدة','un'],
  ['حماس','hamas'],      ['حزب الله','hezbollah'],
  ['كوريا الشمالية','northkorea'], ['كوريا','korea'],
  ['الهند','india'],     ['باكستان','pakistan'],
];

// ── Chinese entity dict (substring → canonical English key) ──────────────────
const CHINESE_ENTITIES = [
  ['美国','usa'],    ['美國','usa'],
  ['中国','china'],  ['中國','china'],  ['中共','ccp'],
  ['俄罗斯','russia'],['俄羅斯','russia'],
  ['英国','uk'],     ['英國','uk'],
  ['法国','france'], ['法國','france'],
  ['德国','germany'],['德國','germany'],
  ['日本','japan'],
  ['韩国','southkorea'], ['韓國','southkorea'],
  ['朝鲜','northkorea'], ['朝鮮','northkorea'],
  ['以色列','israel'],   ['巴勒斯坦','palestine'], ['加沙','gaza'],
  ['乌克兰','ukraine'],  ['烏克蘭','ukraine'],
  ['台湾','taiwan'],     ['台灣','taiwan'],
  ['北京','beijing'],    ['上海','shanghai'],      ['香港','hongkong'],
  ['普京','putin'],      ['拜登','biden'],          ['特朗普','trump'],
  ['习近平','xijinping'],['泽连斯基','zelensky'],   ['泽連斯基','zelensky'],
  ['北约','nato'],       ['联合国','un'],           ['聯合國','un'],
  ['伊朗','iran'],       ['伊拉克','iraq'],
  ['叙利亚','syria'],    ['敘利亞','syria'],
  ['沙特阿拉伯','saudiarabia'], ['土耳其','turkey'], ['埃及','egypt'],
  ['金正恩','kimjongun'],['印度','india'],          ['巴基斯坦','pakistan'],
  ['利比亚','libya'],    ['索马里','somalia'],
];

// ── Latin normalisation dict (post diacritic-strip + lowercase → canonical) ──
// Covers Portuguese, Spanish, French variants of common proper nouns.
const LATIN_NORM = {
  // Cities / capitals
  'moscou':'moscow', 'moscovo':'moscow',
  'pequim':'beijing','pekim':'beijing', 'pechino':'beijing',
  'varsovia':'warsaw','varsovie':'warsaw',
  'belgrado':'belgrade',
  // Countries (PT/ES/FR → EN)
  'alemanha':'germany',    'alemania':'germany',
  'franca':'france',       'fransiz':'france',
  'espanha':'spain',       'espana':'spain',
  'grecia':'greece',       'grece':'greece',
  'suecia':'sweden',       'suede':'sweden',
  'suica':'switzerland',   'suisse':'switzerland',
  'belgica':'belgium',     'belgie':'belgium',
  'turquia':'turkey',      'turquie':'turkey',
  'siria':'syria',         'syrie':'syria',
  'libano':'lebanon',      'liban':'lebanon',
  'irao':'iran',
  'iraque':'iraq',
  'russia':'russia',
  'ucrania':'ukraine',     'ukraina':'ukraine',
  'bielorrussia':'belarus','bielorusia':'belarus',
  'polónia':'poland',      'polonia':'poland',
  'romenia':'romania',     'roumanie':'romania',
  'servia':'serbia',
  'libia':'libya',         'libye':'libya',
  'arabia':'saudiarabia',  // "Arabia Saudita" — "Arabia" alone kept as partial signal
  // Organisations
  'otan':'nato',
  'onu':'un',
  // Leader name variants
  'zelenski':'zelensky',   'zelenskyy':'zelensky', 'zelenskiy':'zelensky',
  'netanyahou':'netanyahu','netanyah':'netanyahu',
  'erdoan':'erdogan',
};

// ── Anchor extraction ─────────────────────────────────────────────────────────
function extractAnchors(title) {
  const anchors = new Set();

  // Normalise Arabic-Indic digits → ASCII
  const t = title.replace(/[٠-٩]/g, toAsciiDigit);

  // Numbers ≥ 2 digits, excluding 4-digit years (too generic in news)
  for (const m of t.matchAll(/\b(\d{2,})\b/g)) {
    const n = parseInt(m[1], 10);
    if (m[1].length === 4 && n >= 1900 && n <= 2100) continue;
    anchors.add('#' + m[1]);
  }

  // Script-specific entity dict lookups (substring match in original script)
  if (hasCyrillic(title))
    for (const [sub, canon] of CYRILLIC_ENTITIES)
      if (title.includes(sub)) anchors.add(canon);

  if (hasArabic(title))
    for (const [sub, canon] of ARABIC_ENTITIES)
      if (title.includes(sub)) anchors.add(canon);

  if (hasChinese(title))
    for (const [sub, canon] of CHINESE_ENTITIES)
      if (title.includes(sub)) anchors.add(canon);

  // Latin-script proper nouns: capitalised (TitleCase or ALLCAPS), length ≥ 3
  // Also picks up Latin words mixed into Cyrillic/Arabic/Chinese headlines.
  for (const m of title.matchAll(/(?<![a-zA-Z])([A-Z][a-zA-ZÀ-ÖØ-öø-ÿ]{2,}|[A-Z]{2,})/g)) {
    let w = m[1]
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    w = LATIN_NORM[w] ?? w;
    if (w.length >= 2 && !STOPWORDS.has(w)) anchors.add(w);
  }

  return anchors;
}

// ── TF-IDF ────────────────────────────────────────────────────────────────────
function tokenise(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9Ѐ-ӿ؀-ۿ一-鿿\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
}

function computeTF(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const max = Math.max(1, ...Object.values(tf));
  for (const k in tf) tf[k] /= max;
  return tf;
}

function computeIDF(tfs) {
  const df = {};
  for (const tf of tfs) for (const t in tf) df[t] = (df[t] || 0) + 1;
  const N = tfs.length;
  const idf = {};
  for (const t in df) idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1;
  return idf;
}

function tfidfVec(tf, idf) {
  const v = {};
  for (const t in tf) if (idf[t]) v[t] = tf[t] * idf[t];
  return v;
}

function sparseCos(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const t in a) { na += a[t] * a[t]; if (b[t]) dot += a[t] * b[t]; }
  for (const t in b) nb += b[t] * b[t];
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}

// ── Union-Find ────────────────────────────────────────────────────────────────
function makeUF(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const r = new Array(n).fill(0);
  function find(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
  function union(x, y) {
    const [rx, ry] = [find(x), find(y)];
    if (rx === ry) return;
    if (r[rx] < r[ry]) p[rx] = ry;
    else if (r[rx] > r[ry]) p[ry] = rx;
    else { p[ry] = rx; r[rx]++; }
  }
  return { find, union };
}

// ── Main ──────────────────────────────────────────────────────────────────────
self.onmessage = ({ data: { articles } }) => {
  try {
    const n = articles.length;

    // 1. Extract anchors and detect script for each article
    self.postMessage({ type: 'status', msg: 'A extrair entidades…' });
    const anchorSets = articles.map(a => extractAnchors(a.title));
    const scripts    = articles.map(a => detectScript(a.title));

    // 2. Build inverted index: anchor → [article indices]
    const inv = new Map();
    for (let i = 0; i < n; i++)
      for (const a of anchorSets[i]) {
        if (!inv.has(a)) inv.set(a, []);
        inv.get(a).push(i);
      }

    self.postMessage({ type: 'progress', done: Math.floor(n * 0.3), total: n });

    // 3. TF-IDF vectors for same-language grouping
    self.postMessage({ type: 'status', msg: 'A calcular similaridade…' });
    const tfs  = articles.map(a => computeTF(tokenise(`${a.title} ${a.description || ''}`)));
    const idf  = computeIDF(tfs);
    const vecs = tfs.map(tf => tfidfVec(tf, idf));

    self.postMessage({ type: 'progress', done: Math.floor(n * 0.55), total: n });

    // 4. Pairwise scoring
    const ANCHOR_CLUSTER = 2,  ANCHOR_RELATED = 1;
    const TFIDF_CLUSTER  = 0.20, TFIDF_RELATED = 0.12;

    const uf          = makeUF(n);
    const relatedData = {};

    // Count shared anchors per pair via inverted index
    const anchorCounts = new Map(); // `${i}_${j}` → count
    for (const [, indices] of inv) {
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          const i = Math.min(indices[a], indices[b]);
          const j = Math.max(indices[a], indices[b]);
          if (articles[i].feed_name === articles[j].feed_name) continue;
          const key = `${i}_${j}`;
          anchorCounts.set(key, (anchorCounts.get(key) || 0) + 1);
        }
      }
    }

    for (const [key, cnt] of anchorCounts) {
      const [i, j] = key.split('_').map(Number);
      if (cnt >= ANCHOR_CLUSTER) uf.union(i, j);
      if (cnt >= ANCHOR_RELATED) {
        (relatedData[articles[i].guid] ??= []).push(articles[j]);
        (relatedData[articles[j].guid] ??= []).push(articles[i]);
      }
    }

    self.postMessage({ type: 'progress', done: Math.floor(n * 0.75), total: n });

    // TF-IDF for same-language (same script) Latin pairs
    // Non-Latin scripts are already handled by entity dict anchors above.
    for (let i = 0; i < n; i++) {
      if (scripts[i] !== 'latin') continue;
      const langI = articles[i].language || '';
      for (let j = i + 1; j < n; j++) {
        if (scripts[j] !== 'latin') continue;
        if (articles[i].feed_name === articles[j].feed_name) continue;
        // Only compare same declared language when available; else compare all Latin
        const langJ = articles[j].language || '';
        if (langI && langJ && langI !== langJ) continue;
        const sim = sparseCos(vecs[i], vecs[j]);
        if (sim >= TFIDF_CLUSTER) uf.union(i, j);
        if (sim >= TFIDF_RELATED && !anchorCounts.has(`${i}_${j}`)) {
          (relatedData[articles[i].guid] ??= []).push(articles[j]);
          (relatedData[articles[j].guid] ??= []).push(articles[i]);
        }
      }
    }

    self.postMessage({ type: 'related', data: relatedData });

    // 5. Collect and sort clusters
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = uf.find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(articles[i]);
    }

    const clusters = [...groups.values()]
      .map(arts => {
        const feeds = [...new Set(arts.map(a => a.feed_name))];
        if (feeds.length < 2) return null;
        return {
          source_count:  feeds.length,
          article_count: arts.length,
          sources:       feeds.join(','),
          sample_title:  arts[0].title,
          sample_link:   arts[0].link,
          articles:      arts,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.source_count - a.source_count || b.article_count - a.article_count);

    self.postMessage({ type: 'progress', done: n, total: n });
    self.postMessage({ type: 'clusters', data: clusters });

  } catch (err) {
    self.postMessage({ type: 'error', msg: `${err.name}: ${err.message}` });
  }
};
