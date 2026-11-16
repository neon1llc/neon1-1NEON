// apps/api/src/emails.ts - The emails 1NEON sends, as plain text plus branded HTML.


import { branded, esc, link, sentAt } from "./mail.ts";


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


/** A notification by email: who did what, where, with a link to look */
export function noticeEmail(opts: { orgName: string; by: string; summary: string; url: string; button?: string; important?: boolean; at?: Date; zone?: string }) {
  const at = opts.at ?? new Date();
  const subject = `${opts.orgName}: ${opts.summary}`.slice(0, 140);
  const text = [
    `${opts.by} in ${opts.orgName}: ${opts.summary}`,
    "",
    `${opts.button ?? "Open 1NEON"}: ${opts.url}`,
    "",
    "Choose which of these reach you in your 1NEON profile, under Notifications.",
    sentAt(at, opts.zone),
  ].join("\n");
  const html = branded({
    label: opts.important ? "something important changed" : "something changed",
    preheader: `${opts.by}: ${opts.summary}`,
    heading: opts.summary,
    body: `<p style="margin:0">${esc(opts.by)} in <b>${esc(opts.orgName)}</b>.</p>`,
    button: { label: opts.button ?? "Open 1NEON", url: opts.url },
    note: "Choose which of these reach you in your 1NEON profile, under Notifications.",
    at,
    zone: opts.zone,
  });
  return { subject, text, html };
}
