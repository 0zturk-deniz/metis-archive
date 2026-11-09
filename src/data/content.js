export const content = {
  en: {
    header: {
      langToggle: "TÜRKÇE'YE GEÇ",
      dark: "DARK MODE",
      light: "LIGHT MODE",
    },
    hero: {
      brand: "Metis Archive",
      title: "Weekly agenda drawings",
      lede: "I created this archive by bringing together the daily drawings from my Metis planner. You can explore the archive chronologically or by using visual search.",
      archiveCta: "Browse archive",
      selectedWeek: "Selected week",
      previousWeek: (range) => `Previous week: ${range}`,
      nextWeek: (range) => `Next week: ${range}`,
      scanAlt: (range) => `Agenda scan for ${range}`,
      social: "Social media",
    },
    search: {
      label: "Search",
      placeholder: "sea, happiness, rain…",
      open: "Open search",
      close: "Close search",
      clear: "Clear",
      searching: "Searching",
      heading: "Search",
      noMatch: "no matching weeks",
      clipLoading: "Loading CLIP model…",
      scansPreparing: (current, total) =>
        `Preparing scans · ${current}/${total}`,
      tilesPreparing: (current, total) =>
        `Preparing scan details · tile ${current}/${total}`,
      clipReady: "CLIP ready",
      clipFailed: "Could not load CLIP",
      refining: "Refining results with visual similarity…",
      preparing: "Preparing visual search…",
      failed: "Search failed",
      weeksCount: (count) => `${count} weeks`,
      matchScore: (year, percent) => `${year} · ${percent}% match`,
    },
    topbar: {
      empty: "Archive empty",
      weekNumber: (n) => `Week ${n}`,
    },
    archive: {
      heading: "Archive",
      intro: "Pick a year to open its weeks.",
      yearMeta: (count) => `${count} weeks · chronological`,
      yearWeeks: (count) => `${count} weeks`,
      back: "← All years",
      weekMeta: (n) => `Week ${n}`,
      scrollTop: "Back to top",
      yearNotes: {
        "2019": {
          title: "A note on 2019",
          body: "My drawing on Metis planners traces back to the daily ferry trips I took in 2019, shuttling between my beloved home in Kadıköy and my equally beloved job in Karaköy. Since 2019, the things I tried so hard to hold onto back then—my home, my job, and my spouse—all parted ways with me one by one. Sadly, the 2019 Metis Planner took its share of these departures and was taken away from me. Because I no longer have the planner physically in hand, I compiled the 2019 archive from the daily photos I snapped that year and the Instagram stories I posted at the time; that’s why some of them still carry story captions.",
        },
      },
    },
    footer: {
      credit:
        "©2026 · Built by Deniz Öztürk using Cursor.",
    },
  },
  tr: {
    header: {
      langToggle: "SWITCH TO ENGLISH",
      dark: "KARANLIK MOD",
      light: "AYDINLIK MOD",
    },
    hero: {
      brand: "Metis Archive",
      title: "Haftalık ajanda çizimleri",
      lede: "Metin Ajandama yaptığım günlük çizimleri bir araya getirerek bu arşivi oluşturdum. Kronolojik olarak veya görsel arama yaparak arşivi inceleyebilirsiniz.",
      archiveCta: "Arşive bak",
      selectedWeek: "Seçili hafta",
      previousWeek: (range) => `Önceki hafta: ${range}`,
      nextWeek: (range) => `Sonraki hafta: ${range}`,
      scanAlt: (range) => `${range} ajanda taraması`,
      social: "Sosyal medya",
    },
    search: {
      label: "Ara",
      placeholder: "deniz, mutluluk, yağmur…",
      open: "Aramayı aç",
      close: "Aramayı kapat",
      clear: "Temizle",
      searching: "Aranıyor",
      heading: "Arama",
      noMatch: "eşleşen hafta yok",
      clipLoading: "CLIP modeli yükleniyor…",
      scansPreparing: (current, total) =>
        `Taramalar hazırlanıyor · ${current}/${total}`,
      tilesPreparing: (current, total) =>
        `Tarama ayrıntıları hazırlanıyor · karo ${current}/${total}`,
      clipReady: "CLIP hazır",
      clipFailed: "CLIP yüklenemedi",
      refining: "Görsel benzerlikle sonuçlar iyileştiriliyor…",
      preparing: "Görsel arama hazırlanıyor…",
      failed: "Arama başarısız",
      weeksCount: (count) => `${count} hafta`,
      matchScore: (year, percent) => `${year} · ${percent}% eşleşme`,
    },
    topbar: {
      empty: "Arşiv boş",
      weekNumber: (n) => `Hafta ${n}`,
    },
    archive: {
      heading: "Arşiv",
      intro: "Bir yıl seç, o yılın haftaları açılsın.",
      yearMeta: (count) => `${count} hafta · kronolojik`,
      yearWeeks: (count) => `${count} hafta`,
      back: "← Tüm yıllar",
      weekMeta: (n) => `Hafta ${n}`,
      scrollTop: "Yukarı çık",
      yearNotes: {
        "2019": {
          title: "2019 yılı için özel not",
          body: "Metis ajandalara çizim yapmaya başlamam, 2019 yılında Kadıköy’deki çok sevdiğim evim ile Karaköy’deki çok sevdiğim işim arasında her gün mekik dokuduğum vapur yolculuklarına dayanır. 2019’dan bu yana o yıllarda sıkı sıkı sarılmaya çalıştığım evim, işim, eşimle yollarımız bir bir ayrıldı. Bu ayrılışlardan ne yazık ki Metis Ajanda 2019 da nasibini aldı ve benden alıkonuldu. Ajanda fiziksel olarak elimde olmadığı için, 2019 yılı arşivini 2019 yılında çektiğim günlük fotoğraflardan ve o dönem paylaştığım Instagram hikayelerimden derledim; o sebeple bazılarında hikaye notları da var.",
        },
      },
    },
    footer: {
      credit:
        "©2026 · Cursor kullanılarak Deniz Öztürk tarafından geliştirilmiştir.",
    },
  },
};
