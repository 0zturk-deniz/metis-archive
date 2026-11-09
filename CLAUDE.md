# Metis Archive

Kâğıt haftalık ajandamın taranmış sayfalarını (çizimler ve notlarla dolu) yıl → hafta olarak gezilebilen ve anlama göre aranabilen bir web arşivine dönüştüren statik site. Ayrıntılı açıklama `README.md`'de.

## Stack

React 19 + Vite 8, düz JavaScript (TypeScript yok). Lint: **Oxlint** (`.oxlintrc.json`), ESLint değil. Arama: statik `visual-index.json` + tarayıcıda Transformers.js ile `jina-clip-v1` (CLIP) yedeği, embedding'ler IndexedDB'de. Backend yok.

## Komutlar

```bash
npm run dev       # önce otomatik olarak `npm run scan` çalışır
npm run build     # önce otomatik olarak `npm run scan` çalışır
npm run scan      # scripts/build-archive.mjs: katalog, display ve thumbnail üretimi
npm run analyze -- --all   # yerel Ollama (qwen3-vl:4b-instruct) ile görsel indeks; sadece yerelde
npm run lint      # oxlint
```

## Kurallar

- **`src/data/archive.js` otomatik üretilir, elle düzenleme.** Değişiklik gerekiyorsa `scripts/build-archive.mjs`'i değiştir.
- `src/data/visual-index.json` büyük bir dosya; tamamını okuma, gerekirse `grep`/`jq` ile ilgili kayda bak. `"reviewed": true` olan kayıtlar elle kontrol edilmiştir, bunları ezme.
- Tarama adlandırma kuralı tek metadata kaynağı: `2025.png` yıl kapağı, `2025-7.png` 2025'in 7. haftası (ISO-8601 haftaları).
- Taramalar şeffaf PNG; kâğıt dokusu `--scan-bg` / `--scan-bg-tile` CSS değişkenleriyle arkaya konur. Tema değişince sadece bu dokular değişir.
- `public/scans/`, `public/display/`, `public/thumbs/`, `public/bg-*.jpg`, `.originals/` git'e girmez.
- `src/data/unpublishedYears.js` içindeki yılların görselleri production build'e girmez (`vite.config.js` içindeki `pruneDeployAssets`). Bu mantığı bozma.
- `@huggingface/transformers` `optimizeDeps`'ten hariç tutulmalı; kaldırma.
- Yorumlar ve arayüz metinleri Türkçe.

## Yayın

`vite.config.js`'te `base: '/metis-archive/'`. Build çıktısı (`dist/`) kişisel sitemin (`~/personal-website-deniz`) `public/metis-archive/` klasörüne kopyalanarak yayınlanıyor. `base` yolunu değiştirirsen orayı da bozarsın, önce sor.

## Çalışma tercihleri

Benimle Türkçe konuş. Değişiklikten sonra `npm run lint` çalıştır.
