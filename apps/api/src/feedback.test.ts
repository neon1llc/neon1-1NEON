// apps/api/src/feedback.test.ts - The feedback form: it mails neon1 with a reference, keeps the bug form's gates,
// and takes a kind, a place, and what they wrote.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { CONTACT_TO } from "./routes/contact.ts";
import { PER_SENDER_HOURLY } from "./routes/feedback.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./local.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";

let app: ReturnType<typeof createApp>;
let mailer: MemoryMailer;
beforeEach(() => {
  mailer = new MemoryMailer();
  const cfg = { env: "local" as const, publicUrl: "https://neon1.tech", operatorEmails: [], devAuth: true };
  app = createApp({ cfg, repo: new Repo(new MemoryTable()), directory: new MemoryDirectory(), mailer, storage: new MemoryStorage() });
});

const good = { kind: "concern", where: "1neon", what: "I wasn't sure what Potentials meant at first.", page: "https://neon1.tech/1NEON/?x=1#top", theme: "awake", browser: "Safari", viewport: "390x844" };
const send = (b: unknown, ip = "203.0.113.7") =>
  app.request("/1NEON/api/feedback", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-forwarded-for": ip }, body: JSON.stringify(b) });

describe("feedback", () => {
  it("mails neon1 with a reference, the kind, the place, and no query string from the page", async () => {
    const r = await send({ ...good, email: "dana@example.com" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ref: string };
    expect(j.ref).toMatch(/^FDB-[2-9A-HJKMNP-Z]{6}$/);
    expect(mailer.sent[0]).toMatchObject({ to: CONTACT_TO, replyTo: "dana@example.com", as: "feedback" });
    const t = mailer.sent[0]!.text;
    expect(t).toMatch(new RegExp(`Reference\\s+${j.ref}`));
    expect(t).toMatch(/Kind\s+Concern/);
    expect(t).toMatch(/About\s+1NEON/);
    expect(t).toMatch(/Page\s+https:\/\/neon1.tech\/1NEON\//);
    expect(t).not.toContain("?x=1");
    expect(mailer.sent[0]!.subject).toMatch(/^\[feedback\] FDB-\w{6} · Concern · 1NEON · I wasn't sure/);
  });
  it("goes to the feedback address when one is configured", async () => {
    const cfg = { env: "local" as const, publicUrl: "https://neon1.tech", operatorEmails: [], devAuth: true, feedbackTo: "feedback@neon1.tech" };
    const m = new MemoryMailer();
    const a = createApp({ cfg, repo: new Repo(new MemoryTable()), directory: new MemoryDirectory(), mailer: m, storage: new MemoryStorage() });
    await a.request("/1NEON/api/feedback", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1" }, body: JSON.stringify(good) });
    expect(m.sent[0]).toMatchObject({ to: "feedback@neon1.tech" });
  });
  it("needs a kind, a place, and some words, and checks an email only when one is given", async () => {
    expect((await send({ ...good, kind: "rant" })).status).toBe(400);
    expect((await send({ ...good, where: "moon" })).status).toBe(400);
    const r = await send({ ...good, what: "hi", email: "dana@" });
    const b = (await r.json()) as { current: { fields: Record<string, string> } };
    expect(Object.keys(b.current.fields).sort()).toEqual(["email", "what"]);
    expect((await send(good)).status).toBe(200);
  });
  it("sends nothing for a filled hidden field", async () => {
    expect((await send({ ...good, website: "x.com" })).status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
  });
  it("caps feedback per sender each hour", async () => {
    for (let i = 0; i < PER_SENDER_HOURLY; i++) expect((await send(good)).status).toBe(200);
    expect((await send(good)).status).toBe(429);
    expect((await send(good, "198.51.100.9")).status).toBe(200);
  });
});
