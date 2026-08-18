import "./SiteHeader.css";

const HOME_URL = "https://denizozturk.co/";

export default function SiteHeader({
  darkMode,
  setDarkMode,
  language,
  setLanguage,
  labels,
}) {
  const modeLabel = darkMode ? labels.light : labels.dark;

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="site-header__brand" href={HOME_URL}>
          deniz
        </a>

        <div className="site-header__controls">
          <button
            type="button"
            className="site-header__lang"
            onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
          >
            {labels.langToggle}
          </button>

          <div className="site-header__mode">
            <button
              type="button"
              className="site-header__switch"
              onClick={() => setDarkMode(!darkMode)}
              aria-label={modeLabel}
              aria-pressed={darkMode}
            >
              <span className="site-header__knob" />
            </button>
            <p className="site-header__mode-label">{modeLabel}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
