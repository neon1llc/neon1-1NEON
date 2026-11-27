// apps/web/src/components/Board.tsx - The workflow board: one column per stage, projects as cards,
// ordered by rank. A card is picked up by holding it, as on Home (half a second, mouse or finger), and the
// slot it will land in shows as a solid outline; a "Move to" menu serves keyboards and screen readers.


import { isBench, isClosed, type Project, type Stage } from "@1neon/domain";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { byRank } from "../lib/hooks.ts";
import { LayerBadge, Standing, stageAge } from "./ui.tsx";


/** A requested move: target stage and the ranks of the neighbours it lands between */
export interface MoveRequest {
  project: Project;
  stageId: string;
  after?: string;
  before?: string;
}


/** The board. Without `onMove` it's read only (viewers and the All clients view) */
export function Board({
  stages,
  projects,
  hrefFor,
  onMove,
  orgName,
}: {
  stages: Stage[];
  projects: Project[];
  hrefFor: (p: Project) => string;
  onMove?: (m: MoveRequest) => void;
  orgName?: (p: Project) => string | undefined;
}) {
  // The card held, how far it has moved, and the slot under the pointer (column, index, height)
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();
  const [slot, setSlot] = useState<{ stageId: string; index: number; h: number }>();
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const held = useRef<{ id: string; x: number; y: number; h: number } | null>(null);
  const pending = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  // A drop is not also a click on the card's link
  const justDropped = useRef(0);
  // Cards in one column, in rank order
  const byStage = (sid: string) => projects.filter((p) => p.stageId === sid).sort(byRank);
  // Hidden stages drop off the board, except while projects are still in them, so no project goes missing
  const visible = stages.filter((s) => !s.hidden || projects.some((p) => p.stageId === s.id));

  // Drop at `idx` among the column's other cards; a drop onto the card's own place is ignored
  const drop = (id: string, stageId: string, idx: number) => {
    const p = projects.find((x) => x.id === id);
    if (!p || !onMove) return;
    const list = byStage(stageId).filter((x) => x.id !== p.id);
    if (p.stageId === stageId && byStage(stageId).findIndex((x) => x.id === p.id) === idx) return;
    onMove({ project: p, stageId, after: list[idx - 1]?.rank, before: list[idx]?.rank });
  };

  // Where the pointer would drop: the column under it, and the first other card whose middle is below it
  const slotAt = (x: number, y: number, id: string) => {
    const col = document.elementsFromPoint(x, y).find((e): e is HTMLElement => e instanceof HTMLElement && Boolean(e.dataset.stage));
    if (!col) return undefined;
    const others = [...col.querySelectorAll<HTMLElement>(".pcard[data-id]")].filter((c) => c.dataset.id !== id);
    const index = others.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return { stageId: col.dataset.stage!, index: index < 0 ? others.length : index };
  };

  const press = (e: React.PointerEvent, id: string) => {
    if (!onMove || e.button !== 0 || (e.target as HTMLElement).closest(".move")) return;
    const card = e.currentTarget as HTMLElement;
    const p = { id, x: e.clientX, y: e.clientY, timer: 0 };
    p.timer = window.setTimeout(() => {
      pending.current = null;
      held.current = { id, x: p.x, y: p.y, h: card.offsetHeight };
      setDragging(id);
      setShift({ x: 0, y: 0 });
      const s0 = slotAt(p.x, p.y, id);
      if (s0) setSlot({ ...s0, h: card.offsetHeight });
      navigator.vibrate?.(8);
    }, 500);
    pending.current = p;
  };

  // Moving and letting go are followed on the window; until the hold starts, moving is scrolling
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (p) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { clearTimeout(p.timer); pending.current = null; }
        return;
      }
      const h = held.current;
      if (!h) return;
      // Near the window's edges the page scrolls, and near the board's sides the board does
      const sc = document.documentElement.classList.contains("body-scrolls") ? document.body : (document.scrollingElement ?? document.documentElement);
      if (e.clientY > innerHeight - 56) sc.scrollTop += 12; else if (e.clientY < 110) sc.scrollTop -= 12;
      const board = document.querySelector<HTMLElement>(".board");
      if (board) {
        const r = board.getBoundingClientRect();
        if (e.clientX > r.right - 40) board.scrollLeft += 14; else if (e.clientX < r.left + 40) board.scrollLeft -= 14;
        // On a phone the board pans both ways inside itself, so near its top or bottom it scrolls too
        if (board.scrollHeight > board.clientHeight) { if (e.clientY > r.bottom - 40) board.scrollTop += 12; else if (e.clientY < r.top + 40) board.scrollTop -= 12; }
      }
      setShift({ x: e.clientX - h.x, y: e.clientY - h.y });
      const s1 = slotAt(e.clientX, e.clientY, h.id);
      setSlot(s1 ? { ...s1, h: h.h } : undefined);
      setOver(s1?.stageId);
    };
    const up = (e: PointerEvent) => {
      const p = pending.current;
      if (p) { clearTimeout(p.timer); pending.current = null; }
      const h = held.current;
      if (!h) return;
      held.current = null;
      const s1 = slotAt(e.clientX, e.clientY, h.id);
      setDragging(undefined); setOver(undefined); setSlot(undefined); setShift({ x: 0, y: 0 });
      justDropped.current = Date.now();
      if (s1 && e.type === "pointerup") drop(h.id, s1.stageId, s1.index);
    };
    // A held finger must not scroll the page instead
    const stop = (e: TouchEvent) => { if (held.current) e.preventDefault(); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    addEventListener("touchmove", stop, { passive: false });
    return () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); removeEventListener("touchmove", stop); };
  });

  // The landing slot, drawn where the card would go
  const ghost = (stageId: string, index: number) => (slot && slot.stageId === stageId && slot.index === index ? <div className="pcard-slot" aria-hidden="true" style={{ height: slot.h }} /> : null);

  return (
    <div className={`board${dragging ? " holding" : ""}`} role="list" aria-label="Workflow board">
      {visible.map((s) => {
        const cards = byStage(s.id);
        // Work-in-progress limits are advice: the count turns amber, nothing is blocked
        const overLimit = s.wipLimit !== undefined && cards.length > s.wipLimit;
        // The column's cards other than the one held, which is where the slot's index counts
        const rest = cards.filter((x) => x.id !== dragging);
        return (
          <section
            key={s.id}
            role="listitem"
            data-tour="board-column"
            className={`col${cards.length || slot?.stageId === s.id ? "" : " empty"}${over === s.id ? " over" : ""}`}
            data-stage={s.id}
            aria-label={`${s.name}, ${cards.length} ${cards.length === 1 ? "project" : "projects"}`}
            title={cards.length ? undefined : `${s.name}: no projects${s.exit ? `. Done when: ${s.exit}` : ""}`}
          >
            {/* Column header: layer, name, and count against its limit */}
            <header>
              <h3><LayerBadge layer={s.layer} /><span className="nm">{s.name}</span></h3>
              <span className={`n${overLimit ? " over" : ""}`} title={s.wipLimit ? `Limit ${s.wipLimit}` : undefined}>
                {cards.length}{s.wipLimit ? `/${s.wipLimit}` : ""}
              </span>
            </header>
            {s.exit && <div className="exit">Done when: {s.exit}</div>}
            {/* Cards are held to move when the board is editable; the held one follows the pointer */}
            {cards.map((p) => (
              <div key={p.id} className="pcard-at">
              {p.id !== dragging && ghost(s.id, rest.indexOf(p))}
              <article
                data-tour="board-card"
                data-id={p.id}
                className={`pcard${dragging === p.id ? " dragging" : ""}${onMove ? " movable" : ""}`}
                style={dragging === p.id ? { transform: `translate(${shift.x}px, ${shift.y}px)` } : undefined}
                onPointerDown={(e) => press(e, p.id)}
                onContextMenu={(e) => { if (onMove) e.preventDefault(); }}
                onClickCapture={(e) => { if (Date.now() - justDropped.current < 400) { e.preventDefault(); e.stopPropagation(); } }}
              >
                {/* Project key, its organization on All clients, name, then where it stands: health and days in
                    stage while open; for a closed project, that it's closed and when, never a health */}
                <div className="k">
                  <span>{p.key}</span>
                  {orgName?.(p) && <span className="tag client">{orgName(p)}</span>}
                  {isBench(p) && <span className="tag">Workbench</span>}
                </div>
                <Link className="name" to={hrefFor(p)}>{p.name}</Link>
                <div className="meta">
                  <Standing health={p.health} closed={isClosed(stages, s.id)} since={p.stageEnteredAt} />
                  {!isClosed(stages, s.id) && <span title={`Time in ${s.name}`}>{stageAge(p.stageEnteredAt)} in {s.name}</span>}
                </div>
                {/* Keyboard, tap, and screen-reader path: the same moves as dragging. Up and down reorder within
                    the column (AP-06); another stage moves the card to the end of that column */}
                {onMove && (
                  <label className="move">
                    <span className="sr">Move {p.key} to</span>
                    <select
                      value=""
                      onChange={(e) => {
                        const to = e.target.value;
                        if (!to) return;
                        const at = cards.findIndex((x) => x.id === p.id);
                        if (to === "__up" || to === "__down") {
                          // Up: between the two cards above; down: between the two below
                          const rest = cards.filter((x) => x.id !== p.id);
                          const idx = to === "__up" ? at - 1 : at + 1;
                          onMove({ project: p, stageId: s.id, after: rest[idx - 1]?.rank, before: rest[idx]?.rank });
                          return;
                        }
                        const list = byStage(to).filter((x) => x.id !== p.id);
                        onMove({ project: p, stageId: to, after: list.at(-1)?.rank });
                      }}
                    >
                      <option value="">Move to…</option>
                      {cards.findIndex((x) => x.id === p.id) > 0 && <option value="__up">Up one in {s.name}</option>}
                      {cards.findIndex((x) => x.id === p.id) < cards.length - 1 && <option value="__down">Down one in {s.name}</option>}
                      {stages.filter((x) => !x.hidden && x.id !== s.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </label>
                )}
              </article>
              </div>
            ))}
            {ghost(s.id, rest.length)}
            {cards.length === 0 && slot?.stageId !== s.id && <p className="muted small none" style={{ padding: "4px" }}>No projects here.</p>}
          </section>
        );
      })}
    </div>
  );
}
