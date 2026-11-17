// apps/web/src/lib/sitetheme.ts - The look of 1NEON's public screens (sign-in, FAQs, legal pages): neon1.tech's
// own choice, awake (light) or matrix (dark), kept in the same localStorage key the site uses ("neon1.theme", the
// same origin), so one pick follows a visitor between the two. Awake until they pick. Signed in, the person's own
// theme setting takes over, as before; the demo and walkthroughs never use this.


import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { applyTheme, isDark } from "../components/Shell.tsx";
import { dawn } from "./dawn.ts";
import { isBusiness, readLook, saveLook, type Look } from "./style.ts";


const KEYS = ["neon1.theme", "neon1.theme.business", "neon1.style"];
// awake and matrix are the stylized look; alert and lamp the plain business look the landing's style switch chooses (lib/style.ts)
export type SiteTheme = Look;


/** The saved pick in the chosen style (storage can be blocked) */
export function readSiteTheme(): SiteTheme { return readLook(); }


const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let timer = 0;


/** The neon parts flicker as the theme changes, the site's way (css: .flick-on / .flick-off on the page element); the business style never does */
function flicker(next: SiteTheme) {
  if (still() || isBusiness(next)) return;
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
      if (!e.key || !KEYS.includes(e.key)) return;
      const t = readSiteTheme();
      // Leaving dark is a slow dawn, but only inside the stylized style
      dawn(isDark() && t === "awake" && !document.documentElement.hasAttribute("data-style"), () => { flushSync(() => setTheme(t)); applyTheme(t); });
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);
  const set = useCallback((t: SiteTheme) => {
    saveLook(t);
    // Leaving dark is a slow dawn (the screen is repainted inside it); going dark is the quick flick. Business is a plain change
    const leaving = isDark() && t === "awake" && !document.documentElement.hasAttribute("data-style");
    if (!leaving) flicker(t);
    dawn(leaving, () => { flushSync(() => setTheme(t)); applyTheme(t); });
  }, []);
  return [theme, set];
}
