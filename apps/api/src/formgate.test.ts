// apps/api/src/formgate.test.ts - The gates on the site's public forms (bug report and feedback) in a deployed
// environment: JSON only, a size cap, neon1's own origin, a one-time challenge answered at person speed, and
// nothing a caller types reaching a mail header or the page as markup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./local.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";
import { FORM_MAX_BYTES, GATE_MIN_MS } from "./lib/formgate.ts";

let app: ReturnType<typeof createApp>;
let mailer: MemoryMailer;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  mailer = new MemoryMailer();
  const cfg = { env: "prod" as const, publicUrl: "https://neon1.tech", operatorEmails: [], devAuth: false };
  app = createApp({ cfg, repo: new Repo(new MemoryTable()), directory: new MemoryDirectory(), mailer, storage: new MemoryStorage() });
});
afterEach(() => vi.useRealTimers());

const good = { kind: "concern", where: "1neon", what: "I wasn't sure what Potentials meant at first.", page: "https://neon1.tech/1NEON/", theme: "awake", browser: "Safari", viewport: "390x844" };
const hdr = (extra: Record<string, string> = {}) => ({ "content-type": "application/json", "x-1neon": "1", origin: "https://neon1.tech", "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.7", ...extra });
const post = (path: string, b: unknown, h = hdr()) => app.request(`/1NEON/api/${path}`, { method: "POST", headers: h, body: typeof b === "string" ? b : JSON.stringify(b) });

const bitsOk = (h: Uint8Array, bits: number) => { let n = 0; for (const x of h) { if (x === 0) { n += 8; continue; } n += Math.clz32(x) - 24; break; } return n >= bits; };
/** What the page does: ask for a challenge, then find a nonce whose hash starts with enough zero bits */
async function solve(form: string, ip = "203.0.113.7") {
  const r = await app.request(`/1NEON/api/form-gate/${form}`, { headers: { "x-forwarded-for": ip } });
  expect(r.status).toBe(200);
  const { id, bits } = (await r.json()) as { id: string; bits: number };
  for (let n = 0; ; n++) {
    const nonce = n.toString(36);
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${id}:${form}:${nonce}`)));
    if (bitsOk(h, bits)) return { id, nonce };
  }
}

describe.each([["feedback", good], ["bug", { where: "site", what: good.what, page: good.page, theme: "awake", browser: "Safari", viewport: "390x844" }]] as const)("%s form gates", (form, base) => {
  it("takes a form with an answered challenge once the delay has passed", async () => {
    const gate = await solve(form);
    vi.advanceTimersByTime(GATE_MIN_MS + 500);
    expect((await post(form, { ...base, gate })).status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
  });
  it("refuses a post with no challenge, a made-up one, or one answered too fast", async () => {
    expect((await post(form, base)).status).toBe(400);
    expect((await post(form, { ...base, gate: { id: "0".repeat(32), nonce: "0" } })).status).toBe(400);
    const quick = await solve(form);
    const r = await post(form, { ...base, gate: quick });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe("gate");
    expect(mailer.sent).toHaveLength(0);
  });
  it("refuses a wrong answer, another form's challenge, and a second use", async () => {
    const g = await solve(form);
    vi.advanceTimersByTime(GATE_MIN_MS + 500);
    expect((await post(form, { ...base, gate: { id: g.id, nonce: "zzzzzzzz" } })).status).toBe(400);
    const other = form === "bug" ? "feedback" : "bug";
    const og = await solve(other);
    vi.advanceTimersByTime(GATE_MIN_MS + 500);
    expect((await post(form, { ...base, gate: og })).status).toBe(400);
    expect((await post(form, { ...base, gate: g })).status).toBe(200);
    expect((await post(form, { ...base, gate: g })).status).toBe(400);
  });
  it("refuses a challenge that has gone stale", async () => {
    const g = await solve(form);
    vi.advanceTimersByTime(31 * 60_000);
    expect((await post(form, { ...base, gate: g })).status).toBe(400);
  });
  it("refuses another site's origin and a cross-site request, and anything but JSON", async () => {
    const g = await solve(form);
    vi.advanceTimersByTime(GATE_MIN_MS + 500);
    expect((await post(form, { ...base, gate: g }, hdr({ origin: "https://evil.example" }))).status).toBe(403);
    expect((await post(form, { ...base, gate: g }, hdr({ "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await post(form, "what=x", hdr({ "content-type": "application/x-www-form-urlencoded" }))).status).toBe(415);
  });
  it("refuses a body over the cap, whatever its length header says", async () => {
    const big = JSON.stringify({ ...base, what: "a".repeat(FORM_MAX_BYTES) });
    expect((await post(form, big)).status).toBe(413);
  });
  it("answers a filled hidden field like a success and sends nothing", async () => {
    expect((await post(form, { ...base, website: "x.com" })).status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
  });
  it("limits how many challenges one sender can ask for", async () => {
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await app.request(`/1NEON/api/form-gate/${form}`, { headers: { "x-forwarded-for": "198.51.100.1" } })).status;
    expect(last).toBe(429);
  });
  it("keeps typed text out of mail headers and markup", async () => {
    const g = await solve(form);
    vi.advanceTimersByTime(GATE_MIN_MS + 500);
    const evil = "Please look at this\r\nBcc: attacker@example.com\r\n<script>alert(1)</script> and <img src=x onerror=1>\u0000\u202e";
    const r = await post(form, { ...base, what: evil, page: "https://evil.example/phish", theme: "x\r\nBcc: a@b.c", viewport: "<b>", gate: g });
    expect(r.status).toBe(200);
    const m = mailer.sent[0]!;
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject).not.toContain("\u0000");
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).not.toContain("evil.example");
    expect(m.text).not.toContain("evil.example");
    expect(m.text).not.toMatch(/Theme\s+x/);
    expect(m.text).not.toContain("\u0000");
  });
  it("never reflects what was typed in an error", async () => {
    const r = await post(form, { ...base, what: "<script>alert(7)</script>", kind: "<script>alert(7)</script>", where: "<script>alert(7)</script>", gate: await solve(form) });
    expect(await r.text()).not.toContain("alert(7)");
  });
// The challenge is solved by real work (a hash search), which a loaded CI machine can stretch past the default 5 seconds
}, 30_000);
