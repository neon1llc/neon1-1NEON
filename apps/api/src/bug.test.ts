// apps/api/src/bug.test.ts - The report-a-bug form: it mails neon1 with a reference, keeps the same gates as the
// contact form, and takes screenshots only as real PNG or JPEG files, within the caps, into the private prefix.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { CONTACT_TO } from "./routes/contact.ts";
import { MAX_IMAGE_BYTES, MAX_IMAGES, PER_SENDER_HOURLY } from "./routes/bug.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./local.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";

let app: ReturnType<typeof createApp>;
let mailer: MemoryMailer;
let storage: MemoryStorage;
beforeEach(() => {
  mailer = new MemoryMailer();
  storage = new MemoryStorage();
  app = createApp({ cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [], devAuth: true }, repo: new Repo(new MemoryTable()), directory: new MemoryDirectory(), mailer, storage });
});

const good = { where: "neo", what: "Neo's box stays open after I press Escape.", page: "https://neon1.tech/knowledge/?q=x#top", theme: "matrix", browser: "Safari", viewport: "390x844" };
const send = (b: unknown, ip = "203.0.113.7") =>
  app.request("/1NEON/api/bug", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-forwarded-for": ip }, body: JSON.stringify(b) });
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const jpg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const image = (ref: string, token: string, bytes: Uint8Array, type = "image/png", ip = "203.0.113.7") =>
  app.request(`/1NEON/api/bug/${ref}/image`, { method: "POST", headers: { "content-type": type, "x-1neon": "1", "x-bug-token": token, "x-forwarded-for": ip }, body: bytes });

describe("report a bug", () => {
  it("mails neon1 with a reference, the captured context, and no query string from the page", async () => {
    const r = await send({ ...good, email: "dana@example.com" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ref: string };
    expect(j.ref).toMatch(/^BUG-[2-9A-HJKMNP-Z]{6}$/);
    expect(mailer.sent[0]).toMatchObject({ to: CONTACT_TO, replyTo: "dana@example.com" });
    const t = mailer.sent[0]!.text;
    expect(t).toContain(`Reference: ${j.ref}`);
    expect(t).toContain("Where: Neo chat");
    expect(t).toContain("Page: https://neon1.tech/knowledge/");
    expect(t).not.toContain("?q=x");
    expect(t).toContain("Window: 390x844");
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
