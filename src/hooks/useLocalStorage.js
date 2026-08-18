import { useEffect, useState } from "react";

/** Portfolyo ile aynı localStorage anahtarları — tercihler iki site arasında taşınır */
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? defaultValue : JSON.parse(stored);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}
