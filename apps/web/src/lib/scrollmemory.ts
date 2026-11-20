// apps/web/src/lib/scrollmemory.ts - Back, Forward, and reload put the page back at the spot where that history entry was
// left, however many steps back, even when the same page is in the history twice. Each entry has its own key (the router's
// location.key, kept in history.state), and its scroll is kept under that key in sessionStorage: it survives a reload, ends
// with the tab, and is cleared on sign-out. A new link opens at its top or at its #spot; another tab of the same project keeps
// the scroll, since the page around it stays.


import { useEffect, useLayoutEffect, useRef } from "react";
import type { NavigationType } from "react-router";
import { pageScroller, pageTop } from "./edge.ts";


const KEY = "1neon.entries";
const KEEP = 100;
let spots: Record<string, number> | undefined;

const store = (): Storage | undefined => {
  try { return window.sessionStorage; } catch { return undefined; }
};

function load(): Record<string, number> {
  if (spots) return spots;
  try { spots = JSON.parse(store()?.getItem(KEY) ?? "{}") as Record<string, number>; } catch { spots = {}; }
  // The record this replaced kept one spot per section, so a page visited twice came back at its latest spot
  try { store()?.removeItem("1neon.scroll"); } catch { /* storage blocked */ }
  return spots;
}

function note(key: string, top: number) {
  const mem = load();
  // Newest last, so the oldest entries are the ones let go
  delete mem[key];
  mem[key] = top;
}

function persist() {
  const mem = load();
  const keys = Object.keys(mem);
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete mem[k];
  try { store()?.setItem(KEY, JSON.stringify(mem)); } catch { /* storage blocked: memory lasts until reload */ }
}

/** Forget every remembered position (sign-out) */
export function forgetScroll() {
  spots = {};
  try { store()?.removeItem(KEY); store()?.removeItem("1neon.scroll"); } catch { /* storage blocked */ }
}

/**
 * Give the entry the app was opened on a key of its own, before the router reads it. Without one the router calls every
 * entry opened from outside the app "default", so two of them in one tab would share a spot
 */
export function keyFirstEntry() {
  try {
    const state: unknown = history.state;
    if (state && typeof state === "object" && typeof (state as { key?: unknown }).key === "string") return;
    history.replaceState({ ...(state && typeof state === "object" ? state : {}), key: Math.random().toString(36).slice(2, 10) }, "");
  } catch { /* the router keeps "default" */ }
}


/**
 * Follow the page's scroll under the entry `key`, and on arriving put it where it belongs: Back, Forward, and reload (POP)
 * go to the entry's own spot; a new entry (PUSH, REPLACE) opens at its top, or stays put when only the project tab
 * changed (`section` is the same). A link to a spot on the page (a #hash) keeps its own destination unless the entry
 * already has a spot.
 */
export function useEntryScroll(key: string, section: string, hash: string, how: NavigationType) {
  // Reload and Back/Forward are ours: the browser's own restoring would fight the entry's memory
  useEffect(() => {
    const prev = history.scrollRestoration;
    try { history.scrollRestoration = "manual"; } catch { /* unsupported */ }
    // Leaving or hiding the page (an iPhone may never send pagehide) writes the last spot seen
    const out = () => persist();
    const hidden = () => { if (document.visibilityState === "hidden") persist(); };
    window.addEventListener("pagehide", out);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      try { history.scrollRestoration = prev; } catch { /* unsupported */ }
      window.removeEventListener("pagehide", out);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  const lastSection = useRef<string | null>(null);
  useLayoutEffect(() => {
    const sameSection = lastSection.current === section;
    lastSection.current = section;
    const mem = load();
    const target = how === "POP" && mem[key] !== undefined ? mem[key] : hash || sameSection ? undefined : 0;

    let restoring = false;
    let frame = 0;
    const settle = () => { restoring = false; cancelAnimationFrame(frame); };

    // Record the position as the reader scrolls. Never while one is being put back: the page may still be loading and
    // shorter than the spot, and a clamped value must not replace the real one
    let timer = 0;
    const onScroll = (e?: Event) => {
      // Scrolling inside a board or a tab strip is not the page's
      if (e && e.target !== document && e.target !== document.body) return;
      if (restoring) return;
      note(key, Math.round(pageTop()));
      clearTimeout(timer);
      timer = window.setTimeout(persist, 200);
    };

    if (target !== undefined) {
      restoring = true;
      const t0 = performance.now();
      // Until the page is tall enough (data still arriving) keep asking; give up after 1.5 s, or the moment the reader
      // scrolls or taps themselves
      const step = () => {
        if (!restoring) return;
        pageScroller().scrollTo({ top: target, left: 0, behavior: "instant" });
        const reached = Math.abs(pageTop() - target) < 2;
        if (reached && performance.now() - t0 > 250) { settle(); onScroll(); return; }
        if (performance.now() - t0 > 1500) { settle(); onScroll(); return; }
        frame = requestAnimationFrame(step);
      };
      step();
    } else if (!hash) onScroll(); // a tab change keeps the scroll: it is this entry's spot until the reader moves
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
    // Each entry is its own; section, hash, and how come with the entry's key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
