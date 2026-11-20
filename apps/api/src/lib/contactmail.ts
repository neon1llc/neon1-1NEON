// apps/api/src/lib/contactmail.ts - The contact form email, laid out like the bug report and feedback emails: a
// left-aligned table of facts (from, organization, about, timing, how they found neon1, their local time, when it was
// sent), then what they wrote in its own blocks. Plain text carries the same rows in aligned columns.
import { sentAt } from "../mail.ts";
import { factMail, gist } from "./factmail.ts";

/** What the form sent and the route checked: everything one message holds */
export interface ContactMessage {
  name: string;
  email: string;
  company: string;
  about: string; // every topic picked by name, or "Not said"
  today: string; // "What happens today"
  better: string; // "What would be better", may be empty
  timing: string;
  found: string; // "Found neon1 through", already worded; empty when not said
  localTime: string; // their clock when they sent it, already worded; empty when the zone was unknown
  at: Date;
  zone: string; // the zone the sent time reads in (neon1's)
}

/** The subject: who wrote, then what about, short: the sender name already says it is the contact form */
export function contactSubject(m: Pick<ContactMessage, "name" | "about">) {
  return `${m.name} · ${gist(m.about, 50)}`;
}

export function contactMail(m: ContactMessage) {
  return factMail({
    kicker: "contact form",
    title: m.name,
    sub: gist(m.about, 60),
    preheader: `${m.name}: ${gist(m.about)}`,
    facts: [
      { k: "From", v: `${m.name} <${m.email}> (reply to this email)` },
      ...(m.company ? [{ k: "Organization", v: m.company }] : []),
      { k: "About", v: m.about },
      ...(m.timing ? [{ k: "Timing", v: m.timing }] : []),
      ...(m.found ? [{ k: "Found neon1 through", v: m.found }] : []),
      ...(m.localTime ? [{ k: "Their local time", v: m.localTime }] : []),
      { k: "Sent", v: sentAt(m.at, m.zone).replace(/^Sent /, "") },
    ],
    blocks: [["What happens today", m.today], ...(m.better ? [["What would be better", m.better] as [string, string]] : [])],
    footer: ["Reply to this email to answer them directly."],
  });
}
