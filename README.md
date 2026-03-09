# WorldVibes — RSS News Aggregator

Agregador de notícias globais com análise de risco OSINT, clustering semântico e suporte a PWA. Arquitectura 100% estática — sem servidor, sem base de dados.

## Arquitectura

```
Browser
  ├── Fetch feeds RSS/APIs OSINT → Cloudflare Worker (proxy CORS)
  ├── Parse RSS/Atom com DOMParser
  ├── Avalia risk scores (GDACS, WHO, USGS, NOAA, …)
  ├── Persiste artigos em IndexedDB (7 dias)
  ├── Clustering semântico via Web Worker (Transformers.js)
  └── Auto-refresh a cada 30 min (ou manual)

Cloudflare Worker  →  proxy CORS para feeds externos e APIs OSINT
Cloudflare Pages   →  serve public/ como SPA (sem build step)
```

## Estrutura

```
public/
  index.html            SPA principal
  feeds.js              Lista dos 22 feeds RSS (ES module)
  risk-sources.js       Fontes OSINT + scoring 1-4 no browser
  db.js                 Camada IndexedDB (artigos, risk signals, meta)
  fetcher.js            Fetch + parse RSS/Atom no browser
  sw.js                 Service Worker (PWA, cache offline)
  embeddings-worker.js  Clustering semântico (Transformers.js)
  manifest.json         PWA manifest
  icon.svg              Ícone
worker/
  index.js              Cloudflare Worker — proxy CORS
wrangler.toml           Config do Worker
package.json            Só wrangler como devDependency
```

## Desenvolvimento local

**Pré-requisito:** Node.js (qualquer versão recente)

```bash
npm install
```

**Terminal 1 — proxy CORS** (porta 8787):

```bash
npx wrangler dev
```

**Terminal 2 — frontend** (qualquer servidor estático):

```bash
npx serve public
# ou
python3 -m http.server 8080 --directory public
```

Abrir [http://localhost:8080](http://localhost:8080).

> Quando `window.WV_PROXY` não está definido, o frontend usa automaticamente `http://localhost:8787/proxy`.

## Deploy

### 1. Worker (proxy CORS)

```bash
npx wrangler login   # autenticar no Cloudflare (só uma vez)
npx wrangler deploy  # publica worker/index.js
```

O worker fica disponível em `https://worldvibe.scadete.workers.dev`.
O URL já está configurado em `public/index.html` (`window.WV_PROXY`).

### 2. Frontend (Cloudflare Pages)

**Opção A — via GitHub** (recomendado — deploy automático a cada push):

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**
2. Seleccionar o repositório `scadete/world-vibes`
3. Configurar:

   | Campo | Valor |
   |---|---|
   | Branch de produção | `claude/rss-news-aggregator-95J0U` |
   | Build command | *(vazio)* |
   | Build output directory | `public` |

4. Clicar **Save and Deploy**

**Opção B — via CLI:**

```bash
npx wrangler pages deploy public --project-name world-vibes
```

## Verificação após deploy

1. Abrir o URL do Pages
2. DevTools → Console → sem erros de CORS
3. Clicar **[↻] Refresh** → artigos carregam em ~30s
4. Clicar **[↻]** nos alertas OSINT → sinais de risco aparecem

## Adicionar feeds

Editar `public/feeds.js` — adicionar ao array `FEEDS`:

```js
{
  name: 'Nome do feed',
  url: 'https://exemplo.com/rss.xml',
  category: 'Categoria',
  language: 'pt',   // 'en' | 'pt' | 'es'
}
```

Adicionar o domínio à allowlist em `worker/index.js` (`ALLOWED_DOMAINS`).

## Fontes OSINT

| Fonte | Categoria | Tipo |
|---|---|---|
| GDACS | Desastres naturais | RSS |
| WHO | Surtos de doenças | RSS |
| ReliefWeb | Crises humanitárias | REST API |
| IODA | Interrupções de internet | REST API |
| USGS | Actividade sísmica | GeoJSON |
| NOAA/SWPC | Clima espacial | JSON |
| Frankfurter | Stress cambial (USD) | REST API |
| Wikipedia | Relógio do Apocalipse | REST API |
| Pizza Index | Stress geopolítico composto | Derivado |
