// apps/web/src/components/Suspend.tsx - Suspensions in the portal (packages/domain/src/suspension.ts): the
// banner a suspended organization or account sees on every page, its "Ask to recommission" dialog, super's own
// banner and actions, and the note dialog super suspends with. The API refuses what a suspension stops; these
// only say so and offer the way back.


import { suspendText, type Suspension, type SuspendWhy } from "@1neon/domain";
import { ShieldCheck, RotateCcw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api.ts";
import { problem } from "../lib/hooks.ts";
import { read } from "../lib/reads.ts";
import { ago, Dialog, useAsk, useToast } from "./ui.tsx";
import { Act } from "./Act.tsx";


/** One open request, as the organization sees it */
interface OpenAsk { id: string; scope: "org" | "account"; userId?: string; userName?: string; byName: string; at: string }


/** Ask to recommission: the reason is required, and super reads it in Potentials */
export function AskDialog({ open, onClose, tid, scope, userId, whose }: { open: boolean; onClose: () => void; tid: string; scope: "org" | "account"; userId?: string; whose: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api(`/t/${tid}/recommission`, { method: "POST", body: { scope, ...(userId ? { userId } : {}), reason } });
      await qc.invalidateQueries({ queryKey: ["recommission", tid] });
      toast("Asked. You'll hear back by email.");
      setReason("");
      onClose();
    } catch (e) {
      toast(problem(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} label={`Recommission ${whose}`} className="ask">
      <h2>Recommission {whose}</h2>
      <label className="field">
        <span>Why</span>
        <textarea rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </label>
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !reason.trim()} onClick={() => void send()}>Ask</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}


/** super's note for a suspension: optional, with the default shown as the hint */
export function NoteDialog({ open, onClose, title, why = "super", scope = "account", go }: { open: boolean; onClose: () => void; title: string; why?: SuspendWhy; scope?: "org" | "account"; go: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await go(note.trim());
      setNote("");
      onClose();
    } catch {
      // The toast already said what went wrong; the dialog stays open with the note
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} label={title} className="ask">
      <h2>{title}</h2>
      <label className="field">
        <span>Message on their banner <small className="muted">optional</small></span>
        <textarea rows={3} maxLength={400} value={note} placeholder={suspendText({ why, scope })} onChange={(e) => setNote(e.target.value)} autoFocus />
      </label>
      <div className="actions">
        <button className="btn btn-danger" disabled={busy} onClick={() => void run()}>Suspend</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}


/** super's changes, each with its toast and a refresh of what it touched; a failure toasts and rethrows */
export function useSuperAct() {
  const qc = useQueryClient();
  const toast = useToast();
  return async (path: string, done: string, body: unknown = {}) => {
    try {
      await api(path, { method: "POST", body });
      toast(done);
      await Promise.all(["org", "members", "suspensions", "prospects", "me", "chat"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) {
      toast(problem(e));
      throw e;
    }
  };
}


/**
 * The banner on every page of a suspended organization or account, styled like All clients' read-only bar.
 * A member asks for their own account; an admin asks for the organization. super sees the reason and lifts it
 */
export function SuspendBar({ tid, name, s, operator, admin, me }: { tid: string; name: string; s: Suspension & { scope: "org" | "account" }; operator: boolean; admin: boolean; me: string }) {
  const act = useSuperAct();
  const [asking, setAsking] = useState(false);
  const asks = useQuery({ queryKey: ["recommission", tid], queryFn: () => read<{ requests: OpenAsk[] }>(`/t/${tid}/recommission`, { requests: "array" }), enabled: !operator });
  const mine = (asks.data?.requests ?? []).find((r) => (s.scope === "org" ? r.scope === "org" : r.scope === "account" && r.userId === me));
  // Who can ask: anyone for their own account, an admin for the organization
  const can = s.scope === "account" || admin;
  // super lifts it from the banner after a confirmation that says what changes
  const ask = useAsk();
  const recommission = async () => {
    if (!(await ask({ title: `Recommission ${name}?`, body: `${suspendText(s)} Lifting it lets ${s.scope === "org" ? "everyone in it" : "them"} make changes again, and any open request to come back closes as done.`, yes: "Recommission" }))) return;
    await act(`/orgs/${tid}/recommission`, `${name} is recommissioned`).catch(() => undefined);
  };
  return (
    <div className="readonly-bar suspend-bar" role="status">
      <strong>Suspended.</strong>
      <span>{suspendText(s)}</span>
      {operator && <Act icon={ShieldCheck} label="Recommission" run={() => void recommission()} />}
      {!operator && mine && <span>Asked {ago(mine.at)}.</span>}
      {!operator && !mine && can && <Act icon={RotateCcw} label="Ask to recommission" run={() => setAsking(true)} />}
      {!operator && !mine && !can && <span>An admin can ask to recommission it.</span>}
      {!operator && <AskDialog open={asking} onClose={() => setAsking(false)} tid={tid} scope={s.scope} whose={s.scope === "org" ? name : "your account"} />}
    </div>
  );
}
