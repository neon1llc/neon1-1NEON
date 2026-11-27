// apps/web/src/components/Trin.tsx - Trin's conversation, a tab in the panel beside Neo and the chat with
// neon1. Trin answers from this organization's own projects, tasks, and pages, links to where it found
// things, and leans toward the project in view. It suggests; people decide.


import type { TrinReply } from "@1neon/domain";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { api } from "../lib/api.ts";
import { problem, useProjects } from "../lib/hooks.ts";
import { Reply } from "./Neo.tsx";


// Questions that show what Trin is for
const STARTERS = ["What's stuck right now?", "Summarize this project", "What should we do next?", "What did we decide?"];

interface Line {
  id: number;
  who: "you" | "bot";
  text: string;
  sources?: TrinReply["sources"];
}


/** The conversation for one organization */
export function TrinChat({ org }: { org: { id: string; slug: string; name: string } }) {
  const loc = useLocation();
  const projects = useProjects(org.id);
  // The project in view, from the address
  const key = /\/projects\/([^/?#]+)/.exec(loc.pathname)?.[1];
  const inView = key ? projects.data?.find((p) => p.key === key) : undefined;
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const ids = useRef(0);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [lines, busy]);

  async function ask(q: string) {
    q = q.trim();
    if (!q || busy) return;
    setText("");
    const before = lines;
    setLines([...before, { id: ++ids.current, who: "you", text: q }]);
    setBusy(true);
    try {
      // The last few turns go with it, so follow-ups make sense
      const history = before.slice(-6).map((l) => ({ role: l.who === "you" ? ("user" as const) : ("assistant" as const), text: l.text.slice(0, 4000) }));
      const r = await api<TrinReply>(`/t/${org.id}/trin`, { method: "POST", body: { question: q.slice(0, 1000), projectId: inView?.id, history } });
      setLines((all) => [...all, { id: ++ids.current, who: "bot", text: r.answer, sources: r.sources }]);
    } catch (e) {
      setText((t) => t || q);
      setLines((all) => [...all, { id: ++ids.current, who: "bot", text: `${problem(e)} Your question is back in the box.` }]);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };
  return (
    <>
      <div ref={log} className="n1chat-log" role="log" aria-live="polite">
        <div className="n1chat-msg n1chat-bot">
          <p>I'm Trin. I read {org.name}'s projects, pages, and tasks, and help you see what's there, what's stuck, and what's next.{inView ? ` I'll lean on ${inView.key}.` : ""}</p>
        </div>
        {!lines.length && (
          <div className="n1chat-chips">
            {STARTERS.map((q) => <button key={q} type="button" className="n1chat-chip" onClick={() => void ask(q)}>{q}</button>)}
          </div>
        )}
        {lines.map((l) => (
          <div key={l.id} className={`n1chat-msg n1chat-${l.who} n1chat-in`}>
            {l.who === "you" ? l.text : <Reply text={l.text} />}
            {/* Where it came from, numbered as the answer cites them */}
            {l.sources && l.sources.length > 0 && <Reply text={l.sources.map((x, n) => `${n + 1}. [${x.title.replace(/[[\]]/g, "")}](${x.href})`).join("\n")} />}
          </div>
        ))}
        {busy && <div className="n1chat-msg n1chat-bot n1chat-typing n1chat-in" aria-label="Trin is thinking"><span /><span /><span /></div>}
      </div>
      <form className="n1chat-form" onSubmit={submit}>
        <textarea
          className="n1chat-input"
          rows={1}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(text); } }}
          aria-label="Ask Trin"
          placeholder="Ask Trin"
        />
        <button type="submit" className="n1chat-send" disabled={busy}>send</button>
      </form>
      <p className="n1chat-note">Trin reads only {org.name}'s work, and changes nothing.</p>
    </>
  );
}
