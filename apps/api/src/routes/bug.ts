// apps/api/src/routes/bug.ts - The report-a-bug form on neon1.tech. Two public routes with the contact form's
// gates (a hidden field, per-sender and daily counters, a real email when one is given):
//   POST /bug            the report as JSON; mails neon1 and answers with a reference and an upload token
//   POST /bug/:ref/image one screenshot's raw bytes, sent after the report (the site's policy lets the page
//                        talk only to neon1.tech, so images pass through here, not straight to S3)
// A screenshot must be a PNG or JPEG by its first bytes (the declared type isn't trusted), under a size cap,
// within a count cap fixed when the report was made. It is stored under t/_bugs/<ref>/ in the documents
// bucket, which is private, scanned by GuardDuty, and refuses reads until the scan tags it clean. Nothing
// here deletes a screenshot. The report itself is only the email; the table keeps counters and a two-hour
// upload session.
import { messageProblem } from "@1neon/domain";
import { z } from "zod";
import { emailProblem, failFields, type FieldProblems } from "../lib/vet.ts";
import { fail } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { viewerIp } from "../lib/edge.ts";
import { branded, esc } from "../mail.ts";
import { COUNTER_KEEP_S, CONTACT_TO } from "./contact.ts";


// Where the bug is, as the page's dropdown and its ?from= values name it
export const WHERE = {
  site: "Main site",
  "1neon": "1NEON",
  demo: "1NEON demo",
  neo: "Neo chat",
  kc: "Knowledge Center",
  blog: "Blog",
  other: "Other",
} as const;
const WhereKey = z.enum(Object.keys(WHERE) as [keyof typeof WHERE, ...(keyof typeof WHERE)[]]);

export const PER_SENDER_HOURLY = 5;
export const DAILY = 50;
// Screenshots: at most this many per report, this many bytes each, and caps per sender and per day
export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const IMAGES_PER_SENDER_HOURLY = 9;
export const IMAGES_DAILY = 150;
// The upload session outlives a slow phone, not much more
const SESSION_S = 2 * 60 * 60;
// Reference characters: no 0/O or 1/I/L, so a reference read aloud or typed back stays unambiguous
const REF_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const Report = z.object({
  where: WhereKey,
  what: z.string().trim().max(3000),
  email: z.string().trim().max(200).optional().default(""),
  // How many screenshots the page is about to send
  images: z.number().int().min(0).max(MAX_IMAGES).optional().default(0),
  // What the page captured: where they came from, the theme, the browser, and the window
  page: z.string().trim().max(500).optional().default(""),
  theme: z.string().trim().max(20).optional().default(""),
  browser: z.string().trim().max(300).optional().default(""),
  viewport: z.string().trim().max(40).optional().default(""),
  // Hidden from people; a bot that fills every field fills this one too
  website: z.string().max(200).optional().default(""),
});


const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));

/** PNG or JPEG by the file's own first bytes; anything else is undefined */
export function imageKind(b: Uint8Array): { type: "image/png" | "image/jpeg"; ext: "png" | "jpg" } | undefined {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length > png.length && png.every((v, i) => b[i] === v)) return { type: "image/png", ext: "png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  return undefined;
}

/** A page address kept to its own origin and path: no query or fragment, which can carry tokens */
function cleanPage(p: string): string {
  try {
    const u = new URL(p);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return "";
  }
}


export function bugRoutes(app: App, k: Kit) {
  const { d, repo } = k;

  // The sender's address, hashed before it's counted, so no address is stored
  async function sender(c: Parameters<typeof viewerIp>[0]) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(viewerIp(c))));
    return hex(digest.slice(0, 12));
  }
  const keep = () => Math.floor(Date.now() / 1000) + COUNTER_KEEP_S;

  app.post("/bug", async (c) => {
    const raw = await c.req.json().catch(() => fail(400, "bad_json", "The request body isn't valid JSON."));
    const parsed = Report.safeParse(raw);
    if (!parsed.success) fail(400, "invalid", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    const m = parsed.data;
    // A filled hidden field looks like success to the bot, and nothing is sent
    if (m.website) return c.json({ ok: true, ref: "BUG-000000", token: "", images: 0 });

    // Field by field, as the contact form answers, so the page shows each beside its field
    const problems: FieldProblems = {};
    const what = messageProblem(m.what);
    if (what) problems.what = what.replace("Tell me a little more", "Add a little more").replace("Say what's going on.", "Say what happened.");
    if (m.email) {
      const e = await emailProblem(d.vetting, m.email);
      if (e) problems.email = e;
    }
    if (Object.keys(problems).length) failFields(problems);

    const who = await sender(c);
    const hour = new Date().toISOString().slice(0, 13);
    if ((await repo.table.increment("COUNTER", `BUG#${who}#${hour}`, 1, keep())) > PER_SENDER_HOURLY) fail(429, "too_many", "That's a lot of reports in an hour. Email hello@neon1.tech instead.");
    if ((await repo.table.increment("COUNTER", `BUG#${hour.slice(0, 10)}`, 1, keep())) > DAILY) fail(429, "busy", "The form is paused for today. Email hello@neon1.tech instead.");

    // A reference to quote, and a token that lets this page (and no one else) add the screenshots it declared
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const ref = `BUG-${[...bytes].map((b) => REF_CHARS[b % REF_CHARS.length]).join("")}`;
    const token = hex(crypto.getRandomValues(new Uint8Array(16)));
    if (m.images > 0) {
      await repo.table.write([{ put: { PK: "BUGSESSION", SK: ref, tokenHash: await sha(token), max: m.images, ttl: Math.floor(Date.now() / 1000) + SESSION_S }, guard: { create: true } }]);
    }

    const page = cleanPage(m.page);
    const rows: [string, string][] = [
      ["Reference", ref],
      ["Where", WHERE[m.where]],
      ["What happened", m.what],
      ...(m.email ? [["Reply to", m.email] as [string, string]] : []),
      ...(page ? [["Page", page] as [string, string]] : []),
      ...(m.theme ? [["Theme", m.theme] as [string, string]] : []),
      ...(m.browser ? [["Browser", m.browser] as [string, string]] : []),
      ...(m.viewport ? [["Window", m.viewport] as [string, string]] : []),
      ...(m.images ? [["Screenshots", `${m.images} on the way, kept privately at t/_bugs/${ref}/ in the documents bucket (readable once scanned clean)`] as [string, string]] : []),
    ];
    const text = rows.map(([a, b]) => `${a}: ${b}`).join("\n\n");
    const html = branded({
      label: "bug report",
      preheader: `${ref}: ${WHERE[m.where]}`,
      heading: `Bug report ${ref}`,
      body: rows.map(([a, b]) => `<p style="margin:0 0 14px"><b>${esc(a)}</b><br>${esc(b).replace(/\n/g, "<br>")}</p>`).join(""),
      note: m.email ? "Reply to this email to answer them directly." : "They left no email.",
    });
    const tag = process.env.APP_ENV === "dev" ? "[dev] neon1.tech" : "neon1.tech";
    await d.mailer.send(CONTACT_TO, `${tag} bug ${ref}: ${WHERE[m.where]}`, text, html, m.email || undefined);
    return c.json({ ok: true, ref, token, images: m.images });
  });

  app.post("/bug/:ref/image", async (c) => {
    const ref = c.req.param("ref");
    const token = c.req.header("x-bug-token") ?? "";
    // The session row exists only for a report that declared screenshots, for two hours
    const session = /^BUG-[A-Z0-9]{6}$/.test(ref) && token ? await repo.table.get("BUGSESSION", ref) : undefined;
    if (!session || session.tokenHash !== (await sha(token))) fail(403, "no_session", "That report can't take a screenshot. Send the report again.");

    const declared = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (declared !== "image/png" && declared !== "image/jpeg") fail(400, "image_type", "Screenshots must be PNG or JPEG.");
    // Read the whole body, then judge it: the length header alone can't be trusted
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) fail(400, "image_empty", "That file is empty.");
    if (bytes.length > MAX_IMAGE_BYTES) fail(400, "image_big", `Each screenshot can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
    // The first bytes decide the type, and must agree with what the page said
    const kind = imageKind(bytes);
    if (!kind || kind.type !== declared) fail(400, "image_type", "Screenshots must be PNG or JPEG.");

    const who = await sender(c);
    const hour = new Date().toISOString().slice(0, 13);
    if ((await repo.table.increment("COUNTER", `BUGIMG#${who}#${hour}`, 1, keep())) > IMAGES_PER_SENDER_HOURLY) fail(429, "too_many", "That's a lot of screenshots in an hour. Email hello@neon1.tech instead.");
    if ((await repo.table.increment("COUNTER", `BUGIMG#${hour.slice(0, 10)}`, 1, keep())) > IMAGES_DAILY) fail(429, "busy", "Screenshots are paused for today. Email hello@neon1.tech instead.");
    // A slot is claimed before the bytes are stored, so two at once can't pass the count the report declared
    const slot = await repo.table.increment("BUGSLOT", ref, 1, Math.floor(Date.now() / 1000) + SESSION_S);
    if (slot > Number(session.max)) fail(400, "too_many_images", `This report took up to ${session.max} screenshots.`);

    await d.storage.put(`t/_bugs/${ref}/${slot}.${kind.ext}`, bytes, kind.type);
    return c.json({ ok: true, n: slot });
  });
}
