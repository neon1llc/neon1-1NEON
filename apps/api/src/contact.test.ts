// apps/api/src/contact.test.ts - The public contact form: it mails neon1 only, honors the hidden
// field, validates input, and caps messages per sender each hour.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { CONTACT_TO, COUNTER_KEEP_S, PER_SENDER_HOURLY } from "./routes/contact.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";

let app: ReturnType<typeof createApp>;
let mailer: MemoryMailer;
let table: MemoryTable;
beforeEach(() => {
  mailer = new MemoryMailer();
  table = new MemoryTable();
  app = createApp({ cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [], devAuth: true }, repo: new Repo(table), directory: new MemoryDirectory(), mailer, storage: new MemoryStorage() });
});

const good = { name: "Tomas Greer", email: "tomas@example.com", topic: "business", today: "We retype orders from email every Friday." };
const send = (b: unknown, ip = "203.0.113.7") =>
  app.request("/1NEON/api/contact", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-forwarded-for": ip }, body: JSON.stringify(b) });

describe("contact form", () => {
  it("mails neon1, with the sender as Reply-To", async () => {
    const r = await send({ ...good, better: "Orders land in the sheet on their own." });
    expect(r.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: CONTACT_TO, replyTo: "tomas@example.com" });
    expect(mailer.sent[0]!.text).toContain("Orders land in the sheet");
    // From "neon1" the website, with one short tag and no sender name repeated in the subject
    expect(mailer.sent[0]).toMatchObject({ as: "requests", subject: expect.stringMatching(/^Contact message: Tomas Greer/) });
  });
  it("shows the sender's local time when their browser gave a real zone, and ignores junk", async () => {
    await send({ ...good, timeZone: "America/Chicago" });
    expect(mailer.sent[0]!.text).toMatch(/Their local time\s+.+ C[SD]T \(\d\d:\d\d UTC.*\), America\/Chicago/);
    // The sign-off to neon1 reads in New York time
    expect(mailer.sent[0]!.html).toMatch(/>Sent<\/td><td[^>]*>.+ E[SD]T \(/);
    await send({ ...good, timeZone: "Mars/Olympus" });
    expect(mailer.sent[1]!.text).not.toContain("Their local time");
    await send({ ...good, timeZone: "" });
    expect(mailer.sent[2]!.text).not.toContain("Their local time");
  });
  it("names every topic picked and the visitor's own, or says none was picked", async () => {
    await send({ ...good, topic: undefined, topics: ["cloud", "security"], other: "Printer setup" });
    expect(mailer.sent[0]!.text).toMatch(/About\s+Cloud, Security awareness and readiness, Printer setup/);
    await send({ ...good, topic: undefined });
    expect(mailer.sent[1]!.text).toMatch(/About\s+Not said/);
    expect((await send({ ...good, topics: ["nope"] })).status).toBe(400);
    // The site's current topics, all at once, and an older key a cached page still sends
    await send({ ...good, topic: undefined, topics: ["workflows", "cloud", "ai", "networks", "devices", "software", "security"], other: "" });
    expect(mailer.sent.at(-1)!.text).toContain("Business workflows, Cloud, AI, Networks, Devices and IoT, Software, Security awareness and readiness");
    expect((await send({ ...good, topic: undefined, topics: ["business", "spaces"] })).status).toBe(200);
    expect((await send({ ...good, topics: ["workflows", "cloud", "ai", "networks", "devices", "software", "security", "business", "spaces", "other"] })).status).toBe(400);
  });
  it("says how they found neon1 when picked, and refuses an answer not on the list", async () => {
    await send({ ...good, found: "linkedin" });
    expect(mailer.sent[0]!.text).toMatch(/Found neon1 through\s+LinkedIn/);
    await send(good);
    expect(mailer.sent[1]!.text).not.toContain("Found neon1");
    expect((await send({ ...good, found: "billboard" })).status).toBe(400);
  });
  it("answers field by field, with a light name check and their words for Somewhere else", async () => {
    const r = await send({ ...good, email: "tomas@", name: "asdf", found: "other" });
    expect(r.status).toBe(400);
    const b = (await r.json()) as { current: { fields: Record<string, string> } };
    expect(Object.keys(b.current.fields).sort()).toEqual(["email", "foundOther", "name"]);
    expect((await send({ ...good, name: "Madonna", found: "other", foundOther: "A podcast" })).status).toBe(200);
    expect(mailer.sent[0]!.text).toMatch(/Found neon1 through\s+A podcast/);
  });
  it("refuses an empty or too-short message, name, or answer, each by its field", async () => {
    const r = await send({ ...good, today: "hi", name: "L", company: "x", found: "other", foundOther: "ab" });
    expect(r.status).toBe(400);
    const b = (await r.json()) as { current: { fields: Record<string, string> } };
    expect(b.current.fields).toMatchObject({ today: expect.stringMatching(/at least 10/), name: expect.stringMatching(/at least 2/), company: expect.stringMatching(/at least 2/), foundOther: expect.stringMatching(/at least 3/) });
    expect((await send({ ...good, today: "   " })).status).toBe(400);
    expect((await send({ ...good, name: "Li", company: "3M" })).status).toBe(200);
  });
  it("escapes what people type", async () => {
    await send({ ...good, today: "<script>x</script>" });
    expect(mailer.sent[0]!.html).not.toContain("<script>");
  });
  it("sends nothing when the hidden field is filled", async () => {
    const r = await send({ ...good, website: "spam.example" });
    expect(r.status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
  });
  it("refuses a bad address or a missing message", async () => {
    expect((await send({ ...good, email: "nope" })).status).toBe(400);
    expect((await send({ ...good, today: "" })).status).toBe(400);
  });
  it("caps messages per sender each hour", async () => {
    for (let i = 0; i < PER_SENDER_HOURLY; i++) expect((await send(good)).status).toBe(200);
    expect((await send(good)).status).toBe(429);
    expect((await send(good, "198.51.100.9")).status).toBe(200);
  });
  it("keeps its counters for a day after their first count, then lets them expire", async () => {
    const before = Math.floor(Date.now() / 1000);
    expect((await send(good)).status).toBe(200);
    const counters = await table.query("COUNTER", "CONTACT#");
    expect(counters).toHaveLength(2);
    for (const c of counters) {
      expect(c.ttl).toBeGreaterThanOrEqual(before + COUNTER_KEEP_S);
      expect(c.ttl).toBeLessThanOrEqual(before + COUNTER_KEEP_S + 5);
    }
    // A second message keeps the first count's expiry
    const first = counters.map((c) => c.ttl);
    expect((await send(good)).status).toBe(200);
    expect((await table.query("COUNTER", "CONTACT#")).map((c) => c.ttl)).toEqual(first);
  });
  it("needs the custom header, like every other change", async () => {
    const r = await app.request("/1NEON/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(good) });
    expect(r.status).toBe(403);
  });
});
