// apps/api/src/lib/formgate.ts - The gates the site's public forms (bug report, feedback) share, beyond each form's
// own field checks and counters. The site's strict CSP lets a page load nothing from outside neon1.tech, so a hosted
// bot check (Turnstile) isn't an option there; these stand in for it with nothing third-party:
//   - a request-size cap and a JSON-only content type, judged before anything is parsed
//   - an origin check: a browser always names where a POST came from, and only neon1's own pages are accepted
//   - a one-time challenge: the page asks for one when it opens (GET /form-gate), solves a small proof of work in
//     the background, and sends the answer with the form. It must come back after a person-speed delay, once, and
//     from a challenge this server issued. A script that posts straight at the route has none of that
import type { Context } from "hono";
import { fail } from "./http.ts";
import { viewerIp } from "./edge.ts";
import type { App, Kit } from "./kit.ts";
import { COUNTER_KEEP_S } from "../routes/contact.ts";

/** Leading zero bits the answer's hash needs: about 30,000 tries, a fraction of a second for a browser */
export const GATE_BITS = 15;
/** The challenge can't be answered sooner than this after it was issued: faster than a person fills a form */
export const GATE_MIN_MS = 4_000;
/** ... and goes stale after this */
export const GATE_MAX_MS = 30 * 60_000;
/** Challenges one sender may ask for each hour */
export const GATE_PER_SENDER_HOURLY = 30;
/** The largest form body taken, in bytes: the longest text is 3,000 characters, so this is generous */
export const FORM_MAX_BYTES = 16 * 1024;

const GATE = "FORMGATE";
const USED = "FORMGATE#USED#";
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Does this hash start with at least `bits` zero bits? */
function leadingZeroBits(h: Uint8Array, bits: number): boolean {
  let n = 0;
  for (const byte of h) {
    if (byte === 0) { n += 8; if (n >= bits) return true; continue; }
    n += Math.clz32(byte) - 24;
    break;
  }
  return n >= bits;
}

const CONTROLS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]", "g");
/** Control characters (other than a line break or tab) have no place in what a person typed; drop them */
export const stripControls = (s: string) => s.replace(CONTROLS, "");

/** The addresses a form post may come from: this deployment's own site, and a local page when running locally */
function allowedOrigins(k: Kit): string[] {
  const own = new URL(k.d.cfg.publicUrl).origin;
  return k.d.cfg.env === "local" ? [own, "http://localhost:5173", "http://localhost:8787", "http://127.0.0.1:5173"] : [own];
}

/** A browser names the page's origin on every POST, and says whether it was a same-site request. When either is
 * present it must be ours; a caller that sends neither is a script, which the challenge then has to cover */
export function originCheck(c: Context, k: Kit) {
  const origin = c.req.header("origin");
  if (origin && !allowedOrigins(k).includes(origin)) fail(403, "origin", "That didn't come from neon1.tech. Email hello@neon1.tech instead.");
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin") fail(403, "origin", "That didn't come from neon1.tech. Email hello@neon1.tech instead.");
}

/** The JSON body of a form post: JSON only, under the size cap, with control characters dropped from every string */
export async function readForm(c: Context): Promise<unknown> {
  const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") fail(415, "content_type", "The form sends JSON.");
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > FORM_MAX_BYTES) fail(413, "too_big", "That's too much to send in one go.");
  const text = await c.req.text();
  // The length header can be missing or wrong, so the body itself is measured too
  if (new TextEncoder().encode(text).length > FORM_MAX_BYTES) fail(413, "too_big", "That's too much to send in one go.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { fail(400, "bad_json", "The request body isn't valid JSON."); }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail(400, "bad_json", "The request body isn't valid JSON.");
  const clean = (v: unknown): unknown => (typeof v === "string" ? stripControls(v) : v);
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([key, v]) => [key, clean(v)]));
}

/** Issue a challenge for one form. Counted per sender, so asking for many is capped too */
export async function issueGate(c: Context, k: Kit, form: string) {
  const { repo } = k;
  const who = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(viewerIp(c)))).slice(0, 12));
  const hour = new Date().toISOString().slice(0, 13);
  const keep = Math.floor(Date.now() / 1000) + COUNTER_KEEP_S;
  if ((await repo.table.increment("COUNTER", `GATE#${who}#${hour}`, 1, keep)) > GATE_PER_SENDER_HOURLY) fail(429, "too_many", "That's a lot of tries in an hour. Email hello@neon1.tech instead.");
  const id = hex(crypto.getRandomValues(new Uint8Array(16)));
  const at = Date.now();
  await repo.table.write([{ put: { PK: GATE, SK: id, form, at, ttl: Math.floor(at / 1000) + GATE_MAX_MS / 1000 + 60 }, guard: { create: true } }]);
  return { id, bits: GATE_BITS, minMs: GATE_MIN_MS };
}

/** Check the answer sent with a form: an issued challenge for this form, old enough, young enough, solved, and
 * not used before. Local runs skip it, so tests and the dev server work without a page */
export async function verifyGate(k: Kit, form: string, gate: { id: string; nonce: string } | undefined) {
  if (k.d.cfg.env === "local") return;
  const refuse = () => fail(400, "gate", "The page's check didn't pass. Reload the page and try again.");
  if (!gate || !/^[0-9a-f]{32}$/.test(gate.id) || !/^[0-9a-z]{1,16}$/.test(gate.nonce)) refuse();
  const g = gate!;
  const row = await k.repo.table.get(GATE, g.id);
  if (!row || row.form !== form) refuse();
  const age = Date.now() - Number(row!.at);
  if (age < GATE_MIN_MS || age > GATE_MAX_MS) refuse();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${g.id}:${form}:${g.nonce}`)));
  if (!leadingZeroBits(hash, GATE_BITS)) refuse();
  // One answer per challenge: the second use of the same one counts 2
  if ((await k.repo.table.increment("COUNTER", `${USED}${g.id}`, 1, Math.floor(Date.now() / 1000) + GATE_MAX_MS / 1000 + 60)) > 1) refuse();
}

/** GET /form-gate/:form, the challenge a form page asks for when it opens */
export function gateRoutes(app: App, k: Kit) {
  app.get("/form-gate/:form", async (c) => {
    const form = c.req.param("form");
    if (form !== "bug" && form !== "feedback") fail(404, "not_found", "No such form.");
    return c.json(await issueGate(c, k, form));
  });
}

/** What the page reports about itself, kept to the shapes a real browser sends; anything else is dropped */
export const themeOk = (s: string) => (/^[a-z]{1,20}$/.test(s) ? s : "");
export const viewportOk = (s: string) => (/^\d{2,5}x\d{2,5}( @\d{1,2}(\.\d{1,2})?x)?$/.test(s) ? s : "");
