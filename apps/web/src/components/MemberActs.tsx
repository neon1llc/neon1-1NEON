// apps/web/src/components/MemberActs.tsx - The dialogs behind a member's major actions on People: deactivate,
// reactivate, suspend, and recommission. Each opens from the action's second press (components/Act.tsx), names the
// person, says what will happen and what stays, takes the action's choices, and refuses up front what the API
// would refuse (the last admin, super). Cancel, Escape, or the backdrop changes nothing.


import type { AccessLevel } from "@1neon/domain";
import { suspendText } from "@1neon/domain";
import { useEffect, useState } from "react";
import type { MemberRow } from "../lib/types.ts";
import { ago, Avatar, Dialog } from "./ui.tsx";


export type MemberAct = "deactivate" | "reactivate" | "suspend" | "recommission";

const ACCESS_WORD: Record<AccessLevel, string> = { viewer: "Viewer", editor: "Editor", admin: "Admin" };
const ACCESS_HINT: Record<AccessLevel, string> = { viewer: "Reads, comments, and approves when named decision maker.", editor: "Also adds and changes work.", admin: "Also manages people and settings." };


/** One dialog for the four actions; `go` does it and resolves once saved, or throws (the toast says why) */
export function MemberActDialog({ kind, m, org, admins, onClose, go }: {
  kind?: MemberAct; m?: MemberRow; org: string; admins: number; onClose: () => void;
  go: (kind: MemberAct, m: MemberRow, opts: { access?: AccessLevel; note?: string }) => Promise<void>;
}) {
  const [access, setAccess] = useState<AccessLevel>("viewer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Each opening starts from the person's own state
  useEffect(() => { if (m) { setAccess(m.access as AccessLevel); setNote(""); } }, [m, kind]);
  if (!kind || !m) return <Dialog open={false} onClose={onClose} label="Member">{null}</Dialog>;

  const who = m.name || m.email;
  const invited = m.status === "invited";
  // The API keeps one admin: deactivating the only one is refused, so it's said here before trying
  const lastAdmin = kind === "deactivate" && m.access === "admin" && admins <= 1;
  const run = async () => {
    setBusy(true);
    try { await go(kind, m, { access, note: note.trim() || undefined }); onClose(); } catch { /* the toast said why; the dialog keeps the choices */ } finally { setBusy(false); }
  };

  const head = {
    deactivate: invited ? `Cancel ${who}'s invitation?` : `Deactivate ${who}?`,
    reactivate: `Reactivate ${who}?`,
    suspend: `Suspend ${who}?`,
    recommission: `Recommission ${who}?`,
  }[kind];
  const lead = {
    deactivate: invited ? `The invitation stops working. You can invite them again any time.` : `They lose access to ${org} now. You can reactivate them any time.`,
    reactivate: `They get access to ${org} back, at the level you choose.`,
    suspend: `Their account reads only until super recommissions it. Nothing is removed.`,
    recommission: `Their account works again as it did before the suspension.`,
  }[kind];
  const yes = { deactivate: invited ? "Cancel invitation" : "Deactivate", reactivate: "Reactivate", suspend: "Suspend", recommission: "Recommission" }[kind];
  const danger = kind === "deactivate" || kind === "suspend";

  return (
    <Dialog open onClose={onClose} label={head} className="ask act-dlg">
      <header className="card-top"><h2>{head}</h2><p>{lead}</p></header>
      {/* Who it is, so the right row was picked */}
      <div className="act-who">
        <Avatar id={m.userId} name={who} size={32} />
        <span><b>{m.name || <span className="muted">No name yet</span>}</b><br /><span className="mono small muted">{m.email}</span></span>
        <span className="small muted">{ACCESS_WORD[m.access as AccessLevel] ?? m.access} · {invited ? `invited ${ago(m.invitedAt)}` : m.status === "deactivated" ? "deactivated" : `seen ${ago(m.lastSeenAt)}`}{m.suspended ? " · suspended" : ""}</span>
      </div>

      {kind === "deactivate" && !invited && (
        <ul className="act-facts">
          <li>No sign-in, emails, or texts from {org}{org.endsWith(".") ? "" : "."}</li>
          <li>What they did here stays, under their name.</li>
          {m.suspended && <li>They're suspended, and stay suspended if you reactivate them later.</li>}
        </ul>
      )}
      {lastAdmin && <p className="act-stop" role="alert">{who} is the only admin. Make someone else an admin first, then deactivate them.</p>}

      {kind === "reactivate" && (
        <label className="field">
          <span>Access</span>
          <select value={access} onChange={(e) => setAccess(e.target.value as AccessLevel)}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <small className="muted">{ACCESS_HINT[access]}</small>
        </label>
      )}

      {kind === "suspend" && (
        <>
          <ul className="act-facts">
            <li>They can still sign in and read; changes, uploads, and messages stop.</li>
            <li>The banner tells them why, and they can ask to be recommissioned.</li>
          </ul>
          <label className="field">
            <span>Message on their banner <small className="muted">optional</small></span>
            <textarea rows={3} maxLength={400} value={note} placeholder={suspendText({ why: "super", scope: "account" })} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      )}

      {kind === "recommission" && m.suspended && (
        <ul className="act-facts">
          <li>Suspended {ago(m.suspended.at)}: {m.suspended.note || suspendText({ ...m.suspended, scope: "account" })}</li>
          <li>Any request they made to come back closes as done.</li>
        </ul>
      )}

      <div className="actions">
        <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy || lastAdmin} onClick={() => void run()}>{busy ? "Saving…" : yes}</button>
        <button className="btn btn-ghost" onClick={onClose} autoFocus>Cancel</button>
      </div>
    </Dialog>
  );
}
