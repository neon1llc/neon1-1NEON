// apps/web/src/pages/NewProject.tsx - New project on one screen: a name, a sentence, and how you like to
// see the work (the project's lens). Everything else is optional under More: what kind of work it is
// (which sets the key and starter items, Quick fix among them), what done looks like, an example, a
// target date, and measures. A quote or a proposal is asked for from inside the project, whichever lens
// it's in. References: Linear's and Notion's new-project dialogs (name first, details optional), Asana's
// "choose your view" at project creation.


import { QUICK_FIX, TEMPLATES } from "@1neon/domain";
import { X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useOrg, useSession, useTopBar } from "../components/Shell.tsx";
import { useToast } from "../components/ui.tsx";
import { api, Unconfirmed } from "../lib/api.ts";
import { checkMeasures, MEASURE_TITLE_MAX, MEASURE_UNIT_MAX, type MetricDraft } from "../lib/measures.ts";
import { problem, useRefresh } from "../lib/hooks.ts";
import { keepLens, LENSES, type Lens } from "./Lenses.tsx";
import type { Project } from "@1neon/domain";
import { Act } from "../components/Act.tsx";


// The kinds of work, Blank first, then lightest to most involved, Quick fix among them
const KINDS = [...TEMPLATES].sort((a, b) => (a.id === "blank" ? -1 : b.id === "blank" ? 1 : a.level - b.level));
// One line under each lens: what you'd do there
const LENS_LINE: Record<Lens, string> = {
  page: "One shared page everyone writes in. Notes, needs, ideas, links.",
  updates: "Messages to everyone on it, answered here or by email, beside what changed.",
  board: "Cards in To do, In progress, Done. Move them as work happens.",
  timeline: "Work placed on dates, with today and the target marked.",
  steps: "NEON, step by step: needs, options, the work, results, handover.",
};


// One form, one create call; only editors and admins get it
export function NewProject() {
  const { org, summary, canWrite } = useOrg();
  const me = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const refresh = useRefresh(org.id);
  // Clients start on the shared page, neon1 on NEON's steps
  const [lens, setLens] = useState<Lens>(me.operator ? "steps" : "page");
  const [kind, setKind] = useState("blank");
  const [name, setName] = useState("");
  const [projectSummary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [example, setExample] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [metrics, setMetrics] = useState<MetricDraft[]>([{ title: "", unit: "", baseline: "", target: "" }]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Create got no answer: the project may exist. Pressing again sends the same key, which finds it
  const [unsure, setUnsure] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  useTopBar(<span><Link to={`/o/${summary.slug}/projects`}>Projects</Link> / New</span>, [summary.slug]);

  // Viewers can open the page by URL but can't create
  if (!canWrite) return <p className="lead">Viewers can't start projects. Ask an editor or admin in {org.name}.</p>;
  const quick = kind === QUICK_FIX;
  // A started measure with a bad number or no name is an error, never silently dropped
  const measures = checkMeasures(metrics);

  // Create the project with its starter items and measures, then open it on its lens
  const create = async () => {
    if (!quick && !measures.ok) { setMore(true); setError("A measure needs fixing."); return; }
    setBusy(true);
    setError("");
    try {
      const p = await api<Project>(`/t/${org.id}/projects`, {
        method: "POST",
        body: { idempotencyKey: requestKey, name: name.trim(), template: kind, workflow: "neon", lens, summary: projectSummary, outcome: quick ? "" : outcome, example: quick ? "" : example, targetDate: targetDate || undefined, metrics: quick ? [] : measures.values },
      });
      keepLens(p.id, lens);
      refresh();
      toast(`${p.key} created`);
      nav(`/o/${summary.slug}/projects/${p.key}${lens === "steps" ? "" : `/${lens}`}`);
    } catch (e) {
      const lost = e instanceof Unconfirmed;
      setUnsure(lost);
      setError(lost ? "I couldn't confirm the project was made. Choose Check again to look without making a second one." : problem(e));
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">New project</h1>
      <form className="form np" data-tour="wizard" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <div><label htmlFor="n">Name<sup className="req" aria-hidden="true">*</sup></label><input id="n" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus placeholder={quick ? "e.g. printer won't print from the front desk" : "e.g. move the file server to the cloud"} /></div>
        <div><label htmlFor="s">{quick ? "What's wrong?" : "What is it, in a sentence?"}</label><textarea id="s" value={projectSummary} onChange={(e) => setSummary(e.target.value)} maxLength={500} rows={2} placeholder={quick ? "e.g. since Tuesday's update, jobs sit in the queue" : "e.g. patients email forms to one inbox, and staff retype them"} /></div>
        {/* The lens: four pictures of the same work, switchable any time */}
        <fieldset className="np-q">
          <legend>How do you like to see the work?</legend>
          <div className="options np-lenses">
            {LENSES.map((l) => {
              const Icon = l.icon;
              return (
                <label key={l.id} className={`card option np-lens${lens === l.id ? " rec" : ""}`}>
                  <input type="radio" name="lens" value={l.id} checked={lens === l.id} onChange={() => setLens(l.id)} className="sr" />
                  <span className="np-lens-head"><Icon size={18} aria-hidden="true" /><b>{l.label}</b></span>
                  <span className="helper">{LENS_LINE[l.id]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {/* Optional details, folded until asked for */}
        <details className="np-more n1-fold n1-more" open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
          <summary>More about it</summary>
          <div className="np-more-body">
            <fieldset className="np-q">
              <legend>What kind of work?</legend>
              <div className="options tpl-grid kinds-grid">
                {KINDS.map((x) => (
                  <label key={x.id} className={`card option tpl${kind === x.id ? " rec" : ""}`}>
                    <input type="radio" name="kind" value={x.id} checked={kind === x.id} onChange={() => setKind(x.id)} className="sr" />
                    <span className="tpl-row"><h4 aria-level={2}>{x.name}</h4><span className="tag">{x.keyPrefix}</span></span>
                    <span className="muted small">{x.summary}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {!quick && <div><label htmlFor="o">What will be true when it's done?</label><textarea id="o" value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={500} rows={2} placeholder="e.g. patients upload once, and the front desk sees what's missing" /></div>}
            {!quick && <div><label htmlFor="x">One real example of how it works today</label><textarea id="x" value={example} onChange={(e) => setExample(e.target.value)} maxLength={2000} rows={3} placeholder="e.g. every Monday, Tomas exports the schedule to a spreadsheet…" /></div>}
            <div><label htmlFor="d">Target date</label><input id="d" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={{ maxWidth: 220 }} /></div>
            {!quick && (
              <fieldset className="np-q">
                <legend>How will you know it worked?</legend>
                {metrics.map((m, i) => {
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
                      {field("baseline", "mb", "Now", { inputMode: "decimal" })}
                      {field("target", "mg", "Target", { inputMode: "decimal" })}
                      {metrics.length > 1 && <Act icon={X} label={`Remove measure ${i + 1}`} className="rm" run={() => setMetrics(metrics.filter((_, j) => j !== i))} />}
                    </div>
                  );
                })}
                {metrics.length < 10 && <button type="button" className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setMetrics([...metrics, { title: "", unit: "", baseline: "", target: "" }])}>Add another measure</button>}
              </fieldset>
            )}
          </div>
        </details>
        {error && <p className="notice" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={!name.trim() || busy}>{busy ? "Creating…" : unsure ? "Check again" : "Create project"}</button>
        </div>
      </form>
    </>
  );
}
