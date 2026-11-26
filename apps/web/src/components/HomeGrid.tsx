// apps/web/src/components/HomeGrid.tsx - Home's cards on a grid (12 columns, 4 on a phone) that can be
// arranged: in Arrange mode each card moves by its grip and resizes from its corner, with the cells it
// will land on highlighted while it's held (gridstack.js and react-grid-layout's placeholder). A resize
// follows the pointer through the in-between sizes and settles on the card's nearest preset, as iOS
// widgets do; the size chips jump straight to one. Arrow keys on the grip move a card a cell at a time.


import { GripVertical, EyeOff } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { compact, move, presetOf, sizeAt, snap, SIZE_LABEL, type Breakpoint, type Cell, type Size } from "../lib/homeGrid.ts";


/** One card as the grid shows it: its body takes the preset it sits at, or the nearest one */
export interface Tile { id: string; title: string; sizes: Size[]; body: (size: string) => ReactNode }

type Hold = { id: string; mode: "move" | "size"; x0: number; y0: number; top0: number; origin: Cell; dx: number; dy: number; target: Cell; preview: Cell[] };

/** The preset whose view suits a size between presets: width counts three times height */
const viewOf = (c: Pick<Cell, "w" | "h">, sizes: { key: string; w: number; h: number }[]) =>
  sizes.reduce((best, s) => ((3 * (s.w - c.w)) ** 2 + (s.h - c.h) ** 2 < (3 * (best.w - c.w)) ** 2 + (best.h - c.h) ** 2 ? s : best)).key;

// Less motion from the device or the profile's "Reduced"
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";


export function HomeGrid({ tiles, cells, bp, arranging, onChange, onHide, onFit }: {
  tiles: Tile[]; cells: Cell[]; bp: Breakpoint; arranging: boolean;
  onChange: (cells: Cell[]) => void; onHide: (id: string) => void;
  // Each card's content height in whole rows, reported as it changes, so no card is ever cut short
  onFit?: (rows: Record<string, number>) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [said, say] = useState("");
  const shown = hold?.preview ?? cells;
  const cols = bp === "wide" ? 12 : 4;
  const sizesOf = (t: Tile) => t.sizes.map((k) => sizeAt(k, bp));
  const label = (k: string) => SIZE_LABEL[k] ?? k;

  // One cell's step in pixels (track plus gap), read from the grid as laid out
  const step = () => {
    const el = grid.current!;
    const cs = getComputedStyle(el);
    const gap = parseFloat(cs.columnGap) || 0;
    const rowH = parseFloat(cs.gridAutoRows) || 72;
    const colW = (el.clientWidth - gap * (cols - 1)) / cols;
    return { x: colW + gap, y: rowH + (parseFloat(cs.rowGap) || 0), gap, colW, rowH };
  };

  // Cards that shift while another is held glide to their new place (FLIP), unless motion is reduced
  const rects = useRef(new Map<string, { left: number; top: number }>());
  const fitted = useRef(new Map<string, { h: number; at: number[] }>());
  // A card's content can grow on its own (a form opens, a list loads): watch it and measure again
  const [, bump] = useState(0);
  const watched = useRef(new WeakSet<Element>());
  const ro = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    ro.current = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => bump((n) => n + 1)); });
    return () => { cancelAnimationFrame(frame); ro.current?.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    // Places are kept relative to the grid, so scrolling the page (or the body, on a phone) is never
    // mistaken for a card moving
    const g = el.getBoundingClientRect();
    const next = new Map<string, { left: number; top: number }>();
    for (const node of el.querySelectorAll<HTMLElement>(".tile[data-id]")) {
      const id = node.dataset.id!;
      const b = node.getBoundingClientRect();
      const r = { left: b.left - g.left, top: b.top - g.top };
      next.set(id, r);
      const was = rects.current.get(id);
      if (!was || id === hold?.id || still()) continue;
      const dx = was.left - r.left, dy = was.top - r.top;
      // A jump bigger than a screen is a relayout, not a move worth watching
      if ((!dx && !dy) || Math.abs(dx) > innerWidth || Math.abs(dy) > innerHeight) continue;
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.28, .11, .32, 1)" });
    }
    rects.current = next;
    // Content height: the card at its natural height (let go of the cell for one synchronous read)
    if (!onFit || hold) return;
    const s = step();
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
      const h = Math.min(40, Math.max(2, Math.ceil((natural + s.gap) / s.y)));
      // Reported only when it changes, and at most a few times a second, so a fit can never chase itself
      const was = fitted.current.get(id);
      const now = performance.now();
      const recent = (was?.at ?? []).filter((t) => now - t < 2000);
      if (was?.h !== h && recent.length < 6) { rows[id] = h; fitted.current.set(id, { h, at: [...recent, now] }); }
    }
    if (Object.keys(rows).length) onFit(rows);
  });

  const begin = (e: React.PointerEvent, id: string, mode: Hold["mode"]) => {
    if (e.button !== 0) return;
    const origin = cells.find((c) => c.id === id);
    if (!origin) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHold({ id, mode, x0: e.clientX, y0: e.clientY, top0: grid.current!.getBoundingClientRect().top, origin, dx: 0, dy: 0, target: origin, preview: cells });
  };

  const drag = (e: React.PointerEvent) => {
    if (!hold) return;
    // Near the window's top or bottom edge the page scrolls, so a card can travel past what's in view.
    // The scroller is the body when the shell says so (html.body-scrolls), else the document
    const scroller = document.documentElement.classList.contains("body-scrolls") ? document.body : (document.scrollingElement ?? document.documentElement);
    if (e.clientY > innerHeight - 56) scroller.scrollTop += 14;
    else if (e.clientY < 120) scroller.scrollTop -= 14;
    const s = step();
    const dx = e.clientX - hold.x0;
    // The page's scroll since the press counts as movement too
    const dy = e.clientY - hold.y0 + (hold.top0 - grid.current!.getBoundingClientRect().top);
    let target: Cell;
    if (hold.mode === "move") {
      // Never past the last card's bottom: a card dropped lower would only pack back up
      const floor = Math.max(0, ...cells.filter((c) => c.id !== hold.id).map((c) => c.y + c.h));
      target = { ...hold.origin, x: Math.round(hold.origin.x + dx / s.x), y: Math.min(floor, Math.max(0, Math.round(hold.origin.y + dy / s.y))) };
    } else {
      const t = tiles.find((x) => x.id === hold.id)!;
      const p = snap(hold.origin.w + dx / s.x, hold.origin.h + dy / s.y, sizesOf(t));
      target = { ...hold.origin, w: p.w, h: p.h };
    }
    const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    if (same(target, hold.target) || (hold.mode === "move" && same(target, { ...hold.target, x: Math.max(0, Math.min(cols - target.w, target.x)) }))) {
      setHold({ ...hold, dx, dy });
      return;
    }
    const preview = move(cells, hold.id, target, cols);
    setHold({ ...hold, dx, dy, target: preview.find((c) => c.id === hold.id)!, preview });
  };

  const end = () => {
    if (!hold) return;
    const done = compact(hold.preview);
    const t = tiles.find((x) => x.id === hold.id);
    const n = done.find((c) => c.id === hold.id)!;
    setHold(null);
    if (JSON.stringify(done) !== JSON.stringify(cells)) {
      onChange(done);
      if (t) say(hold.mode === "move" ? `${t.title}: column ${n.x + 1}, row ${n.y + 1}` : `${t.title}: ${label(presetOf(n, sizesOf(t)) ?? "").toLowerCase()}`);
    }
  };

  // Keyboard: arrows move the card one cell; the change is read out
  const key = (e: React.KeyboardEvent, t: Tile) => {
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

  const resizeTo = (t: Tile, k: Size) => {
    const s = sizeAt(k, bp);
    onChange(compact(move(cells, t.id, { w: s.w, h: s.h }, cols)));
    say(`${t.title}: ${label(k.key).toLowerCase()}`);
  };

  const s = hold ? step() : undefined;
  return (
    <div ref={grid} className={`hg${arranging ? " arranging" : ""}${hold ? " holding" : ""}`} data-bp={bp} onPointerMove={drag} onPointerUp={end} onPointerCancel={end}>
      {tiles.map((t) => {
        const c = shown.find((x) => x.id === t.id);
        if (!c) return null;
        const held = hold?.id === t.id;
        // The held card stays where it was picked up and follows the pointer; others take the preview
        const at = held ? hold!.origin : c;
        // A card between presets shows the view of the nearest preset, judged mostly by width, since width
        // decides how much fits on a line
        const sized = held ? hold!.target : c;
        const size = presetOf(sized, sizesOf(t)) ?? viewOf(sized, sizesOf(t));
        const style: React.CSSProperties = { gridColumn: `${at.x + 1} / span ${at.w}`, gridRow: `${at.y + 1} / span ${at.h}` };
        if (held && hold!.mode === "move") style.transform = `translate(${hold!.dx}px, ${hold!.dy}px)`;
        if (held && hold!.mode === "size" && s) {
          // Free while held, never under one cell or past the grid's edge
          style.width = Math.min(grid.current!.clientWidth - at.x * s.x, Math.max(s.colW, at.w * s.x - s.gap + hold!.dx));
          style.height = Math.max(s.rowH, at.h * s.y - s.gap + hold!.dy);
          style.justifySelf = "start";
          style.alignSelf = "start";
        }
        // The size button lit is the card's nominal preset; its height may have grown to fit its content
        const cur = presetOf(c, sizesOf(t)) ?? viewOf(c, sizesOf(t));
        return (
          <div key={t.id} className={`tile${held ? " held" : ""}`} data-id={t.id} data-size={size ?? ""} style={style}>
            <div className="tile-body" inert={arranging || undefined}>{t.body(size)}</div>
            {arranging && (
              <div className="tile-bar">
                <button type="button" className="tile-grip" aria-label={`Move ${t.title}`} title="Drag, or use the arrow keys" onPointerDown={(e) => begin(e, t.id, "move")} onKeyDown={(e) => key(e, t)}><GripVertical size={16} aria-hidden="true" /></button>
                {t.sizes.length > 1 && (
                  <span className="tile-sizes" role="group" aria-label={`${t.title} size`}>
                    {/* Each chip draws its shape, like the size picker on an iOS widget */}
                    {t.sizes.map((k) => <button key={k.key} type="button" aria-pressed={cur === k.key} aria-label={label(k.key)} title={label(k.key)} onClick={() => resizeTo(t, k)}><i style={{ width: 4 + k.w * 1.5, height: 3 + k.h * 1.1 }} /></button>)}
                  </span>
                )}
                <button type="button" className="tile-hide" aria-label={`Hide ${t.title}`} title="Hide" onClick={() => onHide(t.id)}><EyeOff size={15} aria-hidden="true" /></button>
              </div>
            )}
            {arranging && t.sizes.length > 1 && <span className="tile-corner" aria-hidden="true" onPointerDown={(e) => begin(e, t.id, "size")} />}
          </div>
        );
      })}
      {/* The cells the held card will take */}
      {hold && <div className="tile-ghost" aria-hidden="true" style={{ gridColumn: `${hold.target.x + 1} / span ${hold.target.w}`, gridRow: `${hold.target.y + 1} / span ${hold.target.h}` }} />}
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  );
}
