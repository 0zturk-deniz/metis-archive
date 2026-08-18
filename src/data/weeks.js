import { years as archiveYears } from './archive'

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

export const years = archiveYears.map((entry) => ({
  ...entry,
  cover: entry.cover ? assetUrl(entry.cover) : null,
  coverThumb: entry.coverThumb ? assetUrl(entry.coverThumb) : null,
  weeks: entry.weeks.map((week) => ({
    ...week,
    image: assetUrl(week.image),
    thumb: assetUrl(week.thumb),
  })),
}))

/**
 * Tüm haftalar tek düz liste — yeniden eskiye.
 * Kaynak: otomatik üretilen archive.js (bkz. npm run scan)
 */
export const weeks = years.flatMap((entry) => [...entry.weeks].reverse())

export const latestWeek = weeks[0]

export function getYear(year) {
  return years.find((entry) => entry.year === year) ?? null
}

