import { useEffect, useState } from "react";

/** scroll-top ile aynı dar ekran + dokunmatik birincil cihazlar */
const MOBILE_SEARCH_MQ =
  "(max-width: 900px), (hover: none) and (pointer: coarse)";

function isMobileSearchContext() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_SEARCH_MQ).matches;
}

/** Masaüstünde CLIP açık; mobilde yalnızca JSON indeksi */
export function useClipSearchEnabled() {
  const [enabled, setEnabled] = useState(() => !isMobileSearchContext());

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_SEARCH_MQ);
    const update = () => setEnabled(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return enabled;
}
