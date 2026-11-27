// apps/web/src/pages/Lenses.tsx - Ways to look at one project, for people who think differently: the
// shared Page (write it down), the Board (move cards), the Timeline (plan by dates), and NEON's Steps
// (in Project.tsx). Every lens shows the same items, files, and decisions, so switching loses nothing;
// what's waiting on someone (the quote, the approval, the handover) shows above every lens the same
// way. References: Notion's and Asana's views over one set of rows, Basecamp's Docs and Schedule,
// Trello's board, Linear's project page with its document.


import { RECORD_KINDS, todayIn, type Item, type ItemKind, type Project } from "@1neon/domain";
import { CalendarDays, FileText, Kanban, ListChecks, Plus } from "lucide-react";
import { useState, type DragEvent } from "react";
import { NavLink } from "react-router";
import { ItemPanel, STATUS_WORDS } from "../components/ItemPanel.tsx";
import { PageEditor } from "../components/PageEditor.tsx";
import { pagesPath } from "../components/Write.tsx";
import { useOrg } from "../components/Shell.tsx";
import { Avatar, dateLabel, useToast } from "../components/ui.tsx";
import { api, HttpError } from "../lib/api.ts";
import { problem, useMembers, useRefresh } from "../lib/hooks.ts";
import { prefs } from "../lib/prefs.ts";


/** The four lenses, in the order the switch shows them */
export const LENSES = [
  { id: "page", label: "Page", hint: "Write it down", icon: FileText },
  { id: "board", label: "Board", hint: "Move cards", icon: Kanban },
  { id: "timeline", label: "Timeline", hint: "Plan by dates", icon: CalendarDays },
  { id: "steps", label: "Steps", hint: "Follow NEON", icon: ListChecks },
] as const;
export type Lens = (typeof LENSES)[number]["id"];

// A person's own lens for a project, remembered in this browser
const mine = (pid: string) => `lens:${pid}`;

/** The lens a project opens on: this person's last choice, else the project's, else its workflow's */
export function lensFor(p: Project): Lens {
  const own = prefs.get(mine(p.id));
  if (own && LENSES.some((l) => l.id === own)) return own as Lens;
  return p.lens ?? (p.workflow === "bench" ? "page" : "steps");
}

/** Remember a person's lens for a project */
export function keepLens(pid: string, lens: Lens) {
  prefs.set(mine(pid), lens);
}


/** The lens switch: four links, the current one lit. Steps opens NEON's Overview */
export function LensBar({ base, current, pid }: { base: string; current: Lens; pid: string }) {
  return (
    <nav className="lens-bar" aria-label="Look at this project as" data-tour="lenses">
      {LENSES.map((l) => {
        const Icon = l.icon;
        const to = l.id === "steps" ? `${base}/overview` : `${base}/${l.id}`;
        return (
          <NavLink key={l.id} to={to} className={current === l.id ? "on" : ""} aria-current={current === l.id ? "page" : undefined} title={l.hint} onClick={() => keepLens(pid, l.id)}>
            <Icon size={16} aria-hidden="true" /><span>{l.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}


/** The project's shared page, open in place */
export function PageLens({ project: p }: { project: Project }) {
  const { org, canWrite } = useOrg();
  return (
    <section className="lens-page" aria-label="Project page">
      <PageEditor path={`${pagesPath(org.id, p.id)}/main`} canEdit={canWrite && !p.archived} placeholder="Write anything about this project: what you need, notes from a call, ideas, links. Everyone on it sees your words as you type." />
    </section>
  );
}


// Work a person moves or dates: not records (decisions, invoices, hours) and not options, measures, or purchases
const WORK = (i: Item) => !RECORD_KINDS.has(i.kind) && !["option", "metric", "purchase"].includes(i.kind);
const COLUMNS = ["open", "doing", "blocked", "done"] as const;
// The one-tap move from each column (the item's panel has every status); Trello's and Linear's quick actions
const NEXT: Partial<Record<(typeof COLUMNS)[number], { to: string; label: string }>> = {
  open: { to: "doing", label: "Start" },
  doing: { to: "done", label: "Mark done" },
  blocked: { to: "doing", label: "Unblock" },
};
const columnOf = (i: Item) => ((COLUMNS as readonly string[]).includes(i.status) ? i.status : "open");


/** Item writes shared by the board and the timeline: add a card, change one field */
function useItems(p: Project) {
  const { org } = useOrg();
  const refresh = useRefresh(org.id);
  const toast = useToast();
  const path = `/t/${org.id}/projects/${p.id}`;
  const add = async (title: string, extra: Record<string, unknown> = {}) => {
    try {
      await api(`${path}/items`, { method: "POST", body: { kind: "task", title, ...extra } });
      refresh();
      return true;
    } catch (e) {
      toast(problem(e));
      return false;
    }
  };
  const patch = async (i: Item, body: Record<string, unknown>) => {
    try {
      await api(`${path}/items/${i.id}`, { method: "PATCH", body: { version: i.version, ...body } });
    } catch (e) {
      toast(e instanceof HttpError && e.status === 409 ? `Someone changed "${i.title}" first. Showing the latest.` : problem(e));
    }
    refresh();
  };
  return { path, add, patch };
}


/** One card: title, what it is when it isn't a to-do, date, owner; opens the item's panel */
function Card({ item, path, kindLabel, onDrag }: { item: Item; path: string; kindLabel: string; onDrag?: (e: DragEvent) => void }) {
  const { org } = useOrg();
  const members = useMembers(org.id);
  const [open, setOpen] = useState(false);
  const owner = members.data?.find((m) => m.userId === item.assigneeId);
  const late = item.dueDate && item.status !== "done" && item.dueDate < todayIn(org.timeZone);
  return (
    <div className={`lens-card${item.status === "done" ? " is-done" : ""}`} draggable={Boolean(onDrag)} onDragStart={onDrag}>
      <button type="button" className="item-open" onClick={() => setOpen(true)}>{item.title}</button>
      <span className="lens-meta">
        {item.kind !== "task" && <span className="tag">{kindLabel}</span>}
        {item.dueDate && <span className={`small ${late ? "late" : "muted"}`}>{late && <span className="sr">Overdue, </span>}{dateLabel(item.dueDate)}</span>}
        {owner && <Avatar id={owner.userId} name={owner.name || owner.email} size={20} />}
      </span>
      <ItemPanel item={item} label={kindLabel} path={path} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}


/** A one-line add: a title, and a date on the timeline */
function QuickAdd({ onAdd, dated, label }: { onAdd: (title: string, due?: string) => Promise<boolean>; dated?: boolean; label: string }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="lens-add" onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return;
      setBusy(true);
      if (await onAdd(title.trim(), due || undefined)) { setTitle(""); setDue(""); }
      setBusy(false);
    }}>
      <input aria-label={label} placeholder={label} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
      {dated && <input type="date" aria-label="Date" value={due} onChange={(e) => setDue(e.target.value)} />}
      <button className="icon-act" disabled={!title.trim() || busy} aria-label="Add"><Plus size={18} aria-hidden="true" /></button>
    </form>
  );
}


/** Cards in four columns by status. Drag between columns with a mouse; on touch or a keyboard, one tap
 * moves a card on (Start, Mark done), and its panel sets any status. New cards land in To do */
export function BoardLens({ project: p, items, kindLabel }: { project: Project; items: Item[]; kindLabel: (k: ItemKind) => string }) {
  const { canWrite } = useOrg();
  const { path, add, patch } = useItems(p);
  const [over, setOver] = useState<string>();
  const work = items.filter(WORK);
  const editable = canWrite && !p.archived;
  const drop = (col: string) => (e: DragEvent) => {
    e.preventDefault();
    setOver(undefined);
    const it = work.find((i) => i.id === e.dataTransfer.getData("text/plain"));
    if (it && columnOf(it) !== col) void patch(it, { status: col });
  };
  return (
    <section className="lens-board" aria-label="Board">
      {COLUMNS.map((col) => {
        const cards = work.filter((i) => columnOf(i) === col);
        return (
          <div key={col} className={`lens-col${over === col ? " over" : ""}`} onDragOver={editable ? (e) => { e.preventDefault(); setOver(col); } : undefined} onDragLeave={() => setOver(undefined)} onDrop={editable ? drop(col) : undefined}>
            <h2 className="section-h">{STATUS_WORDS[col]} <small>{cards.length}</small></h2>
            {cards.map((i) => (
              <div key={i.id} className="lens-slot">
                <Card item={i} path={path} kindLabel={kindLabel(i.kind)} onDrag={editable ? (e) => e.dataTransfer.setData("text/plain", i.id) : undefined} />
                {editable && NEXT[col] && <button type="button" className="linkish small lens-next" onClick={() => void patch(i, { status: NEXT[col]!.to })}>{NEXT[col]!.label}</button>}
              </div>
            ))}
            {col === "open" && editable && <QuickAdd label="Add a card" onAdd={(t) => add(t)} />}
          </div>
        );
      })}
    </section>
  );
}


/** Dated work by month, with today and the target date marked, then what has no date yet */
export function TimelineLens({ project: p, items, kindLabel }: { project: Project; items: Item[]; kindLabel: (k: ItemKind) => string }) {
  const { org, canWrite } = useOrg();
  const { path, add, patch } = useItems(p);
  const today = todayIn(org.timeZone);
  const work = items.filter(WORK);
  const dated = work.filter((i) => i.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const undated = work.filter((i) => !i.dueDate && i.status !== "done");
  const editable = canWrite && !p.archived;
  // Marks sit among the items by date: today, and the project's target
  const marks = [{ date: today, label: "Today" }, ...(p.targetDate ? [{ date: p.targetDate, label: "Target date" }] : [])];
  const rows = [...dated.map((i) => ({ date: i.dueDate!, item: i, mark: undefined })), ...marks.map((m) => ({ date: m.date, item: undefined, mark: m.label }))].sort((a, b) => a.date.localeCompare(b.date) || (a.mark ? -1 : 1));
  const month = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return (
    <section className="lens-time" aria-label="Timeline">
      {editable && <QuickAdd dated label="Add something with a date" onAdd={(t, due) => add(t, due ? { dueDate: due } : {})} />}
      <ol className="lens-track">
        {rows.flatMap((r, n) => {
          const head = n === 0 || month(rows[n - 1]!.date) !== month(r.date);
          return [
            head ? <li key={`m${r.date}`} className="lens-month">{month(r.date)}</li> : null,
            r.item
              ? <li key={r.item.id} className="lens-stop"><Card item={r.item} path={path} kindLabel={kindLabel(r.item.kind)} /></li>
              : <li key={`k${r.mark}`} className="lens-mark"><span>{r.mark}</span> <span className="helper">{dateLabel(r.date)}</span></li>,
          ];
        })}
      </ol>
      {undated.length > 0 && (
        <>
          <h2 className="section-h">No date yet <small>{undated.length}</small></h2>
          <div className="lens-undated">
            {undated.map((i) => (
              <div key={i.id} className="lens-slot">
                <Card item={i} path={path} kindLabel={kindLabel(i.kind)} />
                {editable && <input type="date" className="lens-move" aria-label={`Date for ${i.title}`} onChange={(e) => e.target.value && void patch(i, { dueDate: e.target.value })} />}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
