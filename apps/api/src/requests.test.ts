// apps/api/src/requests.test.ts - The limits on asking neon1 for an assessment or a call, under pressure:
// presses at the same moment send one email, a retry with the same key gets the first answer, a failed
// send gives the window back, the windows roll rather than reset at midnight, and the answers carry dates.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSESSMENT_RESEND_DAYS, REQUESTS_PER_WEEK, type User } from "@1neon/domain";
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



const NOTE = "The intake form matters most; we are on QuickBooks.";
const DAYS = (n: number) => n * DAY;

describe("an assessment request under pressure", () => {
  it("lets presses at the same moment through once, with one email", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => a.ask({ kind: "assessment", note: `${NOTE} ${i}`, projects: [p.key], key: `press-race-${i}-cccc` })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409, 409]);
    expect(a.mails()).toHaveLength(1);
  });

  it("holds two tabs without a key to the same one email", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const results = await Promise.all([a.ask({ kind: "assessment", note: NOTE, projects: [p.key] }), a.ask({ kind: "assessment", note: NOTE, projects: [p.key] })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(a.mails()).toHaveLength(1);
  });

  it("answers a retry with the same key as the first request, without a second email", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const first = (await (await a.ask({ kind: "assessment", note: NOTE, projects: [p.key], key: "retry-key-0001" })).json()) as { at: string; again: string };
    const retry = await a.ask({ kind: "assessment", note: NOTE, projects: [p.key], key: "retry-key-0001" });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ok: true, at: first.at, again: first.again, repeated: true });
    expect(a.mails()).toHaveLength(1);
    expect(Date.parse(first.again) - Date.parse(first.at)).toBe(DAYS(ASSESSMENT_RESEND_DAYS));
  });

  it("says when it was sent and when the project can go again, in words", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.ask({ kind: "assessment", note: NOTE, projects: [p.key] })).status).toBe(200);
    const again = await a.ask({ kind: "assessment", note: NOTE, projects: [p.key] });
    expect(again.status).toBe(409);
    const msg = ((await again.json()) as { message: string }).message;
    expect(msg).toMatch(/was sent on [A-Z][a-z]{2} \d+, and I'll reply by email\. You can ask again from [A-Z][a-z]{2} \d+\./);
    expect(a.mails()).toHaveLength(1);
  });

  it("stays closed across midnight in every zone, and opens exactly when the window ends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T23:50:00Z"));
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.ask({ kind: "assessment", note: NOTE, projects: [p.key] })).status).toBe(200);
    vi.setSystemTime(new Date("2026-11-20T01:50:00Z"));
    expect((await a.ask({ kind: "assessment", note: NOTE, projects: [p.key] })).status).toBe(409);
    vi.setSystemTime(new Date("2026-12-03T23:49:00Z"));
    expect((await a.ask({ kind: "assessment", note: NOTE, projects: [p.key] })).status).toBe(409);
    vi.setSystemTime(new Date("2026-12-03T23:51:00Z"));
    expect((await a.ask({ kind: "assessment", note: NOTE, projects: [p.key] })).status).toBe(200);
    expect(a.mails()).toHaveLength(2);
  });

  it("gives the window back when the email can't be sent", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const send = mailer.send.bind(mailer);
    mailer.send = async () => { throw new Error("mail down"); };
    expect((await a.ask({ kind: "assessment", note: NOTE, projects: [p.key], key: "fail-key-0001" })).status).toBeGreaterThanOrEqual(500);
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as { projects: { key: string; sentAt?: string }[] };
    expect(seen.projects.find((x) => x.key === p.key)?.sentAt).toBeUndefined();
    mailer.send = send;
    // The same key again is a fresh try, not an answer to the one that failed
    expect((await a.ask({ kind: "assessment", note: NOTE, projects: [p.key], key: "fail-key-0001" })).status).toBe(200);
    expect(a.mails()).toHaveLength(1);
  });

  it("shows each sent project with its sent and again dates", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const q = await a.project("Backups");
    await a.ask({ kind: "assessment", note: NOTE, projects: [p.key] });
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as { projects: { key: string; sentAt?: string; again?: string }[]; resendDays: number };
    const sent = seen.projects.find((x) => x.key === p.key)!;
    expect(Date.parse(sent.again!) - Date.parse(sent.sentAt!)).toBe(DAYS(seen.resendDays));
    expect(seen.projects.find((x) => x.key === q.key)?.sentAt).toBeUndefined();
  });

  it("emails the projects with how far along each is, and what's still missing", async () => {
    const a = await account();
    const p = await a.project("Intake forms", { summary: "Patients email forms to one inbox and staff retype them.", outcome: "Patients upload once and the desk sees what's missing." });
    expect((await a.ask({ kind: "assessment", note: "The intake form first", projects: [p.key] })).status).toBe(200);
    const [mail] = a.mails();
    expect(mail!.text).toContain(`${p.key} Intake forms`);
    expect(mail!.text).toMatch(/not yet: .*how it works today/);
  });

  it("refuses the request over the weekly cap, even at once, and gives back what it claimed", async () => {
    const a = await account();
    const p = await a.project("One");
    const q = await a.project("Two");
    // Four already counted this week; two more arrive together and only one fits
    await repo.table.increment(`T#${a.tid}`, "REQCAP", REQUESTS_PER_WEEK - 1, Math.ceil(Date.now() / 1000) + 7 * 86400);
    const results = await Promise.all([p, q].map((x) => a.ask({ kind: "assessment", note: NOTE, projects: [x.key] })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(a.mails()).toHaveLength(1);
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as { projects: { sentAt?: string }[] };
    expect(seen.projects.filter((x) => x.sentAt)).toHaveLength(1);
  });
});


describe("a call request", () => {
  it("is separate from an assessment, needs no note or project, and holds one a week", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.ask({ kind: "assessment", note: NOTE, projects: [p.key] })).status).toBe(200);
    const results = await Promise.all([a.ask({ kind: "call" }), a.ask({ kind: "call", note: NOTE }), a.ask({ kind: "call" })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(a.mails().map((m) => m.subject)).toHaveLength(2);
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as { call?: { at: string; again: string } };
    expect(Date.parse(seen.call!.again) - Date.parse(seen.call!.at)).toBe(DAYS(7));
  });

  it("gives the window back when its email can't be sent", async () => {
    const a = await account();
    const send = mailer.send.bind(mailer);
    mailer.send = async () => { throw new Error("mail down"); };
    expect((await a.ask({ kind: "call" })).status).toBeGreaterThanOrEqual(500);
    mailer.send = send;
    expect((await a.ask({ kind: "call" })).status).toBe(200);
  });
});
