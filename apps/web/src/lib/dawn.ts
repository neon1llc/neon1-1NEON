// apps/web/src/lib/dawn.ts - Dark to awake is slow, as the eyes take the light after the dark (Pradeep, 2026-11-17).
// Going dark stays quick, a plain change with the neon flick. Going light runs the change inside a view transition: the dark
// screen stays and the light one comes up over it in a long ease-out (css: html.dawn-vt, "Dark to awake"). A browser without view
// transitions gets html.theme-dawn, the same colors on a slow transition. Reduced motion, or motion turned off, is a plain change.
// The site's own switch does the same in neon1.tech's js/theme.js, so the two feel alike.


const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";


/** Run `change` (it must update the page synchronously) as a slow dawn when `leavingDark`, else just run it */
export function dawn(leavingDark: boolean, change: () => void) {
  const root = document.documentElement;
  if (!leavingDark || still()) { change(); return; }
  root.classList.remove("flick-on", "flick-off");
  const done = () => root.classList.remove("dawn-vt", "theme-dawn");
  if (typeof document.startViewTransition === "function") {
    root.classList.add("dawn-vt");
    try { document.startViewTransition(change).finished.then(done, done); } catch { done(); change(); }
  } else {
    const ms = parseFloat(getComputedStyle(root).getPropertyValue("--dawn")) * 1000 || 2200;
    root.classList.add("theme-dawn");
    change();
    setTimeout(done, ms + 100);
  }
}
