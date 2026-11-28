// apps/api/src/routes/contract.ts - The service agreement's contract states on a project, each its own
// record (lifecycle.ts): neon1 records a handover, a delay notice, a pause, and an ending; a client
// disputes part of an invoice and neon1 answers it. Every one is audited, and the audit notice is the
// written notice the agreement promises. Acceptance stays the client's signature on handover steps,
// and invoices stay with the billing routes: nothing here accepts work or holds up an invoice.


import { ContractEvent, END_NOTICE_DAYS, InvoiceFields, PAY_NOTICE_BUSINESS_DAYS, REVIEW_BUSINESS_DAYS, contractStates, plusBusinessDays, plusDays, disputeOpen, endProblem, money, pauseProblem, payableOn, todayIn, type Item, type Project } from "@1neon/domain";
import type { Context } from "hono";
import { z } from "zod";
import { actorId, body, fail, need, now, who, type Env } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { closingDraft, currentDecision } from "./items.ts";


/** A date as people read it in a notice: "December 10, 2026" */
const dateLabelOf = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const Note = z.string().trim().max(1000).default("");
const Versioned = { version: z.number().int() };
export const HandoverInput = z.object({ ...Versioned, note: z.string().trim().min(3).max(1000) });
export const WaitingInput = z.object({ ...Versioned, need: z.string().trim().min(3).max(500) });
export const PauseInput = z.object({ ...Versioned, reason: z.enum(["waiting", "overdue", "other"]), note: Note });
export const EndInput = z.object({ ...Versioned, reason: z.enum(["notice", "waiting", "other"]), note: z.string().trim().min(3).max(1000) });
export const ClearInput = z.object({ ...Versioned, note: Note });
export const DisputeInput = z.object({ version: z.number().int(), cents: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) });
export const ResolveInput = z.object({ version: z.number().int(), note: z.string().trim().min(3).max(1000) });


export function contractRoutes(app: App, k: Kit) {
  const { repo, project } = k;

  /** neon1 only: the contract records are neon1's to make */
  const neon1 = (c: Context<Env>) => {
    need(c, "write");
    if (!who(c).actor.operator) fail(403, "neon1_only", "neon1 records this.");
  };
  const event = (c: Context<Env>, note = ""): ContractEvent => {
    const u = who(c).user;
    return { at: now(), by: u.id, name: u.name || u.email, note };
  };
  /** Save the project with one change, guarded on the version the person saw, and audit it */
  async function save(c: Context<Env>, p: Project, version: number, change: Partial<Project>, action: string, summary: string, extra: Parameters<typeof repo.table.write>[0] = []) {
    if (version !== p.version) fail(409, "conflict", "This project changed since you opened it. Review it again.", p);
    const ts = now();
    const next: Project = { ...p, ...change, version: p.version + 1, updatedAt: ts, updatedBy: actorId(c) };
    await repo.table.write([repo.projectOp(next, { version: p.version }), ...extra, repo.auditOp({ tenantId: p.tenantId, actorId: actorId(c), action, target: p.id, summary: `${p.key}: ${summary}` })]);
    return next;
  }
  const states = async (c: Context<Env>, p: Project) => {
    const t = c.get("tenant");
    const items = await repo.listItems(p.tenantId, p.id);
    const today = todayIn(t.timeZone);
    return { items, today, s: contractStates(p, items, today, t.timeZone) };
  };

  /** Where every contract state stands on this project, for anyone who can read it */
  app.get("/t/:tid/projects/:pid/contract", async (c) => {
    need(c, "read");
    const p = await project(c);
    return c.json((await states(c, p)).s);
  });

  /**
   * neon1 hands the work over: the deliverables, documentation, and access are provided. This starts
   * the 10-business-day review request and the 30-day defect period, and drafts the final invoice.
   * It never records acceptance
   */
  app.post("/t/:tid/projects/:pid/handover", async (c) => {
    neon1(c);
    const p = await project(c);
    const input = await body(c, HandoverInput);
    if (p.ended) fail(409, "ended", "This project has ended.");
    const { items, today } = await states(c, p);
    const decision = currentDecision(items);
    const hasFinal = items.some((i) => i.kind === "invoice" && i.status !== "void" && i.fields.type === "final");
    const draft = decision && !hasFinal ? closingDraft(p, decision, items, now(), actorId(c)) : undefined;
    const due = dateLabelOf(plusBusinessDays(today, REVIEW_BUSINESS_DAYS));
    const next = await save(c, p, input.version, { handover: event(c, input.note) }, "project.handed_over",
      `handed over: ${input.note.replace(/[.!?]$/, "")}. Please review it by ${due}.`,
      draft ? [repo.itemOp(draft, { create: true })] : []);
    return c.json(next);
  });

  /** neon1 is waiting on the client: what's needed, told to the client. Clearing it ends the delay */
  app.post("/t/:tid/projects/:pid/waiting", async (c) => {
    neon1(c);
    const p = await project(c);
    const input = await body(c, WaitingInput);
    if (p.ended) fail(409, "ended", "This project has ended.");
    const next = await save(c, p, input.version, { waiting: { ...event(c), need: input.need } }, "project.waiting", `waiting on you: ${input.need}`);
    return c.json(next);
  });
  app.post("/t/:tid/projects/:pid/waiting/clear", async (c) => {
    neon1(c);
    const p = await project(c);
    const input = await body(c, ClearInput);
    if (!p.waiting) fail(409, "not_waiting", "Nothing is waiting on the client.");
    return c.json(await save(c, p, input.version, { waiting: undefined, endNotice: undefined }, "project.waiting_cleared", `no longer waiting on you${input.note ? `: ${input.note}` : ""}`));
  });

  /** Written notice to pay, before a pause for an undisputed amount more than 7 days overdue */
  app.post("/t/:tid/projects/:pid/pay-notice", async (c) => {
    neon1(c);
    const p = await project(c);
    const input = await body(c, ClearInput);
    const { s, today } = await states(c, p);
    if (p.ended) fail(409, "ended", "This project has ended.");
    if (!s.overdue.length) fail(409, "not_allowed", "No undisputed amount is more than 7 days overdue.");
    if (s.payNotice) fail(409, "already_noticed", "Notice to pay is already sent.");
    const from = dateLabelOf(plusBusinessDays(today, PAY_NOTICE_BUSINESS_DAYS));
    return c.json(await save(c, p, input.version, { payNotice: { ...event(c, input.note), invoices: s.overdue } }, "project.pay_notice",
      `please pay the overdue undisputed amount. If it stays unpaid, the affected work may pause from ${from}${input.note ? `. ${input.note}` : ""}`));
  });

  /** Written notice of an intended ending for a delay, at least 14 days ahead */
  app.post("/t/:tid/projects/:pid/end-notice", async (c) => {
    neon1(c);
    const p = await project(c);
    const input = await body(c, ClearInput);
    const { s, today } = await states(c, p);
    if (p.ended) fail(409, "ended", "This project has ended.");
    if (!p.waiting) fail(409, "not_allowed", "Record what you're waiting on first, with Waiting on you.");
    if (s.endNotice) fail(409, "already_noticed", "Notice of the ending is already sent.");
    const earliest = [s.mayEndForDelayFrom!, plusDays(today, END_NOTICE_DAYS)].sort().at(-1)!;
    return c.json(await save(c, p, input.version, { endNotice: event(c, input.note) }, "project.end_notice",
      `this project may end on or after ${dateLabelOf(earliest)} unless the delay is resolved: ${p.waiting!.need}${input.note ? `. ${input.note}` : ""}`));
  });

  /** neon1 pauses the work, only when the agreement allows: a delay past 10 business days, or an undisputed amount more than 7 days overdue */
  app.post("/t/:tid/projects/:pid/pause", async (c) => {
    neon1(c);
    const p = await project(c);
    const input = await body(c, PauseInput);
    const { s, today } = await states(c, p);
    const problem = pauseProblem(input.reason, s, today);
    if (problem) fail(409, "not_allowed", problem);
    const why = { waiting: `still waiting on you: ${p.waiting?.need ?? ""}`, overdue: "an undisputed amount is more than 7 days overdue after notice to pay", other: "" }[input.reason];
    return c.json(await save(c, p, input.version, { paused: { ...event(c, input.note), reason: input.reason } }, "project.paused", `work paused${why ? `, ${why}` : ""}${input.note ? `. ${input.note}` : ""}. Your systems, data, and access are untouched`));
  });
  app.post("/t/:tid/projects/:pid/resume", async (c) => {
    neon1(c);
    const p = await project(c);
    const input = await body(c, ClearInput);
    if (!p.paused) fail(409, "not_paused", "This project isn't paused.");
    return c.json(await save(c, p, input.version, { paused: undefined }, "project.resumed", `work resumed${input.note ? `: ${input.note}` : ""}`));
  });

  /** neon1 records that a project ended: on written notice, after a delay the agreement allows, or otherwise */
  app.post("/t/:tid/projects/:pid/end", async (c) => {
    neon1(c);
    const p = await project(c);
    const input = await body(c, EndInput);
    const { s, today } = await states(c, p);
    const problem = endProblem(input.reason, s, today);
    if (problem) fail(409, "not_allowed", problem);
    return c.json(await save(c, p, input.version, { ended: { ...event(c, input.note), reason: input.reason } }, "project.ended", `project ended: ${input.note}. You pay for work properly performed and approved purchases that can't be canceled or refunded. A final statement follows, any unearned balance is refunded, and your access and the work so far are handed over`));
  });

  // --- Invoice disputes ------------------------------------------------------------------------

  async function issuedInvoice(c: Context<Env>, p: Project): Promise<Item> {
    const it = await repo.getItem(p.tenantId, p.id, c.req.param("iid")!);
    if (!it || it.kind !== "invoice") fail(404, "not_found", "That invoice doesn't exist.");
    if (it.status === "draft" || it.status === "void" || it.fields.type === "credit") fail(409, "not_disputable", "Only an issued invoice can be disputed.");
    return it;
  }

  /** The decision maker or a client admin disputes part of an issued invoice: how much and why */
  app.post("/t/:tid/projects/:pid/invoices/:iid/dispute", async (c) => {
    need(c, "read");
    const { actor } = who(c);
    const p = await project(c);
    const isDecider = p.people.some((x) => x.userId === actorId(c) && x.role === "decision_maker");
    if (actor.operator || !(isDecider || c.get("access") === "admin")) fail(403, "not_allowed", "The decision maker or an admin of your organization disputes an invoice.");
    const it = await issuedInvoice(c, p);
    const input = await body(c, DisputeInput);
    if (input.version !== it.version) fail(409, "conflict", "This invoice changed since you opened it.", it);
    if (disputeOpen(it)) fail(409, "already_disputed", "This invoice already has an open dispute. neon1 will answer it here.");
    const items = await repo.listItems(p.tenantId, p.id);
    const owed = payableOn(it, items);
    if (input.cents > owed) fail(400, "too_much", `That's more than the ${money(owed)} still owed on it.`);
    const u = who(c).user;
    const ts = now();
    const f = InvoiceFields.parse(it.fields);
    const next: Item = { ...it, fields: { ...it.fields, dispute: { by: u.id, name: u.name || u.email, at: ts, cents: input.cents, reason: input.reason } }, version: it.version + 1, updatedAt: ts, updatedBy: u.id };
    await repo.table.write([repo.itemOp(next, { version: it.version }), repo.auditOp({ tenantId: p.tenantId, actorId: u.id, action: "invoice.disputed", target: it.id, summary: `${p.key}: ${u.name || u.email} disputed ${money(input.cents)} of ${f.number}: ${input.reason}` })]);
    return c.json(next);
  });

  /** neon1 answers a dispute and marks it resolved (a credit or a new invoice is made separately) */
  app.post("/t/:tid/projects/:pid/invoices/:iid/dispute/resolve", async (c) => {
    neon1(c);
    const p = await project(c);
    const it = await issuedInvoice(c, p);
    const input = await body(c, ResolveInput);
    if (input.version !== it.version) fail(409, "conflict", "This invoice changed since you opened it.", it);
    const f = InvoiceFields.parse(it.fields);
    if (!f.dispute || f.dispute.resolved) fail(409, "no_dispute", "This invoice has no open dispute.");
    const u = who(c).user;
    const ts = now();
    const next: Item = { ...it, fields: { ...it.fields, dispute: { ...f.dispute, resolved: { by: u.id, name: u.name || u.email, at: ts, note: input.note } } }, version: it.version + 1, updatedAt: ts, updatedBy: u.id };
    await repo.table.write([repo.itemOp(next, { version: it.version }), repo.auditOp({ tenantId: p.tenantId, actorId: u.id, action: "invoice.dispute_resolved", target: it.id, summary: `${p.key}: answered the dispute on ${f.number}: ${input.note}` })]);
    return c.json(next);
  });
}
