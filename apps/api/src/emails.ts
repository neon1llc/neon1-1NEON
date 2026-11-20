// apps/api/src/emails.ts - The emails 1NEON sends, as plain text plus branded HTML.


import { gist, factMail } from "./lib/factmail.ts";
import { branded, esc, link, sentAt, type SenderKind } from "./mail.ts";


/** The invite email: plain text plus the branded HTML version */
export function inviteEmail(opts: { orgName: string; inviter: string; url: string; at?: Date; zone?: string }) {
  const at = opts.at ?? new Date();
  const subject = `You're invited to ${opts.orgName} on 1NEON`;
  const about = "1NEON keeps your projects with neon1 in one place: what you need, the work, the results, and how it becomes routine.";
  const text = [
    `${opts.inviter} invited you to ${opts.orgName} on 1NEON, the neon1 project portal.`,
    "",
    about,
    "",
    `Join (sign in with a code sent to this email): ${opts.url}`,
    "",
    "Ignore this if you weren't expecting it.",
    "",
    "neon1 · 1 is glad to be of service.",
    sentAt(at, opts.zone),
  ].join("\n");
  const html = branded({
    label: "your invitation",
    preheader: `${opts.inviter} invited you to ${opts.orgName}.`,
    heading: `You're invited to ${opts.orgName}`,
    body: `<p style="margin:0 0 12px">${esc(opts.inviter)} invited you to <b>${esc(opts.orgName)}</b> on ${link("1NEON", "https://neon1.tech/1NEON/")}.</p><p style="margin:0;color:#56665c">${esc(about)}</p>`,
    button: { label: `Join ${opts.orgName}`, url: opts.url },
    note: "You'll sign in with a code sent to this email. Ignore this if you weren't expecting it.",
    at,
    zone: opts.zone,
  });
  return { subject, text, html };
}


/** The sign-in code email Cognito sends through the custom message trigger. `code` may be Cognito's
 * {####} placeholder; the browser demo passes a real one */
export function signInCodeEmail(opts: { code: string; portal: string; at?: Date; zone?: string }) {
  // Mail apps that offer to copy a code (Gmail's "Code requested") look for a plain sentence naming the
  // code; the preheader and the first line both say it that way. Cognito fills in the code in the body
  // only, so the subject can't carry it
  const subject = "Your 1NEON sign-in code";
  const html = branded({
    label: "your sign-in code",
    preheader: `Your 1NEON sign-in code is ${opts.code}. It works for a few minutes.`,
    heading: "Your sign-in code",
    body: `<p style="margin:0">Your 1NEON sign-in code is <b>${opts.code}</b>. Use it to sign in to ${link("1NEON", opts.portal)}.</p>`,
    code: opts.code,
    // The code also comes as a link that finishes sign-in; it rides in the fragment, which browsers
    // never send to a server, and only works where sign-in started
    button: { label: "Sign in with this code", url: `${opts.portal}#code=${opts.code}` },
    note: "The link works in the browser where you asked for the code. Either way, the code works for a few minutes. Ignore this email if you didn't ask for it.",
    at: opts.at,
    zone: opts.zone,
  });
  return { subject, text: `Your 1NEON sign-in code is ${opts.code}. It works for a few minutes.`, html };
}


/** Notice that a passkey was added, with where to check */
export function passkeyEmail(opts: { url: string; what?: string; at?: Date; zone?: string }) {
  const at = opts.at ?? new Date();
  const what = opts.what ?? "A passkey";
  const subject = `${what} was added to your 1NEON account`;
  const text = [
    `${what} was just added to your 1NEON account. You can now use it to confirm admin actions.`,
    "",
    `If this wasn't you, reply to this email now. Your profile: ${opts.url}`,
    "",
    "neon1 · 1 is glad to be of service.",
    sentAt(at, opts.zone),
  ].join("\n");
  const html = branded({
    label: "a sign-in method was added",
    preheader: `${what} was just added to your account.`,
    heading: `${what} was added`,
    body: `<p style="margin:0">${what} was just added to your 1NEON account. You can now use it to confirm admin actions.</p>`,
    button: { label: "Open your profile", url: opts.url },
    note: "If this wasn't you, reply to this email now.",
    at,
    zone: opts.zone,
  });
  return { subject, text, html };
}


/** Notice that a sign-in method was removed or replaced; it goes out even when the person did it */
export function factorRemovedEmail(opts: { url: string; what: string; how: "removed" | "replaced"; at?: Date; zone?: string }) {
  const at = opts.at ?? new Date();
  const subject = `${opts.what} was ${opts.how} on your 1NEON account`;
  const after = opts.how === "replaced" ? "Codes from the old one no longer work." : "It can no longer confirm admin actions.";
  const text = [
    `${opts.what} was just ${opts.how} on your 1NEON account. ${after} Other sessions must confirm again before admin actions.`,
    "",
    `If this wasn't you, reply to this email now. Your profile: ${opts.url}`,
    "",
    "neon1 · 1 is glad to be of service.",
    sentAt(at, opts.zone),
  ].join("\n");
  const html = branded({
    label: "a sign-in method changed",
    preheader: `${opts.what} was just ${opts.how}.`,
    heading: `${opts.what} was ${opts.how}`,
    body: `<p style="margin:0">${esc(opts.what)} was just ${opts.how} on your 1NEON account. ${esc(after)} Other sessions must confirm again before admin actions.</p>`,
    button: { label: "Open your profile", url: opts.url },
    note: "If this wasn't you, reply to this email now.",
    at,
    zone: opts.zone,
  });
  return { subject, text, html };
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
  "agreement.signed": "Agreement signed", "invoice.issued": "Invoice issued", "invoice.voided": "Invoice voided", "invoice.drafted": "Invoice drafted",
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
  "proposal.issued": "Open it, then decide or ask a question.",
  "option.quoted": "Open it, then decide or ask a question.",
  "proposal.refresh_asked": "Update the proposal and issue it again.",
  "comment.created": "Open the item and reply.",
};

// First words of a summary that need the actor in front of them ("Added task" becomes "Dana added task")
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
  at?: Date;
  zone?: string; // the reader's IANA time zone
}


/**
 * A notification by email: what happened, who did it, where, and what to do. The sender says what part of 1NEON it is
 * from: "1NEON Reach" for an important action in a free account (to neon1 only), "1NEON Trial" for the rest of a free
 * account's changes, and "1NEON" for a client's. The subject is the kind of event and where, never the whole story
 */
export function noticeEmail(o: NoticeOpts) {
  const at = o.at ?? new Date();
  const as: SenderKind = o.trial ? (o.operator && o.important ? "reach" : "trial") : "portal";
  const label = o.quick ? noticeLabel(o.action).replace("Proposal", "Quote") : noticeLabel(o.action);
  const sentence = noticeSentence(o.by, o.summary);
  const subject = gist([label, o.projectKey, o.orgName].filter(Boolean).join(" · "), 90);
  const todo = o.quick ? TODO[o.action]?.replace("proposal", "quote") : TODO[o.action];
  const mail = factMail({
    kicker: o.trial ? (as === "reach" ? "free account alert" : "free account update") : "update",
    title: label,
    sub: o.orgName,
    preheader: gist(sentence, 110),
    facts: [
      { k: "Who", v: o.byEmail && o.by !== "You" ? `${o.by} <${o.byEmail}>` : o.by },
      { k: "Organization", v: o.operator && o.ref ? `${o.orgName} (${o.ref}${o.trial ? ", free account" : ""})` : o.orgName },
      ...(o.projectKey ? [{ k: "Project", v: o.projectKey, href: o.projectUrl, mono: true }] : []),
      { k: "Sent", v: sentAt(at, o.zone).replace(/^Sent /, "") },
    ],
    blocks: [["What happened", sentence]],
    todo,
    action: { label: o.button ?? "Open in 1NEON", url: o.url },
    footer: [...(as === "reach" ? ["Reply to this email to answer them directly."] : []), "Choose which of these reach you in your 1NEON profile, under Notifications."],
    textHead: `${label} · ${o.orgName}`,
  });
  return { subject, text: mail.text, html: mail.html, as, replyTo: as === "reach" && o.byEmail && o.by !== "You" ? o.byEmail : undefined };
}
