// apps/web/src/lib/menufit.ts - A drop-down that ends inside what's on screen and scrolls within
// itself, and closes on a tap outside it.


import { useEffect, useLayoutEffect, type RefObject } from "react";


// Space left between the menu's end and whatever is under it, and the shortest a menu gets
const GAP = 12;
const LEAST = 120;
// A finger that moves further than this is scrolling, not tapping
const SLOP = 10;

/** How tall a menu starting at `top` can be: down to the nearest of the screen's visible end and the
 * bars drawn over it, never shorter than a few rows */
export function fitRoom(top: number, visibleBottom: number, bars: number[]): number {
  const bottom = Math.min(visibleBottom, ...bars);
  return Math.max(LEAST, Math.floor(bottom - top - GAP));
}

/** The tops of the bars pinned over the bottom of a menu's surroundings: the phone's tab bar under a
 * page, or the open side menu's own footer. A bar the keyboard has covered limits nothing */
function barTops(menu: Element, visibleBottom: number): number[] {
  const side = menu.closest(".side");
  const bar = side ? side.querySelector(".menu-footer") : document.querySelector(".tabbar");
  if (!bar) return [];
  const style = getComputedStyle(bar);
  if (style.display === "none" || (side && style.position !== "sticky")) return [];
  const r = bar.getBoundingClientRect();
  return r.height && r.top < visibleBottom && r.bottom > menu.getBoundingClientRect().top ? [r.top] : [];
}

/** While open, keep `--fit` on the menu at the room under it, as the page scrolls, the window turns,
 * or the keyboard rises and falls (styles/app.css caps the menu's height with it) */
export function useMenuFit(menu: RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = menu.current;
    if (!open || !el) return;
    const vv = window.visualViewport;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const end = vv ? vv.offsetTop + vv.height : innerHeight;
      el.style.setProperty("--fit", `${fitRoom(el.getBoundingClientRect().top, end, barTops(el, end))}px`);
    };
    const soon = () => { frame ||= requestAnimationFrame(fit); };
    fit();
    // Again once the opening animation (and the side menu's own slide) has settled
    const settled = window.setTimeout(fit, 320);
    vv?.addEventListener("resize", soon);
    vv?.addEventListener("scroll", soon);
    addEventListener("resize", soon);
    document.addEventListener("scroll", soon, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
      vv?.removeEventListener("resize", soon);
      vv?.removeEventListener("scroll", soon);
      removeEventListener("resize", soon);
      document.removeEventListener("scroll", soon, { capture: true });
    };
  }, [menu, open]);
}

/** Close on a tap or click outside `box`. A swipe that starts outside scrolls the page and leaves the
 * menu open. Pointer events, since iPhone sends no mouse events for a tap on plain page */
export function useTapOutside(box: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    let from: { x: number; y: number; id: number } | null = null;
    const down = (e: PointerEvent) => { from = box.current?.contains(e.target as Node) ? null : { x: e.clientX, y: e.clientY, id: e.pointerId }; };
    const up = (e: PointerEvent) => {
      const f = from;
      from = null;
      if (f && f.id === e.pointerId && Math.hypot(e.clientX - f.x, e.clientY - f.y) <= SLOP) close();
    };
    const cancel = () => { from = null; };
    addEventListener("pointerdown", down, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", cancel, true);
    return () => {
      removeEventListener("pointerdown", down, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", cancel, true);
    };
  }, [box, open, close]);
}
