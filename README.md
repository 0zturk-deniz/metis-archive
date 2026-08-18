# Metis Archive

A minimal web archive for weekly agenda pages — scanned spreads filled with personal drawings and notes — that you can browse by week and search by meaning.

## Purpose

Metis Archive turns a personal paper agenda into a browsable digital collection.

- **Browse by year, then by week.** The archive opens as year cards; clicking a year reveals that year's weeks as a chronological grid. Selecting a week opens the full scan in the hero.
- **Search by meaning**, not by filenames. A locally generated visual index handles known objects, text, themes, and moods instantly; CLIP fills gaps with visual similarity.

The archive is the scans themselves. There is no separate “drawings” library: each weekly photo *is* the content.

## Stack

| Layer | Choice |
| --- | --- |
| UI | [React](https://react.dev/) 19 |
| Build | [Vite](https://vite.dev/) 8 |
| Runtime search | Static visual index + [Transformers.js](https://huggingface.co/docs/transformers.js) |
| Browser vision model | [jinaai/jina-clip-v1](https://huggingface.co/jinaai/jina-clip-v1) |
| Indexing pipeline | [Ollama](https://ollama.com/) + `qwen3-vl:4b-instruct` (local only) |
| Lint | [Oxlint](https://oxc.rs/) |

The production site needs no backend. Its reviewed visual index ships as static JSON and returns strong matches immediately. When the index has no strong match, CLIP loads in the browser and caches image embeddings in **IndexedDB**. Ollama is only a local content-preparation tool; it is never deployed.

## Features

- Full-page hero with a framed scan at its natural aspect ratio
- Theme-aware paper: scans are transparent PNGs, so light and dark mode swap a single background texture behind every hero image and thumbnail
- Two-level archive: year cards → chronological week grid for the selected year
- Filename-driven catalog: drop a file in `public/scans/`, no hand-written metadata
- Auto-generated 1800 px hero images and 500 px thumbnails; full-resolution
  sources stay available for local analysis but are excluded from production
- Hybrid search: reviewed static visual index first, client-side CLIP fallback
  - Local Ollama analysis extracts objects, animals, visible text, colors, moods, and themes
  - Strong index matches are instant and require no model download
  - Page split into a **2×3 tile grid** so small drawings (e.g. a car in one day box) are not lost in a full-spread embedding
  - **Hubness penalty** so busy/abstract pages do not rank first for every query
  - Loads lazily on first search, and caches embeddings in IndexedDB

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

`npm run scan` regenerates the catalog and thumbnails. It runs automatically before `dev` and `build`.

## Adding scans

Naming is the only metadata you write:

| File | Meaning |
| --- | --- |
| `2025.png` | Cover thumbnail for the year 2025 |
| `2025-7.png` | Week 7 of 2025 |

1. Export the scan as a **transparent PNG** — no paper background baked in, and the same aspect ratio as the other scans. The site paints the paper texture behind it.
2. Drop the files into `public/scans/`.
3. Run `npm run dev` (or `npm run scan`).

The script parses the names, computes agenda week date ranges for labels (`13 — 19 Oca`; ISO-8601 weeks), and writes `src/data/archive.js`. It renders 1800 px PNGs into `public/display/` for the hero and 500 px PNGs into `public/thumbs/` for the grid. Both keep their alpha channel. Full-resolution files remain in `public/scans/` for local Ollama analysis, while the Vite build excludes that source directory from `dist/`. Missing weeks are reported in the console and simply omitted from the grid.

Run `npm run analyze -- --all` locally to add missing scans to `src/data/visual-index.json`. Existing entries marked `"reviewed": true` are preserved. Ollama and `qwen3-vl:4b-instruct` must be installed locally for this indexing step; they are not needed by visitors.

### Paper backgrounds

The paper texture behind the drawings is a site asset, not part of each scan. Keep the full-resolution sources in `.originals/` (kept out of the build):

```
.originals/light-bg.png     # Light mode paper
.originals/dark-bg.png      # Dark mode paper
```

`npm run scan` derives four optimized JPEGs from them: `public/bg-light.jpg` and `public/bg-dark.jpg` for the hero, plus `bg-light-tile.jpg` and `bg-dark-tile.jpg` for the thumbnail grid. Those derived files are committed, so a clone builds without the originals. `App.jsx` exposes the active pair as the `--scan-bg` and `--scan-bg-tile` custom properties, so switching theme swaps the paper everywhere at once.

### Color profile

iPhone photos often ship with **HDR / PQ** profiles, which browsers render washed-out and gray. Convert scans to sRGB before publishing:

```bash
sips --matchTo "/System/Library/ColorSync/Profiles/sRGB Profile.icc" scan.png --out scan.png
```

## Project layout

```
public/scans/              # Full-resolution sources; local analysis only, excluded from dist
public/display/            # Generated 1800 px PNGs used by the hero
public/thumbs/             # Generated 500 px PNGs used by grids and CLIP
public/bg-*.jpg            # Generated light/dark paper textures
.originals/                # Full-resolution background sources, excluded from the build
scripts/build-archive.mjs  # Name parsing, display images, thumbnails, backgrounds, manifest
scripts/analyze-scans.mjs  # Local Ollama visual-analysis pipeline
src/data/archive.js        # GENERATED catalog — do not edit by hand
src/data/visual-index.json # Reviewed objects, text, moods, and themes
src/data/weeks.js          # Flat week list derived from the catalog
src/lib/semanticSearch.js  # Static-index ranking + CLIP fallback
src/App.jsx                # UI: hero, search, year + week archive
src/App.css                # Layout and design
```

## How search works (short)

1. The query is normalized and matched against weighted fields in `visual-index.json`; animals and concrete objects receive the highest weight.
2. A strong index match returns instantly.
3. For weak or missing index matches, CLIP loads lazily and compares the query with full-page and 2×3 tile embeddings.
4. Index relevance is the primary hybrid signal; CLIP refines or supplies fallback results.

## License

Private project — Metis Archive.
