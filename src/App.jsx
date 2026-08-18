import { useCallback, useEffect, useRef, useState } from "react";
import SiteHeader from "./components/SiteHeader";
import { content } from "./data/content";
import { latestWeek, weeks, years } from "./data/weeks";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useClipSearchEnabled } from "./hooks/useClipSearchEnabled";
import { formatWeek } from "./lib/formatWeek";
import {
  hasStrongIndexMatch,
  searchIndexWeeks,
  searchWeeks,
  warmSemanticSearch,
} from "./lib/semanticSearch";
import "./App.css";

const chronologicalWeeks = [...weeks].sort(
  (a, b) => a.year - b.year || a.weekNumber - b.weekNumber,
);

const weekOrder = new Map(
  chronologicalWeeks.map((week, position) => [week.id, position]),
);

function ArrowIcon({ direction }) {
  const path =
    direction === "previous"
      ? { line: "M62 12 H6", head: "M18 3 L6 12 L18 21" }
      : { line: "M2 12 H58", head: "M46 3 L58 12 L46 21" };

  return (
    <svg viewBox="0 0 64 24" fill="none" aria-hidden="true">
      <path
        d={path.line}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d={path.head}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function weekText(week, language) {
  return formatWeek(week.year, week.weekNumber, language);
}

/** Kendi kâğıt zeminini gömülü taşıyan haftalar — hero metni her temada siyah kalır */
const BAKED_LIGHT_WEEKS = new Set(["2026-w33"]);

function App() {
  const [darkMode, setDarkMode] = useLocalStorage("darkMode", false);
  const [language, setLanguage] = useLocalStorage("language", "en");
  const [activeId, setActiveId] = useState(latestWeek?.id ?? null);
  const [openYear, setOpenYear] = useState(null);
  const [entered, setEntered] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchError, setSearchError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  // Kayan geçiş boyunca giden tarama bir süre daha ekranda tutulur
  const [transition, setTransition] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const clipSearchEnabled = useClipSearchEnabled();
  const archiveRef = useRef(null);
  const searchInputRef = useRef(null);
  const requestId = useRef(0);
  const warmStarted = useRef(false);

  const t = content[language] ?? content.en;
  const isSearching = query.trim().length > 0;
  const isSearchLoading = isSearching && searchStatus === "loading";
  const activeWeek = weeks.find((w) => w.id === activeId) ?? latestWeek;
  const openYearEntry = years.find((entry) => entry.year === openYear) ?? null;
  const activeWeekIndex = chronologicalWeeks.findIndex(
    (week) => week.id === activeWeek?.id,
  );
  const previousWeek =
    activeWeekIndex > 0 ? chronologicalWeeks[activeWeekIndex - 1] : null;
  const nextWeek =
    activeWeekIndex >= 0 && activeWeekIndex < chronologicalWeeks.length - 1
      ? chronologicalWeeks[activeWeekIndex + 1]
      : null;
  const activeCopy = activeWeek ? weekText(activeWeek, language) : null;
  const previousCopy = previousWeek ? weekText(previousWeek, language) : null;
  const nextCopy = nextWeek ? weekText(nextWeek, language) : null;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    function onScroll() {
      setShowScrollTop(window.scrollY > window.innerHeight * 0.7);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** Komşu haftalar önden indirilir — kayma sırasında boş kare kalmasın */
  useEffect(() => {
    for (const week of [nextWeek, previousWeek]) {
      if (!week) continue;
      const image = new Image();
      image.src = week.image;
    }
  }, [nextWeek, previousWeek]);

  /** CLIP ilk aramada yüklenir — 50+ tarama için önden yüklemek çok yavaş */
  const ensureSearchReady = useCallback(() => {
    if (warmStarted.current) return;
    warmStarted.current = true;

    const copy = content[language] ?? content.en;
    setSearchStatus("loading");
    setStatusMessage(copy.search.clipLoading);
    warmSemanticSearch((info) => {
      if (!info) return;
      if (info.stage === "model") {
        setStatusMessage(copy.search.clipLoading);
      } else if (info.stage === "scans" && info.current && info.total) {
        setStatusMessage(copy.search.scansPreparing(info.current, info.total));
      } else if (
        info.stage === "tiles" &&
        info.weekLabel &&
        info.current &&
        info.total
      ) {
        setStatusMessage(
          copy.search.tilesPreparing(
            info.current,
            info.total,
          ),
        );
      } else if (info.stage === "ready") {
        setStatusMessage(copy.search.clipReady);
      }
    })
      .then(() => {
        setSearchStatus("ready");
        setStatusMessage(copy.search.clipReady);
      })
      .catch((error) => {
        console.error(error);
        warmStarted.current = false;
        setSearchStatus("error");
        setSearchError(copy.search.clipFailed);
      });
  }, [language]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return undefined;
    }

    const id = ++requestId.current;
    const indexedMatches = searchIndexWeeks(trimmed);
    setResults(indexedMatches);
    setSearchStatus("ready");
    setSearchError("");
    if (indexedMatches.length > 0) {
      setActiveId(indexedMatches[0].week.id);
    }

    // Mobilde CLIP UI'yi kilitler; yalnızca JSON indeksi kullanılır.
    if (!clipSearchEnabled || hasStrongIndexMatch(indexedMatches)) return undefined;

    const timer = setTimeout(async () => {
      try {
        setSearchStatus("loading");
        setStatusMessage(
          indexedMatches.length > 0
            ? t.search.refining
            : t.search.preparing,
        );
        ensureSearchReady();
        const matches = await searchWeeks(trimmed);
        if (requestId.current !== id) return;
        setResults(matches);
        setSearchStatus("ready");
        if (matches.length > 0) setActiveId(matches[0].week.id);
      } catch (error) {
        console.error(error);
        if (requestId.current !== id) return;
        setResults([]);
        setSearchStatus("error");
        setSearchError(t.search.failed);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [query, clipSearchEnabled, ensureSearchReady, t.search]);

  function scrollToArchive() {
    archiveRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function goToWeek(week) {
    if (!week || week.id === activeWeek?.id) return;

    const from = activeWeek;
    const direction =
      (weekOrder.get(week.id) ?? 0) >= (weekOrder.get(from?.id) ?? 0)
        ? "next"
        : "previous";

    if (from) setTransition({ week: from, direction });
    setActiveId(week.id);
  }

  function selectWeek(week) {
    goToWeek(week);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openYearArchive(year) {
    setOpenYear(year);
    requestAnimationFrame(() =>
      archiveRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    requestId.current += 1;
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const statusHint =
    searchStatus === "loading"
      ? statusMessage
      : searchStatus === "error"
        ? searchError
        : t.search.weeksCount(results.length);

  // Taramalar şeffaf: kâğıt zeminini site verir, görselin içine gömülü değil
  const bgVariant = darkMode ? "dark" : "light";
  const base = import.meta.env.BASE_URL;
  const lightScanHero = BAKED_LIGHT_WEEKS.has(activeWeek?.id);

  return (
    <div
      className={`app${entered ? " is-entered" : ""}${lightScanHero ? " app--light-scan" : ""}`}
      style={{
        "--scan-bg": `url(${base}bg-${bgVariant}.jpg)`,
        "--scan-bg-tile": `url(${base}bg-${bgVariant}-tile.jpg)`,
        "--hero-paper": `url(${base}bg-${lightScanHero ? "light" : bgVariant}.jpg)`,
      }}
    >
      <SiteHeader
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        language={language}
        setLanguage={setLanguage}
        labels={t.header}
      />

      <header className="topbar">
        <div className="topbar__week" aria-live="polite">
          <span className="topbar__date">
            {activeCopy?.range ?? t.topbar.empty}
          </span>
          {activeWeek && (
            <span className="topbar__week-number">
              {t.topbar.weekNumber(activeWeek.weekNumber)}
            </span>
          )}
        </div>
      </header>

      <section id="top" className="hero" aria-label={t.hero.selectedWeek}>
        <div className="hero__frame">
          {transition && (
            <img
              key={`leaving-${transition.week.id}`}
              className={`hero__scan hero__scan--leave-${transition.direction}`}
              src={transition.week.image}
              alt=""
              draggable={false}
              onAnimationEnd={() => setTransition(null)}
            />
          )}
          {activeWeek && (
            <img
              key={activeWeek.id}
              className={`hero__scan${transition ? ` hero__scan--enter-${transition.direction}` : ""}`}
              src={activeWeek.image}
              alt={t.hero.scanAlt(activeCopy.range)}
              draggable={false}
            />
          )}

          {previousWeek && (
            <button
              type="button"
              className="hero__nav hero__nav--previous"
              onClick={() => goToWeek(previousWeek)}
              aria-label={t.hero.previousWeek(previousCopy.range)}
              title={previousCopy.range}
            >
              <ArrowIcon direction="previous" />
            </button>
          )}

          {nextWeek && (
            <button
              type="button"
              className="hero__nav hero__nav--next"
              onClick={() => goToWeek(nextWeek)}
              aria-label={t.hero.nextWeek(nextCopy.range)}
              title={nextCopy.range}
            >
              <ArrowIcon direction="next" />
            </button>
          )}

          <nav className="hero__social" aria-label={t.hero.social}>
            <a
              className="hero__social-link"
              href="https://www.instagram.com/nedintz"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Instagram"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle
                  cx="17.2"
                  cy="6.8"
                  r="1"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </a>
            <a
              className="hero__social-link"
              href="https://www.tiktok.com/@nedintz"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="TikTok"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.76 0 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05 6.34 6.34 0 1 0 6.34 6.34V8.73a8.2 8.2 0 0 0 4.76 1.52V6.79a4.85 4.85 0 0 1-1-.1z" />
              </svg>
            </a>
          </nav>
        </div>

        <div className="hero__copy">
          <p className="hero__brand">{t.hero.brand}</p>
          <h1 className="hero__title">{t.hero.title}</h1>
          <p className="hero__lede">{t.hero.lede}</p>
          <div className="hero__actions">
            <button
              type="button"
              className="btn btn--solid"
              onClick={scrollToArchive}
            >
              {t.hero.archiveCta}
            </button>

            <form
              className={`search${searchOpen || query ? " is-open" : ""}${isSearchLoading ? " is-loading" : ""}`}
              role="search"
              onSubmit={(event) => event.preventDefault()}
            >
              <button
                type="button"
                className="search__toggle"
                onClick={() => setSearchOpen((open) => !open)}
                aria-label={searchOpen ? t.search.close : t.search.open}
                aria-expanded={searchOpen}
                aria-controls="semantic-search"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m15.5 15.5 5 5" />
                </svg>
              </button>
              <label className="search__label" htmlFor="semantic-search">
                {t.search.label}
              </label>
              <input
                ref={searchInputRef}
                id="semantic-search"
                className="search__input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.search.placeholder}
                autoComplete="off"
                spellCheck={false}
                tabIndex={searchOpen || query ? 0 : -1}
                aria-busy={isSearchLoading}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !query) setSearchOpen(false);
                }}
              />
              {isSearchLoading && (
                <span
                  className="search__spinner"
                  role="status"
                  aria-live="polite"
                >
                  <span className="search__spinner-ring" aria-hidden="true" />
                  <span className="search__label">{t.search.searching}</span>
                </span>
              )}
              {query && !isSearchLoading && (
                <button
                  type="button"
                  className="search__clear"
                  onClick={clearSearch}
                  aria-label={t.search.clear}
                >
                  ×
                </button>
              )}
            </form>
          </div>
        </div>
      </section>

      <section
        ref={archiveRef}
        id="archive"
        className="archive"
        aria-labelledby="archive-heading"
      >
        <div className="archive__bar">
          <div className="archive__intro">
            {isSearching ? (
              <>
                <h2 id="archive-heading">{t.search.heading}</h2>
                <p>
                  “{query.trim()}” ·{" "}
                  {results.length === 0 && searchStatus === "ready"
                    ? t.search.noMatch
                    : statusHint}
                </p>
              </>
            ) : openYearEntry ? (
              <>
                <h2 id="archive-heading">{openYearEntry.label}</h2>
                <p>{t.archive.yearMeta(openYearEntry.weeks.length)}</p>
              </>
            ) : (
              <>
                <h2 id="archive-heading">{t.archive.heading}</h2>
                <p>{t.archive.intro}</p>
              </>
            )}
          </div>

          {!isSearching && openYearEntry && (
            <button
              type="button"
              className="archive__back"
              onClick={() => setOpenYear(null)}
            >
              {t.archive.back}
            </button>
          )}
        </div>

        {isSearching ? (
          <ul className="grid grid--weeks">
            {results.map(({ week, score }) => {
              const copy = weekText(week, language);
              return (
                <li key={week.id}>
                  <button
                    type="button"
                    className={`card${week.id === activeWeek?.id ? " is-active" : ""}`}
                    onClick={() => {
                      setOpenYear(week.year);
                      selectWeek(week);
                    }}
                  >
                    <span className="card__frame">
                      <img
                        src={week.thumb}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    </span>
                    <span className="card__label">{copy.label}</span>
                    <span className="card__meta">
                      {t.search.matchScore(week.year, Math.round(score * 100))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : openYearEntry ? (
          <ul className="grid grid--weeks">
            {openYearEntry.weeks.map((week) => {
              const copy = weekText(week, language);
              return (
                <li key={week.id}>
                  <button
                    type="button"
                    className={`card${week.id === activeWeek?.id ? " is-active" : ""}`}
                    onClick={() => selectWeek(week)}
                  >
                    <span className="card__frame">
                      <img
                        src={week.thumb}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    </span>
                    <span className="card__label">{copy.label}</span>
                    <span className="card__meta">
                      {t.archive.weekMeta(week.weekNumber)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="grid grid--years">
            {years.map((entry) => (
              <li key={entry.year}>
                <button
                  type="button"
                  className="card card--year"
                  onClick={() => openYearArchive(entry.year)}
                >
                  <span className="card__frame card__frame--year">
                    <img
                      src={entry.coverThumb}
                      alt=""
                      loading="lazy"
                      draggable={false}
                    />
                  </span>
                  <span className="card__label card__label--year">
                    {entry.label}
                  </span>
                  <span className="card__meta">
                    {t.archive.yearWeeks(entry.weeks.length)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer
        className="footer"
        style={{ backgroundImage: `url(${base}footer.jpg)` }}
      >
        <span className="footer__brand" lang="en">
          Metis Archive
        </span>
        <span className="footer__credit">{t.footer.credit}</span>
        <span className="footer__stack" lang="en">
          React · Vite · Transformers.js · Jina CLIP · Ollama
        </span>
      </footer>

      <button
        type="button"
        className={`scroll-top${showScrollTop ? " is-visible" : ""}`}
        onClick={scrollToTop}
        aria-label={t.archive.scrollTop}
        title={t.archive.scrollTop}
      >
        <svg viewBox="0 0 24 48" fill="none" aria-hidden="true">
          <path
            d="M12 42 V6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M5 14 L12 6 L19 14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

export default App;
