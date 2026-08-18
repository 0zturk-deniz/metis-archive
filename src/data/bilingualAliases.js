/**
 * TR ↔ EN arama eşlemeleri.
 * İndeks çoğunlukla Türkçe; İngilizce sorgu bu tablodan genişletilir (ve tersi).
 * Anahtarlar normalize edilmiş haliyle tutulur (normalizeText ile aynı kurallar).
 */
const PAIRS = [
  // hayvanlar
  ['kedi', 'cat'],
  ['kopek', 'dog'],
  ['fare', 'mouse', 'rat'],
  ['balik', 'fish'],
  ['kus', 'bird'],
  ['pinguin', 'penguin'],
  ['penguen', 'penguin'],
  ['yilan', 'snake'],
  ['at', 'horse'],
  ['ayi', 'bear'],
  ['kurt', 'wolf'],
  ['tavsan', 'rabbit'],
  ['kelebek', 'butterfly'],
  ['ari', 'bee'],
  ['ordek', 'duck'],
  ['baykus', 'owl'],

  // nesneler / sahneler
  ['deniz', 'sea', 'ocean'],
  ['gokyuzu', 'sky'],
  ['bulut', 'cloud'],
  ['yagmur', 'rain'],
  ['firtina', 'storm'],
  ['gunbatimi', 'sunset'],
  ['ay', 'moon'],
  ['gunes', 'sun'],
  ['yildiz', 'star'],
  ['agac', 'tree'],
  ['cicek', 'flower'],
  ['orman', 'forest'],
  ['dag', 'mountain'],
  ['ada', 'island'],
  ['kayik', 'boat'],
  ['gemi', 'ship'],
  ['araba', 'car'],
  ['bisiklet', 'bike', 'bicycle'],
  ['ev', 'house', 'home'],
  ['pencere', 'window'],
  ['kapi', 'door'],
  ['koltuk', 'sofa', 'armchair'],
  ['masa', 'table'],
  ['sandalye', 'chair'],
  ['lamba', 'lamp'],
  ['caydanlik', 'teapot'],
  ['kupa', 'mug', 'cup'],
  ['kitap', 'book'],
  ['kalem', 'pen', 'pencil'],
  ['cop kutusu', 'trash can', 'bin'],
  ['cop', 'trash', 'garbage'],
  ['kule', 'tower'],
  ['tablo', 'painting', 'picture'],
  ['fotograf', 'photo', 'photograph'],
  ['ayna', 'mirror'],
  ['sise', 'bottle'],
  ['mantar', 'mushroom'],
  ['kalp', 'heart'],
  ['yuz', 'face'],
  ['goz', 'eye'],
  ['el', 'hand'],

  // insanlar
  ['kadin', 'woman'],
  ['erkek', 'man'],
  ['cocuk', 'child', 'kid'],
  ['insan', 'person', 'people', 'human'],
  ['aile', 'family'],
  ['kiz', 'girl'],
  ['figur', 'figure'],

  // duygular / temalar
  ['dusunce', 'thought'],
  ['dusunceli', 'thoughtful', 'pensive'],
  ['dokunakli', 'touching', 'emotional'],
  ['yalnizlik', 'loneliness', 'lonely'],
  ['endiseli', 'anxious', 'worried'],
  ['mutlu', 'happy'],
  ['mutluluk', 'happiness', 'joy'],
  ['uzgun', 'sad'],
  ['uzuntu', 'sadness'],
  ['ofkeli', 'angry'],
  ['korku', 'fear'],
  ['ask', 'love'],
  ['ozlem', 'longing', 'yearning'],
  ['nostalji', 'nostalgia'],
  ['yaratici', 'creative'],
  ['karanlik', 'dark'],
  ['aydinlik', 'bright', 'light'],
  ['kaotik', 'chaotic'],
  ['huzurlu', 'peaceful', 'calm'],
  ['sakin', 'calm', 'quiet'],
  ['enerjik', 'energetic'],
  ['romantik', 'romantic'],
  ['melankolik', 'melancholic', 'melancholy'],
  ['anilar', 'memories'],
  ['zaman', 'time'],
  ['ruya', 'dream'],
  ['gece', 'night'],
  ['sabah', 'morning'],
  ['yaz', 'summer'],
  ['kis', 'winter'],
  ['sonbahar', 'autumn', 'fall'],
  ['ilkbahar', 'spring'],

  // renkler
  ['mavi', 'blue'],
  ['kirmizi', 'red'],
  ['sari', 'yellow'],
  ['yesil', 'green'],
  ['mor', 'purple', 'violet'],
  ['pembe', 'pink'],
  ['turuncu', 'orange'],
  ['siyah', 'black'],
  ['beyaz', 'white'],
  ['gri', 'gray', 'grey'],
  ['kahverengi', 'brown'],
  ['bej', 'beige'],
]

function keyOf(value) {
  return String(value)
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** normalizeText ile aynı anahtar → eş anlamlılar */
export const bilingualAliasMap = (() => {
  const map = new Map()
  const add = (from, to) => {
    if (!from || !to || from === to) return
    const list = map.get(from) ?? []
    if (!list.includes(to)) list.push(to)
    map.set(from, list)
  }

  for (const group of PAIRS) {
    const keys = group.map(keyOf).filter(Boolean)
    for (const a of keys) {
      for (const b of keys) add(a, b)
    }
  }
  return map
})()

/** Sorgu tokenlerini TR/EN eş anlamlılarıyla genişletir */
export function expandSearchTokens(tokens) {
  const expanded = new Set()
  for (const token of tokens) {
    if (!token) continue
    expanded.add(token)
    for (const alias of bilingualAliasMap.get(token) ?? []) {
      expanded.add(alias)
    }
  }
  return [...expanded]
}
