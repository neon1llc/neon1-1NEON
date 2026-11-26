// apps/web/src/components/Dispute.tsx - Disputing part of an issued invoice. The decision maker or a
// client admin names the amount and why; neon1 answers on the invoice and marks it resolved. The rest
// of the invoice stays due on its date, as the service agreement says.


import { InvoiceFields, canApprove, isOwnOrg, money, parseMoney, payableOn, type Item, type Project } from "@1neon/domain";
import { useState } from "react";
import { useOrg, useSession } from "./Shell.tsx";
import { dateLabel, useToast } from "./ui.tsx";
import { api } from "../lib/api.ts";
import { problem, useRefresh } from "../lib/hooks.ts";


/** Words as a sentence: ends with a full stop unless it already ends with one */
const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);


export function InvoiceDispute({ invoice, items, project, path }: { invoice: Item; items: Item[]; project: Project; path: string }) {
  const { org, access } = useOrg();
  const me = useSession();
  const toast = useToast();
  const refresh = useRefresh(org.id);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const f = InvoiceFields.parse(invoice.fields);
  if (invoice.status === "draft" || invoice.status === "void" || f.type === "credit") return null;
  const owed = payableOn(invoice, items);
  const d = f.dispute;
  const mayDispute = !me.operator && (access === "admin" || canApprove({ userId: me.user.id, operator: false, strongSession: false }, access, project.people, isOwnOrg(org.slug)).ok);
  const post = async (url: string, body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await api(`${path}/invoices/${invoice.id}/${url}`, { method: "POST", body: { version: invoice.version, ...body } });
      toast(done);
      setOpen(false);
      setText("");
    } catch (e) {
      toast(problem(e));
    }
    setBusy(false);
    refresh();
  };
  const typed = amount.trim();
  const cents = typed ? parseMoney(typed.startsWith("$") ? typed : "$" + typed) : undefined;
  if (d) {
    return (
      <section className="dispute" aria-label="Dispute">
        <p className="pp-state" role="status">{d.name} disputed {money(d.cents)} on {dateLabel(d.at.slice(0, 10))}: {sentence(d.reason)}{d.resolved ? <> Answered by {d.resolved.name} on {dateLabel(d.resolved.at.slice(0, 10))}: {sentence(d.resolved.note)}</> : <> The rest stays due on its date. neon1 answers here.</>}</p>
        {me.operator && !d.resolved && (open ? (
          <form className="accept-form" onSubmit={(e) => { e.preventDefault(); if (!busy && text.trim().length >= 3) void post("dispute/resolve", { note: text.trim() }, "Answered. The client is told."); }}>
            <label>Your answer (make any credit or new invoice separately)<textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} required /></label>
            <div className="line"><button className="btn btn-primary btn-sm" disabled={busy || text.trim().length < 3}>Answer and resolve</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
          </form>
        ) : <div className="actions"><button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>Answer the dispute</button></div>)}
      </section>
    );
  }
  if (!mayDispute || owed <= 0) return null;
  return (
    <section className="dispute" aria-label="Dispute">
      {open ? (
        <form className="accept-form" onSubmit={(e) => { e.preventDefault(); if (!busy && cents && text.trim().length >= 3) void post("dispute", { cents, reason: text.trim() }, "Sent. The undisputed amount stays due on its date."); }}>
          <label>Amount you dispute (up to {money(owed)})<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={money(owed)} required /></label>
          <label>Which part, and why<textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} required /></label>
          <div className="line"><button className="btn btn-primary btn-sm" disabled={busy || !cents || cents > owed || text.trim().length < 3}>Send the dispute</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      ) : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Dispute part of this invoice</button>}
    </section>
  );
}
