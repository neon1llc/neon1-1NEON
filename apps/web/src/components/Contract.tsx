// apps/web/src/components/Contract.tsx - Where a project stands under the service agreement, each state
// on its own line: handover, the review it asks for, acceptance, the defect period, waiting on the
// client, a pause, and an ending. neon1 records them here; the client reads them. Acceptance comes
// only from the client's signature, and nothing here holds up an invoice.


import { contractStates, type Item, type Project } from "@1neon/domain";
import { useState } from "react";
import { useOrg, useSession } from "./Shell.tsx";
import { dateLabel, useToast } from "./ui.tsx";
import { api } from "../lib/api.ts";
import { problem, useRefresh } from "../lib/hooks.ts";
import { todayIn } from "@1neon/domain";


type Form = { kind: "handover" | "waiting" | "pause" | "end"; text: string; reason: string };


/** The contract lines and, for neon1, the actions that record them */
export function ContractStates({ project, items, path }: { project: Project; items: Item[]; path: string }) {
  const { org } = useOrg();
  const me = useSession();
  const toast = useToast();
  const refresh = useRefresh(org.id);
  const [form, setForm] = useState<Form>();
  const [busy, setBusy] = useState(false);
  const today = todayIn(org.timeZone);
  const s = contractStates(project, items, today, org.timeZone);
  const decided = items.some((i) => i.kind === "decision");
  // Nothing to say before work is agreed, unless neon1 already recorded something
  if (!decided && !s.handover && !s.waiting && !s.paused && !s.ended) return null;
  const send = async (url: string, body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await api(`${path}/${url}`, { method: "POST", body: { version: project.version, ...body } });
      toast(done);
      setForm(undefined);
    } catch (e) {
      toast(problem(e));
    }
    setBusy(false);
    refresh();
  };
  const submit = () => {
    if (!form) return;
    const text = form.text.trim();
    if (form.kind === "handover") return send("handover", { note: text }, "Handover recorded. The client is asked to review it.");
    if (form.kind === "waiting") return send("waiting", { need: text }, "Recorded. The client is told what's needed.");
    if (form.kind === "pause") return send("pause", { reason: form.reason, note: text }, "Work paused. The client is told.");
    return send("end", { reason: form.reason, note: text }, "Project ended. The client is told.");
  };
  const acceptance = { none: "No handover steps", pending: "Not yet accepted", partial: "Partly accepted", accepted: "Accepted" }[s.acceptance];
  const op = me.operator;
  return (
    <section className="kind-group contract" id="contract" aria-labelledby="contract-h">
      <div className="card">
      <h2 id="contract-h" className="card-h">Delivery and review</h2>
      <dl className="facts contract-lines">
        <div><dt>Handover</dt><dd>{s.handover ? <>{dateLabel(s.handover.at.slice(0, 10))}: {s.handover.note}</> : "Not handed over yet"}</dd></div>
        {s.handover && <div><dt>Review</dt><dd>{s.acceptance === "accepted" ? "Accepted" : <>{acceptance}. Review by {dateLabel(s.reviewDue)}{s.reviewLate ? ". The review is past its date; payment isn't affected" : ""}</>}</dd></div>}
        {s.handover && <div><dt>Defects fixed free</dt><dd>Reported by {dateLabel(s.defectsUntil)}</dd></div>}
        {s.waiting && <div><dt>Waiting on you</dt><dd>{s.waiting.need} <span className="muted">(since {dateLabel(s.waiting.at.slice(0, 10))}{op ? `; may pause from ${dateLabel(s.mayPauseForDelayFrom)}, end from ${dateLabel(s.mayEndForDelayFrom)}` : ""})</span></dd></div>}
        {s.payNotice && <div><dt>Notice to pay</dt><dd>Sent {dateLabel(s.payNotice.at.slice(0, 10))}. Work may pause from {dateLabel(s.mayPauseForPaymentFrom)}</dd></div>}
        {s.endNotice && <div><dt>Notice of ending</dt><dd>Sent {dateLabel(s.endNotice.at.slice(0, 10))}. The project may end from {dateLabel(s.mayEndForDelayFrom)}</dd></div>}
        {s.disputes.length > 0 && <div><dt>Invoice disputes</dt><dd>{s.disputes.length} open, answered on the invoice</dd></div>}
        {s.paused && <div><dt>Paused</dt><dd>Since {dateLabel(s.paused.at.slice(0, 10))}{s.paused.note ? `: ${s.paused.note}` : ""}</dd></div>}
        {s.ended && <div><dt>Ended</dt><dd>{dateLabel(s.ended.at.slice(0, 10))}: {s.ended.note}</dd></div>}
      </dl>
      </div>
      {op && !s.ended && !form && (
        <div className="actions">
          <button type="button" className="btn btn-sm" onClick={() => setForm({ kind: "handover", text: "", reason: "" })}>{s.handover ? "Record handover again" : "Record handover"}</button>
          {s.waiting
            ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void send("waiting/clear", {}, "No longer waiting on the client.")}>No longer waiting</button>
            : <button type="button" className="btn btn-sm" onClick={() => setForm({ kind: "waiting", text: "", reason: "" })}>Waiting on you</button>}
          {s.paused
            ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void send("resume", {}, "Work resumed. The client is told.")}>Resume</button>
            : <button type="button" className="btn btn-sm" onClick={() => setForm({ kind: "pause", text: "", reason: s.overdue.length ? "overdue" : "waiting" })}>Pause</button>}
          {s.overdue.length > 0 && !s.payNotice && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void send("pay-notice", {}, "Notice to pay sent.")}>Send notice to pay</button>}
          {s.waiting && !s.endNotice && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void send("end-notice", {}, "Notice of ending sent.")}>Send notice of ending</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ kind: "end", text: "", reason: "notice" })}>End project</button>
        </div>
      )}
      {op && form && (
        <form className="accept-form contract-form" onSubmit={(e) => { e.preventDefault(); if (!busy) void submit(); }}>
          {(form.kind === "pause" || form.kind === "end") && (
            <label>Why
              <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {form.kind === "pause"
                  ? <><option value="waiting">Still waiting on the client (10 business days after notice)</option><option value="overdue">Overdue over 7 days, after 2 business days' notice to pay</option><option value="other">Agreed with the client</option></>
                  : <><option value="notice">Written notice, 14 days</option><option value="waiting">Still waiting on the client (30 days, with 14 days' notice of ending)</option><option value="other">Agreed with the client</option></>}
              </select>
            </label>
          )}
          <label>{{ handover: "What was handed over (deliverables, documentation, access)", waiting: "What you need from the client", pause: "Note to the client (optional)", end: "Note to the client" }[form.kind]}
            <textarea rows={2} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} maxLength={form.kind === "waiting" ? 500 : 1000} required={form.kind !== "pause"} />
          </label>
          <div className="line">
            <button className="btn btn-primary btn-sm" disabled={busy || (form.kind !== "pause" && form.text.trim().length < 3)}>{{ handover: "Record and tell the client", waiting: "Tell the client", pause: "Pause and tell the client", end: "End and tell the client" }[form.kind]}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(undefined)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
