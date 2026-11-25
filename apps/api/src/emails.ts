// apps/api/src/emails.ts - The emails 1NEON sends to its people, as plain text plus HTML in one layout (lib/factmail.ts).
// Every email says what happened in a short subject, shows the facts in a table, offers one action, and says why it
// arrived and how to change that. The sender name (mail.ts) says what kind of mail it is; dev marks only that name.


import { describesLabel, foundLabel } from "@1neon/domain";
import { factMail, gist, subjectOf, type Fact } from "./lib/factmail.ts";
import { sentAt, type SenderKind } from "./mail.ts";

// Replies to mail sent from a no-reply address go to neon1's inbox
const HELLO = "hello@neon1.tech";
const when = (at: Date, zone?: string) => sentAt(at, zone).replace(/^Sent /, "");


/** The invite email: plain text plus the HTML version */
export function inviteEmail(opts: { orgName: string; inviter: string; url: string; at?: Date; zone?: string }) {
  const at = opts.at ?? new Date();
  const mail = factMail({
    kicker: "invitation",
    title: `Join ${opts.orgName}`,
    sub: "on 1NEON",
    preheader: `${opts.inviter} invited you to ${opts.orgName}.`,
    intro: [`${opts.inviter} invited you to ${opts.orgName} on 1NEON, where your projects with neon1 stay in one place.`],
    facts: [
      { k: "Invited by", v: opts.inviter },
      { k: "Sign in", v: "With a code sent to this email address" },
      { k: "Sent", v: when(at, opts.zone) },
    ],
    action: { label: "Accept the invitation", url: opts.url },
    why: `${opts.inviter} invited this address. Ignore this email if you weren't expecting it. Nothing happens until someone signs in.`,
    reply: "Reply to this email to ask me a question, or message me in the chat once you're in.",
  });
  return { subject: subjectOf("Invitation", `${opts.orgName}, from ${opts.inviter}`, 90), ...mail, as: "portal" as SenderKind, replyTo: HELLO };
}


/** The sign-in code email Cognito sends through the custom message trigger. `code` may be Cognito's
 * {####} placeholder; the browser demo passes a real one */
export function signInCodeEmail(opts: { code: string; portal: string; at?: Date; zone?: string }) {
  // Mail apps that offer to copy a code (Gmail's "Code requested") look for a plain sentence naming the
  // code; the preheader and the first line both say it that way. Cognito fills in the code in the body
  // only, so the subject carries the time it was sent: mail apps then don't stack every code into one
  // conversation, where an old one is easy to grab
  const sent = when(opts.at ?? new Date(), opts.zone).match(/\d{1,2}:\d{2}\s[AP]M\s[^\s(]+/)?.[0];
  return codeEmail({ kind: "sign-in code", title: "Your sign-in code", says: "Your 1NEON sign-in code is", lead: "Use it to sign in to 1NEON.", subject: `Your 1NEON sign-in code, sent ${sent}`, code: opts.code, portal: opts.portal, at: opts.at, zone: opts.zone, action: "Sign in with this code" });
}


/** One code email, for each kind of code Cognito sends. `portal` is the sign-in page */
export function codeEmail(o: { kind: string; title: string; says: string; lead: string; subject: string; code: string; portal: string; at?: Date; zone?: string; action?: string }) {
  const at = o.at ?? new Date();
  const signIn = o.action !== undefined;
  const mail = factMail({
    kicker: o.kind,
    title: o.title,
    preheader: `${o.says} ${o.code}. It works for a few minutes.`,
    intro: [`${o.says} ${o.code}. ${o.lead}`],
    code: o.code,
    facts: [
      { k: "Works for", v: "A few minutes" },
      { k: "Sent", v: when(at, o.zone) },
    ],
    // The code also comes as a link that finishes sign-in; it rides in the fragment, which browsers
    // never send to a server, and only works where sign-in started
    action: signIn ? { label: o.action!, url: `${o.portal}#code=${o.code}` } : { label: "Open 1NEON", url: o.portal },
    why: signIn
      ? "Someone asked to sign in to 1NEON with this email address. The link works in the browser where you asked for the code. The code works anywhere for a few minutes."
      : "Someone asked for this code for your 1NEON account.",
    settings: { text: "If it wasn't you, ignore this email. The code expires on its own." },
  });
  return { subject: o.subject, ...mail, as: "security" as SenderKind };
}


/** Notice that a sign-in method was added or removed or replaced, with where to check; it goes out even when the
 * person did it. */
function securityEmail(opts: { url: string; what: string; how: "added" | "removed" | "replaced"; email?: string; at?: Date; zone?: string; effect: string }) {
  const at = opts.at ?? new Date();
  const mail = factMail({
    kicker: "security notice",
    title: `${opts.what} was ${opts.how}`,
    sub: "on your 1NEON account",
    preheader: `${opts.what} was just ${opts.how} on your account.`,
    intro: [opts.effect],
    facts: [
      { k: "Sign-in method", v: opts.what },
      { k: "Change", v: opts.how[0]!.toUpperCase() + opts.how.slice(1) },
      ...(opts.email ? [{ k: "Account", v: opts.email }] : []),
      { k: "Sent", v: when(at, opts.zone) },
    ],
    todo: "If this wasn't you, reply to this email now.",
    action: { label: "Open your profile", url: opts.url },
    why: "Every change to how you sign in to 1NEON is emailed to you, even one you made yourself.",
    reply: "Reply to this email to reach me.",
  });
  return { subject: subjectOf(`${opts.what} was ${opts.how}`, "your 1NEON account", 90), ...mail, as: "security" as SenderKind, replyTo: HELLO };
}


/** Notice that a passkey (or other sign-in method) was added, with where to check */
export function passkeyEmail(opts: { url: string; what?: string; email?: string; at?: Date; zone?: string }) {
  const what = opts.what ?? "A passkey";
  return securityEmail({ ...opts, what, how: "added", effect: `${what} was just added to your 1NEON account. You can now use it to confirm admin actions.` });
}


/** Notice that a sign-in method was removed or replaced */
export function factorRemovedEmail(opts: { url: string; what: string; how: "removed" | "replaced"; email?: string; at?: Date; zone?: string }) {
  const after = opts.how === "replaced" ? "Codes from the old one no longer work." : "It can no longer confirm admin actions.";
  return securityEmail({ ...opts, effect: `${opts.what} was just ${opts.how} on your 1NEON account. ${after} Other sessions must confirm again before admin actions.` });
}


// --- Notices -----------------------------------------------------------------

/** A short name for each kind of event, for the subject and the title */
const LABELS: Record<string, string> = {
  "prospect.signedup": "Free account created", "prospect.kept": "Free account kept", "prospect.promoted": "Became a client",
  "prospect.suspended": "Free account suspended", "prospect.resumed": "Free account resumed", "prospect.held": "Free account held", "prospect.released": "Free account released",
  "member.invited": "Person invited", "member.joined": "Person joined", "member.updated": "Access changed", "member.signedin": "Signed in",
  "doc.uploaded": "File uploaded", "doc.moved": "File moved", "doc.deleted": "File removed",
  "decision.approved": "Decision approved", "decision.changed": "Decision changed", "option.quoted": "Quote issued",
  "proposal.issued": "Proposal issued", "proposal.refresh_asked": "Refresh asked", "purchase.agreed": "Purchase agreed", "handoff.accepted": "Handover accepted",
  "agreement.signed": "Agreement signed", "agreement.choices": "Agreement choices changed", "invoice.issued": "Invoice issued", "invoice.voided": "Invoice voided", "invoice.drafted": "Invoice drafted",
  "payment.started": "Payment started", "payment.received": "Payment received", "payment.failed": "Payment failed",
  "project.moved": "Project moved", "project.created": "Project created", "project.trashed": "Project moved to Trash", "project.updated": "Project updated",
  "project.decider_changed": "Decision maker changed", "org.stages": "Stages changed", "org.profile": "Profile changed", "org.created": "Organization created",
  "comment.created": "New comment", "request.assessment": "Assessment requested", "request.call": "Call requested",
  "calendar.created": "Calendar event added", "calendar.updated": "Calendar event changed", "calendar.deleted": "Calendar event removed",
};

/** The short name for an action; an item's own kind names the rest ("task.created" is "Task added") */
export function noticeLabel(action: string): string {
  if (LABELS[action]) return LABELS[action]!;
  const m = /^([a-z_]+)\.(created|updated|deleted)$/.exec(action);
  if (!m) return "Update";
  const kind = m[1]!.replace(/_/g, " ");
  return `${kind[0]!.toUpperCase()}${kind.slice(1)} ${{ created: "added", updated: "changed", deleted: "removed" }[m[2] as "created"]}`;
}

/** What to do about an event, said once and only where there is something to do */
const TODO: Record<string, string> = {
  "request.assessment": "Reply to this email to answer them, or open their account.",
  "request.call": "Reply to this email to answer them, or open their account.",
  "prospect.signedup": "Nothing yet. Their first project and any request arrive as separate emails.",
  "invoice.issued": "Open the invoice, then pay it or ask a question.",
  "payment.failed": "Open the invoice and try another way to pay.",
  "proposal.issued": "Open it to read it or ask a question.",
  "option.quoted": "Open it, then decide or ask a question.",
  "proposal.refresh_asked": "Update the proposal and issue it again.",
  "comment.created": "Open the item and reply.",
};

// First words of a summary that need the actor in front of them ("Added task" becomes "Tomas added task")
const ACTOR_VERBS = new Set(["added", "removed", "created", "uploaded", "moved", "asked", "changed", "approved", "quoted", "issued", "drafted", "voided", "invited", "updated", "deleted", "renamed"]);

/** One plain sentence: who did what. The stored summary has the project's key in front, which the Project row carries */
export function noticeSentence(by: string, summary: string): string {
  const s = summary.replace(/^[A-Z][A-Z0-9]*-\d+: /, "");
  if (!s) return summary;
  const first = /^([A-Za-z]+)/.exec(s)?.[1]?.toLowerCase();
  return first && ACTOR_VERBS.has(first) ? `${by} ${s[0]!.toLowerCase()}${s.slice(1)}` : `${s[0]!.toUpperCase()}${s.slice(1)}`;
}


/** What the outbox knows about one event and one reader */
export interface NoticeOpts {
  orgName: string;
  trial: boolean; // a free account's space, not a client's
  ref?: string; // the organization's id, such as NP-0002
  by: string; // "You", a person's name, or the payment page
  byEmail?: string;
  action: string; // the audit action, which names the kind of event
  summary: string; // the stored summary, worded for this reader
  projectKey?: string;
  projectUrl?: string;
  url: string; // what the button opens
  button?: string;
  important?: boolean; // in a group that emails by default
  operator?: boolean; // the reader is neon1 itself
  quick?: boolean; // a quick fix, whose client reads "quote" where a project says "proposal"
  changes?: string[]; // each change an edit made, in words ("health At risk → On track")
  details?: Fact[]; // what neon1 knows of a free account (kind, place, link, how they found neon1), for neon1's alerts
  settingsUrl?: string; // the profile page where notifications are chosen
  at?: Date;
  zone?: string; // the reader's IANA time zone
}


/** Which sender an event goes out from: see SENDERS in mail.ts */
export function noticeSender(o: Pick<NoticeOpts, "trial" | "operator" | "important" | "action">): SenderKind {
  if (o.trial) return o.operator && o.important ? "reach" : "trial";
  if (o.operator) return "alerts";
  return /^(invoice|payment)\./.test(o.action) ? "billing" : "portal";
}


/**
 * A notification by email: what happened, who did it, where, and what to do. The sender says what part of 1NEON it is
 * from ("1NEON Reach" for an important action in a free account, to neon1 only; "1NEON Trial" for the rest of a free
 * account's changes; "neon1 Alerts" for neon1's own copy of a client's changes; "1NEON Billing" for invoices and
 * payments; "1NEON" for the rest of a client's). The subject is the kind of event and where, never the whole story
 */
export function noticeEmail(o: NoticeOpts) {
  const at = o.at ?? new Date();
  const as = noticeSender(o);
  const label = o.quick ? noticeLabel(o.action).replace("Proposal", "Quote") : noticeLabel(o.action);
  const signup = o.action === "prospect.signedup";
  const sentence = signup ? `${o.by} created a free account.` : noticeSentence(o.by, o.summary);
  // neon1 sees the account's reference; a member sees the project, then the organization
  const where = [o.projectKey, o.operator && o.ref ? `${o.orgName} (${o.ref})` : o.orgName].filter(Boolean).join(" · ");
  const todo = o.quick ? TODO[o.action]?.replace("proposal", "quote") : TODO[o.action];
  const who = o.byEmail && o.by !== "You" ? `${o.by} <${o.byEmail}>` : o.by;
  const org = o.orgName;
  const why =
    as === "reach" ? "You're a neon1 operator, and this is an important action in a free account."
    : as === "alerts" ? "You're a neon1 operator, and this is a change in a client organization."
    : o.trial ? `You're a member of ${org}'s free account on 1NEON.`
    : `You're a member of ${org} on 1NEON.`;
  const mail = factMail({
    kicker: { reach: "free account alert", trial: "free account update", alerts: "client alert", billing: "billing", portal: "update", requests: "update", bugs: "update", feedback: "update", security: "update" }[as],
    title: label,
    sub: o.orgName,
    preheader: gist(sentence, 110),
    intro: [sentence],
    facts: [
      { k: "Who", v: who },
      ...(o.operator && o.ref ? [{ k: "Organization", v: `${o.orgName} (${o.ref}${o.trial ? ", free account" : ""})` }] : []),
      ...(o.projectKey ? [{ k: "Project", v: o.projectKey, href: o.projectUrl, mono: true }] : []),
      ...(o.details ?? []),
      { k: "When", v: when(at, o.zone) },
    ],
    blocks: o.changes?.length ? [["What changed", o.changes.join("\n")]] : undefined,
    todo,
    action: { label: o.button ?? "Open in 1NEON", url: o.url },
    why,
    settings: { text: "Choose which changes email you in your 1NEON profile.", url: o.settingsUrl, label: "Notification settings" },
    reply: as === "reach" ? "Reply to this email to answer them directly." : undefined,
  });
  return { subject: subjectOf(label, where, 90), text: mail.text, html: mail.html, as, replyTo: as === "reach" && o.byEmail && o.by !== "You" ? o.byEmail : undefined };
}


/** The facts neon1 knows about a free account, in the order they help: what they do, where, their link, how they came */
export function prospectFacts(t: { place?: string; link?: string; prospect?: { kind?: string; kindOther?: string; found?: string; foundOther?: string } }): Fact[] {
  const p = t.prospect;
  return [
    ...(p?.kind ? [{ k: "Describes", v: describesLabel(p) }] : []),
    ...(t.place ? [{ k: "Where", v: t.place }] : []),
    ...(t.link ? [{ k: "Link", v: t.link, href: /^https?:\/\//i.test(t.link) ? t.link : undefined }] : []),
    ...(p?.found ? [{ k: "Found neon1 via", v: foundLabel(p) }] : []),
  ].filter((f) => f.v);
}


/** The email to neon1 when someone asks for an assessment or a call from inside 1NEON; the reply goes to them */
export function requestEmail(o: { kind: "assessment" | "call"; what: string; updated?: boolean; note: string; who?: string; email: string; org: string; ref?: string; free: boolean; place?: string; link?: string; projects?: string; url: string; at: Date }) {
  const title = o.kind === "assessment" ? (o.updated ? "Assessment request updated" : "Assessment requested") : "Call requested";
  const name = o.who || o.email;
  const mail = factMail({
    kicker: o.free ? "free account alert" : "client alert",
    title,
    sub: o.org,
    preheader: `${name} asked for ${o.what}${o.note ? `: ${gist(o.note, 80)}` : ""}`,
    intro: [o.updated ? `${name} changed their request for ${o.what}. This is the full request now.` : `${name} asked neon1 for ${o.what}.`],
    facts: [
      { k: "Who", v: o.who ? `${o.who} <${o.email}>` : o.email },
      { k: "Organization", v: `${o.org}${o.ref ? ` (${o.ref}${o.free ? ", free account" : ""})` : ""}` },
      ...(o.place ? [{ k: "Where", v: o.place }] : []),
      ...(o.link ? [{ k: "Link", v: o.link, href: /^https?:\/\//i.test(o.link) ? o.link : undefined }] : []),
      ...(o.projects ? [{ k: "Projects", v: o.projects }] : []),
      { k: "Sent", v: when(o.at) },
    ],
    blocks: o.note ? [["Their note", o.note]] : [],
    todo: "Reply to this email to answer them, or open their account.",
    action: { label: "Open the account", url: o.url },
    why: `You're a neon1 operator, and someone in ${o.free ? "a free account" : "a client organization"} asked for the next step.`,
    reply: "Reply to this email to answer them directly.",
  });
  return { subject: subjectOf(title, `${o.org}${o.ref ? ` (${o.ref})` : ""}`), ...mail, as: (o.free ? "reach" : "alerts") as SenderKind, replyTo: o.email };
}
