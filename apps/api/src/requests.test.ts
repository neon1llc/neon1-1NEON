// apps/api/src/requests.test.ts - Asking neon1 for an assessment or a call from Home: one open request of
// each kind per account, a rolling window that midnight doesn't reset, a retry that doesn't send twice, and
// what neon1's email says about the projects. Also that making a project adds nothing to Needs you.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_COOLDOWN_DAYS, TEMPLATES, type User } from "@1neon/domain";
import { createApp } from "./app.ts";
import { claimSignup } from "./routes/signup.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";
import type { Config } from "./config.ts";


const OP = "pradeep@neon1.tech";
const DAY = 24 * 60 * 60 * 1000;
let app: ReturnType<typeof createApp>;
let repo: Repo;
let mailer: MemoryMailer;
let cfg: Config;

beforeEach(async () => {
  mailer = new MemoryMailer();
  repo = new Repo(new MemoryTable());
  cfg = { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true, signup: true };
  app = createApp({ cfg, repo, directory: new MemoryDirectory(), mailer, storage: new MemoryStorage() });
  const ts = new Date().toISOString();
  const op: User = { id: "u_op", email: OP, name: "Pradeep", title: "", phone: "", operator: false, strongAuth: true, theme: "awake", menu: "default", version: 1, createdAt: ts, updatedAt: ts, updatedBy: "u_op" };
  await repo.createUser(op);
});
afterEach(() => vi.useRealTimers());

const form = { email: "dana@example.com", name: "Dana Kim", kind: "small", org: "Kim Dental", link: "kimdental.com", terms: true, elapsed: 8000 };
const as = (email: string, path: string, method = "GET", b?: unknown) =>
  app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": email }, body: b === undefined ? undefined : JSON.stringify(b) });

/** A free account with its owner, and a way to ask as them */
async function account(email = "r@example.com") {
  const r = await app.request("/1NEON/api/auth/signup", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-forwarded-for": "203.0.113.7" }, body: JSON.stringify({ ...form, email }) });
  expect(r.status).toBe(200);
  const uid = (await claimSignup({ repo, cfg }, email))!;
  const tid = (await repo.membershipsOf(uid))[0]!.tenantId;
  const project = async (name: string, extra: Record<string, unknown> = {}) => ((await (await as(email, `/t/${tid}/projects`, "POST", { name, ...extra })).json()) as { id: string; key: string });
  const ask = (b: Record<string, unknown>) => as(email, `/t/${tid}/requests`, "POST", b);
  const mails = () => mailer.sent.filter((m) => m.to === "hello@neon1.tech");
  return { email, tid, project, ask, mails };
}


describe("an assessment request", () => {
  it("emails neon1 with the projects and how far along each is, and remembers when and for what", async () => {
    const a = await account();
    const p = await a.project("Intake forms", { summary: "Patients email forms to one inbox and staff retype them.", outcome: "Patients upload once and the desk sees what's missing." });
    const r = await a.ask({ kind: "assessment", note: "The intake form first", projects: [p.id], key: "press-0001-aaaa" });
    expect(r.status).toBe(200);
    const [mail] = a.mails();
    expect(mail!.subject).toBe("Assessment requested · Kim Dental");
    expect(mail!.as).toBe("reach");
    expect(mail!.replyTo).toBe("r@example.com");
    expect(mail!.text).toContain("The intake form first");
    expect(mail!.text).toContain(`${p.key} Intake forms`);
    // The email says what's missing, so the first read starts with what to ask
    expect(mail!.text).toContain("one real example");
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as Record<string, { at: string; open: boolean; again?: string; projects?: string[] }>;
    expect(seen.assessment).toMatchObject({ open: true, projects: [p.id] });
    expect(Date.parse(seen.assessment!.again!) - Date.parse(seen.assessment!.at)).toBe(REQUEST_COOLDOWN_DAYS * DAY);
    expect(seen.call).toBeUndefined();
  });

  it("needs words from the person and a project to look at, and sends nothing without them", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.ask({ kind: "assessment", note: "", projects: [p.id] })).status).toBe(400);
    expect((await a.ask({ kind: "assessment", note: "   ", projects: [p.id] })).status).toBe(400);
    expect((await a.ask({ kind: "assessment", note: "Hello", projects: [] })).status).toBe(400);
    expect((await a.ask({ kind: "nonsense" })).status).toBe(400);
    expect(a.mails()).toHaveLength(0);
    // None of those refusals used up the window
    expect((await a.ask({ kind: "assessment", note: "Hello", projects: [p.id] })).status).toBe(200);
  });

  it("refuses a project that isn't this organization's, or is archived", async () => {
    const a = await account();
    const b = await account("other@example.com");
    const mine = await a.project("Mine");
    const theirs = await b.project("Theirs");
    expect((await a.ask({ kind: "assessment", note: "Hi", projects: [theirs.id] })).status).toBe(400);
    expect((await a.ask({ kind: "assessment", note: "Hi", projects: [mine.id, "nope"] })).status).toBe(400);
    const gone = await a.project("Gone");
    expect((await as(a.email, `/t/${a.tid}/projects/${gone.id}`, "PATCH", { version: 1, archived: true })).status).toBe(200);
    expect((await a.ask({ kind: "assessment", note: "Hi", projects: [gone.id] })).status).toBe(400);
    expect(a.mails()).toHaveLength(0);
  });

  it("holds one open request: pressing again says when it was asked and sends nothing", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.ask({ kind: "assessment", note: "First", projects: [p.id] })).status).toBe(200);
    for (let i = 0; i < 5; i++) {
      const again = await a.ask({ kind: "assessment", note: `Again ${i}`, projects: [p.id], key: `press-000${i}-bbbb` });
      expect(again.status).toBe(409);
      expect(((await again.json()) as { error: string; message: string }).error).toBe("request_open");
    }
    expect(a.mails()).toHaveLength(1);
    // The answer names the asked date and the date it opens again, in words
    const msg = ((await (await a.ask({ kind: "assessment", note: "x", projects: [p.id] })).json()) as { message: string }).message;
    expect(msg).toMatch(/You asked for an assessment on [A-Z][a-z]{2} \d+, and I'll reply by email\. You can ask again from [A-Z][a-z]{2} \d+\./);
  });

  it("lets presses at the same moment through once", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => a.ask({ kind: "assessment", note: `Note ${i}`, projects: [p.id], key: `press-race-${i}-cccc` })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409, 409]);
    expect(a.mails()).toHaveLength(1);
  });

  it("answers a retry with the same key as the first request, without a second email", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const first = (await (await a.ask({ kind: "assessment", note: "First", projects: [p.id], key: "retry-key-0001" })).json()) as { at: string; again: string };
    const retry = await a.ask({ kind: "assessment", note: "First", projects: [p.id], key: "retry-key-0001" });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ok: true, at: first.at, again: first.again, repeated: true });
    expect(a.mails()).toHaveLength(1);
  });

  it("stays open across midnight in every zone, and opens exactly when the window ends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T23:50:00Z"));
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.ask({ kind: "assessment", note: "Late", projects: [p.id] })).status).toBe(200);
    // Past UTC midnight, two hours on, then the next day: still the one request
    vi.setSystemTime(new Date("2026-11-20T01:50:00Z"));
    expect((await a.ask({ kind: "assessment", note: "Again", projects: [p.id] })).status).toBe(409);
    vi.setSystemTime(new Date("2026-11-26T23:49:00Z"));
    expect((await a.ask({ kind: "assessment", note: "Again", projects: [p.id] })).status).toBe(409);
    // The window is exactly seven days from the request
    vi.setSystemTime(new Date("2026-11-26T23:51:00Z"));
    expect((await a.ask({ kind: "assessment", note: "A week on", projects: [p.id] })).status).toBe(200);
    expect(a.mails()).toHaveLength(2);
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as Record<string, { at: string }>;
    expect(seen.assessment!.at).toBe("2026-11-26T23:51:00.000Z");
  });

  it("gives the window back when the email can't be sent, so nothing is lost", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const send = mailer.send.bind(mailer);
    mailer.send = async () => { throw new Error("mail down"); };
    expect((await a.ask({ kind: "assessment", note: "First", projects: [p.id] })).status).toBeGreaterThanOrEqual(500);
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as Record<string, unknown>;
    expect(seen.assessment).toBeUndefined();
    mailer.send = send;
    expect((await a.ask({ kind: "assessment", note: "First", projects: [p.id] })).status).toBe(200);
    expect(a.mails()).toHaveLength(1);
  });
});


describe("a call request", () => {
  it("is separate from an assessment, needs no note or project, and has its own window", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.ask({ kind: "assessment", note: "Hi", projects: [p.id] })).status).toBe(200);
    expect((await a.ask({ kind: "call" })).status).toBe(200);
    expect((await a.ask({ kind: "call", note: "Mornings" })).status).toBe(409);
    expect(a.mails().map((m) => m.subject)).toEqual(["Assessment requested · Kim Dental", "Call requested · Kim Dental"]);
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as Record<string, { open: boolean }>;
    expect(seen.assessment!.open && seen.call!.open).toBe(true);
  });
});


describe("who may ask", () => {
  it("lets writers ask and keeps viewers out", async () => {
    const a = await account();
    // A person who isn't in the organization can't ask for it
    expect((await as("stranger@example.com", `/t/${a.tid}/requests`, "POST", { kind: "call" })).status).toBeGreaterThanOrEqual(400);
    expect(a.mails()).toHaveLength(0);
  });
});


describe("making a project", () => {
  // Writing a project down asks nothing of anyone: no starter item is assigned to the person, so Needs you stays as it was
  it("adds nothing to Needs you, from any template", async () => {
    const a = await account();
    const waiting = async () => ((await (await as(a.email, `/t/${a.tid}/workspace?waiting=all`)).json()) as { waiting: unknown[]; waitingTotal?: number });
    expect((await waiting()).waiting).toHaveLength(0);
    const templates = TEMPLATES.slice(0, 3);
    for (const t of templates) expect((await as(a.email, `/t/${a.tid}/projects`, "POST", { name: `From ${t.name}`, template: t.id, summary: "A summary that is long enough.", example: "A real example of how it works today." })).status).toBe(201);
    const after = await waiting();
    expect(after.waiting).toHaveLength(0);
    expect(after.waitingTotal ?? 0).toBe(0);
  });
});
