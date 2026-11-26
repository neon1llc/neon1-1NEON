// apps/web/src/lib/land.ts - Landing on a spot: an address ending in #something (a notification, an
// email link, a link inside 1NEON) scrolls there once the page has drawn it, and marks it for a moment.


import { useEffect } from "react";
import { useLocation } from "react-router";
import { lessMotion } from "./motion.ts";


// Pages that place themselves (the board layers' stages, the profile, the public FAQs) are left alone
const OWN = /^stage-/;
// How long to wait for the page's data to draw the spot
const WAIT_MS = 8_000;


/** Used once by the frame: the location's key changes on every click, so a link to where the page
 * already is still scrolls */
export function useLandOnHash() {
  const { hash, key, pathname } = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    if (!id || OWN.test(id) || pathname === "/me") return;
    let done: Element | undefined;
    let off: number | undefined;
    const land = () => {
      const el = document.getElementById(id);
      if (!el || done) return;
      done = el;
      watch.disconnect();
      // A folded section opens so the spot can be seen
      for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
      el.scrollIntoView({ behavior: lessMotion() ? "auto" : "smooth", block: (el as HTMLElement).offsetHeight > innerHeight * 0.6 ? "start" : "center" });
      el.classList.add("flash");
      off = window.setTimeout(() => el.classList.remove("flash"), 2200);
    };
    const watch = new MutationObserver(land);
    watch.observe(document.body, { childList: true, subtree: true });
    const stop = window.setTimeout(() => watch.disconnect(), WAIT_MS);
    land();
    return () => {
      watch.disconnect();
      window.clearTimeout(stop);
      window.clearTimeout(off);
      done?.classList.remove("flash");
    };
  }, [hash, key, pathname]);
}
