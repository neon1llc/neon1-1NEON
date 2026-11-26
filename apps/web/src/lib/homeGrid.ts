// apps/web/src/lib/homeGrid.ts - Home's card grid as data: where each card sits (column, row, width,
// height in cells), packing cards upward with no gaps (react-grid-layout's vertical compaction),
// moving one card and pushing the cards it lands on, and snapping a free size to a card's nearest preset
// (iOS widget sizes). Pure, so it's tested without a browser.


/** One card's place on the grid, in cells */
export interface Cell { id: string; x: number; y: number; w: number; h: number }
/** A preset size: its name and its cells on the wide grid (each card has its own set) */
export interface Size { key: string; w: number; h: number }

/** The grid's two widths: 12 columns when there's room, 4 on a phone */
export type Breakpoint = "wide" | "narrow";
export const COLS: Record<Breakpoint, number> = { wide: 12, narrow: 4 };

// What each preset is called on its chip and to a screen reader
export const SIZE_LABEL: Record<string, string> = { S: "Small", M: "Medium", T: "Tall", L: "Large", W: "Wide", B: "Bar" };

/** A preset as cells at this breakpoint. A phone maps the width (up to a quarter of the wide grid becomes
 * half the phone, anything wider the whole phone) and gives text more height, since it wraps more */
export function sizeAt(s: Size, bp: Breakpoint): Size {
  if (bp === "wide") return s;
  const half = s.w <= 3;
  return { key: s.key, w: half ? 2 : 4, h: Math.ceil(s.h * (half ? 1.25 : 1.4)) };
}

/** The preset a cell's size is, if any */
export const presetOf = (c: Pick<Cell, "w" | "h">, sizes: Size[]) => sizes.find((s) => s.w === c.w && s.h === c.h)?.key;

const overlaps = (a: Cell, b: Cell) => a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Pack every card as high as it can go, keeping the reading order (row, then column). `fixed` stays put */
export function compact(cells: Cell[], fixed?: string): Cell[] {
  const order = [...cells].sort((a, b) => (a.id === fixed ? -1 : b.id === fixed ? 1 : a.y - b.y || a.x - b.x));
  const placed: Cell[] = [];
  for (const c of order) {
    const n = { ...c };
    if (n.id !== fixed) {
      n.y = 0;
      // Down from the top until nothing placed is in the way
      while (placed.some((p) => overlaps(n, p))) n.y++;
    }
    placed.push(n);
  }
  return cells.map((c) => placed.find((p) => p.id === c.id)!);
}

/** Put one card at a new place and size: whatever it lands on moves below it, then all packs upward */
export function move(cells: Cell[], id: string, to: Partial<Omit<Cell, "id">>, cols: number): Cell[] {
  const cur = cells.find((c) => c.id === id);
  if (!cur) return cells;
  const w = Math.max(1, Math.min(cols, to.w ?? cur.w));
  const n: Cell = { id, w, h: Math.max(1, to.h ?? cur.h), x: Math.max(0, Math.min(cols - w, to.x ?? cur.x)), y: Math.max(0, to.y ?? cur.y) };
  // The moved card wins its spot; what it lands on drops below it and everything packs around it
  const rest = cells.filter((c) => c.id !== id).map((c) => (overlaps(c, n) ? { ...c, y: n.y + n.h } : c));
  return compact([n, ...rest], id);
}

/** The preset nearest a free size, by distance in cells; ties go to the smaller */
export function snap(w: number, h: number, sizes: Size[]): Size {
  let best = sizes[0]!;
  let gap = Infinity;
  for (const s of sizes) {
    const d = (s.w - w) ** 2 + (s.h - h) ** 2;
    if (d < gap || (d === gap && s.w * s.h < best.w * best.h)) { best = s; gap = d; }
  }
  return best;
}

/** Fill a grid in reading order: each card at the first place it fits (the default layout, and new cards) */
export function flow(cards: { id: string; w: number; h: number }[], cols: number, start: Cell[] = []): Cell[] {
  const placed = [...start];
  for (const c of cards) {
    const w = Math.min(cols, c.w);
    let spot: Cell | undefined;
    for (let y = 0; !spot; y++) {
      for (let x = 0; x + w <= cols; x++) {
        const t = { id: c.id, x, y, w, h: c.h };
        if (!placed.some((p) => overlaps(t, p))) { spot = t; break; }
      }
    }
    placed.push(spot);
  }
  return placed;
}

/** A saved layout for the cards shown now: saved places kept (clamped to the grid), new cards added where
 * they first fit, all packed upward */
export function reconcile(saved: Cell[] | undefined, cards: { id: string; w: number; h: number }[], cols: number): Cell[] {
  const ids = new Set(cards.map((c) => c.id));
  const kept = (saved ?? []).filter((c) => ids.has(c.id)).map((c) => {
    const w = Math.min(cols, c.w);
    return { ...c, w, x: Math.max(0, Math.min(c.x, cols - w)) };
  });
  const fresh = cards.filter((c) => !kept.some((k) => k.id === c.id));
  return compact(flow(fresh, cols, compact(kept)));
}

/** A free size while resizing: whole cells within the grid, pulled onto a preset when within about a
 * cell of one (a magnet, so presets are easy to hit). `preset` names it when it lands on one */
export function resizeTo(w: number, h: number, sizes: Size[], cols: number): { w: number; h: number; preset?: string } {
  const min = sizes.reduce((m, s) => ({ w: Math.min(m.w, s.w), h: Math.min(m.h, s.h) }), { w: Infinity, h: Infinity });
  const fw = Math.max(Math.min(min.w, 2), Math.min(cols, Math.round(w)));
  const fh = Math.max(Math.min(min.h, 2), Math.round(h));
  const near = sizes.find((s) => Math.abs(s.w - w) <= 0.75 && Math.abs(s.h - h) <= 1.5);
  return near ? { w: near.w, h: near.h, preset: near.key } : { w: fw, h: fh };
}

/** The preset whose layout a size shows. Width decides it (how much fits on a line): the widest preset
 * that fits; among presets that wide, the tallest that fits, else the shortest. Height alone never drops a
 * card to a smaller layout, so a card fitted to its content keeps the layout it was given */
export function viewFor(c: Pick<Cell, "w" | "h">, sizes: Size[]): string {
  const byW = [...sizes].sort((a, b) => a.w - b.w);
  const w = [...byW].reverse().find((s) => s.w <= c.w)?.w ?? byW[0]!.w;
  const same = sizes.filter((s) => s.w === w).sort((a, b) => a.h - b.h);
  return ([...same].reverse().find((s) => s.h <= c.h) ?? same[0]!).key;
}

/** Tidy up: the same cards and sizes, repacked in priority order (urgent first, then by size) with no gaps */
export function tidy(cells: Cell[], rank: (id: string) => number, cols: number): Cell[] {
  const order = [...cells].sort((a, b) => rank(a.id) - rank(b.id) || b.w * b.h - a.w * a.h);
  const out = flow(order.map((c) => ({ id: c.id, w: c.w, h: c.h })), cols);
  return compact(out);
}
