// apps/web/src/pages/Settings.tsx - Settings: the organization's details and its workflow stages.


import { plural } from "../lib/plural.ts";
import { INACTIVE_DAYS, UNCHOSEN, choiceLabel, isOwnOrg, isProspect, suspendText, suspensionOf, type Layer, type Stage, type Tenant } from "@1neon/domain";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { FaceFacts, FaceForm } from "../components/OrgFace.tsx";
import { useOrg, useSession, useTopBar } from "../components/Shell.tsx";
import { NoteDialog, useSuperAct } from "../components/Suspend.tsx";
import { ReportBug } from "../components/BugReport.tsx";
import { LayerBadge, LAYERS, layerName, useAsk, useToast } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { ExportCancelled, exportOrganization, type ExportResult } from "../lib/export.ts";
import { clearStaleExports } from "../lib/export-disk.ts";
import { size, verdict } from "../lib/export-plan.ts";
import { problem } from "../lib/hooks.ts";
import { useQueryClient } from "@tanstack/react-query";


// Organization details for everyone; stage editing for admins
export function Settings() {
  const { org, summary, canAdmin: admin, access, prospect } = useOrg();
  const me = useSession();
  // A new account reads its settings; stages change once neon1 and it are working together
  const canAdmin = admin && !prospect;
  const qc = useQueryClient();
  const toast = useToast();
  // A working copy of the stages, saved all at once
  const [stages, setStages] = useState<Stage[]>(org.stages);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The place-and-link form, opened from the details card (any admin, prospects too)
  const [editFace, setEditFace] = useState(false);
  // The working copy as it is now, read when a save answers (AX-06)
  const stagesNow = useRef(stages);
  stagesNow.current = stages;
  useTopBar(<span>{org.name} · Settings</span>, [org.name]);
  // Unsaved changes enable Save and Undo
  const dirty = JSON.stringify(stages) !== JSON.stringify(org.stages);
  // Change one field of one stage in the working copy
  const set = (i: number, patch: Partial<Stage>) => setStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  // Reorder stages; the board's columns follow this order
  const move = (i: number, d: number) => {
    const next = stages.slice();
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s!);
    setStages(next);
  };
  // Save every stage at once against the organization's version; the API refuses removing a stage in use
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const sent = stages;
      const next = await api<Tenant>(`/t/${org.id}/stages`, { method: "PUT", body: { version: org.version, stages } });
      qc.setQueryData(["org", summary.id], { org: next, access });
      // Take the saved copy back, so what's on screen is exactly what was stored, unless the person kept
      // editing while it saved: then their newer edits stay, compared now against the saved version, so
      // Save stays on for them (AX-06)
      if (stagesNow.current === sent) {
        setStages(next.stages);
        toast("Workflow saved");
      } else toast("Saved the earlier version. Your newer changes are still here to save.");
    } catch (e) {
      setError(problem(e));
    }
    setBusy(false);
  };
  return (
    <>
      <h1 className="page-title">Settings</h1>
      {/* Two columns on a wide screen: who the organization is beside its data and the way to report a bug;
          the stages need the full width, so they follow below. Every group is a titled section, in the order people look for them */}
      <div className="cols2">
        <div className="stack">
          <h2 className="section-h">Organization</h2>
          <dl className="card facts">
            <div><dt>Name</dt><dd>{org.name}</dd></div>
            <div><dt>Client ID</dt><dd className="mono">{org.clientId}</dd></div>
            <div><dt>Address</dt><dd className="mono">neon1.tech/1NEON/o/{org.slug}</dd></div>
            {/* Where the business can be seen from outside; any admin may change it */}
            <div id="where"><dt>Where</dt><dd><FaceFacts place={org.place} link={org.link} linkedin={org.linkedin} />{admin && !editFace && <> <button className="linkish helper" onClick={() => setEditFace(true)}>Change</button></>}{editFace && <FaceForm onDone={() => setEditFace(false)} />}</dd></div>
            <div><dt>Your access</dt><dd><span className="tag">{me.operator ? "super" : access}</span></dd></div>
            {/* neon1's service agreement: who signed it, or a way to read and sign it */}
            <div hidden={prospect}><dt>Service agreement</dt><dd>{org.agreements?.length ? <>Signed by {org.agreements.at(-1)!.typedName}, edition {org.agreements.at(-1)!.ref}. Case studies: {choiceLabel("caseStudies", (org.choices?.at(-1) ?? UNCHOSEN).caseStudies)}. Client list: {choiceLabel("naming", (org.choices?.at(-1) ?? UNCHOSEN).naming)}. </> : "Not signed yet. "}<Link to={`/o/${summary.slug}/agreement`}>{org.agreements?.length ? "Read it" : "Read and sign"}</Link></dd></div>
          </dl>
        </div>
        <div className="stack">
          {/* The organization's own copy of everything, any time, without asking neon1 */}
          <h2 className="section-h" id="your-data">Your data</h2>
          <ExportData />
          {/* Same entry as the menu and the profile, where people look for it */}
          <h2 className="section-h">Something not working?</h2>
          <div className="card stack-tight">
            <span className="helper">Tell me what happened, or what you think, on a page that opens in a new tab.</span>
            <ReportBug kind="buttons" />
          </div>
          <SuperControls />
        </div>
      </div>
      <h2 className="section-h" id="stages">Board stages</h2>
      <p className="helper">Each row is a board column, in order: name, layer, when it's done, and an optional project limit. A hidden stage still shows while a project is in it.</p>
      {!canAdmin && <p className="helper">{prospect ? "Stages open up once we're working together." : "Only admins can change stages."}</p>}
      {/* One row per stage: name, layer, exit rule, limit, and order controls; phones stack each stage as a card */}
      <div className="stages" data-tour="stages">
        {stages.map((s, i) => (
          <div key={s.id} className={`stage${s.hidden ? " off" : ""}`}>
            <input aria-label={`Name of stage ${i + 1}`} value={s.name} disabled={!canAdmin} onChange={(e) => set(i, { name: e.target.value })} maxLength={40} />
            <select aria-label={`Layer of ${s.name}`} value={s.layer} disabled={!canAdmin} onChange={(e) => set(i, { layer: e.target.value as Layer })}>
              {LAYERS.map((l) => <option key={l} value={l}>{layerName(l)}</option>)}
            </select>
            <textarea rows={1} aria-label={`Done when, for ${s.name}`} placeholder="Done when…" value={s.exit} disabled={!canAdmin} onChange={(e) => set(i, { exit: e.target.value.replace(/\n/g, " ") })} maxLength={200} />
            <input aria-label={`Limit for ${s.name}`} placeholder="Limit" inputMode="numeric" value={s.wipLimit ?? ""} disabled={!canAdmin} onChange={(e) => set(i, { wipLimit: e.target.value ? Math.max(1, Math.min(99, Number(e.target.value) || 1)) : undefined })} />
            <span className="ctl">
              <LayerBadge layer={s.layer} />
              {canAdmin && (
                <>
                  <button className="chip" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`}>↑</button>
                  <button className="chip" disabled={i === stages.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`}>↓</button>
                  <button className="chip" onClick={() => set(i, { hidden: !s.hidden })}>{s.hidden ? "Show" : "Hide"}</button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      {/* Save and undo, with the strong sign-in requirement spelled out */}
      {canAdmin && (
        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save workflow"}</button>
          {dirty && <button className="btn btn-ghost" onClick={() => setStages(org.stages)}>Undo changes</button>}
          <span className="muted small">Saving may ask you to confirm it's you with a passkey, an authenticator app, or a text code.</span>
        </div>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
    </>
  );
}


/** Download everything in the organization as one zip: records, comments, and the activity history as
 * JSON and CSV, files as uploaded, Trash included, and manifest.json listing every file. Admins only,
 * since it holds every project and every person. Ends with a line saying whether the export is
 * complete, and what's missing if not */
function ExportData() {
  const { org, canAdmin } = useOrg();
  const toast = useToast();
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult>();
  // A large in-memory export waits here for the admin's go-ahead
  const [ask, setAsk] = useState<{ warning: string; answer: (go: boolean) => void }>();
  // A zip left in the browser's storage by an earlier export (a closed tab, a crash) is removed here
  useEffect(() => void clearStaleExports(), []);
  if (!canAdmin) return <p className="helper">An admin of {org.name} can download a copy of everything here at any time.</p>;
  const confirmLarge = (warning: string) => new Promise<boolean>((answer) => setAsk({ warning, answer: (go) => { setAsk(undefined); answer(go); } }));
  const run = async () => {
    setBusy(true);
    setResult(undefined);
    try {
      setResult(await exportOrganization(org, setSaid, confirmLarge));
      setSaid("");
    } catch (e) {
      if (e instanceof ExportCancelled) setSaid("The export didn't start.");
      else {
        setSaid("The export stopped and nothing was saved.");
        toast(`The export stopped: ${problem(e)}`);
      }
    }
    setBusy(false);
  };
  const m = result?.manifest;
  const missed = m?.files.filter((f) => f.status === "omitted") ?? [];
  const SHOWN = 20;
  return (
    <div className="card" style={{ display: "grid", gap: 10, maxWidth: 620 }}>
      <p className="small" style={{ margin: 0 }}>A copy of everything in {org.name}, as one zip file: every project's records, decisions and signatures, proposals, invoices and payments, and handover steps as JSON and CSV (spreadsheets open the CSV files), every comment, the activity history, every uploaded file as it was uploaded, and projects in Trash. manifest.json in the zip lists every file with its size and checksum, and README.txt says what each file holds and what isn't included.</p>
      <div className="actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>{busy ? "Preparing…" : "Download everything"}</button>
        {said && <span className="small muted" role="status">{said}</span>}
      </div>
      {/* Before a large export this browser would build in memory: go on, or stop and switch browsers */}
      {ask && (
        <div className="notice" role="alert" style={{ display: "grid", gap: 8 }}>
          <span className="small">{ask.warning}</span>
          <div className="actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-primary" onClick={() => ask.answer(true)}>Export anyway</button>
            <button type="button" className="btn btn-ghost" onClick={() => ask.answer(false)}>Don't start</button>
          </div>
        </div>
      )}
      {/* How it ended: complete, or partial with what's missing and what to do */}
      {result && m && (
        <div className="small" role="status" style={{ display: "grid", gap: 6 }}>
          <span>Saved <b>{result.name}</b>. {verdict(m)}</span>
          {m.complete && <span className="muted">{plural(m.counts.projects, "project")}{m.counts.trashedProjects ? ` and ${m.counts.trashedProjects} in Trash` : ""}, {m.counts.members} people, {plural(m.counts.comments ?? 0, "comment")}, {plural(m.counts.activity ?? 0, "activity record")}, and {plural(m.counts.files.included, "file")} ({size(m.counts.bytes.included)}).</span>}
          {missed.length > 0 && (
            <>
              <span>Not included:</span>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {missed.slice(0, SHOWN).map((f) => <li key={f.id}>{f.path}: {f.reason}</li>)}
                {missed.length > SHOWN && <li>and {missed.length - SHOWN} more, listed in manifest.json and README.txt</li>}
              </ul>
              <span className="muted">Download {missed.length === 1 ? "it" : "these"} from Files, then try again.{missed.some((f) => f.reason === "the upload never finished") ? " An upload that never finished needs uploading again." : ""}{missed.some((f) => f.trashed) ? " Files in Trash don't show in Files. Ask neon1 for those." : ""}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}


/** super's controls for this organization: downgrade a client to a potential, suspend or recommission it, and
 * keep it off the inactivity clock (routes/suspensions.ts). Hidden from everyone else and in neon1's own */
function SuperControls() {
  const me = useSession();
  const { org } = useOrg();
  const act = useSuperAct();
  const ask = useAsk();
  const [suspending, setSuspending] = useState(false);
  if (!me.operator || isOwnOrg(org.slug)) return null;
  const s = suspensionOf(org);
  const potential = isProspect(org);
  const downgrade = async () => {
    if (await ask({ title: `Make ${org.name} a potential?`, body: "Its people get free-account limits and it moves to Potentials. Its work and client ID stay, and promoting it brings both back.", yes: "Make potential", danger: true })) await act(`/orgs/${org.id}/downgrade`, `${org.name} is a potential`).catch(() => undefined);
  };
  return (
    <>
      <h2 className="section-h" id="super">super</h2>
      <dl className="card facts">
        <div><dt>Standing</dt><dd>{s ? <>Suspended {s.why === "super" ? "" : `(${s.why === "inactive" ? "inactivity" : "abuse"}) `}<span className="helper">{suspendText(s)}</span></> : potential ? "Potential" : "Client"}</dd></div>
        <div><dt>Inactivity</dt><dd>{org.test ? "A test organization: never suspended for inactivity" : org.keptAt ? "Kept: never suspended for inactivity" : potential && !org.prospect?.fromClient ? "Free-account clock" : org.dormant ? `${plural(org.dormant.notices, "reminder")} sent` : `Suspended after ${INACTIVE_DAYS} quiet days`}</dd></div>
        <div className="actions">
          {s
            ? <button className="btn btn-ghost btn-sm" onClick={() => void act(`/orgs/${org.id}/recommission`, `${org.name} is recommissioned`).catch(() => undefined)}>Recommission</button>
            : <button className="btn btn-ghost btn-sm" onClick={() => setSuspending(true)}>Suspend</button>}
          {!potential && <button className="btn btn-ghost btn-sm" onClick={() => void downgrade()}>Make potential</button>}
          {(!potential || org.prospect?.fromClient) && <button className="btn btn-ghost btn-sm" onClick={() => void act(`/orgs/${org.id}/keep`, org.keptAt ? `${org.name} is back on the inactivity clock` : `${org.name} is kept`, { keep: !org.keptAt }).catch(() => undefined)}>{org.keptAt ? "Stop keeping" : "Keep active"}</button>}
        </div>
      </dl>
      <NoteDialog scope="org" open={suspending} onClose={() => setSuspending(false)} title={`Suspend ${org.name}`} go={(note) => act(`/orgs/${org.id}/suspend`, `${org.name} is suspended`, note ? { note } : {})} />
    </>
  );
}
