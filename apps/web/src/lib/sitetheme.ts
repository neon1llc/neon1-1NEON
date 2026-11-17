// apps/web/src/lib/sitetheme.ts - The look of 1NEON's public screens (sign-in, FAQs, legal pages): neon1.tech's
// own choice, awake (light) or matrix (dark), kept in the same localStorage key the site uses ("neon1.theme", the
// same origin), so one pick follows a visitor between the two. Awake until they pick. Signed in, the person's own
// theme setting takes over, as before; the demo and walkthroughs never use this.


import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { applyTheme, isDark } from "../components/Shell.tsx";
import { dawn } from "./dawn.ts";


const KEY = "neon1.theme";
export type SiteTheme = "awake" | "matrix";


/** The saved pick, else awake (storage can be blocked) */
export function readSiteTheme(): SiteTheme {
  try { return localStorage.getItem(KEY) === "matrix" ? "matrix" : "awake"; } catch { return "awake"; }
}


const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let timer = 0;


/** The neon parts flicker as the theme changes, the site's way (css: .flick-on / .flick-off on the page element) */
function flicker(next: SiteTheme) {
  if (still()) return;
  const root = document.documentElement;
  root.classList.remove("flick-on", "flick-off");
  void root.offsetWidth; // restart the animation if it was still running
  root.classList.add(next === "matrix" ? "flick-on" : "flick-off");
  clearTimeout(timer);
  timer = window.setTimeout(() => root.classList.remove("flick-on", "flick-off"), 2400);
}


/** The page's theme for a public screen: set on arrival, changed by the switch, and following the site's other tabs */
export function useSiteTheme(active = true): [SiteTheme, (t: SiteTheme) => void] {
  const [theme, setTheme] = useState<SiteTheme>(readSiteTheme);
  useEffect(() => { if (active) applyTheme(theme); }, [active, theme]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const t = readSiteTheme();
      dawn(isDark() && t === "awake", () => { flushSync(() => setTheme(t)); applyTheme(t); });
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);
  const set = useCallback((t: SiteTheme) => {
    try { localStorage.setItem(KEY, t); } catch { /* not kept: this page still switches */ }
    // Leaving dark is a slow dawn (the screen is repainted inside it); going dark is the quick flick
    const leaving = isDark() && t === "awake";
    if (!leaving) flicker(t);
    dawn(leaving, () => { flushSync(() => setTheme(t)); applyTheme(t); });
  }, []);
  return [theme, set];
}
