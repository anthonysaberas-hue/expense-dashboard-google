"use client";
import { useState, useEffect } from "react";

// true while the media query matches (false during SSR / first render)
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// Matches the CSS breakpoint where the bottom tab bar takes over
export const useIsPhone = () => useMediaQuery("(max-width: 639px)");
