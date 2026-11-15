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

const good = { name: "Dana Kim", email: "dana@example.com", topic: "business", today: "We retype orders from email every Friday." };
const send = (b: unknown, ip = "203.0.113.7") =>
  app.request("/1NEON/api/contact", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-forwarded-for": ip }, body: JSON.stringify(b) });

describe("contact form", () => {
  it("mails neon1, with the sender as Reply-To", async () => {
    const r = await send({ ...good, better: "Orders land in the sheet on their own." });
    expect(r.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: CONTACT_TO, replyTo: "dana@example.com" });
    expect(mailer.sent[0]!.text).toContain("Orders land in the sheet");
  });
  it("names every topic picked and the visitor's own, or says none was picked", async () => {
    await send({ ...good, topic: undefined, topics: ["cloud", "security"], other: "Printer setup" });
    expect(mailer.sent[0]!.text).toContain("About: Cloud and AI engineering, Security awareness and readiness, Printer setup");
    await send({ ...good, topic: undefined });
    expect(mailer.sent[1]!.text).toContain("About: Not said");
    expect((await send({ ...good, topics: ["nope"] })).status).toBe(400);
  });
  it("says how they found neon1 when picked, and refuses an answer not on the list", async () => {
    await send({ ...good, found: "linkedin" });
    expect(mailer.sent[0]!.text).toContain("Found neon1 through: LinkedIn");
    await send(good);
    expect(mailer.sent[1]!.text).not.toContain("Found neon1");
    expect((await send({ ...good, found: "billboard" })).status).toBe(400);
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
