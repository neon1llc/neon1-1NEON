// apps/web/src/lib/sitetheme.ts - The look of 1NEON's public screens (sign-in, FAQs, legal pages, the sample project): neon1.tech's
// own family and mode, kept in the same localStorage keys the site uses ("neon1.style" and "neon1.mode", the
// same origin), so one pick follows a visitor between the two. Awake until they pick. Signed in, the person's own
// theme setting takes over, as before; the demo and walkthroughs never use this.
// The page itself is painted by lib/themepaint.ts from the saved choice; this hook only keeps React's copy in step with it.


import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { readLook, saveLook, type Look } from "./style.ts";
import { onPainted, paintTheme } from "./themepaint.ts";


// The named look combines the landing family with the shared light/dark mode
export type SiteTheme = Look;


/** The saved pick in the chosen style (storage can be blocked) */
export function readSiteTheme(): SiteTheme { return readLook(); }


/** The page's theme for a public screen: set on arrival, changed by the switch, and following the site's other tabs and pages */
export function useSiteTheme(active = true): [SiteTheme, (t: SiteTheme) => void] {
  const [theme, setTheme] = useState<SiteTheme>(readSiteTheme);
  useEffect(() => {
    if (!active) return;
    // Arrive on the saved choice (it may have changed since this render), then follow every paint
    paintTheme({ instant: true });
    setTheme(readSiteTheme());
    return onPainted((viaTransition) => {
      // Inside a view transition the screen must be drawn before the callback returns
      if (viaTransition) flushSync(() => setTheme(readSiteTheme())); else setTheme(readSiteTheme());
    });
  }, [active]);
  // Saving announces the pick to this page and to other tabs, and the repaint reads it back
  const set = useCallback((t: SiteTheme) => saveLook(t), []);
  return [theme, set];
}
