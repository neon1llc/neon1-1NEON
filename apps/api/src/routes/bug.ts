// apps/api/src/routes/bug.ts - The report-a-bug form on neon1.tech. Two public routes with the contact form's
// gates (a hidden field, per-sender and daily counters, a real email when one is given):
//   POST /bug            the report as JSON; answers with a reference and an upload token. Mails neon1 at once when it
//                        has no screenshots; otherwise holds the report until they are scanned (see sweepBugs)
//   POST /bug/:ref/:token/image one screenshot's raw bytes, sent after the report (the site's policy lets the page
//                        talk only to neon1.tech, so images pass through here, not straight to S3)
// A screenshot must be a PNG or JPEG by its first bytes (the declared type isn't trusted), under a size cap,
// within a count cap fixed when the report was made. It is stored under t/_bugs/<ref>/ in the documents
// bucket, which is private, scanned by GuardDuty, and refuses reads until the scan tags it clean. Nothing
// here deletes a screenshot. The report itself is the email: a report with screenshots waits in the table, at
// most 15 minutes, until each is scanned clean, then goes out with them attached (a scheduled pass does this once a
// minute), and the waiting rows are removed. Otherwise the table keeps counters and a two-hour upload session.
import { messageProblem } from "@1neon/domain";
import { z } from "zod";
import { emailProblem, failFields, type FieldProblems } from "../lib/vet.ts";
import { fail } from "../lib/http.ts";
import { originCheck, readForm, themeOk, verifyGate, viewportOk } from "../lib/formgate.ts";
import type { App, Kit } from "../lib/kit.ts";
import { viewerIp } from "../lib/edge.ts";
import type { Attachment } from "../lib/mime.ts";
import { bugMail, bugSubject, type BugReport, type Shot } from "../lib/bugmail.ts";
import type { Deps } from "../lib/kit.ts";
import { COUNTER_KEEP_S, CONTACT_TO } from "./contact.ts";


// Where the bug is, as the page's dropdown and its ?from= values name it
export const WHERE = {
  site: "Main site",
  "1neon": "1NEON",
  demo: "1NEON demo",
  walkthrough: "1NEON live walkthrough",
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
  // The answer to the challenge the page asked for when it opened (lib/formgate.ts)
  gate: z.object({ id: z.string().max(40), nonce: z.string().max(20) }).optional(),
});


// Reports waiting for their screenshots, and (one partition per report) the screenshots stored for each
const PENDING = "BUGPENDING";
const SHOT = "BUGSHOT#";
// A report waits at most this long for its screenshots to arrive and scan; past it, it goes with what is clean
const WAIT_MS = 15 * 60_000;
// Under SES's message limit with room for encoding: attachments past this total are named, not attached
const ATTACH_MAX = 18 * 1024 * 1024;

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
    // Only neon1's own pages: a link to anywhere else would reach the inbox as bait
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (!/(^|\.)neon1\.tech$|^localhost$/.test(u.hostname)) return "";
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
    // Where it came from and how big it is, before anything is read; then the shape, then the gates
    originCheck(c, k);
    const raw = await readForm(c);
    const parsed = Report.safeParse(raw);
    if (!parsed.success) fail(400, "invalid", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    const m = parsed.data;
    // A filled hidden field looks like success to the bot, and nothing is sent
    if (m.website) return c.json({ ok: true, ref: "BUG-000000", token: "", images: 0 });
    // A challenge this server issued, answered at person speed, once
    await verifyGate(k, "bug", m.gate);

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

    const report: BugReport = { ref, where: WHERE[m.where], what: m.what, email: m.email, page: cleanPage(m.page), theme: themeOk(m.theme), browser: m.browser, viewport: viewportOk(m.viewport), at: new Date().toISOString() };
    if (m.images > 0) {
      // Held until the screenshots are in and scanned; the row lives two days at most, even if nothing ever arrives
      await repo.table.write([{ put: { PK: PENDING, SK: ref, report, expect: m.images, ttl: Math.floor(Date.now() / 1000) + 2 * 86_400 }, guard: { create: true } }]);
    } else {
      await deliver(d, report, [], []);
    }
    return c.json({ ok: true, ref, token, images: m.images });
  });

  // The token rides in the path: CloudFront forwards only a short list of headers to the API, and a path always arrives
  app.post("/bug/:ref/:token/image", async (c) => {
    originCheck(c, k);
    const ref = c.req.param("ref");
    const token = c.req.param("token");
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

    const key = `t/_bugs/${ref}/${slot}.${kind.ext}`;
    await d.storage.put(key, bytes, kind.type);
    await repo.table.write([{ put: { PK: `${SHOT}${ref}`, SK: String(slot).padStart(2, "0"), key, type: kind.type, size: bytes.length, ttl: Math.floor(Date.now() / 1000) + 2 * 86_400 }, guard: { always: true } }]);
    return c.json({ ok: true, n: slot });
  });
}


/** Mail neon1 the report, with the given screenshots attached and inline, and `notes` for any left out */
async function deliver(d: Pick<Deps, "mailer" | "cfg">, r: BugReport, files: { name: string; type: string; bytes: Uint8Array }[], notes: string[]) {
  const attach: Attachment[] = files.map((f, i) => ({ ...f, cid: `shot${i + 1}@neon1` }));
  const shots: Shot[] = attach.map((a) => ({ name: a.name, type: a.type, size: a.bytes.length, cid: a.cid! }));
  const { text, html } = bugMail(r, shots, notes);
  await d.mailer.send(d.cfg.bugTo ?? CONTACT_TO, bugSubject(r), text, html, r.email || undefined, undefined, attach, "bugs");
}

/**
 * The scheduled pass: send each held report once its screenshots have all arrived and been scanned (clean ones
 * attach; one with a threat, or that never scanned, is named instead), or after WAIT_MS with whatever is ready.
 * An environment with no scan (dev) attaches what arrived. Returns how many reports it sent
 */
export async function sweepBugs(d: Pick<Deps, "repo" | "storage" | "mailer" | "cfg">, opts: { deadline?: number } = {}): Promise<{ held: number; sent: number }> {
  const rows = await d.repo.table.query(PENDING);
  let sent = 0;
  for (const row of rows) {
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) break;
    const report = row.report as BugReport;
    const expect = Number(row.expect);
    const shots = await d.repo.table.query(`${SHOT}${report.ref}`);
    const verdicts = await Promise.all(shots.map(async (s) => ({ s, v: await d.storage.scan(String(s.key)) })));
    // Still scanning (or the scan couldn't be asked): not settled yet
    const settled = verdicts.every(({ v }) => v !== "pending" && v !== "error" && v !== "absent");
    const late = Date.now() - Date.parse(report.at) > WAIT_MS;
    if (!late && !(shots.length >= expect && settled)) continue;

    const files: { name: string; type: string; bytes: Uint8Array }[] = [];
    const notes: string[] = [];
    let total = 0;
    for (const { s, v } of verdicts) {
      const n = Number(s.SK);
      const name = `screenshot-${n}.${s.type === "image/png" ? "png" : "jpg"}`;
      if (v === "infected") notes.push(`Screenshot ${n} was not attached: the malware scan found a threat. It is kept in the bucket at ${s.key}.`);
      else if (v !== "clean" && v !== "unscanned") notes.push(`Screenshot ${n} was not attached: it ${v === "pending" || v === "error" || v === "absent" ? "hadn't finished scanning" : "couldn't be scanned"}. Key: ${s.key}.`);
      else if (total + Number(s.size) > ATTACH_MAX) notes.push(`Screenshot ${n} was too large to attach with the others. Key: ${s.key}.`);
      else {
        files.push({ name, type: String(s.type), bytes: await d.storage.get(String(s.key)) });
        total += Number(s.size);
      }
    }
    if (shots.length < expect) notes.push(`${expect - shots.length} of ${expect} screenshots never arrived.`);
    await deliver(d, report, files, notes);
    sent++;
    // Sent: nothing about the report stays in the table
    await d.repo.table.write([{ delete: { PK: PENDING, SK: report.ref } }, ...shots.map((s) => ({ delete: { PK: String(s.PK), SK: String(s.SK) } }))]);
  }
  return { held: rows.length, sent };
}
