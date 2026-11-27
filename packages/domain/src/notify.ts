// packages/domain/src/notify.ts - Notifications: every audit event belongs to one group, and each
// group has an importance and default email and text choices that people can change in their profile.


import { z } from "zod";


/** How much a notification matters: critical ones email by default, info ones never light the bell */
export type Level = "critical" | "normal" | "info";


/** The service agreement's written notices on a project (contract.ts): always sent, as the agreement promises */
export const CONTRACT_NOTICES: ReadonlySet<string> = new Set(["project.handed_over", "project.waiting", "project.waiting_cleared", "project.paused", "project.resumed", "project.ended", "invoice.reminded"]);


/** One kind of notification, the audit actions it covers, and its defaults */
export interface NotifyGroup {
  id: string;
  label: string;
  hint: string;
  level: Level;
  email: boolean;
  match: (action: string) => boolean;
  // Emails on by default only in a free account, and never by text (the outline tips)
  free?: boolean;
  emailOnly?: boolean;
}


// In order of importance; the first group whose match accepts an action owns it
export const NOTIFY_GROUPS: NotifyGroup[] = [
  { id: "files", label: "Files", hint: "A file is uploaded or removed", level: "critical", email: true, match: (a) => a.startsWith("doc.") },
  { id: "access", label: "People and access", hint: "Someone is invited, joins, signs up, gets a different access level, or is suspended or recommissioned", level: "critical", email: true, match: (a) => a === "member.invited" || a === "member.joined" || a === "member.updated" || a.startsWith("prospect.") || a.startsWith("access.") || a.startsWith("account.") || a.startsWith("recommission.") || a === "org.kept" || a === "org.unkept" },
  { id: "decisions", label: "Decisions and options", hint: "A proposal is issued, an option is approved or changed to another, a refresh is asked for, or a decision is waiting on you", level: "critical", email: true, match: (a) => a === "decision.approved" || a === "decision.changed" || a.startsWith("option.") || a === "proposal.issued" || a === "proposal.refresh_asked" || a === "purchase.agreed" || a === "handoff.accepted" },
  { id: "billing", label: "Agreements, invoices, and payments", hint: "The service agreement is signed or its choices change, work is handed over, paused, or ended, neon1 is waiting on you, an invoice is issued, voided, disputed, or overdue, or a payment starts, arrives, or fails", level: "critical", email: true, match: (a) => a === "agreement.signed" || a === "agreement.choices" || a === "invoice.issued" || a === "invoice.voided" || a === "invoice.disputed" || a === "invoice.dispute_resolved" || a === "invoice.reminded" || a.startsWith("payment.") || CONTRACT_NOTICES.has(a) },
  { id: "workflow", label: "Workflow and stages", hint: "A project moves stage, or the board's stages change", level: "critical", email: true, match: (a) => a === "project.moved" || a === "org.stages" || a === "project.created" || a === "project.trashed" },
  // A message in a project's Updates is written to everyone on the project, so it emails by default; reply to the email to answer
  { id: "messages", label: "Project messages", hint: "Someone writes in a project's Updates", level: "normal", email: true, match: (a) => a === "message.created" },
  // Comments come before the item catch-all below, whose pattern would otherwise claim comment.created
  { id: "comments", label: "Comments", hint: "Someone comments on an item", level: "normal", email: false, match: (a) => a === "comment.created" },
  { id: "updates", label: "Updates and items", hint: "Status updates, requests, tasks, measures, calendar events, and other items", level: "normal", email: false, match: (a) => /^[a-z_]+\.(created|updated|deleted)$/.test(a) || a === "project.updated" },
  { id: "signins", label: "Sign-ins", hint: "Someone in the organization signs in", level: "info", email: false, match: (a) => a === "member.signedin" },
  // Not an audit event: the outline pass (apps/api/src/routes/nudges.ts) asks for it by its id
  { id: "outline", label: "Outline tips", hint: "A project's outline is unfinished and nothing has gone to neon1: tips about 3 and 7 days after the last change", level: "info", email: false, free: true, emailOnly: true, match: (a) => a === "outline.tips" },
];

/** A group's email default for this person: the outline tips are on in a free account and off in a client's */
export const emailDefault = (g: NotifyGroup, free: boolean) => (g.free ? free : g.email);

/** Does this person want the outline tips by email? */
export function wantsOutlineTips(prefs: NotifyPrefs | undefined, free: boolean): boolean {
  const mine = prefs?.outline;
  return mine ? mine.email : free;
}


/**
 * Records a person signs: they get a copy too, though they did it themselves, so what they agreed to
 * reaches their inbox and their bell (a notice about anything else skips the person who acted)
 */
export const RECEIPTS = new Set(["decision.approved", "decision.changed", "agreement.signed", "handoff.accepted", "purchase.agreed"]);

/** Does the person who acted hear about it too? Signed records always; in neon1's own organization,
 * where neon1 is its own client, the billing that a client would hear about as well */
export const actorHears = (action: string, ownOrg: boolean) => RECEIPTS.has(action) || (ownOrg && groupOf(action).id === "billing");

/** Actions only neon1 hears about: its own working drafts, which a client sees once issued, and its
 * handling of prospects (sign-up, keeping, suspending), apart from a promotion to client */
export const neon1Only = (action: string) => action === "invoice.drafted" || (action.startsWith("prospect.") && action !== "prospect.promoted") || action.startsWith("recommission.") || action === "org.kept" || action === "org.unkept";

/** One account's suspension reaches that person and the organization's admins, not every colleague */
export const accountNotice = (action: string) => action.startsWith("account.");


/**
 * The wording of a notice to a person (bell and email). The stored audit summary keeps "Proposal 0041-r1"
 * so numbering and hashes never change; on a quick fix, whose client reads a quote, the notice says
 * "Quote 0041-r1" instead. Only the proposal's reference is reworded, and only when `quick` is true
 */
export const noticeSummary = (summary: string, quick: boolean) => (quick ? summary.replace(/\bProposal (?=\d{4,}-r\d+)/g, "Quote ") : summary);

/** The group an audit action belongs to; unknown actions count as updates */
export function groupOf(action: string): NotifyGroup {
  return NOTIFY_GROUPS.find((g) => g.match(action)) ?? NOTIFY_GROUPS.find((g) => g.id === "updates")!;
}


/** A person's choices per group; missing groups use the group's defaults */
export const NotifyPrefs = z.record(z.string().max(24), z.object({ email: z.boolean(), sms: z.boolean() }));
export type NotifyPrefs = z.infer<typeof NotifyPrefs>;


/** Should this person get an email (or a text) for this action? */
export function wants(prefs: NotifyPrefs | undefined, action: string, channel: "email" | "sms"): boolean {
  // The agreement's written notices always go by email, whatever the person chose
  if (channel === "email" && CONTRACT_NOTICES.has(action)) return true;
  const g = groupOf(action);
  const mine = prefs?.[g.id];
  return mine ? mine[channel] : channel === "email" ? g.email : false;
}
