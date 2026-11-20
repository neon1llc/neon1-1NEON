// apps/api/src/lib/contactmail.ts - The contact form email, laid out like the bug report and feedback emails: a
// left-aligned table of facts (from, organization, about, timing, how they found neon1, their local time, when it was
// sent), then what they wrote in its own blocks. Plain text carries the same rows in aligned columns.
import { sentAt } from "../mail.ts";
import { factMail, gist, replyTo, subjectOf } from "./factmail.ts";

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

/** The subject: what it is and who wrote ("Contact message — Dana Kim (Kim Dental)"); the topics are in the body and the preview line */
export function contactSubject(m: Pick<ContactMessage, "name" | "company">) {
  return subjectOf("Contact message", m.company ? `${m.name} (${m.company})` : m.name);
}

export function contactMail(m: ContactMessage) {
  return factMail({
    kicker: "contact form",
    title: m.name,
    sub: m.company || undefined,
    intro: [`${m.name} wrote through the contact form about: ${gist(m.about, 120)}.`],
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
    action: { label: `Reply to ${m.name}`, url: replyTo(m.email, contactSubject(m)) },
    why: "Someone sent this through the contact form on neon1.tech.",
    reply: "Reply to this email to answer them directly.",
  });
}
