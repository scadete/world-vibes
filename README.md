# 🌍 WorldVibes – RSS News Aggregator

A lightweight, self-hosted RSS news aggregator that pulls from international sources and presents them in a clean dark-mode web UI.

## Features

- **12+ international feeds** – BBC, Reuters, Al Jazeera, NPR, The Guardian, DW, France 24, Folha, G1, El País, Ars Technica, Hacker News
- **Multi-language support** – English, Portuguese, Spanish
- **Filter by category or language**
- **Full-text search** across titles and descriptions
- **Auto-refresh** every 30 minutes (configurable)
- **Manual refresh** button in the UI
- **SQLite storage** – zero external database dependencies
- **Pagination** – load-more for large result sets

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000

### Fetch feeds manually (CLI)

```bash
npm run fetch
```

## Configuration

### Adding/removing feeds

Edit `src/feeds.js` – each feed entry has:

| Field      | Description                             |
|------------|-----------------------------------------|
| `name`     | Display name                            |
| `url`      | RSS/Atom feed URL                       |
| `category` | Category label shown in the UI          |
| `language` | ISO 639-1 code (`en`, `pt`, `es`, …)   |

### Environment variables

| Variable | Default | Description         |
|----------|---------|---------------------|
| `PORT`   | `3000`  | HTTP port to listen |

## API

| Method | Path            | Description                        |
|--------|-----------------|------------------------------------|
| GET    | `/api/articles` | Paginated articles (query params: `category`, `language`, `search`, `limit`, `offset`) |
| GET    | `/api/categories` | List of distinct categories      |
| GET    | `/api/stats`    | Aggregate stats                    |
| POST   | `/api/fetch`    | Trigger immediate feed refresh     |

## Stack

- **Node.js** + **Express** – HTTP server
- **rss-parser** – RSS/Atom parsing
- **better-sqlite3** – local persistence
- **node-cron** – scheduled fetches
- Vanilla HTML/CSS/JS frontend (no build step)
