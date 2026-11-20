// apps/api/src/mail.ts - What every email shares: who it is from, the escaping, links, and the sent-at line.
// The layout is in lib/factmail.ts.


import { formatWhen } from "@1neon/domain";


// HTML-escape values placed into an email
export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// The brand green links are drawn in
const BRAND = "#035704";

// Who 1NEON's mail is from, as infra/modules/mail sets it for production (a test keeps the two equal);
// the walkthrough's pretend inbox shows the same sender
export const MAIL_FROM = { name: "1NEON", address: "noreply@notify.neon1.tech" } as const;

// Who a message is from, by what it is, so the sender name alone says what an email is before it is opened.
// Mail only neon1 receives: "neon1 Reach" (a contact form message), "neon1 Bugs", "neon1 Feedback", "1NEON Reach"
// (an important action by someone on a free account, such as signing up or asking for an assessment), and "neon1
// Alerts" (a client organization's change, as neon1 itself hears of it). Mail the portal sends to its people:
// "1NEON Trial" (changes in a free account's own space, and its check-ins and closing notice), "1NEON" (a client's
// changes and invitations), "1NEON Billing" (invoices and payments) and "1NEON Security" (sign-in codes and
// notices about sign-in methods). Dev adds "[DEV] " before the name and nowhere else. All send from the one
// verified notify.neon1.tech domain, so SPF and DKIM stay aligned for every address
export const SENDERS = {
  portal: { name: "1NEON", local: "noreply" },
  trial: { name: "1NEON Trial", local: "trial" },
  reach: { name: "1NEON Reach", local: "reach" },
  requests: { name: "neon1 Reach", local: "requests" },
  bugs: { name: "neon1 Bugs", local: "bugs" },
  feedback: { name: "neon1 Feedback", local: "feedback" },
  alerts: { name: "neon1 Alerts", local: "alerts" },
  billing: { name: "1NEON Billing", local: "billing" },
  security: { name: "1NEON Security", local: "security" },
} as const;
export type SenderKind = keyof typeof SENDERS;

/** A From header for one sender on the sending domain; dev puts "[DEV] " first in the display name, never in the subject */
export function fromHeader(kind: SenderKind, domain: string, dev = false) {
  const s = SENDERS[kind];
  // Quoted, since "[" and "]" are specials in a display name
  return `"${dev ? "[DEV] " : ""}${s.name}" <${s.local}@${domain}>`;
}

// The mark the site serves for mail: 96px dark green on transparent, shown at 32px for sharp screens
export const MARK = "https://neon1.tech/shared/mail/neon1-mark.png";
// Links read as links without shouting: brand green with a thin underline
const LINK = `color:${BRAND};text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px`;


/** A subtle brand link for email bodies */
export function link(label: string, url: string) {
  return `<a class="lk" href="${esc(url)}" style="${LINK}">${esc(label)}</a>`;
}


/** When a message was sent, for its sign-off: in the reader's zone with UTC beside it (neon1's own
 * zone when the reader's isn't known) */
export function sentAt(at: Date, zone?: string) {
  return `Sent ${formatWhen(at, zone)}`;
}
