// apps/web/src/components/Bell.tsx - Notifications: a bell in the top bar that breathes while
// something is unread, and one list, newest first, of what others did lately (and copies of what you
// signed), each a link to exactly what it's about. Unread ones are bold with a filled dot. Opening one
// reads that one only; "Mark all read" reads the rest. Choices for email and text live in the profile.


import { BellIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { AuditEvent, Layer, Level } from "@1neon/domain";
import { api } from "../lib/api.ts";
import { read } from "../lib/reads.ts";
import { gate, Stale } from "./Reads.tsx";
import { useMembers } from "../lib/hooks.ts";
import { ago, layerSlug } from "./ui.tsx";
import { useSession } from "./Shell.tsx";


/** Where one leads, as the API says it (apps/api/src/lib/links.ts) */
type NoteLink = { page?: string; project?: string; layer?: Layer; item?: string; invoice?: string; anchor?: string; day?: string };
/** One notification as the API returns it, with where it leads when the thing still exists */
type Note = AuditEvent & { group: string; level: Level; unread: boolean; link?: NoteLink };


/** The address a notification opens: a page and a spot on it, an invoice, a project, or one item on its layer's tab */
export function hrefOf(slug: string, link: NoteLink | undefined) {
  if (!link) return undefined;
  const hash = link.anchor ? `#${link.anchor}` : "";
  if (link.page === "prospects") return `/prospects${hash}`;
  if (link.page) return `/o/${slug}/${link.page}${link.day ? `?day=${link.day}` : ""}${hash}`;
  if (!link.project) return undefined;
  if (link.invoice) return `/o/${slug}/projects/${link.project}/invoices/${link.invoice}`;
  return `/o/${slug}/projects/${link.project}${link.layer ? `/${layerSlug(link.layer)}` : ""}${link.item ? `#item-${link.item}` : hash}`;
}
interface Notes { unread: number; events: Note[] }


/** The bell and its list for one organization; checks every 20 seconds and when the tab returns */
export function Bell({ tid, slug }: { tid: string; slug: string }) {
  const qc = useQueryClient();
  const members = useMembers(tid);
  const names = new Map(members.data?.map((m) => [m.userId, m.name || m.email]) ?? []);
  // The caller's own signed records come back too, marked as theirs
  const myId = useSession().user.id;
  const q = useQuery({ queryKey: ["notes", tid], queryFn: () => read<Notes>(`/t/${tid}/notifications`, { unread: "number", events: "array" }), refetchInterval: 20_000 });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = q.data?.unread ?? 0;
  // Loading or failed with nothing to show: the list says which instead of "Nothing yet"
  const wait = gate([q], { compact: true });

  // Show it read at once, tell the API, then take the API's answer (which puts it back if that failed)
  const mark = async (path: string, which: (e: Note) => boolean) => {
    await qc.cancelQueries({ queryKey: ["notes", tid] });
    qc.setQueryData<Notes>(["notes", tid], (n) => {
      if (!n) return n;
      const events = n.events.map((e) => (e.unread && which(e) ? { ...e, unread: false } : e));
      return { events, unread: events.filter((e) => e.unread).length };
    });
    await api(`/t/${tid}/notifications/${path}`, { method: "POST" }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ["notes", tid] });
  };
  const readOne = (e: Note) => { if (e.unread) void mark(`${e.id}/read`, (x) => x.id === e.id); };
  const readAll = () => {
    const upTo = q.data?.events.reduce((m, e) => (e.at > m ? e.at : m), "") ?? "";
    // The button goes once nothing is unread, so focus moves to the list rather than the page
    box.current?.querySelector<HTMLElement>(".bell-list")?.focus();
    void mark(`read-all?upTo=${encodeURIComponent(upTo)}`, (e) => e.at <= upTo);
  };
  // A click outside or Escape closes the list
  useEffect(() => {
    if (!open) return;
    // The walkthrough's own controls (pause, speed, Back) aren't "outside": pausing leaves the list open
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".live-bar, .live-list")) setOpen(false); };
    // Escape from inside the list gives focus back to the bell; a click outside leaves focus where it went (AP-04)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside = box.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) box.current?.querySelector<HTMLButtonElement>(".bell-btn")?.focus();
    };
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="bell" ref={box}>
      <button className={`icon-btn bell-btn${unread ? " breathing" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications" data-tour="notifications">
        <BellIcon size={17} aria-hidden="true" />
        {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-list" role="dialog" aria-label="Notifications" tabIndex={-1}>
          <div className="bell-head">
            <b>Notifications{unread > 0 && <small className="bell-new"> {unread} unread</small>}</b>
            {unread > 0 && <button type="button" className="linkish small" onClick={readAll}>Mark all read</button>}
          </div>
          {/* "Nothing yet" only when the list really answered empty; a failure says so instead */}
          <Stale reads={[q]} />
          {wait ?? (!q.data?.events.length && <p className="muted small bell-empty">Nothing yet. Others' changes appear here.</p>)}
          {!wait && <ul>
            {q.data?.events.map((e) => {
              const href = hrefOf(slug, e.link);
              const body = (
                <>
                  <span className="dot" aria-hidden="true" />
                  <span className="what">
                    <span className="sum">{e.unread && <span className="sr-only">Unread: </span>}{e.summary}</span>
                    <span className="muted small">{e.actorId === "stripe" ? "The payment page" : e.actorId === myId ? "You, a copy for your records" : names.get(e.actorId) ?? "Someone"} · {ago(e.at)}{e.level === "critical" && <span className="tag imp">important</span>}</span>
                  </span>
                </>
              );
              // Each one opens what it's about; with nowhere left to go, an unread one can still be marked read
              return (
                <li key={e.id} className={`lvl-${e.level}${e.unread ? " new" : ""}`}>
                  {href ? <Link to={href} className="note" onClick={() => { readOne(e); setOpen(false); }} onAuxClick={() => readOne(e)}>{body}</Link>
                    : e.unread ? <button type="button" className="note" onClick={() => readOne(e)}>{body}</button> : <span className="note">{body}</span>}
                </li>
              );
            })}
          </ul>}
          <p className="bell-foot small"><Link to="/me#notifications" onClick={() => setOpen(false)}>Choose what reaches you</Link></p>
        </div>
      )}
    </div>
  );
}
