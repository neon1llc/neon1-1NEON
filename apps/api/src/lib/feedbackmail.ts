// apps/api/src/lib/feedbackmail.ts - The feedback email, laid out like the bug report's: a left-aligned table of facts
// (reference, kind, where, time, sender, page, theme, browser, window), then what they wrote in its own block. Plain
// text carries the same rows in aligned columns.
import { sentAt } from "../mail.ts";
import { factMail, gist, replyTo, subjectOf } from "./factmail.ts";
import { browserName } from "./bugmail.ts";

/** What the page sent and the route fixed: everything one piece of feedback holds */
export interface Feedback {
  ref: string;
  kind: string; // the dropdown's words ("Concern")
  where: string; // the dropdown's words ("Neo chat")
  what: string;
  email: string;
  page: string;
  theme: string;
  browser: string; // the raw agent string
  viewport: string;
  at: string; // ISO time
}

const when = (iso: string) => sentAt(new Date(iso)).replace(/^Sent /, "");

/** The subject: what it is and where ("Feedback FDB-G8889Y: Concern, Neo chat") */
export function feedbackSubject(f: Feedback) {
  return subjectOf(`Feedback ${f.ref}`, `${f.kind}, ${f.where}`);
}

export function feedbackMail(f: Feedback) {
  const browser = browserName(f.browser);
  return factMail({
    kicker: "feedback",
    title: f.ref,
    sub: `${f.kind} · ${f.where}`,
    intro: [`${f.email || "Someone"} sent feedback about ${f.where}.`],
    preheader: `${f.kind}: ${gist(f.what, 90)}`,
    facts: [
      { k: "Reference", v: f.ref, mono: true },
      { k: "Kind", v: f.kind },
      { k: "About", v: f.where },
      { k: "Sent", v: when(f.at) },
      { k: "From", v: f.email ? `${f.email} (reply to this email)` : "no email left" },
      ...(f.page ? [{ k: "Page", v: f.page, mono: true }] : []),
      ...(f.theme ? [{ k: "Theme", v: f.theme }] : []),
      ...(browser ? [{ k: "Browser", v: browser }] : []),
      ...(f.viewport ? [{ k: "Window", v: f.viewport, mono: true }] : []),
    ],
    blocks: [["What they wrote", f.what]],
    action: f.email ? { label: "Reply to them", url: replyTo(f.email, feedbackSubject(f)) } : undefined,
    why: "Someone sent this with Feedback on neon1.tech or in 1NEON.",
    reply: f.email ? "Reply to this email to answer them." : "They left no email.",
    textHead: `${f.ref}  ${f.kind}  ${f.where}`,
  });
}
