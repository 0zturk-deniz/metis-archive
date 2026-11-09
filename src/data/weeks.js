import { years as archiveYears } from './archive'
import { unpublishedYears } from './unpublishedYears'

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

const sourceYears = import.meta.env.PROD
  ? archiveYears.filter((entry) => !unpublishedYears.includes(entry.year))
  : archiveYears

export const years = sourceYears.map((entry) => ({
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

