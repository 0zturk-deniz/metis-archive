import { weeks } from '../data/weeks'

/** Çok dilli CLIP — TR/EN metin ↔ haftalık scan aynı uzayda */
const MODEL_ID = 'jinaai/jina-clip-v1'
const IMAGE_PROCESSOR_ID = 'Xenova/clip-vit-base-patch32'
const CACHE_NAME = 'metis-clip-weeks-v3'
const DEFAULT_LIMIT = 4

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

function cacheKey(week) {
  return `${MODEL_ID}::tiles2x3::${week.id}::${week.image}`
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

  const img = await loadSourceImage(week.image)
  const views = buildViewCanvases(img)
  const embeddings = []

  for (let i = 0; i < views.length; i += 1) {
    onProgress?.({
      stage: 'images',
      message: `${week.label}: karo ${i + 1}/${views.length}`,
    })
    embeddings.push(await embedCanvas(views[i].canvas))
  }

  // Hubness: bu sayfa “her şeye” ne kadar benzer? (karmaşık doodle cezası)
  const probeVectors = await embedTexts(HUBNESS_PROBES)
  const hubness = bestSim(probeVectors, embeddings)

  await cacheSet(key, {
    embeddings: embeddings.map((e) => Array.from(e)),
    hubness,
    image: week.image,
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
          stage: 'images',
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
 * - Göreli hubness: ortalamanın üstündeki “her şeye benzer” sayfaları cezalandırır
 * @returns {Promise<{ week: object, score: number }[]>}
 */
export async function searchWeeks(query, { limit = DEFAULT_LIMIT } = {}) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const prompts = buildQueryPrompts(trimmed)
  const [queryVectors, catalog] = await Promise.all([embedTexts(prompts), getCatalog()])

  const meanHub =
    catalog.reduce((sum, item) => sum + item.hubness, 0) / Math.max(catalog.length, 1)

  const scored = catalog
    .map(({ week, embeddings, hubness }) => {
      const raw = bestSim(queryVectors, embeddings)
      // Sadece ortalamadan daha “hub” olanları cezalandır (hafif)
      const adjusted = raw - 0.65 * (hubness - meanHub)
      return { week, raw, adjusted }
    })
    .sort((a, b) => b.adjusted - a.adjusted)

  if (scored.length === 0) return []

  const topAdj = scored[0].adjusted
  const meanAdj = scored.reduce((sum, item) => sum + item.adjusted, 0) / scored.length

  // Soft filtre: en iyinin yakını + ortalamanın üstü; asla boş dönme
  let relevant = scored.filter(
    (item) => item.adjusted >= topAdj - 0.035 && item.adjusted >= meanAdj - 0.01,
  )

  if (relevant.length === 0) {
    relevant = scored.slice(0, Math.min(3, scored.length))
  }

  // Tek sonuç çok baskınsa sadece onu göster
  const second = relevant[1]
  if (second && topAdj - second.adjusted > 0.045) {
    relevant = relevant.slice(0, 1)
  }

  const span = Math.max(topAdj - (relevant[relevant.length - 1]?.adjusted ?? topAdj) + 0.02, 0.02)

  return relevant.slice(0, limit).map((item) => ({
    week: item.week,
    score: Math.max(0.15, Math.min(1, 0.35 + 0.65 * ((item.adjusted - (topAdj - span)) / span))),
  }))
}
