// packages/domain/src/lifecycle.ts - The service agreement's contract states on a project, kept apart:
// proposal approval, handover (delivery), the review it asks for, client acceptance, invoices and
// disputes, the defect period, waiting on the client, a pause, and an ending. None implies another:
// an unresponsive client is never recorded as having accepted, and never holds up an invoice.


import { invoiceState, undisputedOn, disputeOpen, InvoiceFields } from "./billing.ts";
import { businessDaysBetween } from "./decisions.ts";
import type { Item, Project } from "./model.ts";
import { dateIn, plusDays } from "./timing.ts";


/** Business days a client has to review handed-over work */
export const REVIEW_BUSINESS_DAYS = 10;
/** Calendar days after handover in which a reported defect is fixed at no charge */
export const DEFECT_DAYS = 30;
/** Business days after a delay notice before the affected work may pause */
export const DELAY_PAUSE_BUSINESS_DAYS = 10;
/** Calendar days after a delay notice before the affected project may end */
export const DELAY_END_DAYS = 30;
/** Days an undisputed amount must be overdue before work may pause, after written notice */
export const OVERDUE_PAUSE_DAYS = 7;


/** The date `n` business days after `from` (weekdays; holidays count as weekdays) */
export function plusBusinessDays(from: string, n: number): string {
  let d = from;
  while (businessDaysBetween(from, d) < n) d = plusDays(d, 1);
  return d;
}


/** Where the client's acceptance stands: no handover steps, none accepted, some, or all */
export function acceptanceOf(items: Pick<Item, "kind" | "status" | "fields">[]): "none" | "pending" | "partial" | "accepted" {
  const steps = items.filter((i) => i.kind === "handoff");
  if (!steps.length) return "none";
  const accepted = steps.filter((i) => Boolean((i.fields as { accepted?: unknown }).accepted)).length;
  return accepted === 0 ? "pending" : accepted < steps.length ? "partial" : "accepted";
}


/** The issued invoices that let work pause: an undisputed amount more than OVERDUE_PAUSE_DAYS overdue */
export function overdueForPause(items: Item[], today: string): Item[] {
  return items.filter((i) => {
    if (i.kind !== "invoice" || i.status === "draft" || i.status === "void") return false;
    const f = InvoiceFields.parse(i.fields);
    return Boolean(f.dueDate) && invoiceState(i, items, today) === "overdue" && today > plusDays(f.dueDate!, OVERDUE_PAUSE_DAYS) && undisputedOn(i, items) > 0;
  });
}


/** Every contract state on a project at once, each on its own, for the page and the API's checks */
export function contractStates(p: Pick<Project, "handover" | "waiting" | "paused" | "ended">, items: Item[], today: string, timeZone?: string) {
  const handed = p.handover ? dateIn(p.handover.at, timeZone) : undefined;
  const waitingSince = p.waiting ? dateIn(p.waiting.at, timeZone) : undefined;
  const acceptance = acceptanceOf(items);
  return {
    handover: p.handover,
    // The review request runs from handover; it ends at acceptance, never by silence
    reviewDue: handed ? plusBusinessDays(handed, REVIEW_BUSINESS_DAYS) : undefined,
    reviewLate: Boolean(handed) && acceptance !== "accepted" && today > plusBusinessDays(handed!, REVIEW_BUSINESS_DAYS),
    acceptance,
    defectsUntil: handed ? plusDays(handed, DEFECT_DAYS) : undefined,
    waiting: p.waiting,
    mayPauseForDelayFrom: waitingSince ? plusBusinessDays(waitingSince, DELAY_PAUSE_BUSINESS_DAYS) : undefined,
    mayEndForDelayFrom: waitingSince ? plusDays(waitingSince, DELAY_END_DAYS) : undefined,
    overdue: overdueForPause(items, today).map((i) => i.id),
    disputes: items.filter((i) => i.kind === "invoice" && disputeOpen(i)).map((i) => i.id),
    paused: p.paused,
    ended: p.ended,
  };
}
export type ContractStates = ReturnType<typeof contractStates>;


/** Why a pause can't be recorded yet, or undefined when the agreement allows it */
export function pauseProblem(reason: "waiting" | "overdue" | "other", s: ContractStates, today: string): string | undefined {
  if (s.ended) return "This project has ended.";
  if (s.paused) return "This project is already paused.";
  if (reason === "waiting") {
    if (!s.waiting) return "Record what you're waiting on first, with Waiting on you.";
    if (today < s.mayPauseForDelayFrom!) return `The agreement allows a pause for this delay from ${s.mayPauseForDelayFrom}, 10 business days after the notice.`;
  }
  if (reason === "overdue" && !s.overdue.length) return `No undisputed amount is more than ${OVERDUE_PAUSE_DAYS} days overdue.`;
  return undefined;
}


/** Why an ending for a delay can't be recorded yet, or undefined */
export function endProblem(reason: "notice" | "waiting" | "other", s: ContractStates, today: string): string | undefined {
  if (s.ended) return "This project has already ended.";
  if (reason === "waiting") {
    if (!s.waiting) return "Record what you're waiting on first, with Waiting on you.";
    if (today < s.mayEndForDelayFrom!) return `The agreement allows ending for this delay from ${s.mayEndForDelayFrom}, 30 days after the notice.`;
  }
  return undefined;
}
