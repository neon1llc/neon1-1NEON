// apps/web/src/pages/NewProject.tsx - New project: a short wizard. Template, the basics, how we'll
// measure it, then review.


import { benchStage, QUICK_FIX, TEMPLATES } from "@1neon/domain";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useOrg, useSession, useTopBar } from "../components/Shell.tsx";
import { dateLabel, useToast } from "../components/ui.tsx";
import { api, Unconfirmed } from "../lib/api.ts";
import { checkMeasures, MEASURE_TITLE_MAX, MEASURE_UNIT_MAX, numberWords, type MetricDraft } from "../lib/measures.ts";
import { problem, useRefresh } from "../lib/hooks.ts";
import { slide } from "../lib/motion.ts";
import type { Project } from "@1neon/domain";


// The wizard's steps, in order
const STEPS = ["Start", "Basics", "Measures", "Review"] as const;

// How the work runs, lightest first. Workbench and Quick fix need no second question; a proposal and
// NEON ask what kind of work it is, which sets the key prefix and the starter items
type Way = "bench" | "quick" | "proposal" | "neon";
const WAYS: { id: Way; name: string; line: string; level: 1 | 2 | 3 | 4; path?: string[] }[] = [
  { id: "bench", name: "Workbench", line: "One shared page for notes, to-dos, and files, open until it's done.", level: 1, path: ["Open", "Done"] },
  { id: "quick", name: "Quick fix", line: "A few hours: one quote, one signature, one invoice when it's fixed.", level: 2, path: ["Quote", "Fix", "Accept"] },
  { id: "proposal", name: "Build a proposal", line: "Shape scope and price together, sign, then the work runs on NEON or a Workbench.", level: 3, path: ["Proposal", "Sign", "Run it"] },
  { id: "neon", name: "NEON", line: "Needs and options, a signed decision, the work, measured results, and a handover.", level: 4 },
];
// The kinds of work, lightest to most involved; the domain's order (Blank first) stays the fallback
const KINDS = TEMPLATES.filter((t) => t.id !== QUICK_FIX).sort((a, b) => a.level - b.level);
const EFFORT = ["Light", "Moderate", "Involved", "Most involved"] as const;
// NEON's four layers, in order, with the class that paints each its layer color
const LAYERS = [["needs", "Needs"], ["execution", "Execute"], ["observation", "Observe"], ["next", "Normalize"]] as const;




// Four steps, then one create call; only editors and admins get the form
export function NewProject() {
  const { org, summary, canWrite } = useOrg();
  const me = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const refresh = useRefresh(org.id);
  const [step, setStep] = useState(0);
  // The step's heading takes focus after Next or Back, never on first arrival (AP-05)
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    stepHeading.current?.focus({ preventScroll: true });
  }, [step]);
  // Answers from every step, kept until Create
  // A client starts on a Workbench and neon1 on NEON, as chosen for the workflows
  const [way, setWay] = useState<Way>(me.operator ? "neon" : "bench");
  const [kind, setKind] = useState("blank");
  const template = way === "quick" ? QUICK_FIX : way === "bench" ? "blank" : kind;
  const [name, setName] = useState("");
  const [projectSummary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [example, setExample] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [metrics, setMetrics] = useState<MetricDraft[]>([{ title: "", unit: "", baseline: "", target: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Create got no answer: the project may exist. Pressing again sends the same key, which finds it
  const [unsure, setUnsure] = useState(false);
  // One key per visit to this page: if a reply is lost and the person presses Create again, the API
  // returns the project it already made instead of a second one
  const [requestKey] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  useTopBar(<span><Link to={`/o/${summary.slug}/projects`}>Projects</Link> / New</span>, [summary.slug]);

  // Viewers can open the page by URL but can't create
  if (!canWrite) return <p className="lead">Viewers can't start projects. Ask an editor or admin in {org.name}.</p>;
  // The chosen template, falling back to the first (blank)
  const t = TEMPLATES.find((x) => x.id === template) ?? TEMPLATES[0]!;
  // A quick fix skips Measures and asks only what's wrong: neon1 quotes it from the project itself.
  // `order` is the steps this template walks through, by their place in STEPS
  const quick = way === "quick";
  const bench = way === "bench";
  // A quick fix and a Workbench skip Measures: one is done when it works, the other when everyone says so
  const light = quick || bench;
  const order = light ? [0, 1, 3] : [0, 1, 2, 3];
  const at = order.indexOf(step);
  const nextStep = order[at + 1];
  const prevStep = order[at - 1];
  // Measures checked once, the same way for the inline errors, the Review step, and the create call:
  // a started measure with a bad number or a missing name is an error, never silently dropped
  const measures = checkMeasures(metrics);
  const kept = measures.values;
  // The project starts in the first stage that isn't hidden, as the API does
  const shownFirst = org.stages.find((x) => !x.hidden) ?? org.stages[0];
  const first = bench ? benchStage(org.stages) : way === "proposal" ? (org.stages.find((x) => x.id === "propose" && !x.hidden) ?? shownFirst) : shownFirst;
  // What was left blank, named on the review so skipping it is a choice, not an accident
  const later = (quick ? [!projectSummary.trim() && "what's wrong"] : bench ? [!projectSummary.trim() && "what it's about"] : [!projectSummary.trim() && "what it is", !outcome.trim() && "what done looks like", kept.length === 0 && "a measure"]).filter(Boolean) as string[];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  // Only the Basics step has a required field
  const ready = [true, name.trim().length > 0, true, true];
  // On a step with a problem, move to the first field to fix instead of going on; answers stay as typed
  const firstProblem = () => {
    if (light || !measures.first) return false;
    const [field, i] = measures.first.split(":");
    const ids = { title: "mt", unit: "mu", baseline: "mb", target: "mg" } as Record<string, string>;
    if (step !== 2) setStep(2);
    setTimeout(() => document.getElementById(`${ids[field!]}${i}`)?.focus(), 0);
    return true;
  };

  // Create the project with its starter items and measures, then open it
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const p = await api<Project>(`/t/${org.id}/projects`, {
        method: "POST",
        body: {
          idempotencyKey: requestKey,
          name: name.trim(),
          template,
          workflow: bench ? "bench" : "neon",
          start: way === "proposal" ? "proposal" : "intake",
          summary: projectSummary,
          outcome,
          example,
          targetDate: targetDate || undefined,
          // Exactly the values the Review step showed (a quick fix has none, and shows none)
          metrics: light ? [] : kept,
          // Answers typed before switching to a quick fix or a Workbench, which don't ask them, aren't sent
          ...(light ? { outcome: "", example: "" } : {}),
        },
      });
      refresh();
      toast(`${p.key} created`);
      // A proposal opens where it's shaped; a Workbench opens on its one shared page
      nav(`/o/${summary.slug}/projects/${p.key}${way === "proposal" ? "/needs#options" : bench ? "/execute" : ""}`);
    } catch (e) {
      // Every answer ends the busy state; the answers stay on the form either way
      const lost = e instanceof Unconfirmed;
      setUnsure(lost);
      setError(lost ? "I couldn't confirm the project was made. Your answers are kept. Choose Check again to look without making a second one." : problem(e));
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">New project</h1>
      {/* Progress through the steps; the current one is marked for screen readers */}
      <div className="steps" aria-label="Steps" data-tour="wizard">
        {order.map((i, n) => (
          <span key={STEPS[i]} className={i === step ? "on" : n < at ? "done" : ""} aria-current={i === step ? "step" : undefined}>{n + 1}. {STEPS[i]}</span>
        ))}
      </div>
      {/* Each step announces itself and takes focus when reached by Next or Back (AP-05) */}
      <h2 ref={stepHeading} tabIndex={-1} className="sr">Step {at + 1} of {order.length}: {STEPS[step]}</h2>
      {/* Enter moves to the next step; on the last step it creates the project */}
      {/* The form pans like an assembly line: forward to the left, Back to the right */}
      <form
        className={`form slide-stage${step === 0 ? " wide" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (step >= 2 && firstProblem()) return;
          if (nextStep !== undefined) slide("next", () => setStep(nextStep));
          else void create();
        }}
      >
        {/* Step 1: template */}
        {step === 0 && (
          <>
            <fieldset className="np-q">
              <legend>How should we work?</legend>
              <div className="options tpl-grid ways">
                {WAYS.map((w) => (
                  <label key={w.id} className={`card option tpl${way === w.id ? " rec" : ""}`}>
                    <input type="radio" name="way" value={w.id} checked={way === w.id} onChange={() => setWay(w.id)} className="sr" />
                    <span className="tpl-row">
                      <h4>{w.name}</h4>
                      <span className="effort" title={`${EFFORT[w.level - 1]} (${w.level} of 4)`}>
                        {[1, 2, 3, 4].map((n) => <i key={n} className={n <= w.level ? "on" : ""} aria-hidden="true" />)}
                        <span className="sr">{EFFORT[w.level - 1]}, {w.level} of 4</span>
                      </span>
                    </span>
                    <span className="muted small">{w.line}</span>
                    {/* The path it follows: NEON's four layers in their colors, or its own short steps */}
                    {w.path
                      ? <span className="tpl-path"><span className="sr">Path: </span>{w.path.map((x) => <b key={x}>{x}</b>)}</span>
                      : <span className="tpl-path neon"><span className="sr">Path: </span>{LAYERS.map(([k, n]) => <b key={k} className={`l-${k}`} title={n}><span aria-hidden="true">{n[0]}</span><span className="sr">{n} </span></b>)}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
            {/* Only a proposal and NEON ask what kind of work: it sets the key and the starter items */}
            {!light && (
              <fieldset className="np-q">
                <legend>What kind of work?</legend>
                <div className="options tpl-grid kinds-grid">
                  {KINDS.map((x) => (
                    <label key={x.id} className={`card option tpl${kind === x.id ? " rec" : ""}`}>
                      <input type="radio" name="kind" value={x.id} checked={kind === x.id} onChange={() => setKind(x.id)} className="sr" />
                      <span className="tpl-row"><h4>{x.name}</h4><span className="tag">{x.keyPrefix}</span></span>
                      <span className="muted small">{x.summary}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </>
        )}
        {/* Step 2: basics */}
        {step === 1 && (
          <>
            <p className="small muted" style={{ margin: 0 }}><sup className="req" aria-hidden="true">*</sup> Required. The rest can wait, and the project will remind you.</p>
            <div><label htmlFor="n">Name<sup className="req" aria-hidden="true">*</sup></label><input id="n" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus placeholder={quick ? "e.g. printer won't print from the front desk" : "e.g. move the file server to the cloud"} /></div>
            <div><label htmlFor="s">{quick ? "What's wrong, in a sentence or two?" : bench ? "What's it about?" : "In one or two sentences, what is this?"}</label><textarea id="s" value={projectSummary} onChange={(e) => setSummary(e.target.value)} maxLength={500} rows={2} placeholder={quick ? "e.g. since Tuesday's update, jobs sit in the queue and nothing prints" : "e.g. patients email forms to one inbox, and staff retype them into the record"} /></div>
            {/* A quick fix is done when it works, and has no example to collect: those two are for projects */}
            {!light && <div><label htmlFor="o">What will be true when it's done?</label><textarea id="o" value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={500} rows={2} placeholder="e.g. patients upload once, and the front desk sees what's missing at a glance" /></div>}
            {!light && <div><label htmlFor="x">One real example of how it works today</label><textarea id="x" value={example} onChange={(e) => setExample(e.target.value)} maxLength={2000} rows={3} placeholder="e.g. every Monday, Tomas exports the schedule to a spreadsheet and emails it to the front desk…" /></div>}
            <div><label htmlFor="d">Target date (optional)</label><input id="d" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={{ maxWidth: 220 }} /></div>
          </>
        )}
        {/* Step 3: measures */}
        {step === 2 && (
          <>
            <p className="muted small" style={{ margin: 0 }}>How will we know it worked? Add a measure with where it is now and where it should be.</p>
            {metrics.map((m, i) => {
              // Change one field of this measure
              const set = (patch: Partial<MetricDraft>) => setMetrics(metrics.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const err = measures.errors[i] ?? {};
              // One field with its inline error, tied to it for screen readers
              const field = (key: keyof MetricDraft, idp: string, label: string, input: { placeholder?: string; inputMode?: "decimal"; maxLength?: number }, cls?: string) => (
                <div className={cls}>
                  <label htmlFor={`${idp}${i}`}>{label}</label>
                  <input id={`${idp}${i}`} value={m[key]} onChange={(e) => set({ [key]: e.target.value })} aria-invalid={Boolean(err[key])} aria-describedby={err[key] ? `${idp}${i}-e` : undefined} {...input} />
                  {err[key] && <small id={`${idp}${i}-e`} className="warn" role="alert">{err[key]}</small>}
                </div>
              );
              return (
                <div key={i} className="card metric-draft">
                  {field("title", "mt", "Measure", { placeholder: "e.g. hours a week on scheduling", maxLength: MEASURE_TITLE_MAX }, "mt")}
                  {field("unit", "mu", "Unit", { placeholder: "e.g. hours", maxLength: MEASURE_UNIT_MAX })}
                  {/* Optional numbers: blank means not set (not zero); anything else must be a number */}
                  {field("baseline", "mb", "Now (optional)", { inputMode: "decimal" })}
                  {field("target", "mg", "Target (optional)", { inputMode: "decimal" })}
                  {metrics.length > 1 && <button type="button" className="linkish small rm" onClick={() => setMetrics(metrics.filter((_, j) => j !== i))} aria-label={`Remove measure ${i + 1}`}>Remove</button>}
                </div>
              );
            })}
            {metrics.length < 10 && <button type="button" className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setMetrics([...metrics, { title: "", unit: "", baseline: "", target: "" }])}>Add another measure</button>}
          </>
        )}
        {/* Step 4: review */}
        {step === 3 && (
          <div className="card">
            {/* The key's number is given at Create (the next free one), so only its prefix shows here */}
            <p className="s mono muted small" style={{ margin: 0 }}>{t.keyPrefix} · {bench ? "Workbench" : way === "proposal" ? `${t.name}, from a proposal` : t.name}</p>
            <h2 style={{ margin: "6px 0 10px" }}>{name}</h2>
            {projectSummary && <p>{projectSummary}</p>}
            {outcome && !light && <p><b>Done when:</b> {outcome}</p>}
            {targetDate && <p><b>Target:</b> {dateLabel(targetDate)}</p>}
            {/* Each measure exactly as it will be saved: the normalized numbers, with unset ones named */}
            {kept.length > 0 && !light && (
              <ul className="small" style={{ paddingLeft: 18 }}>
                {kept.map((m, i) => <li key={i}>{m.title}: now {numberWords(m.baseline)}, target {numberWords(m.target)}{m.unit ? ` (${m.unit})` : ""}</li>)}
              </ul>
            )}
            {!measures.ok && !light && <p className="notice" role="alert">A measure needs fixing before Create. <button type="button" className="linkish" onClick={firstProblem}>Show the problem</button></p>}
            {later.length > 0 && <p className="small notice">Not written yet: {later.join(", ")}. You can add {later.length === 1 ? "it" : "them"} later from the project's Overview, which will remind you.</p>}
            {quick
              ? <p className="muted small">Gets the next {t.keyPrefix} number when created. Starts with a quote to price and issue, and one handover step, "{t.items.find((i) => i.kind === "handoff")?.title}". The client approves the quote with one signature, nothing is paid up front, and the invoice is drafted when they accept the fix.</p>
              : bench ? <p className="muted small">Gets the next {t.keyPrefix} number when created. Opens as one shared page in {first?.name} on the board, and moves to done when you say so.</p>
              : <p className="muted small">Gets the next {t.keyPrefix} number when created. Starts in {first?.name}. Adds {plural(t.items.length, "starter item")}{kept.length ? ` and ${plural(kept.length, "measure")}` : ""}.</p>}
          </div>
        )}
        {error && <p className="notice" role="alert">{error}</p>}
        {/* Back, then Next or Create */}
        <div className="actions">
          {prevStep !== undefined && <button type="button" className="btn btn-ghost" onClick={() => slide("back", () => setStep(prevStep))}>Back</button>}
          <button className="btn btn-primary" type="submit" disabled={!ready[step] || busy}>{nextStep !== undefined ? "Next" : busy ? "Creating…" : unsure ? "Check again" : "Create project"}</button>
        </div>
      </form>
    </>
  );
}
