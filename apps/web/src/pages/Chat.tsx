// apps/web/src/pages/Chat.tsx - Direct chat with neon1's lead. A person's own page is one thread: write any
// time, replies come in the reply hours and by email. The operator's page is the inbox (everyone who wrote, with
// unread marks) and, opened on a person, that thread with a reply box. Messages are plain text; nothing is
// sent until the person presses Send, and a draft stays in the box when a send fails.


import { CHAT_MAX, type ChatMessage, type ChatThread, type ChatView } from "@1neon/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { gate } from "../components/Reads.tsx";
import { useSession, useTopBar } from "../components/Shell.tsx";
import { ago, Empty, useToast } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { problem, useSubmit } from "../lib/hooks.ts";
import { read } from "../lib/reads.ts";


// Open threads refresh while the page is in view, so a reply shows without a reload
const POLL = 15_000;
const VIEW_SHAPE = { messages: "array", hours: "object" } as const;


/** When the next reply window starts, in the reader's own zone: "Saturday 8:00 AM EST" */
export const nextWindow = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit", timeZoneName: "short" });


/** The line under the title: reading now, or when the next window starts */
function Hours({ hours }: { hours: ChatView["hours"] }) {
  return (
    <p className="muted small" style={{ margin: 0 }}>
      {hours.open ? "I'm reading messages now. " : `I'll read this ${nextWindow(hours.nextAt)}. `}
      I answer {hours.text}, and a reply also comes to your email.
    </p>
  );
}


/** The messages, oldest first. `mine` is the side that is the reader's own */
function Messages({ messages, mine, them }: { messages: ChatMessage[]; mine: ChatMessage["from"]; them: string }) {
  const end = useRef<HTMLLIElement>(null);
  // The newest message comes into view when one arrives
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [messages.length]);
  return (
    <ol className="chat-log" role="log" aria-live="polite" aria-label="Messages">
      {messages.map((m) => (
        <li key={m.id} className={`chat-msg ${m.from === mine ? "mine" : "theirs"}`}>
          <p>{m.body}</p>
          <small className="muted">{m.from === mine ? "You" : them} · {ago(m.at)}</small>
        </li>
      ))}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}


/** The box under a thread: a draft that is kept until a send works */
function Composer({ send, label }: { send: (text: string) => Promise<void>; label: string }) {
  const [text, setText] = useState("");
  const [pending, run] = useSubmit();
  const toast = useToast();
  const go = () => {
    const t = text.trim();
    if (!t) return;
    void run(async () => {
      try {
        await send(t);
        setText("");
      } catch (e) {
        // The draft stays, and the reason is said as written
        toast(problem(e));
      }
    });
  };
  return (
    <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <label htmlFor="chat-text" className="sr">{label}</label>
      <textarea id="chat-text" value={text} maxLength={CHAT_MAX} placeholder={label} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }} />
      <div className="chat-send">
        <span className="muted small">{text.length > CHAT_MAX - 200 ? `${CHAT_MAX - text.length} left` : "Ctrl or ⌘ Enter sends"}</span>
        <button className="btn btn-primary" type="submit" disabled={pending || !text.trim()}>{pending ? "Sending…" : "Send"}</button>
      </div>
    </form>
  );
}


/** A person's own conversation with neon1 */
function MyChat() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["chat"], queryFn: () => read<ChatView>("/chat", VIEW_SHAPE), refetchInterval: POLL });
  useTopBar(<span>Chat</span>, []);
  const wait = gate([q]);
  const v = wait ? undefined : q.data;
  const send = async (text: string) => {
    await api("/chat", { method: "POST", body: { text } });
    await qc.invalidateQueries({ queryKey: ["chat"] });
  };
  return (
    <>
      <h1 className="page-title">Chat with Pradeep</h1>
      {wait ?? (v && (
        <section className="card chat-card">
          <Hours hours={v.hours} />
          {v.messages.length ? <Messages messages={v.messages} mine="user" them="Pradeep" /> : <Empty text="Nothing yet. Ask about your outline, an assessment, or anything you're unsure of." />}
          <Composer send={send} label="Write a message" />
          <p className="muted small" style={{ margin: 0 }}>For something about one project, write in the project. For a quick tour, ask <Link to="/faqs">the FAQs</Link>.</p>
        </section>
      ))}
    </>
  );
}


/** One thread in the operator's inbox, with its reply box */
function Thread({ uid, base }: { uid: string; base: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["chat", "thread", uid], queryFn: () => read<ChatView>(`/chat/threads/${uid}`, VIEW_SHAPE), refetchInterval: POLL });
  useTopBar(<span>Chat</span>, []);
  const wait = gate([q]);
  const v = wait ? undefined : q.data;
  const send = async (text: string) => {
    await api(`/chat/threads/${uid}`, { method: "POST", body: { text } });
    await qc.invalidateQueries({ queryKey: ["chat"] });
  };
  const t = v?.thread;
  return (
    <>
      <p className="small" style={{ margin: 0 }}><Link to={`${base}/chat`}>All conversations</Link></p>
      <h1 className="page-title">{t?.name ?? "Conversation"}</h1>
      {wait ?? (v && t && (
        <section className="card chat-card">
          <p className="muted small" style={{ margin: 0 }}>{t.email}{t.orgName ? ` · ${t.orgName}${t.free ? " (free account)" : ""}` : ""}</p>
          <Messages messages={v.messages} mine="neon1" them={t.name} />
          <Composer send={send} label="Write a reply" />
        </section>
      ))}
    </>
  );
}


/** neon1's inbox: everyone who wrote, most recent first, unread marked */
function Inbox({ base }: { base: string }) {
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
            <li key={t.userId}>
              <Link to={`${base}/chat/${t.userId}`} className={t.ownerUnread ? "unread" : undefined}>
                <span className="who">{t.name}{t.orgName ? <small className="muted"> {t.orgName}{t.free ? " · free" : ""}</small> : null}</span>
                <span className="preview muted">{t.lastFrom === "neon1" ? "You: " : ""}{t.preview}</span>
                <small className="muted">{ago(t.lastAt)}{t.ownerUnread ? ` · ${t.ownerUnread} new` : ""}</small>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </>
  );
}


/** The chat page: the inbox for neon1, the person's own thread for everyone else */
export function ChatPage() {
  const me = useSession();
  const { uid } = useParams();
  // The operator reaches the inbox from inside All clients or outside it, and stays where they were
  const base = useLocation().pathname.startsWith("/all") ? "/all" : "";
  if (!me.operator) return <MyChat />;
  return uid ? <Thread uid={uid} base={base} /> : <Inbox base={base} />;
}
