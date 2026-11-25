// apps/web/src/lab/Bench.tsx - Workbench: one shared stream of notes, to-dos, files, and links


import { useState } from "react";
import { ArchiveDialog, SwitchDialog } from "./Switch.tsx";
import { BENCH } from "./model.ts";
import type { LabProps } from "./WorkflowLab.tsx";


type Kind = "note" | "todo" | "file" | "link";
const KINDS: { id: Kind; name: string; many: string; hint: string }[] = [
  { id: "note", name: "Note", many: "Notes", hint: "Write a note" },
  { id: "todo", name: "To-do", many: "To-dos", hint: "What needs doing?" },
  { id: "file", name: "File", many: "Files", hint: "File name" },
  { id: "link", name: "Link", many: "Links", hint: "Paste a link" },
];
interface Entry { id: number; kind: Kind; text: string; by: string; done?: boolean; quoted?: boolean }

const SEEDED: Entry[] = [
  { id: 3, kind: "todo", text: "List every device on the front desk", by: "neon1" },
  { id: 2, kind: "note", text: "The scheduler and the card reader share one old router. It drops twice a week.", by: "Tomas" },
  { id: 1, kind: "file", text: "front-desk-photos.zip", by: "Tomas" },
];


export function Bench({ projects, save, as, open, selected }: LabProps) {
  const p = projects.find((x) => x.key === selected && x.workflow.id === "bench") ?? projects.find((x) => x.key === "PRJ-4") ?? { key: "PRJ-4", org: "Harborline", name: "Front desk tidy-up", workflow: BENCH, stepId: "open", approved: false };
  // A project just created starts empty
  const [entries, setEntries] = useState<Entry[]>(p.key.startsWith("NEW-") ? [] : SEEDED);
  const [kind, setKind] = useState<Kind>("note");
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [text, setText] = useState("");
  const [ball, setBall] = useState<"neon1" | "client">("neon1");
  const [switching, setSwitching] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const done = p.stepId === "finished";
  const set = (id: number, patch: Partial<Entry>) => setEntries(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const todos = entries.filter((e) => e.kind === "todo");
  const cleared = !done && todos.length > 0 && todos.every((e) => e.done);
  const quoted = entries.filter((e) => e.quoted).length;
  const list = entries.filter((e) => filter === "all" || e.kind === filter);

  const add = () => {
    if (!text.trim()) return;
    setEntries([{ id: Date.now(), kind, text: text.trim(), by: as === "neon1" ? "neon1" : "You" }, ...entries]);
    setText("");
    setFilter("all");
  };

  return (
    <>
      <p className="mono small muted lab-key">{p.key} · {p.org}</p>
      <h1 className="page-title">{p.name}</h1>
      <p className="lab-meta">
        <span className="tag">Workbench</span>
        <button type="button" className="chip" onClick={() => setBall(ball === "neon1" ? "client" : "neon1")} aria-label="Change who it's waiting on">
          {done ? "Done" : `Waiting on ${ball === as ? "you" : ball === "neon1" ? "neon1" : p.org}`}
        </button>
        <button type="button" className="linkish small" onClick={() => setSwitching(true)}>Change workflow</button>
      </p>
      {cleared && (
        <div className="next-step" role="status">
          <p>Every to-do is ticked.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => save({ ...p, stepId: "finished" })}>Mark done</button>
        </div>
      )}
      <div className="bench">
        <div>
          <form className="composer card" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <label className="sr" htmlFor="bench-new">{KINDS.find((k) => k.id === kind)!.hint}</label>
            <input id="bench-new" value={text} onChange={(e) => setText(e.target.value)} placeholder={KINDS.find((k) => k.id === kind)!.hint} autoComplete="off" enterKeyHint="send" />
            <div className="composer-row">
              <span role="group" aria-label="Type">
                {KINDS.map((k) => <button key={k.id} type="button" className={`chip${kind === k.id ? " on" : ""}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.name}</button>)}
              </span>
              <button type="submit" className="btn btn-primary btn-sm" disabled={!text.trim()}>Add</button>
            </div>
          </form>
          <div className="chips" role="group" aria-label="Show">
            {[{ id: "all" as const, many: "All" }, ...KINDS].map((k) => (
              <button key={k.id} type="button" className={`chip${filter === k.id ? " on" : ""}`} aria-pressed={filter === k.id} onClick={() => setFilter(k.id)}>{k.many}</button>
            ))}
          </div>
          {list.length === 0 && <p className="empty">{entries.length ? "None here." : "Add the first thing: a note, a to-do, a file, or a link."}</p>}
          <ul className="stream">
            {list.map((e) => (
              <li key={e.id} className={e.done ? "is-done" : ""}>
                {e.kind === "todo"
                  ? <input type="checkbox" checked={!!e.done} onChange={(x) => set(e.id, { done: x.target.checked })} aria-label={`Done: ${e.text}`} />
                  : <span className="tag">{KINDS.find((k) => k.id === e.kind)!.name}</span>}
                <span className="stream-text">{e.text}<small>{e.by}</small></span>
                <button type="button" className="chip" aria-pressed={!!e.quoted} onClick={() => set(e.id, { quoted: !e.quoted })}>{e.quoted ? "In proposal" : "Add to proposal"}</button>
              </li>
            ))}
          </ul>
        </div>
        <aside className="bench-side">
          <div className="card">
            <h3>Proposal</h3>
            <p className="small muted">{quoted ? `${quoted} ${quoted === 1 ? "line" : "lines"} picked` : "Nothing is billed without a signed one."}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => open("proposal", p.key)}>{quoted ? "Open the draft" : "Start one"}</button>
          </div>
          <div className="card">
            <h3>Hours</h3>
            <p className="small muted">None logged.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => save({ ...p, stepId: done ? "open" : "finished" })}>{done ? "Reopen" : "Mark done"}</button>
          <button type="button" className="linkish small" onClick={() => (p.archived ? save({ ...p, archived: undefined }) : setArchiving(true))}>{p.archived ? "Restore" : "Archive"}</button>
        </aside>
      </div>
      <ArchiveDialog open={archiving} onClose={() => setArchiving(false)} onArchive={(r) => { setArchiving(false); save({ ...p, archived: r }); }} />
      <SwitchDialog open={switching} project={p} onClose={() => setSwitching(false)} onSwitch={(n) => { setSwitching(false); save(n); open(n.workflow.id === "bench" ? "bench" : "neon", n.key); }} />
    </>
  );
}
