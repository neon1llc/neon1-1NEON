// apps/web/src/pages/Chat.tsx - One shared chat per organization: every member and neon1's lead write in the same
// conversation, with their names, and it stays as the record. A message is sent the moment Send is pressed. What
// is typed and not yet sent is kept on this device as a draft, so closing the page or locking the phone loses
// nothing. You can edit your own messages; the earlier text stays on the message for neon1. neon1's own page is the
// inbox of every organization that wrote.


import { CHAT_MAX, type ChatMessage, type ChatThread, type ChatView } from "@1neon/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router";
import { gate } from "../components/Reads.tsx";
import { useOrg, useSession, useTopBar } from "../components/Shell.tsx";
import { ago, Empty, useToast } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { problem, useMembers, useSubmit } from "../lib/hooks.ts";
import { read } from "../lib/reads.ts";


// An open chat refreshes while the page is in view, so a reply shows without a reload
const POLL = 15_000;
const VIEW_SHAPE = { messages: "array", hours: "object" } as const;
// The unsent draft, one per organization, in this browser only (listed in the cookie notice)
const DRAFT = (tid: string) => `1neon.chat.draft.${tid}`;


/** The saved draft for an organization, or empty when storage is blocked */
function savedDraft(tid: string): string {
  try { return localStorage.getItem(DRAFT(tid)) ?? ""; } catch { return ""; }
}
/** Keep (or drop, when empty) a draft; blocked storage only means the draft isn't kept */
function keepDraft(tid: string, text: string) {
  try { if (text) localStorage.setItem(DRAFT(tid), text); else localStorage.removeItem(DRAFT(tid)); } catch { /* storage blocked: no draft is kept */ }
}


/** When the next reply window starts, in the reader's own zone: "Saturday 8:00 AM EST" */
export const nextWindow = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit", timeZoneName: "short" });


/** The line under the title: reading now, or when the next window starts */
function Hours({ hours }: { hours: ChatView["hours"] }) {
  return (
    <p className="muted small" style={{ margin: 0 }}>
      {hours.open ? "I'm reading messages now. " : `I'll read this ${nextWindow(hours.nextAt)}. `}
      I answer {hours.text}. Everyone in your organization sees this chat, and a reply also comes to your email.
    </p>
  );
}


/** One message: its author, when, edited or not, and (for your own) Edit. neon1 can open the earlier versions */
function Message({ m, mine, operator, edit, who }: { m: ChatMessage; mine: boolean; operator: boolean; edit: (text: string) => Promise<void>; who: (id: string) => string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.body);
  const [pending, run] = useSubmit();
  const toast = useToast();
  const save = () => void run(async () => {
    try {
      await edit(text.trim());
      setEditing(false);
    } catch (e) {
      toast(problem(e));
    }
  });
  return (
    <li className={`chat-msg ${mine ? "mine" : "theirs"}${m.from === "neon1" ? " lead" : ""}${m.privateWith ? " private" : ""}`}>
      <small className="who">{m.authorName}{m.privateWith && <span className="muted"> · {operator ? `private with ${who(m.privateWith)}` : "private, only you and Pradeep"}</span>}</small>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="sr" htmlFor={`edit-${m.id}`}>Edit your message</label>
          <textarea id={`edit-${m.id}`} value={text} maxLength={CHAT_MAX} onChange={(e) => setText(e.target.value)} />
          <div className="chat-send">
            <button type="button" className="btn btn-ghost" onClick={() => { setText(m.body); setEditing(false); }}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={pending || !text.trim() || text.trim() === m.body}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      ) : (
        <p>{m.body}</p>
      )}
      <small className="muted">
        {ago(m.at)}{m.editedAt ? ` · edited ${ago(m.editedAt)}` : ""}
        {mine && !editing && <> · <button type="button" className="linklike" onClick={() => { setText(m.body); setEditing(true); }}>Edit</button></>}
      </small>
      {operator && m.history?.length ? (
        <details className="chat-history">
          <summary className="muted small">Earlier versions ({m.history.length})</summary>
          <ol>{m.history.map((h, i) => <li key={i}><small className="muted">{ago(h.at)}</small> {h.body}</li>)}</ol>
        </details>
      ) : null}
    </li>
  );
}


/** The messages, oldest first */
function Messages({ messages, me, operator, edit, who }: { messages: ChatMessage[]; me: string; operator: boolean; edit: (id: string, text: string) => Promise<void>; who: (id: string) => string }) {
  const end = useRef<HTMLLIElement>(null);
  // The newest message comes into view when one arrives
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [messages.length]);
  return (
    <ol className="chat-log" role="log" aria-live="polite" aria-label="Messages">
      {messages.map((m) => <Message key={m.id + (m.editedAt ?? "")} m={m} mine={m.authorId === me} operator={operator} edit={(text) => edit(m.id, text)} who={who} />)}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}


/** The box under the chat. The draft is kept on this device as it is typed and cleared once a send is accepted */
function Composer({ tid, send, operator, people }: { tid: string; send: (text: string, to: { private?: boolean; to?: string }) => Promise<void>; operator: boolean; people: { userId: string; name: string }[] }) {
  const [text, setText] = useState(() => savedDraft(tid));
  // A member can keep one message between themselves and neon1; neon1 can answer one member privately
  const [priv, setPriv] = useState(false);
  const [to, setTo] = useState("");
  const [pending, run] = useSubmit();
  const toast = useToast();
  const change = (v: string) => { setText(v); keepDraft(tid, v); };
  const go = () => {
    const t = text.trim();
    if (!t) return;
    void run(async () => {
      try {
        await send(t, operator ? (to ? { to } : {}) : priv ? { private: true } : {});
        change("");
        // A private choice never carries over to the next message
        setPriv(false);
        setTo("");
      } catch (e) {
        // The draft stays, and the reason is said as written
        toast(problem(e));
      }
    });
  };
  return (
    <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <label htmlFor="chat-text" className="sr">Write a message</label>
      <textarea id="chat-text" value={text} maxLength={CHAT_MAX} placeholder="Write a message" onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }} />
      {operator ? (
        <label className="chat-to small">Send to
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Everyone in the organization</option>
            {people.map((p) => <option key={p.userId} value={p.userId}>Only {p.name}</option>)}
          </select>
        </label>
      ) : (
        <label className="chat-private small"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Only Pradeep sees this</label>
      )}
      <div className="chat-send">
        <span className="muted small">{text.length > CHAT_MAX - 200 ? `${CHAT_MAX - text.length} left` : "Sends at once. Unsent text is kept on this device."}</span>
        <button className="btn btn-primary" type="submit" disabled={pending || !text.trim()}>{pending ? "Sending…" : "Send"}</button>
      </div>
    </form>
  );
}


/** An organization's chat, for its members and for neon1 */
export function OrgChat() {
  const { org } = useOrg();
  const me = useSession();
  const qc = useQueryClient();
  const key = ["chat", org.id];
  const q = useQuery({ queryKey: key, queryFn: () => read<ChatView>(`/t/${org.id}/chat`, VIEW_SHAPE), refetchInterval: POLL });
  useTopBar(<span>Chat</span>, []);
  const wait = gate([q]);
  const v = wait ? undefined : q.data;
  const members = useMembers(org.id);
  const people = (members.data ?? []).filter((m) => m.status === "joined" && m.email !== undefined).map((m) => ({ userId: m.userId, name: m.name || m.email }));
  const who = (id: string) => people.find((p) => p.userId === id)?.name ?? "a member";
  const send = async (text: string, how: { private?: boolean; to?: string }) => {
    await api(`/t/${org.id}/chat`, { method: "POST", body: { text, ...how } });
    await qc.invalidateQueries({ queryKey: key });
  };
  const edit = async (id: string, text: string) => {
    await api(`/t/${org.id}/chat/${id}`, { method: "PATCH", body: { text } });
    await qc.invalidateQueries({ queryKey: key });
  };
  return (
    <>
      <h1 className="page-title">{me.operator ? `Chat with ${org.name}` : "Chat with Pradeep"}</h1>
      {wait ?? (v && (
        <section className="card chat-card">
          <Hours hours={v.hours} />
          {v.messages.length
            ? <Messages messages={v.messages} me={me.user.id} operator={me.operator} edit={edit} who={who} />
            : <Empty text="Nothing yet. Ask about an outline, an assessment, or anything you're unsure of." />}
          <Composer tid={org.id} send={send} operator={me.operator} people={people.filter((p) => p.userId !== me.user.id)} />
          <p className="muted small" style={{ margin: 0 }}>For something about one project, write in the project. For a quick tour, ask <Link to="/faqs">the FAQs</Link>.</p>
        </section>
      ))}
    </>
  );
}


/** neon1's inbox: every organization that wrote, most recent first, with new messages marked */
function Inbox() {
  const q = useQuery({ queryKey: ["chat", "inbox"], queryFn: () => read<{ threads: ChatThread[] }>("/chat/inbox", { threads: "array" }), refetchInterval: POLL });
  useTopBar(<span>Chat</span>, []);
  const wait = gate([q]);
  const threads = wait ? [] : q.data?.threads ?? [];
  return (
    <>
      <h1 className="page-title">Chat</h1>
      {wait ?? (threads.length === 0 ? <Empty text="Nobody has written yet." /> : (
        <ul className="chat-inbox card">
          {threads.map((t) => (
            <li key={t.tenantId}>
              <Link to={`/o/${t.orgSlug}/chat`} className={t.ownerUnread ? "unread" : undefined}>
                <span className="who">{t.orgName}{t.free ? <small className="muted"> · free</small> : null}</span>
                <span className="preview muted">{t.lastFrom === "neon1" ? "You" : t.lastBy}: {t.preview}</span>
                <small className="muted">{ago(t.lastAt)}{t.ownerUnread ? ` · ${t.ownerUnread} new` : ""}</small>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </>
  );
}


/** /chat and /all/chat: the inbox for neon1; for everyone else, their organization's chat */
export function ChatEntry() {
  const me = useSession();
  if (me.operator) return <Inbox />;
  const first = me.orgs.find((o) => o.slug !== "neon1") ?? me.orgs[0];
  return first ? <Navigate to={`/o/${first.slug}/chat`} replace /> : <Empty text="You're not in an organization yet." />;
}
