#!/usr/bin/env node
/**
 * public/scans/ içindeki dosya adlarından arşiv manifesti üretir.
 *
 *   2025.png      -> 2025 yılının kapak görseli
 *   2025-7.png    -> 2025 yılının 7. haftası
 *
 * Ayrıca hero için 2400 px PNG'ler (public/display/) ve grid için küçük
 * PNG thumbnail'lar (public/thumbs/) üretir.
 * çünkü ham taramalar 2-30 MB ve bir yıl grid'i 50 tanesini birden ister.
 * Taramalar şeffaf olduğu için thumbnail de PNG kalır — kâğıt zeminini
 * site sağlar (bkz. bg-light/bg-dark), görselin içine gömülmez.
 *
 * .originals/{light,dark}-bg.png varsa hero ve kart zeminleri için
 * küçültülmüş JPEG sürümleri üretilir.
 */
import { execFile } from 'node:child_process'
import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scansDir = join(root, 'public', 'scans')
const displayDir = join(root, 'public', 'display')
const thumbsDir = join(root, 'public', 'thumbs')
const publicDir = join(root, 'public')
const originalsDir = join(root, '.originals')
const outFile = join(root, 'src', 'data', 'archive.js')

/** Kart 224 px'e kadar çıkıyor; 500 px 2x ekranlarda yeterli, alfa korunur */
const THUMB_MAX_EDGE = 500
/** Hero masaüstünde yaklaşık 1600 px; 2x ekranda ~3000 fiziksel piksele denk gelir */
const DISPLAY_MAX_EDGE = 2400
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i

/** Zeminler: hero tam genişlik, kartlar küçük karo */
const BACKGROUNDS = [
  { source: 'light-bg.png', target: 'bg-light.jpg', maxEdge: 2400 },
  { source: 'dark-bg.png', target: 'bg-dark.jpg', maxEdge: 2400 },
  { source: 'light-bg.png', target: 'bg-light-tile.jpg', maxEdge: 700 },
  { source: 'dark-bg.png', target: 'bg-dark-tile.jpg', maxEdge: 700 },
]
const BG_QUALITY = 82

const MONTHS_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
]
const MONTHS_LONG = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

/**
 * Ajanda haftası = ISO-8601.
 * 1. hafta: yılın ilk Perşembe’sini içeren Pazartesi–Pazar.
 * Örn. 2025 hafta 3 → 13 — 19 Ocak
 */
function isoWeekMonday(year, week) {
  // 4 Ocak her zaman ISO 1. haftadadır
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const day = jan4.getUTCDay() || 7 // Pazartesi=1 … Pazar=7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - (day - 1) + (week - 1) * 7)
  return monday
}

function agendaWeekRange(year, week) {
  const start = isoWeekMonday(year, week)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { start, end }
}

function formatWeek(year, week) {
  const { start, end } = agendaWeekRange(year, week)
  const d1 = start.getUTCDate()
  const d2 = end.getUTCDate()
  const m1 = start.getUTCMonth()
  const m2 = end.getUTCMonth()

  const label =
    m1 === m2 ? `${d1} — ${d2} ${MONTHS_SHORT[m2]}` : `${d1} ${MONTHS_SHORT[m1]} — ${d2} ${MONTHS_SHORT[m2]}`
  const range =
    m1 === m2
      ? `${d1} — ${d2} ${MONTHS_LONG[m2]} ${end.getUTCFullYear()}`
      : `${d1} ${MONTHS_LONG[m1]} — ${d2} ${MONTHS_LONG[m2]} ${end.getUTCFullYear()}`

  return { label, range }
}

async function newerThan(source, target) {
  try {
    const [a, b] = await Promise.all([stat(source), stat(target)])
    return a.mtimeMs > b.mtimeMs
  } catch {
    return true
  }
}

async function makeThumb(sourcePath, thumbName) {
  const target = join(thumbsDir, thumbName)
  if (!(await newerThan(sourcePath, target))) return false

  await execFileAsync('sips', [
    '-Z', String(THUMB_MAX_EDGE),
    '--setProperty', 'format', 'png',
    sourcePath,
    '--out', target,
  ])
  return true
}

async function makeDisplay(sourcePath, displayName) {
  const target = join(displayDir, displayName)
  if (!(await newerThan(sourcePath, target))) return false

  await execFileAsync('sips', [
    '-Z', String(DISPLAY_MAX_EDGE),
    '--setProperty', 'format', 'png',
    sourcePath,
    '--out', target,
  ])
  return true
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Zemin görselleri: kaynak .originals/ içinde, türevler public/ içine */
async function buildBackgrounds() {
  let built = 0
  const missing = new Set()

  for (const { source, target, maxEdge } of BACKGROUNDS) {
    const sourcePath = join(originalsDir, source)
    if (!(await exists(sourcePath))) {
      missing.add(source)
      continue
    }

    const targetPath = join(publicDir, target)
    if (!(await newerThan(sourcePath, targetPath))) continue

    await execFileAsync('sips', [
      '-Z', String(maxEdge),
      '--setProperty', 'format', 'jpeg',
      '--setProperty', 'formatOptions', String(BG_QUALITY),
      sourcePath,
      '--out', targetPath,
    ])
    built += 1
  }

  return { built, missing: [...missing] }
}

async function main() {
  await Promise.all([
    mkdir(displayDir, { recursive: true }),
    mkdir(thumbsDir, { recursive: true }),
  ])

  const entries = (await readdir(scansDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && IMAGE_EXT.test(entry.name))
    .map((entry) => entry.name)

  /** @type {Map<number, { cover: string | null, coverThumb: string | null, weeks: any[] }>} */
  const byYear = new Map()
  const skipped = []
  let builtDisplays = 0
  let builtThumbs = 0

  const ensureYear = (year) => {
    if (!byYear.has(year)) byYear.set(year, { cover: null, coverThumb: null, weeks: [] })
    return byYear.get(year)
  }

  for (const name of entries.sort()) {
    const base = name.replace(IMAGE_EXT, '')
    const coverMatch = base.match(/^(\d{4})$/)
    const weekMatch = base.match(/^(\d{4})[-_](\d{1,2})$/)
    const sourcePath = join(scansDir, name)

    if (coverMatch) {
      const year = Number(coverMatch[1])
      const displayName = `${year}.png`
      const thumbName = `${year}.png`
      if (await makeDisplay(sourcePath, displayName)) builtDisplays += 1
      if (await makeThumb(sourcePath, thumbName)) builtThumbs += 1
      const entry = ensureYear(year)
      entry.cover = `display/${displayName}`
      entry.coverThumb = `thumbs/${thumbName}`
      continue
    }

    if (weekMatch) {
      const year = Number(weekMatch[1])
      const week = Number(weekMatch[2])
      if (week < 1 || week > 53) {
        skipped.push(`${name} (geçersiz hafta)`)
        continue
      }
      const displayName = `${year}-${String(week).padStart(2, '0')}.png`
      const thumbName = `${year}-${String(week).padStart(2, '0')}.png`
      if (await makeDisplay(sourcePath, displayName)) builtDisplays += 1
      if (await makeThumb(sourcePath, thumbName)) builtThumbs += 1

      const { label, range } = formatWeek(year, week)
      ensureYear(year).weeks.push({
        id: `${year}-w${String(week).padStart(2, '0')}`,
        year,
        weekNumber: week,
        label,
        range,
        image: `display/${displayName}`,
        source: `scans/${name}`,
        thumb: `thumbs/${thumbName}`,
      })
      continue
    }

    skipped.push(name)
  }

  // Yıllar yeniden -> eskiye, haftalar kronolojik (1 -> 52)
  const years = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, entry]) => {
      const weeks = entry.weeks.sort((a, b) => a.weekNumber - b.weekNumber)
      const fallback = weeks[0]
      return {
        year,
        label: String(year),
        cover: entry.cover ?? fallback?.image ?? null,
        coverThumb: entry.coverThumb ?? fallback?.thumb ?? null,
        weeks,
      }
    })
    .filter((entry) => entry.weeks.length > 0)

  const banner = `/**
 * OTOMATİK ÜRETİLDİ — elle düzenlemeyin.
 * Kaynak: public/scans/  ·  Yeniden üret: npm run scan
 *
 * Dosya adı kuralı:  2025.png = yıl kapağı, 2025-7.png = 2025'in 7. haftası
 */`

  await writeFile(
    outFile,
    `${banner}\nexport const years = ${JSON.stringify(years, null, 2)}\n`,
    'utf8',
  )

  const backgrounds = await buildBackgrounds()

  const totalWeeks = years.reduce((sum, entry) => sum + entry.weeks.length, 0)
  console.log(`arşiv: ${years.length} yıl, ${totalWeeks} hafta -> src/data/archive.js`)
  if (builtDisplays > 0) console.log(`hero: ${builtDisplays} yeni/güncellenmiş -> public/display/`)
  if (builtThumbs > 0) console.log(`thumbnail: ${builtThumbs} yeni/güncellenmiş -> public/thumbs/`)
  if (backgrounds.built > 0) console.log(`zemin: ${backgrounds.built} yeni/güncellenmiş -> public/bg-*.jpg`)
  if (backgrounds.missing.length) {
    console.log(`zemin kaynağı yok: ${backgrounds.missing.map((n) => `.originals/${n}`).join(', ')}`)
  }
  for (const entry of years) {
    const missing = []
    for (let w = 1; w <= Math.max(...entry.weeks.map((x) => x.weekNumber)); w += 1) {
      if (!entry.weeks.some((x) => x.weekNumber === w)) missing.push(w)
    }
    const gap = missing.length ? ` · eksik hafta: ${missing.join(', ')}` : ''
    console.log(`  ${entry.year}: ${entry.weeks.length} hafta${gap}`)
  }
  if (skipped.length) console.log(`atlanan: ${skipped.join(', ')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
