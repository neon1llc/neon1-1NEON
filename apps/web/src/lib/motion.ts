// apps/web/src/lib/motion.ts - Assembly-line motion between states. The changing part pans out to
// one side as the next state pans in from the other, using the browser's View Transitions; with
// no support, or with reduced motion asked for, the change is instant.


import { flushSync } from "react-dom";


/** Which way the line moves: forward pans left, back pans right */
export type Way = "next" | "back";


// --- Less motion -----------------------------------------------------------------------------------
// Motion is off when the device asks for less (prefers-reduced-motion) or the person chose "Reduced" on
// their profile. That choice is kept in this browser and marks the page (html[data-motion="off"]),
// which the stylesheet reads to turn every animation and transition off, the same as the device setting

const MOTION_KEY = "1neon.motion";
const device = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The device asks for less motion, so the profile's choice can't turn it back on */
export const deviceLessMotion = device;
/** The person's own choice on this browser */
export function chosenLessMotion(): boolean {
  try { return localStorage.getItem(MOTION_KEY) === "reduce"; } catch { return false; }
}
/** Should anything move right now? */
export const lessMotion = () => device() || chosenLessMotion();
/** Mark the page with the person's choice; called at startup and whenever it changes */
export function applyMotion() {
  if (chosenLessMotion()) document.documentElement.dataset.motion = "off";
  else delete document.documentElement.dataset.motion;
}
/** Change the choice, kept in this browser */
export function setLessMotion(on: boolean) {
  try { if (on) localStorage.setItem(MOTION_KEY, "reduce"); else localStorage.removeItem(MOTION_KEY); } catch { /* storage blocked: this page only */ }
  if (on) document.documentElement.dataset.motion = "off";
  else delete document.documentElement.dataset.motion;
}


// Browsers without view transitions, and people who asked for less motion, get instant changes
type VT = { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> };
type Doc = Document & { startViewTransition?: (cb: () => void) => VT };
const start = (): ((cb: () => void) => VT) | undefined => {
  const d = document as Doc;
  if (!d.startViewTransition || lessMotion()) return undefined;
  return d.startViewTransition.bind(d);
};

/** Cross-fade one state into the next (sign-in to sign-up, one sign-in step to the next) with the same
 * timing as everything else; instant where there's no support or less motion is asked for */
export function fade(change: () => void) {
  const begin = start();
  if (!begin) return change();
  document.documentElement.dataset.fade = "";
  const t = begin(() => flushSync(change));
  const done = () => delete document.documentElement.dataset.fade;
  t.finished.then(done, done);
}

/** Whether a change can slide right now: links that ask the router for a transition check first, and
 * navigate plainly otherwise (no support, less motion asked for, or a walkthrough setting up out of sight) */
export const canSlide = () => Boolean(start());


/**
 * A transition cut short by the next one (two quick clicks on the tabs) rejects its `ready` promise.
 * Nothing waits on it, the page still changes, and the browser would report an error nobody can act
 * on. Called once at startup, this marks that rejection as expected for every transition, the
 * router's included
 */
export function quietSkippedTransitions() {
  const d = document as Doc;
  const begin = d.startViewTransition;
  if (!begin) return;
  d.startViewTransition = ((cb: () => void) => {
    const t = begin.call(d, cb);
    t.ready?.catch(() => undefined);
    // Once its change has landed, and again when it ends, make sure the page still matches the address
    const check = () => void setTimeout(() => settle?.(), 60);
    (t.updateCallbackDone ?? t.finished).then(check, check);
    t.finished.then(check, check);
    return t;
  }) as typeof d.startViewTransition;
}


// --- Keeping the page and the address together ---------------------------------------------------
// The router draws a transition's page a frame or more after the click. A navigation that lands in
// that gap (two quick taps on a busy phone) is drawn first, and the transition's older page is then
// drawn over it, while the address stays on the newer one. So after every transition the page drawn
// is compared with the router's place, and when they differ the router goes to its place again

// The location the app drew last (its key), reported by the app's root
let drawn = "";
/** The app's root says which location it just drew */
export function drew(key: string) {
  drawn = key;
}

// Set once at startup: goes to the router's place again when the page drawn isn't it
let settle: (() => void) | undefined;
/** Give the check the router: where it is (and whether it's at rest), and how to go there again */
export function keepPageWithAddress(at: () => { key: string; idle: boolean }, again: () => void) {
  settle = () => {
    const now = at();
    if (now.idle && drawn && drawn !== now.key) again();
  };
}


/** Mark the direction for the CSS, cleared once the transition ends */
export function aim(way: Way) {
  document.documentElement.dataset.slide = way;
}


/** Change state with a slide: React renders the new state inside the transition */
export function slide(way: Way, update: () => void) {
  const go = start();
  if (!go) return update();
  aim(way);
  go(() => flushSync(update)).finished.finally(() => delete document.documentElement.dataset.slide);
}


/** For links that use the router's own view transition: set the way from positions in a sequence */
export function aimBetween(from: number, to: number) {
  if (to !== from) aim(to > from ? "next" : "back");
  // The router starts and ends the transition; clear the mark shortly after it would finish
  setTimeout(() => { delete document.documentElement.dataset.slide; }, 700);
}
