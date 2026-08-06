# Metis Archive

A minimal web archive for weekly agenda pages — scanned spreads filled with personal drawings and notes — that you can browse by week and search by meaning.

## Purpose

Metis Archive turns a personal paper agenda into a browsable digital collection.

- **Browse** weekly scans in a clean SPA: the latest week opens in the hero; older weeks sit in a thumbnail slider below.
- **Search by meaning**, not by filenames or tags. Type something like `car`, `sea`, or `mutluluk` and CLIP finds agenda pages whose drawings match the idea — without writing captions for every page.

The archive is the scans themselves. There is no separate “drawings” library: each weekly photo *is* the content.

## Stack

| Layer | Choice |
| --- | --- |
| UI | [React](https://react.dev/) 19 |
| Build | [Vite](https://vite.dev/) 8 |
| Semantic search | [Transformers.js](https://huggingface.co/docs/transformers.js) (`@huggingface/transformers`) |
| Vision–language model | [jinaai/jina-clip-v1](https://huggingface.co/jinaai/jina-clip-v1) (multilingual CLIP) |
| Lint | [Oxlint](https://oxc.rs/) |

Everything runs **in the browser**. The CLIP model downloads on first visit; image embeddings are cached in **IndexedDB** so later loads are faster. No backend is required for search.

## Features

- Full-page hero with a framed scan (no bleed), natural aspect ratio, white margins
- Horizontal archive slider of weekly thumbnails
- Client-side CLIP search over weekly scans
  - Page split into a **2×3 tile grid** so small drawings (e.g. a car in one day box) are not lost in a full-spread embedding
  - **Hubness penalty** so busy/abstract pages do not rank first for every query
- Soft ranking: results stay ordered by relevance instead of dumping the whole archive

## Getting started

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Adding weekly scans

1. Put image files in `public/scans/` (PNG or JPEG).
2. Register them in `src/data/weeks.js` — **first item = newest week** (shown in the hero on load):

```js
{
  id: '2025-w01',
  weekNumber: 1,
  label: '30 Dec — 5 Jan',
  range: '30 December 2024 — 5 January 2025',
  image: '/scans/IMG_2468.png',
}
```

No tags or `searchText` fields are required. CLIP reads the pixels.

### Color profile tip

iPhone photos often ship with **HDR / PQ** profiles. Browsers can render those washed-out or gray. For the web, export or convert scans to **sRGB** before publishing.

## Project layout

```
public/scans/           # Weekly agenda photos
src/data/weeks.js       # Week catalog (id, label, image path)
src/lib/semanticSearch.js  # CLIP load, tile embed, hubness, search
src/App.jsx             # UI: hero, search, archive slider
src/App.css             # Layout and design
```

## How search works (short)

1. Warm-up embeds each scan: full page + 2×3 tiles.
2. A small set of neutral probes estimates how “generally attractive” each page is (hubness).
3. On query, text and tiles are compared with cosine similarity; hubness is subtracted relatively so specific matches rise.
4. Ranked weeks filter the archive slider; selecting one opens it in the hero.

## License

Private project — Metis Archive.
