// apps/web/src/lib/edge.ts - The top and bottom edges of the screen in iPhone browsers, and the one
// place that knows which element scrolls the page.
//
// DuckDuckGo on iPhone draws the page all the way down, under its floating toolbar, but stops
// everything fixed (the tab bar, the menu, a walkthrough's backdrop) at the toolbar's top edge and
// clips whatever runs past it. So the page scrolled by in that strip, in view, under the tab bar.
// Nothing fixed can cover it. What can: the page itself doesn't scroll there. The body scrolls
// inside a page that stays still, and the strip under the toolbar shows the page's own background,
// which matches the tab bar. The same goes for the top: the body is pinned to the part of the screen
// between the browser's own bars, so nothing scrolls by under a see-through bar at either end.
//
// iOS answers a tap on the status bar by scrolling the document, never a box inside it. So the still
// page is one pixel taller than the screen and rests scrolled by that pixel: the tap takes the
// document to 0, and the body follows it to the top. The body is pinned, so the pixel shows nowhere.
//
// DuckDuckGo often sends Safari's own user agent, so it can't be told apart from Safari. Every iPhone
// browser gets this, then (they all run on Safari's engine, and Safari's own glass toolbar shows the
// page through it too). Elsewhere the page scrolls as usual.


import { useLayoutEffect } from "react";


// Any browser on an iPhone or iPod, and an iPad, which says it's a Mac but has a touch screen
const IPHONE = /iPhone|iPod|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Set once at startup, before the first paint: the body scrolls instead of the page on an iPhone
 * (styles/app.css, "Under the browser's own controls") */
export function keepEdgeStill() {
  if (!IPHONE) return;
  document.documentElement.classList.add("body-scrolls");
  followStatusBarTap();
}

// How long after the last touch a move of the document still counts as that touch's own (a drag on a fixed bar and its settle)
const SETTLE_MS = 600;

/** A tap on the status bar sends the document to 0 without any touch reaching the page: take the body to its top, then
 * put the document back on its pixel for the next tap. A move that follows a touch, or the keyboard's, is only put back */
export function followStatusBarTap() {
  const root = document.documentElement;
  let touching = false;
  let touched = -SETTLE_MS;
  let timer = 0;
  const still = () => root.classList.contains("body-scrolls");
  const typing = () => Boolean(document.activeElement?.matches("input, textarea, select, [contenteditable]"));
  // Never under a finger or a focused field: iOS is moving the document for them
  const rest = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => { if (still() && !touching && !typing() && window.scrollY !== 1) window.scrollTo(0, 1); }, 100);
  };
  addEventListener("touchstart", () => { touching = true; }, { passive: true, capture: true });
  const end = (e: TouchEvent) => { touching = e.touches.length > 0; touched = e.timeStamp; rest(); };
  addEventListener("touchend", end, { passive: true, capture: true });
  addEventListener("touchcancel", end, { passive: true, capture: true });
  // The window's own scroll only: the body's doesn't bubble up to it
  addEventListener("scroll", (e) => {
    if (e.target !== document || !still()) return;
    if (window.scrollY === 0 && !touching && !typing() && e.timeStamp - touched > SETTLE_MS) {
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || root.dataset.motion === "off";
      document.body.scrollTo({ top: 0, behavior: calm ? "instant" : "smooth" });
    }
    rest();
  });
  addEventListener("focusout", rest);
  addEventListener("pageshow", rest);
  rest();
}

/** Public pages have no tab bar under the browser's toolbar, so there the page scrolls as the document: the status-bar tap that returns to the top works, and the bar's sticky parts keep to the document. The body scrolls again once the page is left. */
export function useDocumentScroll() {
  useLayoutEffect(() => {
    const classes = document.documentElement.classList;
    const had = classes.contains("body-scrolls");
    classes.remove("body-scrolls");
    // The document is the page's own scroller here, so the pixel it rested on goes
    if (had && window.scrollY === 1) window.scrollTo(0, 0);
    return () => { if (had) { classes.add("body-scrolls"); window.scrollTo(0, 1); } };
  }, []);
}

/** What scrolls the page: the body where it scrolls on its own, the window everywhere else */
export function pageScroller(): Pick<Window, "scrollTo" | "scrollBy"> {
  return document.documentElement.classList.contains("body-scrolls") ? document.body : window;
}

/** How far the page is scrolled, from whatever scrolls it (see pageScroller) */
export function pageTop(): number {
  return document.documentElement.classList.contains("body-scrolls") ? document.body.scrollTop : window.scrollY;
}
