// apps/web/src/lib/scrollmemory.ts - Each section of the app (Settings, Contact, one project, ...) keeps
// the scroll position you left it at, so moving between sections and back lands where you were. A section
// you haven't visited starts at its top. Kept in sessionStorage: it survives a reload, ends with the tab,
// and is cleared on sign-out.


import { useEffect, useLayoutEffect } from "react";
import { pageScroller, pageTop } from "./edge.ts";


const KEY = "1neon.scroll";
let spots: Record<string, number> | undefined;

const store = (): Storage | undefined => {
  try { return window.sessionStorage; } catch { return undefined; }
};

function load(): Record<string, number> {
  if (spots) return spots;
  try { spots = JSON.parse(store()?.getItem(KEY) ?? "{}") as Record<string, number>; } catch { spots = {}; }
  return spots;
}

function persist() {
  try { store()?.setItem(KEY, JSON.stringify(load())); } catch { /* storage blocked: memory lasts until reload */ }
}

/** Forget every remembered position (sign-out) */
export function forgetScroll() {
  spots = {};
  try { store()?.removeItem(KEY); } catch { /* storage blocked */ }
}


/**
 * Follow the page's scroll under `section`, and on arriving in another section put it back where that
 * one was left. A link to a spot on the page (a #hash) keeps its own destination.
 */
export function useSectionScroll(section: string, hash: string) {
  // Reload and Back/Forward are ours too: the browser's own restoring would fight the section's memory
  useEffect(() => {
    const prev = history.scrollRestoration;
    try { history.scrollRestoration = "manual"; } catch { /* unsupported */ }
    return () => { try { history.scrollRestoration = prev; } catch { /* unsupported */ } };
  }, []);

  useLayoutEffect(() => {
    let restoring = false;
    let frame = 0;
    const settle = () => { restoring = false; cancelAnimationFrame(frame); };
    const mem = load();
    const target = hash ? undefined : mem[section] ?? 0;

    // Record the position as the reader scrolls. Never while we're putting one back: the page may still
    // be loading and shorter than the spot, and a clamped value must not replace the real one
    let timer = 0;
    const onScroll = (e?: Event) => {
      // Scrolling inside a board or a tab strip is not the page's
      if (e && e.target !== document && e.target !== document.body) return;
      if (restoring) return;
      mem[section] = Math.round(pageTop());
      clearTimeout(timer);
      timer = window.setTimeout(persist, 200);
    };

    if (target !== undefined) {
      restoring = true;
      const t0 = performance.now();
      // Until the page is tall enough (data still arriving) keep asking; give up after 1.5 s, or the
      // moment the reader scrolls or taps themselves
      const step = () => {
        if (!restoring) return;
        pageScroller().scrollTo({ top: target, left: 0, behavior: "instant" });
        const reached = Math.abs(pageTop() - target) < 2;
        if (reached && performance.now() - t0 > 250) { settle(); onScroll(); return; }
        if (performance.now() - t0 > 1500) { settle(); onScroll(); return; }
        frame = requestAnimationFrame(step);
      };
      step();
    }
    const own = () => { if (restoring) settle(); };
    // Captured: the body's scroll (iPhone) doesn't bubble up to the window
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("wheel", own, { passive: true });
    window.addEventListener("touchstart", own, { passive: true });
    window.addEventListener("keydown", own);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", own);
      window.removeEventListener("touchstart", own);
      window.removeEventListener("keydown", own);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      persist();
    };
    // Only moving to another section matters; a hash change inside one is the page's own business
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
}
