import { useEffect, useRef, useState } from 'react'
import { latestWeek, weeks } from './data/weeks'
import { searchWeeks, warmSemanticSearch } from './lib/semanticSearch'
import './App.css'

function App() {
  const [activeId, setActiveId] = useState(latestWeek.id)
  const [entered, setEntered] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchStatus, setSearchStatus] = useState('idle')
  const [searchError, setSearchError] = useState('')
  const [statusMessage, setStatusMessage] = useState('CLIP hazırlanıyor…')
  const archiveRef = useRef(null)
  const trackRef = useRef(null)
  const requestId = useRef(0)

  const isSearching = query.trim().length > 0
  const scoreById = new Map(results.map((r) => [r.week.id, r.score]))
  const visibleWeeks = isSearching ? results.map((r) => r.week) : weeks

  const activeWeek =
    visibleWeeks.find((w) => w.id === activeId) ??
    visibleWeeks[0] ??
    weeks.find((w) => w.id === activeId) ??
    latestWeek

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    let cancelled = false
    setSearchStatus('loading')
    setStatusMessage('CLIP modeli yükleniyor…')
    warmSemanticSearch((info) => {
      if (!cancelled && info?.message) setStatusMessage(info.message)
    })
      .then(() => {
        if (!cancelled) {
          setSearchStatus('ready')
          setStatusMessage('CLIP hazır')
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSearchStatus('error')
          setSearchError(error.message || 'CLIP yüklenemedi')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return undefined
    }

    const id = ++requestId.current
    const timer = setTimeout(async () => {
      setSearchStatus((prev) => (prev === 'error' ? prev : 'loading'))
      try {
        const matches = await searchWeeks(trimmed)
        if (requestId.current !== id) return
        setResults(matches)
        setSearchStatus('ready')

        if (matches.length > 0) {
          setActiveId(matches[0].week.id)
          archiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      } catch (error) {
        if (requestId.current !== id) return
        setResults([])
        setSearchStatus('error')
        setSearchError(error.message || 'Arama başarısız')
      }
    }, 320)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const thumb = track.querySelector(`[data-week-id="${activeWeek.id}"]`)
    thumb?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeWeek.id])

  function scrollToArchive() {
    archiveRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function selectWeek(id) {
    setActiveId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function shiftWeek(delta) {
    const list = visibleWeeks.length ? visibleWeeks : weeks
    const index = list.findIndex((w) => w.id === activeWeek.id)
    const next = list[index + delta]
    if (next) selectWeek(next.id)
  }

  function scrollTrack(direction) {
    const track = trackRef.current
    if (!track) return
    const amount = Math.min(track.clientWidth * 0.7, 320)
    track.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  function clearSearch() {
    setQuery('')
    setResults([])
  }

  const statusHint =
    searchStatus === 'loading'
      ? statusMessage
      : searchStatus === 'error'
        ? searchError
        : isSearching
          ? `${results.length} hafta`
          : `${weeks.length} hafta · CLIP`

  return (
    <div className={`app${entered ? ' is-entered' : ''}`}>
      <header className="topbar">
        <a className="topbar__brand" href="#top" onClick={() => setActiveId(latestWeek.id)}>
          Metis
        </a>

        <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
          <label className="search__label" htmlFor="semantic-search">
            Ara
          </label>
          <input
            id="semantic-search"
            className="search__input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="deniz, mutluluk, yağmur…"
            autoComplete="off"
            spellCheck={false}
            disabled={searchStatus === 'error'}
          />
          {query && (
            <button type="button" className="search__clear" onClick={clearSearch} aria-label="Temizle">
              ×
            </button>
          )}
        </form>

        <button type="button" className="topbar__link" onClick={scrollToArchive}>
          Arşiv
        </button>
      </header>

      <section id="top" className="hero" aria-label="En güncel hafta">
        <div className="hero__frame" key={activeWeek.id}>
          <img
            className="hero__scan"
            src={activeWeek.image}
            alt={`${activeWeek.range} ajanda taraması`}
            draggable={false}
          />
        </div>

        <div className="hero__copy">
          <p className="hero__brand">Metis Archive</p>
          <h1 className="hero__title">Haftalık ajanda</h1>
          <p className="hero__lede">
            Taranmış sayfalar, hafta hafta. Şu an {activeWeek.range}.
          </p>
          <div className="hero__actions">
            <button type="button" className="btn btn--solid" onClick={scrollToArchive}>
              Haftalara bak
            </button>
          </div>
        </div>
      </section>

      <section ref={archiveRef} id="archive" className="archive" aria-labelledby="archive-heading">
        <div className="archive__bar">
          <div className="archive__intro">
            <h2 id="archive-heading">{isSearching ? 'Arama' : 'Arşiv'}</h2>
            <p>
              {isSearching
                ? results.length
                  ? `“${query.trim()}” · ${statusHint}`
                  : searchStatus === 'ready'
                    ? `“${query.trim()}” · eşleşen hafta yok`
                    : statusHint
                : 'Haftayı seç, hero’da açılsın.'}
            </p>
          </div>

          <div className="slider__nav" role="group" aria-label="Arşiv kaydır">
            <button
              type="button"
              className="slider__btn"
              onClick={() => scrollTrack(-1)}
              aria-label="Önceki haftalar"
            >
              ←
            </button>
            <button
              type="button"
              className="slider__btn"
              onClick={() => scrollTrack(1)}
              aria-label="Sonraki haftalar"
            >
              →
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          className="slider"
          role="listbox"
          aria-label="Haftalık taramalar"
          aria-activedescendant={`week-${activeWeek.id}`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              shiftWeek(1)
            }
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              shiftWeek(-1)
            }
          }}
        >
          {visibleWeeks.map((week) => {
            const isActive = week.id === activeWeek.id
            const score = scoreById.get(week.id)
            return (
              <button
                key={week.id}
                id={`week-${week.id}`}
                data-week-id={week.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`thumb${isActive ? ' is-active' : ''}`}
                onClick={() => selectWeek(week.id)}
              >
                <span className="thumb__frame">
                  <img
                    className="thumb__image"
                    src={week.image}
                    alt=""
                    draggable={false}
                    loading="lazy"
                  />
                </span>
                <span className="thumb__label">{week.label}</span>
                <span className="thumb__meta">
                  {score != null ? `${Math.round(score * 100)}% eşleşme` : `Hafta ${week.weekNumber}`}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <footer className="footer">
        <span>Metis Archive</span>
        <span>CLIP · haftalık scan</span>
      </footer>
    </div>
  )
}

export default App
