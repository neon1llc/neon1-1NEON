// apps/api/src/bug.test.ts - The report-a-bug form: it mails neon1 with a reference, keeps the same gates as the
// contact form, and takes screenshots only as real PNG or JPEG files, within the caps, into the private prefix.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { CONTACT_TO } from "./routes/contact.ts";
import { MAX_IMAGE_BYTES, MAX_IMAGES, PER_SENDER_HOURLY, sweepBugs } from "./routes/bug.ts";
import { rawMessage } from "./lib/mime.ts";
import { browserName } from "./lib/bugmail.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./local.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";

let app: ReturnType<typeof createApp>;
let mailer: MemoryMailer;
let storage: MemoryStorage;
let deps: Parameters<typeof sweepBugs>[0];
beforeEach(() => {
  mailer = new MemoryMailer();
  storage = new MemoryStorage();
  const cfg = { env: "local" as const, publicUrl: "https://neon1.tech", operatorEmails: [], devAuth: true };
  const repo = new Repo(new MemoryTable());
  deps = { cfg, repo, storage, mailer };
  app = createApp({ cfg, repo, directory: new MemoryDirectory(), mailer, storage });
});
afterEach(() => vi.useRealTimers());

const good = { where: "neo", what: "Neo's box stays open after I press Escape.", page: "https://neon1.tech/knowledge/?q=x#top", theme: "matrix", browser: "Safari", viewport: "390x844" };
const send = (b: unknown, ip = "203.0.113.7") =>
  app.request("/1NEON/api/bug", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-forwarded-for": ip }, body: JSON.stringify(b) });
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const jpg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const image = (ref: string, token: string, bytes: Uint8Array, type = "image/png", ip = "203.0.113.7") =>
  app.request(`/1NEON/api/bug/${ref}/${token}/image`, { method: "POST", headers: { "content-type": type, "x-1neon": "1", "x-forwarded-for": ip }, body: bytes });

describe("report a bug", () => {
  it("mails neon1 with a reference, the captured context, and no query string from the page", async () => {
    const r = await send({ ...good, email: "dana@example.com" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ref: string };
    expect(j.ref).toMatch(/^BUG-[2-9A-HJKMNP-Z]{6}$/);
    expect(mailer.sent[0]).toMatchObject({ to: CONTACT_TO, replyTo: "dana@example.com" });
    const t = mailer.sent[0]!.text;
    expect(t).toMatch(new RegExp(`Reference\\s+${j.ref}`));
    expect(t).toMatch(/Where\s+Neo chat/);
    expect(t).toMatch(/Page\s+https:\/\/neon1.tech\/knowledge\//);
    expect(t).not.toContain("?q=x");
    expect(t).toMatch(/Window\s+390x844/);
    expect(t).toContain("WHAT HAPPENED");
    expect(mailer.sent[0]!.subject).toMatch(/^BUG-\w{6} · Neo chat$/);
    expect(mailer.sent[0]).toMatchObject({ as: "bugs", to: "hello@neon1.tech" });
  });
  it("needs a place and a description, and checks an email only when one is given", async () => {
    expect((await send({ ...good, where: "moon" })).status).toBe(400);
    const r = await send({ ...good, what: "hi", email: "dana@" });
    const b = (await r.json()) as { current: { fields: Record<string, string> } };
    expect(Object.keys(b.current.fields).sort()).toEqual(["email", "what"]);
    expect((await send({ ...good })).status).toBe(200);
  });
  it("sends nothing for a filled hidden field", async () => {
    expect((await send({ ...good, website: "x.com" })).status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
  });
  it("caps reports per sender each hour", async () => {
    for (let i = 0; i < PER_SENDER_HOURLY; i++) expect((await send(good)).status).toBe(200);
    expect((await send(good)).status).toBe(429);
    expect((await send(good, "198.51.100.9")).status).toBe(200);
  });

  it("stores PNG and JPEG screenshots under the private prefix, up to the count declared", async () => {
    const { ref, token } = (await (await send({ ...good, images: 2 })).json()) as { ref: string; token: string };
    expect((await image(ref, token, png())).status).toBe(200);
    expect((await image(ref, token, jpg(), "image/jpeg")).status).toBe(200);
    expect([...storage.files.keys()].sort()).toEqual([`t/_bugs/${ref}/1.png`, `t/_bugs/${ref}/2.jpg`]);
    expect((await image(ref, token, png())).status).toBe(400);
  });
  it("holds a report with screenshots, then sends it once with the clean ones attached, and clears what it held", async () => {
    const { ref, token } = (await (await send({ ...good, images: 2 })).json()) as { ref: string; token: string };
    expect(mailer.sent).toHaveLength(0);
    await image(ref, token, png());
    // One of two has arrived: still waiting
    expect((await sweepBugs(deps)).sent).toBe(0);
    await image(ref, token, jpg(), "image/jpeg");
    // Both arrived but one is still being scanned
    storage.verdicts.set(`t/_bugs/${ref}/2.jpg`, "pending");
    expect((await sweepBugs(deps)).sent).toBe(0);
    storage.verdicts.delete(`t/_bugs/${ref}/2.jpg`);
    expect(await sweepBugs(deps)).toEqual({ held: 1, sent: 1 });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.attachments?.map((a) => a.name)).toEqual(["screenshot-1.png", "screenshot-2.jpg"]);
    expect(mailer.sent[0]!.html).toContain("cid:shot1@neon1");
    // Once sent, nothing is held, so a second pass sends nothing
    expect(await sweepBugs(deps)).toEqual({ held: 0, sent: 0 });
  });
  it("names a screenshot that scanned as a threat instead of attaching it, and sends late with what is ready", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { ref, token } = (await (await send({ ...good, images: 3 })).json()) as { ref: string; token: string };
    await image(ref, token, png());
    await image(ref, token, png());
    storage.verdicts.set(`t/_bugs/${ref}/2.png`, "infected");
    // Two of three arrived, so it waits; after 15 minutes it goes anyway
    expect((await sweepBugs(deps)).sent).toBe(0);
    vi.setSystemTime(Date.now() + 16 * 60_000);
    expect((await sweepBugs(deps)).sent).toBe(1);
    const m = mailer.sent[0]!;
    expect(m.attachments).toHaveLength(1);
    expect(m.text).toContain("Screenshot 2 was not attached: the malware scan found a threat");
    expect(m.text).toContain("1 of 3 screenshots never arrived");
  });
  it("refuses a screenshot with no session, a wrong token, or a report that declared none", async () => {
    const { ref, token } = (await (await send({ ...good, images: 1 })).json()) as { ref: string; token: string };
    expect((await image(ref, "0".repeat(32), png())).status).toBe(403);
    expect((await image("BUG-AAAAAA", token, png())).status).toBe(403);
    const none = (await (await send(good)).json()) as { ref: string; token: string };
    expect((await image(none.ref, none.token, png())).status).toBe(403);
    expect(storage.files.size).toBe(0);
  });
  it("judges the file by its first bytes, not its declared type, and caps its size", async () => {
    const { ref, token } = (await (await send({ ...good, images: MAX_IMAGES })).json()) as { ref: string; token: string };
    expect((await image(ref, token, new TextEncoder().encode("<svg onload=alert(1)>"), "image/png")).status).toBe(400);
    expect((await image(ref, token, png(), "image/jpeg")).status).toBe(400);
    expect((await image(ref, token, png(), "image/gif")).status).toBe(400);
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(png());
    expect((await image(ref, token, big)).status).toBe(400);
    expect((await image(ref, token, new Uint8Array())).status).toBe(400);
    expect(storage.files.size).toBe(0);
  });
  it("refuses more than 3 screenshots declared", async () => {
    expect((await send({ ...good, images: MAX_IMAGES + 1 })).status).toBe(400);
  });
});

describe("the report email's parts", () => {
  it("names the browser and system from an agent string, and keeps the string when unknown", () => {
    expect(browserName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")).toBe("Safari 17 on iOS");
    expect(browserName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0")).toBe("Edge 126 on Windows");
    expect(browserName("curl dev-verify")).toBe("curl dev-verify");
  });
  it("builds a raw message with the HTML, an inline image, and its attachment, with every body in base64", () => {
    const raw = rawMessage({ from: "a@neon1.tech", to: "b@neon1.tech", subject: "Héllo\nBcc: x@y.z", text: "hi", html: "<p>hi</p>", attachments: [{ name: "a b.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]), cid: "shot1@neon1" }] });
    expect(raw).toContain("multipart/mixed");
    expect(raw).toContain("Content-ID: <shot1@neon1>");
    expect(raw).toContain('filename="a b.png"');
    // A newline in the subject can't start another header
    expect(raw).not.toMatch(/^Bcc:/m);
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});
