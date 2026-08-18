/**
 * Ajanda haftası = ISO-8601 (build-archive.mjs ile aynı kural).
 * Dil tercihine göre kısa/uzun tarih etiketleri üretir.
 */

const MONTHS = {
  tr: {
    short: [
      "Oca",
      "Şub",
      "Mar",
      "Nis",
      "May",
      "Haz",
      "Tem",
      "Ağu",
      "Eyl",
      "Eki",
      "Kas",
      "Ara",
    ],
    long: [
      "Ocak",
      "Şubat",
      "Mart",
      "Nisan",
      "Mayıs",
      "Haziran",
      "Temmuz",
      "Ağustos",
      "Eylül",
      "Ekim",
      "Kasım",
      "Aralık",
    ],
  },
  en: {
    short: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    long: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
  },
};

function isoWeekMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (day - 1) + (week - 1) * 7);
  return monday;
}

export function formatWeek(year, weekNumber, language = "tr") {
  const months = MONTHS[language] ?? MONTHS.tr;
  const start = isoWeekMonday(year, weekNumber);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  const d1 = start.getUTCDate();
  const d2 = end.getUTCDate();
  const m1 = start.getUTCMonth();
  const m2 = end.getUTCMonth();

  const label =
    m1 === m2
      ? `${d1} — ${d2} ${months.short[m2]}`
      : `${d1} ${months.short[m1]} — ${d2} ${months.short[m2]}`;

  const range =
    m1 === m2
      ? `${d1} — ${d2} ${months.long[m2]} ${end.getUTCFullYear()}`
      : `${d1} ${months.long[m1]} — ${d2} ${months.long[m2]} ${end.getUTCFullYear()}`;

  return { label, range };
}
