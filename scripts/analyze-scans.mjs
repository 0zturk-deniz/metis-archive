#!/usr/bin/env node
/**
 * Ajanda taramalarını ücretsiz yerel Ollama vision modeliyle analiz eder.
 *
 * Örnek:
 *   npm run analyze -- --weeks 2025-3,2025-15,2025-27
 *   npm run analyze -- --all
 *
 * Sonuçlar src/data/visual-index.json içinde birikir; daha önce analiz edilmiş
 * haftalar --force verilmedikçe tekrar çalıştırılmaz.
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const archiveFile = join(root, 'src', 'data', 'archive.js')
const outputFile = join(root, 'src', 'data', 'visual-index.json')
const MODEL = process.env.OLLAMA_VISION_MODEL ?? 'qwen3-vl:4b-instruct'
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'

const shortStringArray = {
  type: 'array',
  maxItems: 8,
  items: { type: 'string', maxLength: 160 },
}
const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', maxLength: 320 },
    objects: shortStringArray,
    animals: shortStringArray,
    people: shortStringArray,
    visibleText: shortStringArray,
    colors: shortStringArray,
    visualStyle: shortStringArray,
    moods: shortStringArray,
    themes: shortStringArray,
    searchTerms: shortStringArray,
    uncertainty: shortStringArray,
  },
  required: [
    'summary',
    'objects',
    'animals',
    'people',
    'visibleText',
    'colors',
    'visualStyle',
    'moods',
    'themes',
    'searchTerms',
    'uncertainty',
  ],
}

const prompt = `Bu görsel, el çizimleri ve el yazıları içeren haftalık bir ajanda taramasıdır.
Arama indeksi için yalnızca bu sayfayı diğer haftalardan ayıran bulguları içeren kısa bir JSON üret.

Kurallar:
- Görselin tamamını ve kenarlarını tara; küçük nesne, hayvan, insan, yüz, manzara ve sembolleri not et.
- animals alanına yalnızca açıkça gördüğün hayvanı, people alanına yalnızca açıkça gördüğün insanı yaz. Emin değilsen uncertainty alanına taşı.
- objects alanında "çizim", "kalem çizimi", "yazı", "sayfa" gibi genel ifadeler kullanma; kedi, araba, ağaç, deniz, çöp kutusu gibi somut içeriği yaz.
- visibleText alanına yalnızca anlamlı el yazılarını, alıntıları, kitap/yazar adlarını ve dikkat çekici basılı ifadeleri ekle.
- Ay, gün, tarih, sayfa numarası ve Pazartesi/Monday gibi standart ajanda metinlerini visibleText veya searchTerms alanına ekleme.
- moods ve themes alanlarını çizim, renk, kompozisyon ve anlamlı metne dayanarak seç; "dikkatli" gibi belirsiz sıfatlardan kaçın.
- searchTerms iki dilli olsun: her önemli Türkçe terimin yanına İngilizce eş anlamlısını da ekle (ör. kedi + cat, deniz + sea, yalnızlık + loneliness).
- searchTerms yalnızca bu haftaya özgü, görselde gerçekten desteklenen nesne, hayvan, duygu, tema ve eş anlamlılardan oluşsun.
- searchTerms'e ajanda, takvim, doodle, el yazısı, kalem, çizim, sayfa gibi bütün haftalarda bulunabilecek genel kelimeleri ekleme.
- Görünen yazıları uydurma; okuyamadığın metni uncertainty alanına ekle.
- Diziler kısa olsun (en fazla 8 madde).
- Aynı ifadeyi tekrar etme; Türkçe ve İngilizce eş anlamlı çiftleri serbest.
- Ana alanları (objects, animals, moods, themes) Türkçe yaz; İngilizce karşılıklar searchTerms'te olsun.
- SADECE geçerli JSON döndür.

Şema:
{"summary":"1-2 cümle","objects":[],"animals":[],"people":[],"visibleText":[],"colors":[],"visualStyle":[],"moods":[],"themes":[],"searchTerms":[],"uncertainty":[]}`

function parseArgs(argv) {
  const options = { all: false, force: false, weeks: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--all') options.all = true
    else if (arg === '--force') options.force = true
    else if (arg === '--weeks') options.weeks = (argv[++i] ?? '').split(',').filter(Boolean)
    else if (arg.startsWith('--weeks=')) options.weeks = arg.slice(8).split(',').filter(Boolean)
  }
  return options
}

async function loadWeeks() {
  const source = await readFile(archiveFile, 'utf8')
  const json = source.match(/export const years = ([\s\S]+)\n$/)?.[1]
  if (!json) throw new Error(`Arşiv okunamadı: ${archiveFile}`)
  return JSON.parse(json).flatMap((year) => year.weeks)
}

async function loadIndex() {
  try {
    return JSON.parse(await readFile(outputFile, 'utf8'))
  } catch {
    return { model: MODEL, generatedAt: null, entries: {} }
  }
}

async function saveIndex(index) {
  const tempFile = `${outputFile}.tmp`
  await writeFile(tempFile, `${JSON.stringify(index, null, 2)}\n`)
  await rename(tempFile, outputFile)
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLocaleLowerCase('tr-TR')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const GENERIC_SEARCH_TERM =
  /^(ajanda|takvim|calendar|planner|doodle|el yazısı|handwriting|kalem|pencil|çizim|drawing|sayfa|page|not|notes?|el çizimli ajanda|el yazısı ajanda|doodle ajanda|hand.?drawn journal|personal journal page|art journaling|doodle art|journaling with text|creative journaling)$/i
const GENERIC_OBJECT =
  /^(çizim|çizimler|kalem|kalem çizimi|kalem çizimleri|pastel çizim|renkli pastel çizimler|el yazısı|yazı|yazılar|sayfa|sayfalar|ajanda|takvim|doodle)$/i
const GENERIC_MOOD = /^(dikkatli|dijital olmayan|düşünceye açık)$/i
const ROUTINE_TEXT =
  /^(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık|january|february|march|april|may|june|july|august|september|october|november|december)(\s+.*)?$|^(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(\s*\/\s*.*)?$/i

function normalizeAnalysis(raw) {
  return {
    summary: String(raw.summary ?? '').trim(),
    objects: asStringArray(raw.objects).filter((item) => !GENERIC_OBJECT.test(item)),
    animals: asStringArray(raw.animals),
    people: asStringArray(raw.people),
    visibleText: asStringArray(raw.visibleText).filter((item) => !ROUTINE_TEXT.test(item)),
    colors: asStringArray(raw.colors),
    visualStyle: asStringArray(raw.visualStyle),
    moods: asStringArray(raw.moods).filter((item) => !GENERIC_MOOD.test(item)),
    themes: asStringArray(raw.themes),
    searchTerms: asStringArray(raw.searchTerms).filter(
      (item) => !GENERIC_SEARCH_TERM.test(item) && !ROUTINE_TEXT.test(item),
    ),
    uncertainty: asStringArray(raw.uncertainty),
  }
}

async function prepareImage(week) {
  // Ollama her zaman tam çözünürlüklü kaynağı görür; site ise küçültülmüş
  // `image` sürümünü kullanır.
  const source = join(root, 'public', week.source ?? week.image)
  const target = join(tmpdir(), `metis-analysis-${week.id}-${Date.now()}.jpg`)
  await execFileAsync('sips', [
    '-Z',
    '1600',
    '--setProperty',
    'format',
    'jpeg',
    '--setProperty',
    'formatOptions',
    '82',
    source,
    '--out',
    target,
  ])
  return target
}

function extractJson(text) {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`JSON bulunamadı: ${cleaned.slice(0, 180)}`)
    }
    return JSON.parse(cleaned.slice(start, end + 1))
  }
}

async function analyzeOnce(imagePath, { numPredict = 1800 } = {}) {
  const image = await readFile(imagePath, 'base64')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300_000)

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: ANALYSIS_SCHEMA,
        keep_alive: '10m',
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [image],
          },
        ],
        options: {
          temperature: 0.1,
          num_ctx: 4096,
          num_predict: numPredict,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama ${response.status}: ${await response.text()}`)
    }

    const payload = await response.json()
    const content = payload?.message?.content || payload?.message?.thinking
    if (!content) throw new Error('Model boş yanıt döndü')
    if (payload.done_reason === 'length') {
      throw new Error(`JSON kesildi: ${content.slice(0, 180)}`)
    }
    return normalizeAnalysis(extractJson(content))
  } finally {
    clearTimeout(timeout)
  }
}

async function analyze(imagePath) {
  try {
    return await analyzeOnce(imagePath, { numPredict: 1800 })
  } catch (error) {
    console.warn(`  yeniden denenecek: ${error.message}`)
    return analyzeOnce(imagePath, { numPredict: 2600 })
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const weeks = await loadWeeks()
  const index = await loadIndex()
  for (const [id, entry] of Object.entries(index.entries)) {
    if (entry.reviewed !== true) {
      index.entries[id] = { ...entry, ...normalizeAnalysis(entry), reviewed: false }
    }
  }
  const requested = new Set(options.weeks.map((id) => id.replace(/-(\d)$/, '-0$1')))

  let selected
  if (options.all) {
    selected = weeks
  } else if (requested.size > 0) {
    selected = weeks.filter(
      (week) =>
        requested.has(week.id) ||
        requested.has(`${week.year}-${String(week.weekNumber).padStart(2, '0')}`),
    )
  } else {
    // Hızlı kalite testi: yıl içine eşit yayılmış beş sayfa.
    const positions = [0, 0.25, 0.5, 0.75, 1]
    selected = positions.map((position) => weeks[Math.round((weeks.length - 1) * position)])
  }

  selected = [...new Map(selected.filter(Boolean).map((week) => [week.id, week])).values()]
  if (selected.length === 0) throw new Error('İstenen haftalar bulunamadı.')

  await mkdir(dirname(outputFile), { recursive: true })
  console.log(`model: ${MODEL} · ${selected.length} hafta`)

  for (let i = 0; i < selected.length; i += 1) {
    const week = selected[i]
    const existing = index.entries[week.id]
    if (existing && (existing.reviewed === true || !options.force)) {
      const reason = existing.reviewed === true ? 'elle onaylı, korunuyor' : 'zaten hazır'
      console.log(`[${i + 1}/${selected.length}] ${week.id} ${reason}`)
      continue
    }

    console.log(`[${i + 1}/${selected.length}] ${week.id} analiz ediliyor…`)
    const started = Date.now()
    const imagePath = await prepareImage(week)
    try {
      const analysis = await analyze(imagePath)
      index.entries[week.id] = {
        weekId: week.id,
        image: week.source ?? week.image,
        thumb: week.thumb,
        analyzedAt: new Date().toISOString(),
        reviewed: false,
        ...analysis,
      }
      index.model = MODEL
      index.generatedAt = new Date().toISOString()
      await saveIndex(index)
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      console.log(
        `  ${seconds}s · nesne: ${analysis.objects.slice(0, 6).join(', ') || '—'} · duygu: ${analysis.moods.slice(0, 4).join(', ') || '—'}`,
      )
    } finally {
      await rm(imagePath, { force: true })
    }
  }

  console.log(`tamam: ${basename(outputFile)}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
