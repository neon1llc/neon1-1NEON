// apps/api/src/routes/feedback.ts - The feedback form on neon1.tech: comments, complaints, concerns, and suggestions.
// One public route with the bug form's gates (a hidden field, per-sender and daily counters, a real email when one
// is given) and no screenshots, so there is no upload step: it answers with a reference and mails neon1 at once.
//   POST /feedback   the feedback as JSON; answers with a reference to quote
import { messageProblem } from "@1neon/domain";
import { z } from "zod";
import { emailProblem, failFields, type FieldProblems } from "../lib/vet.ts";
import { fail } from "../lib/http.ts";
import { originCheck, readForm, themeOk, verifyGate, viewportOk } from "../lib/formgate.ts";
import type { App, Kit } from "../lib/kit.ts";
import { viewerIp } from "../lib/edge.ts";
import { alertNeon1 } from "../lib/alert.ts";
import { feedbackMail, feedbackSubject, type Feedback } from "../lib/feedbackmail.ts";
import { COUNTER_KEEP_S, CONTACT_TO } from "./contact.ts";
import { WHERE } from "./bug.ts";

// What kind of feedback it is, as the page's dropdown names it
export const KIND = {
  comment: "Comment",
  complaint: "Complaint",
  concern: "Concern",
  suggestion: "Suggestion",
} as const;
const KindKey = z.enum(Object.keys(KIND) as [keyof typeof KIND, ...(keyof typeof KIND)[]]);
// What it is about: the places the bug form names, the same ?from= values
const WhereKey = z.enum(Object.keys(WHERE) as [keyof typeof WHERE, ...(keyof typeof WHERE)[]]);

export const PER_SENDER_HOURLY = 5;
export const DAILY = 50;
// Reference characters: no 0/O or 1/I/L, so a reference read aloud or typed back stays unambiguous
const REF_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const Body = z.object({
  kind: KindKey,
  where: WhereKey,
  what: z.string().trim().max(3000),
  email: z.string().trim().max(200).optional().default(""),
  // What the page captured: where they came from, the theme, the browser, and the window
  page: z.string().trim().max(500).optional().default(""),
  theme: z.string().trim().max(20).optional().default(""),
  browser: z.string().trim().max(300).optional().default(""),
  viewport: z.string().trim().max(40).optional().default(""),
  // Hidden from people; a bot that fills every field fills this one too
  website: z.string().max(200).optional().default(""),
  // The answer to the challenge the page asked for when it opened (lib/formgate.ts)
  gate: z.object({ id: z.string().max(40), nonce: z.string().max(20) }).optional(),
});

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** A page address kept to its own origin and path: no query or fragment, which can carry tokens */
function cleanPage(p: string): string {
  try {
    const u = new URL(p);
    // Only neon1's own pages: a link to anywhere else would reach the inbox as bait
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (!/(^|\.)neon1\.tech$|^localhost$/.test(u.hostname)) return "";
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return "";
  }
}

export function feedbackRoutes(app: App, k: Kit) {
  const { d, repo } = k;

  app.post("/feedback", async (c) => {
    // Where it came from and how big it is, before anything is read; then the shape, then the gates
    originCheck(c, k);
    const raw = await readForm(c);
    const parsed = Body.safeParse(raw);
    if (!parsed.success) fail(400, "invalid", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    const m = parsed.data;
    // A filled hidden field looks like success to the bot, and nothing is sent
    if (m.website) return c.json({ ok: true, ref: "FDB-000000" });
    // A challenge this server issued, answered at person speed, once
    await verifyGate(k, "feedback", m.gate);

    // Field by field, as the bug form answers, so the page shows each beside its field
    const problems: FieldProblems = {};
    const what = messageProblem(m.what);
    if (what) problems.what = what.replace("Tell me a little more", "Add a little more").replace("Say what's going on.", "Say what's on your mind.");
    if (m.email) {
      const e = await emailProblem(d.vetting, m.email);
      if (e) problems.email = e;
    }
    if (Object.keys(problems).length) failFields(problems);

    // The sender's address, hashed before it's counted, so no address is stored
    const who = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(viewerIp(c)))).slice(0, 12));
    const hour = new Date().toISOString().slice(0, 13);
    const keep = Math.floor(Date.now() / 1000) + COUNTER_KEEP_S;
    if ((await repo.table.increment("COUNTER", `FDB#${who}#${hour}`, 1, keep)) > PER_SENDER_HOURLY) fail(429, "too_many", "That's a lot of feedback in an hour. Email hello@neon1.tech instead.");
    if ((await repo.table.increment("COUNTER", `FDB#${hour.slice(0, 10)}`, 1, keep)) > DAILY) fail(429, "busy", "The form is paused for today. Email hello@neon1.tech instead.");

    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const ref = `FDB-${[...bytes].map((b) => REF_CHARS[b % REF_CHARS.length]).join("")}`;
    const fb: Feedback = { ref, kind: KIND[m.kind], where: WHERE[m.where], what: m.what, email: m.email, page: cleanPage(m.page), theme: themeOk(m.theme), browser: m.browser, viewport: viewportOk(m.viewport), at: new Date().toISOString() };
    const { text, html } = feedbackMail(fb);
    await alertNeon1(d, { severity: "info", title: "New feedback", text: "Feedback arrived.", source: "feedback", to: [d.cfg.feedbackTo ?? CONTACT_TO], mail: { subject: feedbackSubject(fb), text, html, replyTo: fb.email || undefined, as: "feedback" } });
    return c.json({ ok: true, ref });
  });
}
