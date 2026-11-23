// apps/web/src/components/Neo.tsx - Neo for signed-in people: the same window and looks as the public
// Neo (neon1.tech's /shared/chat.css, dark in Matrix and light in Awake), answered by POST /neo from the
// 1NEON guide and the person's own data. A reply can carry links that open inside 1NEON, a tour that
// walks across pages, and a plan that runs only after the person presses "Yes, do it", one step at a
// time through the normal API as them (lib/neo.ts), stopping at the first step that doesn't go through.


import { LASTING_OPS, type NeoPlan, type NeoTour } from "@1neon/domain";
import { useQuery } from "@tanstack/react-query";
import { driver } from "driver.js";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { problem } from "../lib/hooks.ts";
import { askNeo, blocks, fit, keep, runStep, type Piece, type Turn } from "../lib/neo.ts";
import { navigate, refreshAll } from "../lib/nav.ts";
import { api } from "../lib/api.ts";
import { Talk, useUnread, type ChatOrg } from "./Talk.tsx";


// Starting points, shown until the first question
const SUGGESTIONS = ["What can I do on this page?", "Show me around this page", "What's waiting on me?", "How do I invite someone?"];

// One step of a plan as it runs: not yet, running, done, or stopped with a reason
type StepState = { state: "todo" | "run" | "done" | "fail"; error?: string };
// One message in the window; Neo's can carry a tour and a plan
interface Msg {
  id: number;
  who: "you" | "bot";
  text: string;
  tour?: NeoTour;
  plan?: NeoPlan;
}


// The neon1 mark, the site logo's eight arcs, as the public window draws it
function Mark() {
  return (
    <svg className="n1chat-mark" viewBox="3 4 58 58" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6a24 24 0 0 1 24 24v30M6 12a18 18 0 0 1 18 18v30M6 18a12 12 0 0 1 12 12v30M6 24a6 6 0 0 1 6 6v30M34 6a24 24 0 0 1 24 24v30M34 12a18 18 0 0 1 18 18v30M34 18a12 12 0 0 1 12 12v30M34 24a6 6 0 0 1 6 6v30" />
    </svg>
  );
}


// Light (Awake) unless the page is dark: the html element's n1-dark class, kept by the theme code
function useLight() {
  const read = () => !document.documentElement.classList.contains("n1-dark");
  const [light, setLight] = useState(read);
  useEffect(() => {
    const seen = new MutationObserver(() => setLight(read()));
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => seen.disconnect();
  }, []);
  return light;
}


// --- Reply text: paragraphs, lists, bold, and links (inside 1NEON through the router; links that leave the app open a new tab and take the site's northeast arrow, n1chat-ext) ---

function Line({ parts }: { parts: Piece[] }) {
  return (
    <>
      {parts.map((p, i) =>
        "href" in p ? (
          p.inside ? <Link key={i} className="n1chat-link" to={p.href.slice("/1NEON".length) || "/"}>{p.text}</Link> : <a key={i} className="n1chat-link n1chat-ext" href={p.href} target="_blank" rel="noopener">{p.text}</a>
        ) : p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

function Reply({ text }: { text: string }) {
  return (
    <>
      {blocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Line parts={l} /></span>)}</p>
        ) : b.kind === "ul" ? (
          <ul key={i}>{b.items.map((l, j) => <li key={j}><Line parts={l} /></li>)}</ul>
        ) : (
          <ol key={i}>{b.items.map((l, j) => <li key={j}><Line parts={l} /></li>)}</ol>
        ),
      )}
    </>
  );
}


// --- Tours: each stop opens its page, waits for the spot to appear, then points at it ---

// The spot on screen now (laid out and inside the viewport), as the page tours find it
function spot(at?: string): HTMLElement | undefined {
  if (!at) return undefined;
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${at}"]`)].find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
  });
}

// Open a stop's page and give it up to three seconds to draw its spot; without one, the stop shows centered
async function arrive(path: string, at?: string) {
  if (location.pathname.replace(/^\/1NEON/, "") !== path) navigate(path);
  for (let waited = 0; waited < 3000 && at && !spot(at); waited += 100) await new Promise((r) => setTimeout(r, 100));
}

export async function startTour(tour: NeoTour) {
  const steps = tour.steps;
  await arrive(steps[0]!.path, steps[0]!.at);
  const d = driver({
    steps: steps.map((s) => ({ element: () => spot(s.at) as Element, popover: { title: s.title, description: s.text } })),
    showProgress: steps.length > 1,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "n1-tour",
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 10,
    smoothScroll: true,
    // Moving between stops opens the next stop's page first
    onNextClick: () => {
      const i = d.getActiveIndex() ?? 0;
      if (i + 1 >= steps.length) return d.destroy();
      void arrive(steps[i + 1]!.path, steps[i + 1]!.at).then(() => d.moveNext());
    },
    onPrevClick: () => {
      const i = d.getActiveIndex() ?? 0;
      if (i <= 0) return;
      void arrive(steps[i - 1]!.path, steps[i - 1]!.at).then(() => d.movePrevious());
    },
  });
  d.drive();
}


// --- Plans: the steps, "Want me to do it?", and each step's outcome ---

function Plan({ plan }: { plan: NeoPlan }) {
  const [states, setStates] = useState<StepState[]>(() => plan.steps.map(() => ({ state: "todo" })));
  const [phase, setPhase] = useState<"offer" | "running" | "stopped" | "done" | "declined">("offer");
  const lasting = plan.steps.some((s) => LASTING_OPS.has(s.action.op));

  // Run from the first step that isn't done; stop at the first that doesn't go through
  async function run() {
    setPhase("running");
    const next = [...states];
    for (let i = 0; i < plan.steps.length; i++) {
      if (next[i]!.state === "done") continue;
      next[i] = { state: "run" };
      setStates([...next]);
      try {
        await runStep(plan.steps[i]!.action);
        next[i] = { state: "done" };
        setStates([...next]);
      } catch (e) {
        next[i] = { state: "fail", error: e instanceof Error && !("body" in e) && !("path" in e) ? e.message : problem(e) };
        setStates([...next]);
        setPhase("stopped");
        void refreshAll();
        return;
      }
    }
    setPhase("done");
    void refreshAll();
  }

  const mark = { todo: "○", run: "…", done: "✓", fail: "✗" } as const;
  return (
    <div className="neo-plan">
      <strong className="neo-plan-title">{plan.title}</strong>
      <ol className="neo-steps">
        {plan.steps.map((s, i) => (
          <li key={i} className={`neo-step neo-${states[i]!.state}`}>
            <span className="neo-mark" aria-hidden="true">{mark[states[i]!.state]}</span>
            <span>
              {s.say}
              {states[i]!.error && <span className="neo-error" role="alert">{states[i]!.error}</span>}
            </span>
          </li>
        ))}
      </ol>
      {phase === "offer" && (
        <>
          {lasting && <p className="neo-warn">Some of these steps can't be undone by editing.</p>}
          <div className="neo-acts">
            <span>Want me to do it?</span>
            <button type="button" className="n1chat-send" onClick={() => void run()}>Yes, do it</button>
            <button type="button" className="n1chat-tool" onClick={() => setPhase("declined")}>No thanks</button>
          </div>
        </>
      )}
      {phase === "running" && <p className="neo-note" role="status">Working on it as you…</p>}
      {phase === "stopped" && (
        <div className="neo-acts">
          <span>Stopped. Nothing after that step ran.</span>
          <button type="button" className="n1chat-tool" onClick={() => void run()}>Continue from there</button>
        </div>
      )}
      {phase === "done" && <p className="neo-note" role="status">Done. The page shows the changes.</p>}
      {phase === "declined" && <p className="neo-note">Okay, nothing was changed.</p>}
    </div>
  );
}


// --- The window -------------------------------------------------------------------------

/** Neo's panel, with a second conversation in it: the organization's chat with Pradeep (components/Talk.tsx). Opened from anywhere, so nobody leaves the page */
export function Neo({ open, setOpen, org, me, neo = true }: { open: boolean; setOpen: (open: boolean) => void; org?: ChatOrg; me: { id: string; operator: boolean }; neo?: boolean }) {
  const light = useLight();
  const loc = useLocation();
  // Without Neo (no model set up) the panel is only the conversation with Pradeep
  const [tabWas, setTab] = useState<"neo" | "pradeep">("neo");
  const tab = neo ? tabWas : "pradeep";
  // neon1 can pick any organization from its inbox; everyone else has their own
  const [picked, setPicked] = useState<ChatOrg | undefined>();
  const chatOrg = me.operator ? picked ?? org : org;
  const canTalk = me.operator || Boolean(org);
  const unread = useUnread(chatOrg, me.operator, open && tab === "pradeep");
  // Once a session, the launcher opens its label for a few seconds so people see there are two to talk to (Neo and Pradeep)
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!canTalk) return;
    let seen = false;
    try { seen = sessionStorage.getItem("1neon.peeked") === "1"; sessionStorage.setItem("1neon.peeked", "1"); } catch { /* storage blocked: it opens each time the page loads */ }
    if (seen) return;
    const on = setTimeout(() => setPeek(true), 1200);
    const off = setTimeout(() => setPeek(false), 6500);
    return () => { clearTimeout(on); clearTimeout(off); };
  }, [canTalk]);
  // Alert emails open the page with ?chat=1, and other places ask with this event
  useEffect(() => {
    const talk = () => { if (!canTalk) return; setTab("pradeep"); setOpen(true); };
    if (new URLSearchParams(loc.search).get("chat") === "1") talk();
    addEventListener("1neon:chat", talk);
    return () => removeEventListener("1neon:chat", talk);
  }, [canTalk, loc.search, setOpen]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [history, setHistory] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // "new" starts over; an answer for an earlier conversation is dropped
  const generation = useRef(0);
  const ids = useRef(0);

  // The newest message stays in view
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, busy]);
  // On a narrow screen the open window covers the page: the page holds its position, since iOS scrolls it
  // when the box takes focus and the keyboard rises
  useEffect(() => {
    if (!open || !matchMedia("(max-width: 600px)").matches) return;
    const at = scrollY;
    const hold = () => { if (scrollY !== at) scrollTo({ top: at, left: 0, behavior: "instant" as ScrollBehavior }); };
    addEventListener("scroll", hold, { passive: true });
    return () => removeEventListener("scroll", hold);
  }, [open]);
  // Opening moves focus into the window (not the box, so phones don't raise the keyboard)
  useEffect(() => { if (open) panel.current?.focus({ preventScroll: true }); }, [open]);
  // The question field grows with wrapped text, then scrolls internally after a comfortable limit
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    const fit = () => {
      field.style.height = "auto";
      const max = 160;
      field.style.height = `${Math.min(field.scrollHeight, max)}px`;
      field.style.overflowY = field.scrollHeight > max ? "auto" : "hidden";
    };
    fit();
    addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, [text, open]);

  const add = (m: Omit<Msg, "id">) => setMsgs((all) => [...all, { ...m, id: ++ids.current }]);

  async function ask(q: string) {
    q = q.trim();
    if (!q || busy) return;
    setText("");
    add({ who: "you", text: q });
    const messages = fit(history, q.slice(0, 2000));
    const gen = generation.current;
    setBusy(true);
    try {
      const r = await askNeo(messages, loc.pathname.startsWith("/1NEON") ? loc.pathname : `/1NEON${loc.pathname}`);
      if (gen !== generation.current) return;
      add({ who: "bot", text: r.reply || "I don't have an answer for that.", tour: r.tour, plan: r.plan });
      setHistory([...messages, { role: "assistant", content: keep(r.reply || "No answer.") }]);
    } catch (e) {
      if (gen !== generation.current) return;
      setText((t) => t || q);
      add({ who: "bot", text: `${problem(e)} Your question is back in the box.` });
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }

  function fresh() {
    generation.current++;
    setMsgs([]);
    setHistory([]);
    setBusy(false);
  }

  // Return keyboard focus after a manual close; an outside control keeps its own focus
  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => launcher.current?.focus({ preventScroll: true }));
  }

  const look = light ? " n1chat-light" : "";
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };
  let body: ReactNode = null;
  if (open) body = (
    <div ref={panel} className={`n1chat n1chat-right n1neo${look}`} role="dialog" aria-label={canTalk ? (neo ? "Chat with Neo or Pradeep" : "Chat with Pradeep") : "Neo, your 1NEON assistant"} tabIndex={-1} onKeyDown={(e) => e.key === "Escape" && close()}>
      <div className="n1chat-head">
        {canTalk && !neo ? (
          <strong className="n1chat-title"><Mark />{me.operator ? "Chat" : "Pradeep"}</strong>
        ) : canTalk ? (
          <span className="talk-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "neo"} className="n1chat-title talk-tab" onClick={() => setTab("neo")}><Mark />Neo</button>
            <button type="button" role="tab" aria-selected={tab === "pradeep"} className="n1chat-title talk-tab" onClick={() => setTab("pradeep")}>{me.operator ? "Chat" : "Pradeep"}{unread > 0 && tab !== "pradeep" && <b className="talk-badge">{unread}</b>}</button>
          </span>
        ) : (
          <strong className="n1chat-title"><Mark />Neo</strong>
        )}
        <span className="n1chat-tools">
          {tab === "neo" && <button type="button" className="n1chat-tool" onClick={fresh} aria-label="Start a new conversation">new</button>}
          <button type="button" className="n1chat-tool" onClick={() => close()} aria-label="Close">close</button>
        </span>
      </div>
      {tab === "pradeep" && canTalk ? (
        <Talk org={chatOrg} me={me.id} operator={me.operator} active={open && tab === "pradeep"} pick={setPicked} />
      ) : (
        <>
        <div ref={log} className="n1chat-log" role="log" aria-live="polite">
          <div className="n1chat-msg n1chat-bot">
            <p>I'm Neo, 1NEON's automated assistant. Ask about anything here, and I can point you to it, show you around, or offer to do it with you.</p>
          </div>
          {!msgs.length && (
            <div className="n1chat-chips">
              {SUGGESTIONS.map((q) => <button key={q} type="button" className="n1chat-chip" onClick={() => void ask(q)}>{q}</button>)}
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`n1chat-msg n1chat-${m.who} n1chat-in`}>
              {m.who === "you" ? m.text : <Reply text={m.text} />}
              {m.tour && (
                <div className="neo-acts">
                  <button type="button" className="n1chat-send" onClick={() => { setOpen(false); void startTour(m.tour!); }}>Start the tour</button>
                  <span className="neo-note">{m.tour.title}</span>
                </div>
              )}
              {m.plan && <Plan plan={m.plan} />}
            </div>
          ))}
          {busy && <div className="n1chat-msg n1chat-bot n1chat-typing n1chat-in" aria-label="Neo is typing"><span /><span /><span /></div>}
        </div>
        <form className="n1chat-form" onSubmit={submit}>
          <textarea
            ref={input}
            className="n1chat-input"
            rows={1}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(text); } }}
            aria-label="Your question"
            placeholder="Ask Neo"
          />
          <button type="submit" className="n1chat-send" disabled={busy}>send</button>
        </form>
        <p className="n1chat-note">Neo reads only what you can open, and changes nothing unless you say yes.</p>
        </>
      )}
    </div>
  );

  return (
    <>
      <button ref={launcher} type="button" className={`n1chat-launch n1chat-right n1neo${look}${open ? " n1chat-hidden" : ""}${peek ? " n1chat-peek" : ""}`} aria-expanded={open} aria-label={unread > 0 ? `Ask Neo or message Pradeep, ${unread} new` : canTalk ? (neo ? "Ask Neo or message Pradeep" : "Message Pradeep") : "Ask Neo, your 1NEON assistant"} onClick={() => setOpen(true)} data-tour="neo">
        <Mark />
        <span className="n1chat-label" aria-hidden="true">{!canTalk ? "ask Neo" : neo ? "ask Neo or Pradeep" : "message Pradeep"}</span>
        {unread > 0 && <b className="talk-badge talk-badge-launch" aria-hidden="true">{unread > 9 ? "9+" : unread}</b>}
      </button>
      {body}
    </>
  );
}
