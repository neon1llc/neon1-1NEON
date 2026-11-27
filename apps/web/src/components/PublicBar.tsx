// apps/web/src/components/PublicBar.tsx - The top bar of 1NEON's public screens (sign-in, FAQs, legal pages), the
// site's own: the neon1 logo on the left that goes home, the light or dark switch, and on the pages that sit
// beside the sign-in a "← 1NEON" button that goes back to it. On a phone the button is at the right edge with the
// switch to its left; on a desktop the button sits at the right edge and the switch beside it in the page margin,
// as on neon1.tech. Not used inside the portal, the demo, or a walkthrough.


import { Link } from "react-router";
import type { SiteTheme } from "../lib/sitetheme.ts";
import { Arr } from "./ui.tsx";


export function ThemeSwitch({ theme, onChange }: { theme: SiteTheme; onChange: (t: SiteTheme) => void }) {
  // The mode changes within the family chosen on the landing
  const dark = theme === "plugged" || theme === "desert-of-the-real";
  const biz = theme === "providence" || theme === "desert-of-the-real";
  return (
    <button className="theme-sw" type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title="light or dark"
      onClick={() => onChange(dark ? (biz ? "providence" : "awake") : biz ? "desert-of-the-real" : "plugged")}>
      <svg className="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>
      <svg className="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z" /></svg>
      <span className="theme-knob" aria-hidden="true" />
    </button>
  );
}


/** The bar. With `back`, the pages beside sign-in get their way back; the sign-in itself has only the switch */
export function PublicBar({ theme, onChange, back = false }: { theme: SiteTheme; onChange: (t: SiteTheme) => void; back?: boolean }) {
  return (
    <header className={`n1-bar pub-bar${back ? "" : " alone"}`}>
      <div className="n1-inner">
        <a className="n1-logo" href="/" aria-label="neon1.tech home">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6a24 24 0 0 1 24 24v30M6 12a18 18 0 0 1 18 18v30M6 18a12 12 0 0 1 12 12v30M6 24a6 6 0 0 1 6 6v30" />
            <path d="M34 6a24 24 0 0 1 24 24v30M34 12a18 18 0 0 1 18 18v30M34 18a12 12 0 0 1 12 12v30M34 24a6 6 0 0 1 6 6v30" />
          </svg>
          <span><span className="ne">neon</span><span className="one">1</span></span>
        </a>
        <ThemeSwitch theme={theme} onChange={onChange} />
        {back && <Link className="pub-back" to="/" viewTransition><Arr />1NEON</Link>}
      </div>
    </header>
  );
}
