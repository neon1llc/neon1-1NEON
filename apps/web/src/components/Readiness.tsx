// apps/web/src/components/Readiness.tsx - A project's way from a first outline to an agreed option, on
// its Overview: a percent, the four steps, and the six outline parts with a tip for each, where to write
// it, and where it goes once the work starts (Execute, Observe, Normalize). The same parts Home's Next
// step and neon1's assessment read (packages/domain/src/outline.ts). It goes once there's a decision.


import { OUTLINE_CARRIES, OUTLINE_PARTS, readinessOf, type Item, type OutlinePart, type Project } from "@1neon/domain";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Link } from "react-router";
import { read } from "../lib/reads.ts";
import { useOrg } from "./Shell.tsx";
import { dateLabel, layerSlug } from "./ui.tsx";


// Home's Next step answer (routes/requests.ts), for when this project was sent for assessment
type Asked = { projects: { key: string; sentAt?: string }[] };


/** The readiness card. `onEditBasics` opens the Overview's own edit form for the parts written there */
export function Readiness({ project: p, items, orgId, slug, canWrite, prospect, onEditBasics }: {
  project: Project; items: Item[]; orgId: string; slug: string; canWrite: boolean; prospect: boolean; onEditBasics: () => void;
}) {
  const asked = useQuery({ queryKey: ["requests", orgId], queryFn: () => read<Asked>(`/t/${orgId}/requests`, { projects: "array" }), enabled: canWrite });
  const sentAt = asked.data?.projects.find((x) => x.key === p.key)?.sentAt;
  // A client's project that neon1 has moved past the first stage is already being assessed in person
  const { org } = useOrg();
  const first = (org.stages.find((x) => !x.hidden) ?? org.stages[0])?.id;
  const moved = !prospect && p.stageId !== first;
  const r = readinessOf(p, items, sentAt ?? (moved ? p.stageEnteredAt : undefined));
  if (r.steps.decide) return null;
  const base = `/o/${slug}/projects/${p.key}`;
  // Where each part is written: the basics on this page, the example and people in Needs, measures in Observe
  const where = (id: OutlinePart) => {
    if (!canWrite) return null;
    if (id === "what" || id === "done" || id === "limits") return <button type="button" className="linkish small" onClick={onEditBasics}>{id === "limits" ? "Set a target date" : "Write it here"}</button>;
    if (id === "measure") return <Link className="small" to={`${base}/${layerSlug("observation")}`}>Add in Observe</Link>;
    return <Link className="small" to={`${base}/${layerSlug("needs")}`}>Answer in Needs</Link>;
  };
  const tick = (done: boolean) => <span className={`tick${done ? " on" : ""}`} aria-hidden="true">{done ? <Check size={12} /> : null}</span>;
  const n = r.outline.have.length;

  return (
    <section className="card readiness" aria-labelledby="ready-h" data-tour="readiness">
      <h2 className="section-h" id="ready-h">Ready for Execute <small>{r.percent}%</small></h2>
      <span className="ready-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.percent} aria-label="Ready for Execute"><i style={{ width: `${r.percent}%` }} /></span>
      <p className="small muted">Before the work starts, a project goes from an outline to one agreed option. Everything you write here is optional, and each part makes the assessment and our call sharper.</p>
      <ol className="ready-steps">
        <li className={r.steps.outline ? "done" : ""}>
          <details open={!r.steps.outline && canWrite}>
            <summary>{tick(r.steps.outline)}<span><b>Outline</b> <span className="muted small">{n} of {OUTLINE_PARTS.length}</span></span></summary>
            <ul className="ready-parts">
              {OUTLINE_PARTS.map((part) => {
                const done = r.outline.have.includes(part.id);
                return (
                  <li key={part.id} className={done ? "done" : ""}>
                    {tick(done)}
                    <span>
                      <span className="ready-part">{part.label}</span>
                      {!done && <span className="small"> Add {part.tip}. {where(part.id)}</span>}
                      <span className="small muted ready-carries">{OUTLINE_CARRIES[part.id]}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        </li>
        <li className={r.steps.assess ? "done" : ""}>
          {tick(r.steps.assess)}
          <span><b>Assessment</b> <span className="small muted">{sentAt ? `Sent ${dateLabel(sentAt)}. The reply comes by email.` : moved && !r.steps.options ? "Under way with neon1." : r.steps.assess ? "Done." : <>{prospect ? "Free: m" : "M"}y read of what's written, plausible approaches, and the first questions to settle. Ask for it under <Link to={`/o/${slug}/workspace`}>Next step</Link> on Home.</>}</span></span>
        </li>
        <li className={r.steps.options ? "done" : ""}>
          {tick(r.steps.options)}
          <span><b>Options</b> <span className="small muted">{r.steps.options ? <>Ready to compare under <Link to={`${base}/${layerSlug("needs")}#options`}>Needs</Link>.</> : prospect ? "After the assessment and our call, I write up options with what each costs and takes." : "neon1 writes up options under Needs, with what each costs and takes."}</span></span>
        </li>
        <li>
          {tick(false)}
          <span><b>Decision</b> <span className="small muted">One option approved with a signature. Then Execute starts: the outline becomes the plan, its measure is tracked in Observe, and its people and tools shape the handover in Normalize.</span></span>
        </li>
      </ol>
    </section>
  );
}
