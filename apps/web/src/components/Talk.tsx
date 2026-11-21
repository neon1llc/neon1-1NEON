// apps/web/src/components/Talk.tsx - The conversation with Pradeep, inside Neo's panel (components/Neo.tsx) and drawn
// with its pieces: the same log, bubbles, composer, and send button. One shared chat per organization, so everyone in
// it sees the same messages with their names. A message sends when Send is pressed; what is typed and not sent is kept
// on this device as a draft. You can edit your own messages. neon1 gets an inbox of every organization that wrote.


import { CHAT_MAX, chatVisibleTo, type ChatMessage, type ChatThread, type ChatView } from "@1neon/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { problem, useMembers } from "../lib/hooks.ts";
import { read } from "../lib/reads.ts";
import { ago, useToast } from "./ui.tsx";


/** The organization a conversation belongs to */
export interface ChatOrg { id: string; name: string; slug: string }

// An open conversation refreshes while it is in view; the launcher's count is read more slowly (Neo.tsx)
const POLL = 15_000;
const VIEW_SHAPE = { messages: "array", hours: "object" } as const;
// The unsent draft, one per organization, in this browser only (listed in the cookie notice)
const DRAFT = (tid: string) => `1neon.chat.draft.${tid}`;
const savedDraft = (tid: string) => { try { return localStorage.getItem(DRAFT(tid)) ?? ""; } catch { return ""; } };
const keepDraft = (tid: string, text: string) => { try { if (text) localStorage.setItem(DRAFT(tid), text); else localStorage.removeItem(DRAFT(tid)); } catch { /* storage blocked: no draft is kept */ } };


/** When Pradeep next reads, in the reader's own zone: "Saturday 8:00 AM EST" */
const nextWindow = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit", timeZoneName: "short" });


/** One message: its author when it isn't yours, the text, and (for yours) edit. neon1 can open earlier versions */
function Bubble({ m, me, operator, who, edit }: { m: ChatMessage; me: string; operator: boolean; who: (id: string) => string; edit: (id: string, text: string) => Promise<void> }) {
  const mine = m.authorId === me;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.body);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    setBusy(true);
    try { await edit(m.id, text.trim()); setEditing(false); } catch (e) { toast(problem(e)); } finally { setBusy(false); }
  };
  return (
    <div className={`n1chat-msg n1chat-${mine ? "you" : "bot"} n1chat-in${m.privateWith ? " talk-private" : ""}`}>
      {(!mine || m.privateWith) && (
        <small className="talk-who">
          {!mine && m.authorName}{!mine && m.privateWith ? " · " : ""}{m.privateWith ? (operator ? `private, ${who(m.privateWith)}` : "private") : ""}
        </small>
      )}
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <textarea className="n1chat-input talk-edit" aria-label="Edit your message" rows={2} maxLength={CHAT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="talk-acts">
            <button type="button" className="n1chat-tool" onClick={() => { setText(m.body); setEditing(false); }}>cancel</button>
            <button type="submit" className="n1chat-send" disabled={busy || !text.trim() || text.trim() === m.body}>save</button>
          </span>
        </form>
      ) : (
        <p>{m.body}</p>
      )}
      <small className="talk-meta">
        {ago(m.at)}{m.editedAt ? ", edited" : ""}
        {mine && !editing && <button type="button" className="n1chat-tool talk-edit-btn" onClick={() => { setText(m.body); setEditing(true); }}>edit</button>}
      </small>
      {operator && m.history?.length ? (
        <details className="talk-history">
          <summary>earlier ({m.history.length})</summary>
          {m.history.map((h, i) => <p key={i}>{h.body}</p>)}
        </details>
      ) : null}
    </div>
  );
}


/** neon1's inbox: every organization that wrote, most recent first, new counts marked */
function Inbox({ pick }: { pick: (o: ChatOrg) => void }) {
  const q = useQuery({ queryKey: ["chat", "inbox"], queryFn: () => read<{ threads: ChatThread[] }>("/chat/inbox", { threads: "array" }), refetchInterval: POLL });
  const threads = q.data?.threads ?? [];
  return (
    <div className="n1chat-log">
      {q.isPending && <p className="talk-hint">Loading…</p>}
      {!q.isPending && !threads.length && <p className="talk-hint">Nobody has written yet.</p>}
      {threads.map((t) => (
        <button key={t.tenantId} type="button" className={`talk-row${t.ownerUnread ? " new" : ""}`} onClick={() => pick({ id: t.tenantId, name: t.orgName, slug: t.orgSlug })}>
          <span className="talk-row-name">{t.orgName}{t.free ? <small> free</small> : null}{t.ownerUnread ? <b className="talk-badge">{t.ownerUnread}</b> : null}</span>
          <span className="talk-row-text">{t.lastFrom === "neon1" ? "You" : t.lastBy}: {t.preview}</span>
          <small>{ago(t.lastAt)}</small>
        </button>
      ))}
    </div>
  );
}


/** The box under the conversation. A private toggle for members; for neon1 a recipient, when the organization has more than one person */
function Composer({ org, operator, people, send }: { org: ChatOrg; operator: boolean; people: { userId: string; name: string }[]; send: (text: string, how: { private?: boolean; to?: string }) => Promise<void> }) {
  const [text, setText] = useState(() => savedDraft(org.id));
  const [priv, setPriv] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const field = useRef<HTMLTextAreaElement>(null);
  // Another organization (neon1 picking from the inbox) has its own draft
  useEffect(() => { setText(savedDraft(org.id)); setPriv(false); setTo(""); }, [org.id]);
  // The box grows with its text, then scrolls, as Neo's does
  useLayoutEffect(() => {
    const f = field.current;
    if (!f) return;
    f.style.height = "auto";
    f.style.height = `${Math.min(f.scrollHeight, 160)}px`;
    f.style.overflowY = f.scrollHeight > 160 ? "auto" : "hidden";
  }, [text]);
  const change = (v: string) => { setText(v); keepDraft(org.id, v); };
  const go = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await send(t, operator ? (to ? { to } : {}) : priv ? { private: true } : {});
      change("");
      // A private choice never carries over to the next message
      setPriv(false);
      setTo("");
    } catch (e) {
      // The draft stays in the box
      toast(problem(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="n1chat-form" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <textarea ref={field} className="n1chat-input" rows={1} maxLength={CHAT_MAX} value={text} aria-label="Your message" placeholder={operator ? "Reply" : "Message Pradeep"}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void go(); } }} />
      {operator ? (
        people.length > 1 && (
          <select className="talk-to" aria-label="Send to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">all</option>
            {people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
          </select>
        )
      ) : (
        <button type="button" className={`n1chat-tool talk-priv${priv ? " on" : ""}`} aria-pressed={priv} title="Only Pradeep sees it" onClick={() => setPriv((v) => !v)}>private</button>
      )}
      <button type="submit" className="n1chat-send" disabled={busy}>send</button>
    </form>
  );
}


/** One organization's conversation. `active` is true while the panel shows it: only then is it read, which marks it seen */
function Thread({ org, me, operator, active, inbox }: { org: ChatOrg; me: string; operator: boolean; active: boolean; inbox: () => void }) {
  const qc = useQueryClient();
  const log = useRef<HTMLDivElement>(null);
  const members = useMembers(org.id);
  const people = (members.data ?? []).filter((m) => m.status === "joined" && m.userId !== me).map((m) => ({ userId: m.userId, name: m.name || m.email }));
  const q = useQuery({ queryKey: ["chat", org.id], queryFn: () => read<ChatView>(`/t/${org.id}/chat`, VIEW_SHAPE), enabled: active, refetchInterval: POLL });
  const messages = (q.data?.messages ?? []).filter((m) => chatVisibleTo(m, me, operator));
  // The newest message stays in view
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages.length, org.id]);
  const who = (id: string) => people.find((p) => p.userId === id)?.name ?? "member";
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["chat", org.id] }), qc.invalidateQueries({ queryKey: ["chat", "unread"] })]);
  const send = async (text: string, how: { private?: boolean; to?: string }) => { await api(`/t/${org.id}/chat`, { method: "POST", body: { text, ...how } }); await refresh(); };
  const edit = async (id: string, text: string) => { await api(`/t/${org.id}/chat/${id}`, { method: "PATCH", body: { text } }); await refresh(); };
  const h = q.data?.hours;
  return (
    <>
      {/* One short line above the conversation, which scrolls under it */}
      {operator && <p className="talk-hint"><button type="button" className="n1chat-tool" onClick={inbox}>inbox</button> {org.name}</p>}
      {h && !operator && <p className="talk-hint">{h.open ? "Pradeep is reading now." : `Pradeep reads ${nextWindow(h.nextAt)}.`}</p>}
      <div ref={log} className="n1chat-log" role="log" aria-live="polite">
        {messages.map((m) => <Bubble key={m.id + (m.editedAt ?? "")} m={m} me={me} operator={operator} who={who} edit={edit} />)}
      </div>
      <Composer org={org} operator={operator} people={people} send={send} />
    </>
  );
}


/** The Pradeep tab: a member's own organization; for neon1, the inbox and any organization chosen from it */
export function Talk({ org, me, operator, active, pick }: { org: ChatOrg | undefined; me: string; operator: boolean; active: boolean; pick: (o: ChatOrg) => void }) {
  const [inbox, setInbox] = useState(operator && !org);
  // Choosing an organization (from the inbox, or by moving to one) shows its conversation
  useEffect(() => { if (org) setInbox(false); }, [org?.id]);
  if (operator && (inbox || !org)) return <Inbox pick={(o) => { pick(o); setInbox(false); }} />;
  if (!org) return null;
  return <Thread org={org} me={me} operator={operator} active={active} inbox={() => setInbox(true)} />;
}
