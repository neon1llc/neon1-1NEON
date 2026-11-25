// apps/web/src/lib/themepaint.ts - Paints the page's theme. The saved choice (lib/style.ts: family, mode, and the shared flag)
// is the one source of truth, and every trigger (a switch here, a switch on another page or tab, the signed-in profile arriving,
// a page restored by Back, the device's own setting) only asks for a repaint. A repaint reads the choice when it runs, never a
// value captured earlier, so a slow dawn or a late answer can't paint over a newer pick, and the page always ends on the
// newest saved choice however quickly the switches are pressed.


import { dawn } from "./dawn.ts";
import { isDarkLook, isSentinel, normalizeLook, onLookChange, readLook, resolveTheme, styleChoice } from "./style.ts";


const deviceDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;


/** Apply a theme to the page; with no attribute the styles show awake */
export function applyTheme(theme: string) {
  // Named looks map to the existing light/dark CSS values; data-look retains the public name
  const look = normalizeLook(theme);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme === "device" ? "device" : isDarkLook(look) ? "matrix" : "awake");
  root.setAttribute("data-look", theme === "device" ? "device" : look);
  if (isSentinel(look)) root.setAttribute("data-style", "sentinel"); else root.removeAttribute("data-style");
  syncDark();
}


/** Whether the page shows a dark mode right now: chosen outright, or "device" on a device set to dark. The html element carries
 * it as the class n1-dark, so Neo's window can follow the same look and repaint the moment it changes */
export function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "matrix" || (t === "device" && deviceDark());
}
function syncDark() {
  const dark = isDark();
  document.documentElement.classList.toggle("n1-dark", dark);
}


// The signed-in person's saved theme: the fallback until they make a choice that is shared across the site. Null on public screens
let account: string | null = null;
export function setAccountTheme(theme: string | null) { account = theme; }
/** What the page should show now: the shared choice if there is one, else the account's theme, else the saved choice */
export const shownTheme = (): string => (account === null ? readLook() : resolveTheme(account));


// Screens that keep a copy of the look in React state hear about every paint; `viaTransition` says the paint is inside a view
// transition's update, which must draw synchronously
const listeners = new Set<(viaTransition: boolean) => void>();
export function onPainted(cb: (viaTransition: boolean) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}


let flickerTimer = 0;
/** The neon parts flicker as the theme changes, the site's way (css: .flick-on / .flick-off on the page element); Sentinel never does */
function flicker(toDark: boolean) {
  if (still()) return;
  const root = document.documentElement;
  root.classList.remove("flick-on", "flick-off");
  void root.offsetWidth; // restart the animation if it was still running
  root.classList.add(toDark ? "flick-on" : "flick-off");
  clearTimeout(flickerTimer);
  flickerTimer = window.setTimeout(() => root.classList.remove("flick-on", "flick-off"), 2400);
}


/** Paint the page from the saved choice. Leaving dark inside Matrix is a slow dawn (lib/dawn.ts) and going dark is the quick
 * flick; Sentinel, and `instant` (arrival, restore), change at once. Safe to call at any time and any number of times */
export function paintTheme({ instant = false }: { instant?: boolean } = {}) {
  const target = shownTheme();
  const toDark = isDarkLook(target) || (target === "device" && deviceDark());
  const plain = isSentinel(target) || document.documentElement.getAttribute("data-style") === "sentinel";
  const wasDark = isDark();
  const leaving = !instant && !plain && wasDark && !toDark;
  if (!instant && !plain && !leaving && wasDark !== toDark) flicker(toDark);
  // Read again when the change runs: a dawn paints a frame or more after it starts, and the choice may have moved on
  dawn(leaving, () => {
    applyTheme(shownTheme());
    listeners.forEach((cb) => cb(leaving));
  });
}


let watching = false;
/** Once at startup: every way the choice can change repaints the page from the saved choice */
export function watchTheme() {
  if (watching) return;
  watching = true;
  // A pick on this page (announced by saveLook) and in another tab (storage)
  onLookChange(() => paintTheme());
  // A page restored from the back/forward cache, or a tab brought forward, may have missed events while it was asleep
  addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) paintTheme({ instant: true }); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") paintTheme({ instant: true }); });
  const device = matchMedia("(prefers-color-scheme: dark)");
  device.addEventListener?.("change", () => { if (account === "device" && styleChoice() === "sentinel") paintTheme({ instant: true }); else syncDark(); });
}
