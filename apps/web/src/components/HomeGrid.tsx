// apps/web/src/components/HomeGrid.tsx - Home's cards on a grid (12 columns, 4 on a phone), laid out the
// way react-grid-layout does it: each card absolutely placed by a transform, so cards that make room glide
// there by CSS transition and never jitter. In Arrange mode a card is picked up by holding it (about half
// a second, as iOS and Android long-press), resized from its right edge, bottom edge, or corner, and set
// to a preset from its gear bar. A resize is free in whole cells and pulled onto a preset when close; the
// cells it will take show solid on a preset and dashed between. Arrow keys move a focused card a cell.


import { EyeOff, Settings } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { compact, move, presetOf, resizeTo, SIZE_LABEL, viewFor, type Breakpoint, type Cell, type Size } from "../lib/homeGrid.ts";


/** What a card holds, by kind: urgent (red), suggested (amber), general (green) */
export interface Counts { urgent: number; suggested: number; general: number }

/** One card as the grid shows it: its body takes the preset its size shows (homeGrid.ts viewFor) */
// fit: the card hasn't been given a size, so it is as tall as its content, not stretched to whole grid rows
export interface Tile { id: string; title: string; sizes: Size[]; counts?: Counts; fit?: boolean; body: (view: string) => ReactNode }

type Hold = { id: string; mode: "move" | "w" | "h" | "wh"; x0: number; y0: number; top0: number; origin: Cell; dx: number; dy: number; target: Cell; preset?: string; preview: Cell[] };

// Long-press length; a finger that travels farther than SLOP first is scrolling, not picking up
const HOLD_MS = 500;
const SLOP = 8;

// Less motion from the device or the profile's "Reduced"
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";
// The page's scroller: the body when the shell says so (html.body-scrolls), else the document
const scroller = () => (document.documentElement.classList.contains("body-scrolls") ? document.body : (document.scrollingElement ?? document.documentElement));


/** The counts as pills, only for kinds with something in them */
export function CountPills({ counts, className = "" }: { counts?: Counts; className?: string }) {
  if (!counts || !(counts.urgent || counts.suggested || counts.general)) return null;
  return (
    <span className={`cpills ${className}`}>
      {counts.urgent > 0 && <span className="cpill urgent" title={`${counts.urgent} urgent`}>{counts.urgent}</span>}
      {counts.suggested > 0 && <span className="cpill suggested" title={`${counts.suggested} suggested`}>{counts.suggested}</span>}
      {counts.general > 0 && <span className="cpill general" title={`${counts.general} to know`}>{counts.general}</span>}
    </span>
  );
}


export function HomeGrid({ tiles, cells, bp, arranging, onChange, onHide, onFit }: {
  tiles: Tile[]; cells: Cell[]; bp: Breakpoint; arranging: boolean;
  onChange: (cells: Cell[]) => void; onHide: (id: string) => void;
  // Each card's content height in whole rows, reported as it changes, so no card is ever cut short
  onFit?: (rows: Record<string, number>) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hold, setHold] = useState<Hold | null>(null);
  const holdRef = useRef<Hold | null>(null);
  holdRef.current = hold;
  const [pressing, setPressing] = useState<string | null>(null);
  const [cfg, setCfg] = useState<string | null>(null);
  const [cfgW, setCfgW] = useState(0);
  const [said, say] = useState("");
  const cols = bp === "wide" ? 12 : 4;
  const shown = hold?.preview ?? cells;
  // A tile carries the presets for the grid it is on (Workspace picks wide or phone)
  const sizesOf = (t: Tile) => t.sizes;
  const label = (k: string) => SIZE_LABEL[k] ?? k;

  // The grid's width, kept current; cells are sized from it
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const css = grid.current ? getComputedStyle(grid.current) : undefined;
  const gap = parseFloat(css?.columnGap ?? "") || 16;
  const rowH = parseFloat(css?.getPropertyValue("--row") ?? "") || 24;
  const colW = width ? (width - gap * (cols - 1)) / cols : 0;
  const sx = colW + gap, sy = rowH + gap;
  const px = (c: Pick<Cell, "x" | "y" | "w" | "h">) => ({ x: c.x * sx, y: c.y * sy, w: c.w * sx - gap, h: c.h * sy - gap });

  // A card's content can grow on its own (a form opens, a list loads): watch it and measure again
  const [, bump] = useState(0);
  const watched = useRef(new WeakSet<Element>());
  const ro = useRef<ResizeObserver | null>(null);
  const fitted = useRef(new Map<string, { h: number; at: number[] }>());
  useLayoutEffect(() => {
    let frame = 0;
    ro.current = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => bump((n) => n + 1)); });
    return () => { cancelAnimationFrame(frame); ro.current?.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el || !onFit || hold || !width) return;
    const rows: Record<string, number> = {};
    for (const node of el.querySelectorAll<HTMLElement>(".tile[data-id]")) {
      const id = node.dataset.id!;
      // A body can hold more than one card (Next step and its request form): measure them all, stacked
      const body = node.querySelector<HTMLElement>(".tile-body");
      const parts = body ? [...body.children].filter((k): k is HTMLElement => k instanceof HTMLElement && k.tagName !== "DIALOG") : [];
      if (!body || !parts.length) continue;
      for (const part of parts) for (const k of [part, ...part.children]) if (!watched.current.has(k)) { watched.current.add(k); ro.current?.observe(k); }
      body.classList.add("measuring");
      const natural = body.scrollHeight;
      body.classList.remove("measuring");
      const h = Math.min(40, Math.max(2, Math.ceil((natural + gap) / sy)));
      // Reported only when it changes, and at most a few times a second, so a fit can never chase itself
      const was = fitted.current.get(id);
      const now = performance.now();
      const recent = (was?.at ?? []).filter((t) => now - t < 2000);
      if (was?.h === h) continue;
      if (recent.length < 6) { rows[id] = h; fitted.current.set(id, { h, at: [...recent, now] }); }
      // Held back for now: look again shortly, so the last change still lands
      else window.setTimeout(() => bump((n) => n + 1), 600);
    }
    if (Object.keys(rows).length) onFit(rows);
  });

  // While a card is held, a finger on a phone must not scroll the page instead (non-passive, so it can
  // be stopped; until the hold starts, swipes scroll as usual)
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (holdRef.current || pendingRef.current?.armed) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  // Picking up: a press on a card starts a timer; moving away first cancels it (that was a scroll)
  const pendingRef = useRef<{ id: string; x: number; y: number; timer: number; armed: boolean } | null>(null);
  const start = (id: string, mode: Hold["mode"], x: number, y: number) => {
    const origin = cells.find((c) => c.id === id);
    if (!origin || !grid.current) return;
    setPressing(null);
    setCfg(null);
    setHold({ id, mode, x0: x, y0: y, top0: grid.current.getBoundingClientRect().top, origin, dx: 0, dy: 0, target: origin, preview: cells });
    if (mode === "move") navigator.vibrate?.(8);
  };
  const press = (e: React.PointerEvent, id: string) => {
    if (!arranging || e.button !== 0 || (e.target as HTMLElement).closest(".tile-cfg, .tile-edge")) return;
    const p = { id, x: e.clientX, y: e.clientY, armed: false, timer: 0 };
    p.timer = window.setTimeout(() => { p.armed = true; start(id, "move", p.x, p.y); }, HOLD_MS);
    pendingRef.current = p;
    setPressing(id);
  };
  const edge = (e: React.PointerEvent, id: string, mode: Hold["mode"]) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    start(id, mode, e.clientX, e.clientY);
  };

  // Moving and letting go are followed on the window, so a fast drag never slips off its card
  useEffect(() => {
    const moveFn = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (p && !p.armed) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) { clearTimeout(p.timer); pendingRef.current = null; setPressing(null); }
        return;
      }
      const h = holdRef.current;
      if (!h || !grid.current) return;
      // Near the window's top or bottom edge the page scrolls, so a card can travel past what's in view
      const sc = scroller();
      if (e.clientY > innerHeight - 56) sc.scrollTop += 14;
      else if (e.clientY < 120) sc.scrollTop -= 14;
      const dx = e.clientX - h.x0;
      // The page's scroll since the press counts as movement too
      const dy = e.clientY - h.y0 + (h.top0 - grid.current.getBoundingClientRect().top);
      const t = tiles.find((x) => x.id === h.id)!;
      let target: Cell;
      let preset: string | undefined;
      if (h.mode === "move") {
        // Never past the last card's bottom: a card dropped lower would only pack back up
        const floor = Math.max(0, ...cells.filter((c) => c.id !== h.id).map((c) => c.y + c.h));
        target = { ...h.origin, x: Math.round(h.origin.x + dx / sx), y: Math.min(floor, Math.max(0, Math.round(h.origin.y + dy / sy))) };
      } else {
        const r = resizeTo(h.origin.w + (h.mode === "h" ? 0 : dx / sx), h.origin.h + (h.mode === "w" ? 0 : dy / sy), sizesOf(t), cols - h.origin.x);
        target = { ...h.origin, w: r.w, h: r.h };
        preset = r.preset;
      }
      const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
      if (same(target, h.target)) { setHold({ ...h, dx, dy }); return; }
      const preview = move(cells, h.id, target, cols);
      setHold({ ...h, dx, dy, preset, target: preview.find((c) => c.id === h.id)!, preview });
    };
    const up = () => {
      const p = pendingRef.current;
      if (p) { clearTimeout(p.timer); pendingRef.current = null; setPressing(null); }
      const h = holdRef.current;
      if (!h) return;
      const done = compact(h.preview);
      setHold(null);
      if (JSON.stringify(done) !== JSON.stringify(cells)) {
        onChange(done);
        const t = tiles.find((x) => x.id === h.id);
        const n = done.find((c) => c.id === h.id)!;
        if (t) say(h.mode === "move" ? `${t.title}: column ${n.x + 1}, row ${n.y + 1}` : `${t.title}: ${n.w} by ${n.h}`);
      }
    };
    addEventListener("pointermove", moveFn);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => { removeEventListener("pointermove", moveFn); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
  });

  // Keyboard: on a focused card in Arrange mode, arrows move it one cell; the change is read out
  const key = (e: React.KeyboardEvent, t: Tile) => {
    if (!arranging || e.target !== e.currentTarget) return;
    const c = cells.find((x) => x.id === t.id);
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!c || !d) return;
    e.preventDefault();
    // Down lands below the card underneath; up lands above the one overhead
    const y = d[1] === -1 ? Math.max(0, c.y - 1) : d[1] === 1 ? c.y + c.h : c.y;
    const next = compact(move(cells, t.id, { x: c.x + d[0], y }, cols));
    onChange(next);
    const n = next.find((x) => x.id === t.id)!;
    say(`${t.title}: column ${n.x + 1}, row ${n.y + 1}`);
  };

  const setSize = (t: Tile, k: Size) => {
    onChange(compact(move(cells, t.id, { w: k.w, h: k.h }, cols)));
    say(`${t.title}: ${label(k.key).toLowerCase()}`);
  };

  const bottom = Math.max(0, ...shown.map((c) => c.y + c.h));
  return (
    <div ref={grid} className={`hg${arranging ? " arranging" : ""}${hold ? " holding" : ""}${still() ? " still" : ""}`} data-bp={bp} style={{ height: bottom ? bottom * sy - gap : 0 }}>
      {/* The cells the held card will take: solid on a preset, dashed between */}
      {hold && width > 0 && (() => {
        const g = px(hold.target);
        const t = tiles.find((x) => x.id === hold.id);
        const onPreset = hold.mode === "move" || Boolean(hold.preset) || Boolean(t && presetOf(hold.target, sizesOf(t)));
        return <div className={`tile-ghost${onPreset ? " preset" : ""}`} aria-hidden="true" style={{ width: g.w, height: g.h, transform: `translate(${g.x}px, ${g.y}px)` }} />;
      })()}
      {width > 0 && tiles.map((t) => {
        const c = shown.find((x) => x.id === t.id);
        if (!c) return null;
        const held = hold?.id === t.id;
        // The held card stays where it was picked up and follows the pointer; others glide to the preview
        const at = px(held ? hold!.origin : c);
        let w = at.w, h = at.h, x = at.x, y = at.y;
        if (held && hold!.mode === "move") { x += hold!.dx; y += hold!.dy; }
        if (held && hold!.mode !== "move") {
          if (hold!.mode !== "h") w = Math.min(width - at.x, Math.max(colW, at.w + hold!.dx));
          if (hold!.mode !== "w") h = Math.max(rowH, at.h + hold!.dy);
        }
        const view = viewFor(held ? hold!.target : c, sizesOf(t));
        const cur = presetOf(c, sizesOf(t)) ?? viewFor(c, sizesOf(t));
        const open = cfg === t.id;
        return (
          <div key={t.id} className={`tile${held ? " held" : ""}${pressing === t.id ? " pressing" : ""}${t.fit ? " fit" : ""}`} data-id={t.id} data-size={view}
            style={{ width: w, height: h, transform: `translate(${x}px, ${y}px)` }}
            tabIndex={arranging ? 0 : undefined} role={arranging ? "group" : undefined}
            aria-label={arranging ? `${t.title}. Hold to move, or use the arrow keys` : undefined}
            onPointerDown={(e) => press(e, t.id)} onKeyDown={(e) => key(e, t)} onContextMenu={(e) => arranging && e.preventDefault()}>
            <div className="tile-body" inert={arranging || undefined}>{t.body(view)}</div>
            <CountPills counts={t.counts} className="tile-counts" />
            {arranging && (
              <>
                {/* The card's own bar: closed to a gear; open, its preset sizes and hide */}
                <div className={`tile-cfg${open ? " open" : ""}`}>
                  {/* Its width opens to the measured width of its contents, on the gear's own clock, so the two
                      start and finish together */}
                  <div className="tile-cfg-items" aria-hidden={!open} inert={!open || undefined} style={{ width: open ? cfgW : 0 }}>
                    <span className="tile-sizes" role="group" aria-label={`${t.title} size`}>
                      {/* Each size button draws its shape, like the size picker on an iOS widget */}
                      {t.sizes.map((k) => <button key={k.key} type="button" aria-pressed={cur === k.key} aria-label={label(k.key)} title={label(k.key)} onClick={() => setSize(t, k)}><i style={{ width: 4 + k.w * 1.5, height: 3 + k.h * 0.8 }} /></button>)}
                    </span>
                    <button type="button" className="tile-hide" aria-label={`Hide ${t.title}`} title="Hide" onClick={() => { setCfg(null); onHide(t.id); }}><EyeOff size={16} aria-hidden="true" /></button>
                  </div>
                  <button type="button" className="tile-gear" aria-expanded={open} aria-label={`${t.title} options`} onClick={(e) => {
                    const items = (e.currentTarget.parentElement?.querySelector(".tile-cfg-items") as HTMLElement | null);
                    if (!open && items) setCfgW(items.scrollWidth);
                    setCfg(open ? null : t.id);
                  }}><Settings size={18} aria-hidden="true" /></button>
                </div>
                <span className="tile-edge e-w" aria-hidden="true" onPointerDown={(e) => edge(e, t.id, "w")} />
                <span className="tile-edge e-h" aria-hidden="true" onPointerDown={(e) => edge(e, t.id, "h")} />
                <span className="tile-edge e-wh" aria-hidden="true" onPointerDown={(e) => edge(e, t.id, "wh")} />
              </>
            )}
          </div>
        );
      })}
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  );
}
