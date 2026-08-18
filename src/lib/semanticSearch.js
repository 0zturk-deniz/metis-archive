import { weeks } from '../data/weeks'
import visualIndex from '../data/visual-index.json'
import { expandSearchTokens } from '../data/bilingualAliases'

/** Çok dilli CLIP — TR/EN metin ↔ haftalık scan aynı uzayda */
const MODEL_ID = 'jinaai/jina-clip-v1'
const IMAGE_PROCESSOR_ID = 'Xenova/clip-vit-base-patch32'
const CACHE_NAME = 'metis-clip-weeks-v4'
/** Ajanda sketch’lerinde skorlar dar aralıkta; top-k ile çeşitlilik korunur */
const DEFAULT_LIMIT = 12
/** Hubness sadece hafif kırıcı — yüksek değer hep aynı “temiz” sayfaları öne çıkarıyordu */
const HUBNESS_WEIGHT = 0.18
/** En iyi skorun bu kadar altındakiler elenir (ham cosine) */
const RAW_GAP = 0.055
const MIN_RESULTS = 6
const INDEX_LIMIT = 12
const STRONG_INDEX_SCORE = 0.72
/** Kök eşleşmesi için asgari uzunluk — daha kısası hece gürültüsü üretiyor */
const STEM_MIN_LENGTH = 5

const INDEX_FIELDS = [
  ['animals', 1],
  ['objects', 1],
  ['people', 0.95],
  ['searchTerms', 0.95],
  ['moods', 0.88],
  ['themes', 0.88],
  ['visibleText', 0.82],
  ['colors', 0.72],
  ['visualStyle', 0.68],
  ['summary', 0.62],
]

const weekById = new Map(weeks.map((week) => [week.id, week]))

function normalizeText(value) {
  return String(value)
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function asTextList(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function textMatchScore(value, normalizedQuery, queryTokens) {
  const text = normalizeText(value)
  if (!text) return 0
  if (text === normalizedQuery) return 1

  const padded = ` ${text} `
  if (padded.includes(` ${normalizedQuery} `)) return 0.96
  if (normalizedQuery.length >= 4 && text.includes(normalizedQuery)) return 0.88

  const textTokens = [...new Set(text.split(' '))]
  const matched = queryTokens.filter(
    (token) =>
      textTokens.includes(token) ||
      // Yalnızca çekim eki farkı: "mantar" ↔ "mantarlar".
      // Kısa parçalara izin verilirse "akla-ma" gibi hece kırıntıları "mantar"a eşleşiyor.
      (token.length >= STEM_MIN_LENGTH &&
        textTokens.some(
          (candidate) =>
            candidate.length >= STEM_MIN_LENGTH &&
            (candidate.startsWith(token) || token.startsWith(candidate)),
        )),
  ).length

  if (matched === 0) return 0
  const coverage = matched / queryTokens.length
  return coverage === 1 ? 0.82 : 0.58 * coverage
}

function scoreIndexEntry(entry, query) {
  const normalizedQuery = normalizeText(query)
  const queryTokens = normalizedQuery.split(' ').filter((token) => token.length > 1)
  if (!normalizedQuery || queryTokens.length === 0) return null

  // "cat" → kedi, "mushroom" → mantar — indeks TR ağırlıklı olduğu için sorguyu genişlet
  const expandedTokens = expandSearchTokens(queryTokens)
  const queryVariants = [
    ...new Set([
      normalizedQuery,
      ...expandedTokens.filter((token) => token !== normalizedQuery),
    ]),
  ]

  let best = 0
  let corroboration = 0
  const matchedFields = []

  for (const [field, weight] of INDEX_FIELDS) {
    const fieldScore = Math.max(
      0,
      ...asTextList(entry[field]).flatMap((value) =>
        queryVariants.map((variant) =>
          textMatchScore(
            value,
            variant,
            variant.includes(' ')
              ? variant.split(' ').filter((token) => token.length > 1)
              : expandedTokens,
          ),
        ),
      ),
    )
    if (fieldScore <= 0) continue

    matchedFields.push(field)
    corroboration += 1
    best = Math.max(best, fieldScore * weight)
  }

  if (best === 0) return null
  return {
    score: Math.min(1, best + Math.min(corroboration - 1, 3) * 0.035),
    matchedFields,
  }
}

/**
 * Ollama'nın önceden ürettiği statik JSON indeksinde anında arama.
 * Canlı sitede model veya sunucu gerektirmez.
 */
export function searchIndexWeeks(query, { limit = INDEX_LIMIT } = {}) {
  return Object.values(visualIndex.entries)
    .map((entry) => {
      const match = scoreIndexEntry(entry, query)
      const week = weekById.get(entry.weekId)
      return match && week ? { week, score: match.score, source: 'index' } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Yoğun/karmaşık sayfaların her sorguda öne çıkmasını ölçmek için nötr probe’lar */
const HUBNESS_PROBES = [
  'a notebook page',
  'abstract scribbles',
  'colorful doodle',
  'handwritten text',
  'random sketch lines',
  'ajanda sayfası',
  'karışık çizgiler',
  'something',
]

const TILE_COLS = 2
const TILE_ROWS = 3

let modelsPromise = null
let catalogPromise = null
let probePromise = null

function cosineSimilarity(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function normalize(vec) {
  const out = vec instanceof Float32Array ? Float32Array.from(vec) : Float32Array.from(vec)
  let norm = 0
  for (let i = 0; i < out.length; i += 1) norm += out[i] * out[i]
  norm = Math.sqrt(norm)
  if (norm === 0) return out
  for (let i = 0; i < out.length; i += 1) out[i] /= norm
  return out
}

function tensorToVectors(tensor) {
  const data = tensor.data
  const dims = tensor.dims
  if (dims.length === 1) return [normalize(data)]
  const [rows, dim] = dims
  const vectors = []
  for (let i = 0; i < rows; i += 1) {
    vectors.push(normalize(data.slice(i * dim, (i + 1) * dim)))
  }
  return vectors
}

async function openCache() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('embeddings')) {
        db.createObjectStore('embeddings')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function cacheGet(key) {
  try {
    const db = await openCache()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('embeddings', 'readonly')
      const req = tx.objectStore('embeddings').get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function cacheSet(key, value) {
  try {
    const db = await openCache()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('embeddings', 'readwrite')
      tx.objectStore('embeddings').put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // cache optional
  }
}

async function loadSourceImage(url) {
  const abs = new URL(url, window.location.href).href
  const img = new Image()
  img.decoding = 'async'
  img.src = abs
  await img.decode()
  return img
}

function canvasFromRegion(img, sx, sy, sw, sh, outSize) {
  const canvas = document.createElement('canvas')
  canvas.width = outSize
  canvas.height = outSize
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#F5F2EA'
  ctx.fillRect(0, 0, outSize, outSize)

  const scale = Math.min(outSize / sw, outSize / sh)
  const w = sw * scale
  const h = sh * scale
  ctx.drawImage(img, sx, sy, sw, sh, (outSize - w) / 2, (outSize - h) / 2, w, h)
  return canvas
}

/** Tam sayfa + 2×3 karo — küçük çizimler (araba vb.) kaybolmasın diye */
function buildViewCanvases(img) {
  const W = img.naturalWidth
  const H = img.naturalHeight
  const views = [{ id: 'full', canvas: canvasFromRegion(img, 0, 0, W, H, 384) }]

  for (let row = 0; row < TILE_ROWS; row += 1) {
    for (let col = 0; col < TILE_COLS; col += 1) {
      const sx = (col * W) / TILE_COLS
      const sy = (row * H) / TILE_ROWS
      const sw = W / TILE_COLS
      const sh = H / TILE_ROWS
      views.push({
        id: `r${row}c${col}`,
        canvas: canvasFromRegion(img, sx, sy, sw, sh, 256),
      })
    }
  }

  return views
}

async function getModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const {
        AutoTokenizer,
        AutoProcessor,
        CLIPTextModelWithProjection,
        CLIPVisionModelWithProjection,
        env,
      } = await import('@huggingface/transformers')

      env.allowLocalModels = false

      const [tokenizer, textModel, processor, visionModel] = await Promise.all([
        AutoTokenizer.from_pretrained(MODEL_ID),
        CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
        AutoProcessor.from_pretrained(IMAGE_PROCESSOR_ID),
        CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
      ])

      return { tokenizer, textModel, processor, visionModel }
    })().catch((error) => {
      modelsPromise = null
      throw error
    })
  }
  return modelsPromise
}

function buildQueryPrompts(query) {
  const q = query.trim()
  return [
    q,
    `a hand-drawn ${q}`,
    `drawing of a ${q}`,
    `sketch of a ${q}`,
    `${q} çizimi`,
    `ajandada ${q}`,
  ]
}

async function embedTexts(texts) {
  const { tokenizer, textModel } = await getModels()
  const inputs = tokenizer(texts, { padding: true, truncation: true })
  const { text_embeds } = await textModel(inputs)
  return tensorToVectors(text_embeds)
}

async function embedCanvas(canvas) {
  const { RawImage } = await import('@huggingface/transformers')
  const { processor, visionModel } = await getModels()
  const image = RawImage.fromCanvas(canvas)
  const inputs = await processor(image)
  const { image_embeds } = await visionModel(inputs)
  return tensorToVectors(image_embeds)[0]
}

/** Karolar 256-384 px'e indiği için thumbnail yeterli; ham PNG'i decode etmek gereksiz yavaş */
function sourceFor(week) {
  return week.thumb ?? week.image
}

function cacheKey(week) {
  return `${MODEL_ID}::tiles2x3::${week.id}::${sourceFor(week)}`
}

function bestSim(queryVectors, embeddings) {
  let best = -1
  for (const qVec of queryVectors) {
    for (const emb of embeddings) {
      const score = cosineSimilarity(qVec, emb)
      if (score > best) best = score
    }
  }
  return best
}

async function embedWeek(week, onProgress) {
  const key = cacheKey(week)
  const cached = await cacheGet(key)
  if (cached?.embeddings?.length && typeof cached.hubness === 'number') {
    return {
      embeddings: cached.embeddings.map((e) => Float32Array.from(e)),
      hubness: cached.hubness,
    }
  }

  const img = await loadSourceImage(sourceFor(week))
  const views = buildViewCanvases(img)
  const embeddings = []

  for (let i = 0; i < views.length; i += 1) {
    onProgress?.({
      stage: 'tiles',
      message: `${week.label}: karo ${i + 1}/${views.length}`,
      weekLabel: week.label,
      current: i + 1,
      total: views.length,
    })
    embeddings.push(await embedCanvas(views[i].canvas))
  }

  // Hubness: bu sayfa “her şeye” ne kadar benzer? (karmaşık doodle cezası)
  if (!probePromise) probePromise = embedTexts(HUBNESS_PROBES)
  const hubness = bestSim(await probePromise, embeddings)

  await cacheSet(key, {
    embeddings: embeddings.map((e) => Array.from(e)),
    hubness,
    image: sourceFor(week),
  })

  return { embeddings, hubness }
}

/**
 * @param {(info: { stage: string, message: string, current?: number, total?: number }) => void} [onProgress]
 */
async function getCatalog(onProgress) {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      onProgress?.({ stage: 'model', message: 'CLIP modeli yükleniyor…' })
      await getModels()

      const total = weeks.length
      const items = []

      for (let i = 0; i < weeks.length; i += 1) {
        const week = weeks[i]
        onProgress?.({
          stage: 'scans',
          message: `Scan’ler vektörleniyor… (${i + 1}/${total})`,
          current: i + 1,
          total,
        })
        const { embeddings, hubness } = await embedWeek(week, onProgress)
        items.push({ week, embeddings, hubness })
      }

      onProgress?.({ stage: 'ready', message: 'CLIP hazır' })
      return items
    })().catch((error) => {
      catalogPromise = null
      throw error
    })
  }
  return catalogPromise
}

/** CLIP model + haftalık scan embedding’leri hazırlar */
export async function warmSemanticSearch(onProgress) {
  await getCatalog(onProgress)
}

/**
 * Metin → haftalık scan CLIP araması.
 * - Karo (tile) max: küçük çizimleri bulur
 * - Hafif hubness: karmaşık sayfaları biraz cezalandırır, sıralamayı ele geçirmez
 * - Top-k + skor bandı: her sorguda aynı 4 “favori” sayfayı dayatmaz
 * @returns {Promise<{ week: object, score: number }[]>}
 */
async function searchClipWeeks(query, { limit = DEFAULT_LIMIT } = {}) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const prompts = buildQueryPrompts(trimmed)
  const [queryVectors, catalog] = await Promise.all([embedTexts(prompts), getCatalog()])

  const meanHub =
    catalog.reduce((sum, item) => sum + item.hubness, 0) / Math.max(catalog.length, 1)

  const scored = catalog
    .map(({ week, embeddings, hubness }) => {
      const raw = bestSim(queryVectors, embeddings)
      const adjusted = raw - HUBNESS_WEIGHT * (hubness - meanHub)
      return { week, raw, adjusted }
    })
    .sort((a, b) => {
      // Önce ham benzerlik; hubness yalnızca yakın skorları ayırır
      if (Math.abs(b.raw - a.raw) > 0.012) return b.raw - a.raw
      return b.adjusted - a.adjusted
    })

  if (scored.length === 0) return []

  const topRaw = scored[0].raw
  const band = scored.filter((item) => item.raw >= topRaw - RAW_GAP)
  const relevant =
    band.length >= MIN_RESULTS ? band : scored.slice(0, Math.min(MIN_RESULTS, scored.length))

  return relevant.slice(0, limit).map((item) => ({
    week: item.week,
    // Yüzde: bu sorgudaki en iyi ham skora göre (1. hep ~%100, diğerleri orantılı)
    // Mutlak CLIP skoru doodle’da düşük olduğu için “güven” iddiası yok
    score: topRaw > 0 ? Math.max(0.05, Math.min(1, item.raw / topRaw)) : 0,
    source: 'clip',
  }))
}

/**
 * Hibrit sıralama: hazır vision indeksi ana sinyal, CLIP destek sinyali.
 * Bu fonksiyon yalnızca indeks tek başına yeterli olmadığında çağrılmalı.
 */
export async function searchWeeks(query, { limit = DEFAULT_LIMIT } = {}) {
  const [indexResults, clipResults] = await Promise.all([
    Promise.resolve(searchIndexWeeks(query, { limit: INDEX_LIMIT })),
    searchClipWeeks(query, { limit: INDEX_LIMIT }),
  ])

  const combined = new Map()
  for (const result of clipResults) {
    combined.set(result.week.id, {
      week: result.week,
      indexScore: 0,
      clipScore: result.score,
    })
  }
  for (const result of indexResults) {
    const current = combined.get(result.week.id) ?? {
      week: result.week,
      indexScore: 0,
      clipScore: 0,
    }
    current.indexScore = result.score
    combined.set(result.week.id, current)
  }

  return [...combined.values()]
    .map(({ week, indexScore, clipScore }) => {
      const hasIndexMatch = indexScore > 0
      return {
        week,
        score: hasIndexMatch
          ? Math.min(1, 0.82 * indexScore + 0.18 * clipScore)
          : 0.55 * clipScore,
        source: hasIndexMatch ? 'hybrid' : 'clip',
      }
    })
    .sort((a, b) => b.score - a.score)
    .filter((item, index) => item.score >= 0.28 || index < MIN_RESULTS)
    .slice(0, limit)
}

export function hasStrongIndexMatch(results) {
  return (results[0]?.score ?? 0) >= STRONG_INDEX_SCORE
}
