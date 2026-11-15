// apps/api/src/routes/contact.ts - The contact form on neon1.tech: one public route that emails the
// message to neon1, with the sender as Reply-To. It mails only neon1's own inbox, never the address a
// visitor types, so it can't be used to send mail to anyone else. A hidden field catches simple bots,
// and counters cap messages per sender each hour and in total each day. The counters expire after a day.
import { FOUND_KEYS, foundLabel, messageProblem, MIN_TEXT } from "@1neon/domain";
import { emailProblem, failFields, nameProblem, textProblem, type FieldProblems } from "../lib/vet.ts";
import { z } from "zod";
import { body, fail } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { esc, branded } from "../mail.ts";


export const CONTACT_TO = "hello@neon1.tech";
export const PER_SENDER_HOURLY = 5;
export const DAILY = 50;
// Both counters expire a day after their first count; they only need to outlive the hour or day they cap
export const COUNTER_KEEP_S = 24 * 60 * 60;

// What each topic is called in the email: the site's four services, plus "something else" (kept so
// an older page still sends). A visitor may pick any number, or none, and name their own in `other`
export const TOPICS = {
  workflows: "Business workflows",
  cloud: "Cloud",
  ai: "AI",
  networks: "Networks",
  devices: "Devices and IoT",
  software: "Software",
  security: "Security awareness and readiness",
  // Older keys a cached page may still send
  business: "Business workflows and technology",
  spaces: "Networks, devices, and spaces",
  other: "Something else",
} as const;

const TopicKey = z.enum(Object.keys(TOPICS) as [keyof typeof TOPICS, ...(keyof typeof TOPICS)[]]);

const Message = z.object({
  name: z.string().trim().max(100),
  email: z.string().trim().max(200),
  company: z.string().trim().max(120).optional().default(""),
  topics: z.array(TopicKey).max(9).optional().default([]),
  // The older one-topic form, still accepted
  topic: TopicKey.optional(),
  // Their own words for what it's about, when none of the topics fits
  other: z.string().trim().max(120).optional().default(""),
  today: z.string().trim().max(3000),
  better: z.string().trim().max(1500).optional().default(""),
  timing: z.string().trim().max(200).optional().default(""),
  // "How did you find neon1?": optional, the same list as sign-up (FOUND_VIA)
  found: z.enum(FOUND_KEYS).optional(),
  // Their words for "Somewhere else"
  foundOther: z.string().trim().max(80).optional().default(""),
  // Hidden from people; a bot that fills every field fills this one too
  website: z.string().max(200).optional().default(""),
});


export function contactRoutes(app: App, k: Kit) {
  const { d, repo } = k;

  app.post("/contact", async (c) => {
    const m = await body(c, Message);
    // A filled hidden field looks like success to the bot, and nothing is sent
    if (m.website) return c.json({ ok: true });

    // Each field's check, the same as sign-up's but lighter on the name (one name is fine here), answered
    // field by field so the site can show each beside its field. Counters don't move for a typo
    const problems: FieldProblems = {};
    const today = messageProblem(m.today);
    if (today) problems.today = today;
    const email = await emailProblem(d.vetting, m.email);
    if (email) problems.email = email;
    const name = nameProblem(m.name, true);
    if (name) problems.name = name;
    const company = textProblem(m.company, "the organization's name", MIN_TEXT);
    if (company) problems.company = company;
    if (m.found === "other" && !m.foundOther) problems.foundOther = "Say where you found neon1.";
    else if (m.found === "other") { const t = textProblem(m.foundOther, "where you found neon1"); if (t) problems.foundOther = t; }
    const other = textProblem(m.other, "the topic");
    if (other) problems.other = other;
    if (Object.keys(problems).length) failFields(problems);

    // The sender's address is hashed before it's counted, so no address is stored
    const ip = (c.req.header("cloudfront-viewer-address") ?? c.req.header("x-forwarded-for") ?? "unknown").split(",")[0]!.replace(/:\d+$/, "").trim();
    // Web Crypto, not node:crypto, so the browser demo can run the same API
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)));
    const who = [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const hour = new Date().toISOString().slice(0, 13);
    const expiresAt = Math.floor(Date.now() / 1000) + COUNTER_KEEP_S;
    if ((await repo.table.increment("COUNTER", `CONTACT#${who}#${hour}`, 1, expiresAt)) > PER_SENDER_HOURLY) fail(429, "too_many", "That's a lot of messages in an hour. Email hello@neon1.tech instead.");
    if ((await repo.table.increment("COUNTER", `CONTACT#${hour.slice(0, 10)}`, 1, expiresAt)) > DAILY) fail(429, "busy", "The form is paused for today. Email hello@neon1.tech instead.");

    // Every picked topic by name, then their own words; "Not said" when they picked nothing
    const keys = [...new Set([...m.topics, ...(m.topic ? [m.topic] : [])])].filter((t) => t !== "other");
    const topic = [...keys.map((t) => TOPICS[t]), ...(m.other ? [m.other] : [])].join(", ") || "Not said";
    const rows: [string, string][] = [
      ["From", `${m.name} <${m.email}>`], ...(m.company ? [["Organization", m.company] as [string, string]] : []),
      ["About", topic], ["What happens today", m.today],
      ...(m.better ? [["What would be better", m.better] as [string, string]] : []),
      ...(m.timing ? [["Timing", m.timing] as [string, string]] : []),
      ...(m.found ? [["Found neon1 through", foundLabel(m)] as [string, string]] : []),
    ];
    const text = rows.map(([k2, v]) => `${k2}: ${v}`).join("\n\n");
    const html = branded({
      label: "website message",
      preheader: `${m.name}: ${topic}`,
      heading: `Message from ${m.name}`,
      body: rows.map(([k2, v]) => `<p style="margin:0 0 14px"><b>${esc(k2)}</b><br>${esc(v).replace(/\n/g, "<br>")}</p>`).join(""),
      note: "Reply to this email to answer them directly.",
    });
    // A message sent from dev.neon1.tech says so in its subject
    const where = process.env.APP_ENV === "dev" ? "[dev] neon1.tech" : "neon1.tech";
    await d.mailer.send(CONTACT_TO, `${where}: ${topic} (${m.name})`, text, html, m.email);
    return c.json({ ok: true });
  });
}
