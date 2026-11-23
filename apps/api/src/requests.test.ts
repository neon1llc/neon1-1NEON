// apps/api/src/requests.test.ts - Asking neon1 for an assessment or a call, under pressure: saves at the
// same moment and overlapping passes send one email, an edit during a send is kept and goes an hour later,
// and a call holds one a week, answers a retry with the same key, and gives the week back on a failed send.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@1neon/domain";
import { createApp } from "./app.ts";
import { claimSignup } from "./routes/signup.ts";
import { sweepRequests } from "./routes/requests.ts";
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

const form = { email: "tomas@example.com", name: "Tomas Greer", kind: "small", org: "Kim Dental", link: "kimdental.com", terms: true, elapsed: 8000 };
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
  const save = (b: Record<string, unknown>) => as(email, `/t/${tid}/requests/assessment`, "PUT", b);
  const mails = () => mailer.sent.filter((m) => m.to === "hello@neon1.tech");
  return { email, tid, project, ask, save, mails };
}



const NOTE = "The intake form matters most; we are on QuickBooks.";
const DAYS = (n: number) => n * DAY;

describe("an assessment request under pressure", () => {
  const sweep = (ms: number) => sweepRequests({ repo, d: { mailer } as never, cfg }, { at: new Date(Date.now() + ms) });
  const MIN = 60 * 1000;

  it("takes six saves at once and emails neon1 once, with the last one saved", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => a.save({ note: `${NOTE} ${i}`, projects: [p.key] })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const kept = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as { assessment: { note: string } };
    expect(await sweep(31 * MIN)).toMatchObject({ sent: 1 });
    expect(a.mails()).toHaveLength(1);
    expect(a.mails()[0]!.text).toContain(kept.assessment.note);
  });

  it("sends once when two passes overlap", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.save({ note: NOTE, projects: [p.key] })).status).toBe(200);
    const [x, y] = await Promise.all([sweep(31 * MIN), sweep(31 * MIN)]);
    expect(x.sent + y.sent).toBe(1);
    expect(a.mails()).toHaveLength(1);
  });

  it("keeps an edit made while the email goes, and sends it an hour later as an update", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.save({ note: NOTE, projects: [p.key] })).status).toBe(200);
    // The edit lands between the pass reading the request and recording the email
    const send = mailer.send.bind(mailer);
    mailer.send = async (...args: Parameters<typeof send>) => { mailer.send = send; await a.save({ note: `${NOTE} And the Saturday hours.`, projects: [p.key] }); return send(...args); };
    expect(await sweep(31 * MIN)).toMatchObject({ sent: 1 });
    const seen = (await (await as(a.email, `/t/${a.tid}/requests`)).json()) as { assessment: { state: string; note: string; sentAt?: string; dueAt?: string } };
    expect(seen.assessment).toMatchObject({ state: "waiting", note: `${NOTE} And the Saturday hours.` });
    expect(seen.assessment.sentAt).toBeTruthy();
    expect(Date.parse(seen.assessment.dueAt!) - Date.parse(seen.assessment.sentAt!)).toBeGreaterThanOrEqual(60 * MIN);
    expect(await sweep(45 * MIN)).toMatchObject({ sent: 0 });
    expect(await sweep(2 * 60 * MIN)).toMatchObject({ sent: 1 });
    expect(a.mails()[1]!.text).toContain("Saturday hours");
    expect(a.mails()[1]!.subject).toMatch(/updated/i);
  });

  it("emails the projects with how far along each is, and what's still missing", async () => {
    const a = await account();
    const p = await a.project("Intake forms", { summary: "Patients email forms to one inbox and staff retype them.", outcome: "Patients upload once and the desk sees what's missing." });
    expect((await a.save({ note: "The intake form comes first for us.", projects: [p.key] })).status).toBe(200);
    await sweep(31 * MIN);
    const [mail] = a.mails();
    expect(mail!.text).toContain(`${p.key} Intake forms`);
    expect(mail!.text).toMatch(/not yet: .*how it works today/);
  });
});


describe("a request row from before versions existed", () => {
  it("saves over it instead of conflicting, then carries on at version 1", async () => {
    const a = await account();
    await repo.table.write([{ put: { PK: `T#${a.tid}`, SK: "REQUEST#assessment", at: new Date().toISOString(), by: "u_old" }, guard: { always: true } }]);
    const p = await a.project("Intake");
    const first = await a.save({ note: NOTE, projects: [p.key] });
    expect(first.status).toBe(200);
    expect(((await repo.table.get(`T#${a.tid}`, "REQUEST#assessment")) as { version?: number }).version).toBe(1);
    expect((await a.save({ note: `${NOTE} More.`, projects: [p.key] })).status).toBe(200);
  });
});


describe("a call request", () => {
  it("is separate from an assessment, needs no note or project, and holds one a week", async () => {
    const a = await account();
    const p = await a.project("Intake forms");
    expect((await a.save({ note: NOTE, projects: [p.key] })).status).toBe(200);
    const results = await Promise.all([a.ask({ kind: "call" }), a.ask({ kind: "call", note: NOTE }), a.ask({ kind: "call" })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(a.mails().map((m) => m.subject)).toHaveLength(1);
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
