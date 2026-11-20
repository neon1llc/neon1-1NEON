// apps/web/src/lib/themepaint.test.ts - Rapid and interleaved theme switches always end on the newest saved choice.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookFor, onLookChange, readLook, saveLook, type Look, type Style } from "./style.ts";
import { paintTheme, setAccountTheme, shownTheme, watchTheme } from "./themepaint.ts";

// A page with attributes and classes, a storage that survives "reloads" (and is shared with a pretend second tab), and view
// transitions whose update callbacks wait until the test lets them run, the way a real dawn paints a frame or more late
let attrs: Map<string, string>, classes: Set<string>, store: Map<string, string>, pending: (() => void)[], events: EventTarget;
const reduced = { value: false };
const root = () => ({
  getAttribute: (k: string) => attrs.get(k) ?? null,
  setAttribute: (k: string, v: string) => void attrs.set(k, v),
  removeAttribute: (k: string) => void attrs.delete(k),
  hasAttribute: (k: string) => attrs.has(k),
  dataset: {},
  offsetWidth: 0,
  classList: { add: (...c: string[]) => c.forEach((x) => classes.add(x)), remove: (...c: string[]) => c.forEach((x) => classes.delete(x)), toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)), contains: (c: string) => classes.has(c) },
});
beforeEach(() => {
  attrs = new Map(); classes = new Set(); store = new Map(); pending = []; events = new EventTarget(); reduced.value = false;
  const html = root();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", {
    documentElement: html, getElementById: () => null, visibilityState: "visible",
    addEventListener: (k: string, f: () => void) => events.addEventListener(k, f),
    startViewTransition: (cb: () => void) => { pending.push(cb); return { finished: new Promise<void>(() => undefined), ready: Promise.resolve() }; },
  });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced") ? reduced.value : false, addEventListener: () => undefined }));
  vi.stubGlobal("addEventListener", (k: string, f: () => void) => events.addEventListener(k, f));
  vi.stubGlobal("removeEventListener", (k: string, f: () => void) => events.removeEventListener(k, f));
  vi.stubGlobal("dispatchEvent", (e: Event) => events.dispatchEvent(e));
  vi.stubGlobal("clearTimeout", () => undefined);
  vi.stubGlobal("setTimeout", () => 0);
  setAccountTheme(null);
});
afterEach(() => vi.unstubAllGlobals());

// watchTheme registers once per module load, so each scenario that needs it gets a fresh copy of the modules
async function fresh() {
  events = new EventTarget();
  vi.resetModules();
  const style = await import("./style.ts");
  const paint = await import("./themepaint.ts");
  paint.watchTheme();
  return { ...style, ...paint };
}
const flush = () => { while (pending.length) pending.shift()!(); };
const painted = () => attrs.get("data-look");
const seed = (style: Style, dark: boolean) => { store.set("neon1.style", style); store.set("neon1.mode", dark ? "dark" : "light"); store.set("neon1.theme.shared", "1"); };
const other = (k: string, v: string) => { store.set(k, v); events.dispatchEvent(Object.assign(new Event("storage"), { key: k })); };

describe("painting from the saved choice", () => {
  it("every start and every short run of switches ends on the newest saved look, however late the dawns paint", async () => {
    type Op = "mode" | "family";
    const runs: Op[][] = [];
    const ops: Op[] = ["mode", "family"];
    const build = (prefix: Op[]) => { if (prefix.length) runs.push(prefix); if (prefix.length < 4) ops.forEach((o) => build([...prefix, o])); };
    build([]);
    for (const style of ["matrix", "sentinel"] as Style[]) for (const dark of [true, false]) for (const when of ["each", "end", "reverse"]) for (const run of runs) {
      const m = await fresh();
      attrs.clear(); classes.clear(); store.clear(); pending.length = 0;
      seed(style, dark);
      m.paintTheme({ instant: true });
      let s: Style = style, d = dark;
      for (const op of run) {
        const now = m.readLook();
        const nowDark = now === "plugged" || now === "desert-of-the-real", nowSentinel = now === "providence" || now === "desert-of-the-real";
        const next: Look = op === "mode" ? lookFor(nowSentinel ? "sentinel" : "matrix", !nowDark) : lookFor(nowSentinel ? "matrix" : "sentinel", nowDark);
        if (op === "mode") d = !d; else s = s === "matrix" ? "sentinel" : "matrix";
        m.saveLook(next);
        if (when === "each") flush();
      }
      if (when === "reverse") pending.reverse();
      flush();
      const want = lookFor(s, d);
      expect({ style, dark, when, run: run.join(), look: painted(), dark2: classes.has("n1-dark") }).toEqual({ style, dark, when, run: run.join(), look: want, dark2: d });
    }
  });

  it("a switch pressed in another tab while a dawn is pending is not painted over by the older pick", async () => {
    const m = await fresh();
    seed("matrix", true);
    m.paintTheme({ instant: true });
    expect(painted()).toBe("plugged");
    m.saveLook("awake");          // leaving dark: a dawn starts, its paint is still waiting
    expect(pending).toHaveLength(1);
    other("neon1.mode", "dark");  // another tab flips back to dark meanwhile
    flush();
    expect(painted()).toBe("plugged");
    expect(classes.has("n1-dark")).toBe(true);
  });

  it("another tab's family and mode both arrive, even as separate storage events", async () => {
    const m = await fresh();
    seed("matrix", false);
    m.paintTheme({ instant: true });
    other("neon1.style", "sentinel"); flush();
    other("neon1.mode", "dark"); flush();
    expect(painted()).toBe("desert-of-the-real");
    expect(attrs.get("data-style")).toBe("sentinel");
  });

  it("the account's theme arriving late never paints over a pick made first", async () => {
    const m = await fresh();
    // No shared choice yet: the account's theme shows
    m.setAccountTheme("plugged");
    m.paintTheme({ instant: true });
    expect(painted()).toBe("plugged");
    // The person picks light (sentinel family)
    m.saveLook("providence"); flush();
    // A slow profile answer, or a refetch on focus, arrives with the old account theme
    m.setAccountTheme("plugged");
    m.paintTheme({ instant: true });
    expect(painted()).toBe("providence");
    expect(m.shownTheme()).toBe("providence");
  });

  it("Sentinel never plays the dawn or the flicker, and Matrix going dark flicks without a transition", async () => {
    const m = await fresh();
    seed("sentinel", true);
    m.paintTheme({ instant: true });
    m.saveLook("providence");
    expect(pending).toHaveLength(0);
    expect(painted()).toBe("providence");
    expect([...classes].some((c) => c.startsWith("flick"))).toBe(false);
    seed("matrix", false);
    m.paintTheme({ instant: true });
    m.saveLook("plugged");
    expect(pending).toHaveLength(0);
    expect(classes.has("flick-on")).toBe(true);
    expect(painted()).toBe("plugged");
  });

  it("reduced motion changes at once", async () => {
    const m = await fresh();
    reduced.value = true;
    seed("matrix", true);
    m.paintTheme({ instant: true });
    m.saveLook("awake");
    expect(pending).toHaveLength(0);
    expect(painted()).toBe("awake");
  });

  it("blocked storage still follows the newest pick on this page", async () => {
    const m = await fresh();
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } });
    m.saveLook("desert-of-the-real"); flush();
    m.saveLook("providence"); flush();
    m.saveLook("desert-of-the-real"); flush();
    expect(painted()).toBe("desert-of-the-real");
  });

  it("a page restored from the back/forward cache catches up with what it missed", async () => {
    const m = await fresh();
    seed("matrix", false);
    m.paintTheme({ instant: true });
    store.set("neon1.mode", "dark");   // changed in another tab while this one slept; no event reached it
    events.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(painted()).toBe("plugged");
  });
});

// Keep the unused named imports honest for the type checker without running anything
void [onLookChange, readLook, saveLook, paintTheme, shownTheme, watchTheme];
