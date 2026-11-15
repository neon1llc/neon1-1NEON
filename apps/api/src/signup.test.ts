// apps/api/src/signup.test.ts - Prospect sign-up end to end on the in-memory stack: the form's guards
// and counters, the prospect made only once the code is proved, the prospect allowlist and quotas,
// costly features refused, neon1's review queue (promote, suspend, delete), the unconfirmed sign-up
// sweep, and the quiet-prospect emails and deletion.
import { beforeEach, describe, expect, it } from "vitest";
import { PROSPECT_LIMITS, type User } from "@1neon/domain";
import { createApp } from "./app.ts";
import { claimSignup, SIGNUP_LIMITS, SIGNUP_PK, sweepSignups } from "./routes/signup.ts";
import { WRITE_LIMITS } from "./lib/guards.ts";
import { purgeProspect, sweepQuietProspects } from "./routes/prospects.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";
import type { Config } from "./config.ts";


const OP = "pradeep@neon1.tech";
let app: ReturnType<typeof createApp>;
let repo: Repo;
let mailer: MemoryMailer;
let directory: MemoryDirectory;
let storage: MemoryStorage;
let cfg: Config;

beforeEach(async () => {
  mailer = new MemoryMailer();
  directory = new MemoryDirectory();
  storage = new MemoryStorage();
  repo = new Repo(new MemoryTable());
  cfg = { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true, signup: true };
  app = createApp({ cfg, repo, directory, mailer, storage });
  // neon1's operator, who joins every prospect organization
  const ts = new Date().toISOString();
  const op: User = { id: "u_op", email: OP, name: "Pradeep", title: "", phone: "", operator: false, strongAuth: true, theme: "awake", menu: "default", version: 1, createdAt: ts, updatedAt: ts, updatedBy: "u_op" };
  await repo.createUser(op);
});

const form = { email: "dana@example.com", name: "Dana Kim", org: "Kim Dental", terms: true, elapsed: 8000 };
const signup = (b: unknown, ip = "203.0.113.7") =>
  app.request("/1NEON/api/auth/signup", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-forwarded-for": ip }, body: JSON.stringify(b) });
const as = (email: string, path: string, method = "GET", b?: unknown) =>
  app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": email }, body: b === undefined ? undefined : JSON.stringify(b) });

/** Sign up and prove the code: the prospect's user ID and organization */
async function prospect(email = form.email) {
  expect((await signup({ ...form, email })).status).toBe(200);
  const uid = await claimSignup({ repo, cfg }, email);
  expect(uid).toBeTruthy();
  const tid = (await repo.membershipsOf(uid!))[0]!.tenantId;
  return { uid: uid!, tid, tenant: (await repo.getTenant(tid))! };
}


describe("the sign-up form", () => {
  it("says whether it's open, with the terms edition", async () => {
    const r = await (await app.request("/1NEON/api/auth/signup")).json();
    expect(r).toMatchObject({ open: true, terms: expect.any(String) });
  });

  it("makes only a pending row and a sign-in account before the code is proved", async () => {
    expect((await signup(form)).status).toBe(200);
    expect(await repo.userIdForEmail(form.email)).toBeUndefined();
    expect(directory.users.has(form.email)).toBe(true);
    const row = await repo.table.get(SIGNUP_PK, form.email);
    expect(row).toMatchObject({ name: "Dana Kim", org: "Kim Dental", made: true });
    // The address is kept only as a hash
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
  });

  it("does nothing for a filled hidden field or a form filled too fast", async () => {
    expect((await signup({ ...form, website: "spam.example" })).status).toBe(200);
    expect((await signup({ ...form, elapsed: SIGNUP_LIMITS.minFillMs - 1 })).status).toBe(200);
    expect(await repo.table.get(SIGNUP_PK, form.email)).toBeUndefined();
    expect(directory.users.size).toBe(0);
  });

  it("needs the terms accepted", async () => {
    expect((await signup({ ...form, terms: false })).status).toBe(400);
  });

  it("caps sign-ups per address, per email, and per day", async () => {
    for (let i = 0; i < SIGNUP_LIMITS.perAddressHourly; i++) expect((await signup({ ...form, email: `p${i}@example.com` })).status).toBe(200);
    expect((await signup({ ...form, email: "late@example.com" })).status).toBe(429);
    // One email gets a few codes a day, whatever address asks
    for (let i = 0; i < SIGNUP_LIMITS.perEmailDaily; i++) expect((await signup(form, `198.51.100.${i}`)).status).toBe(200);
    expect((await signup(form, "198.51.100.200")).status).toBe(429);
  });

  it("stops at the daily total", async () => {
    let refused = 0;
    for (let i = 0; i < SIGNUP_LIMITS.daily + 2; i++) if ((await signup({ ...form, email: `d${i}@example.com` }, `192.0.2.${i}`)).status === 503) refused++;
    expect(refused).toBe(2);
  });

  it("is shut when configuration says so, or when neon1 pauses it", async () => {
    cfg.signup = false;
    expect((await signup(form)).status).toBe(503);
    cfg.signup = true;
    await repo.table.write([{ put: { PK: "CONFIG", SK: "SIGNUP", paused: true }, guard: { always: true } }]);
    expect((await signup(form)).status).toBe(503);
  });

  it("refuses a deployed sign-up with no bot check, and one the check fails", async () => {
    const deployed = createApp({ cfg: { ...cfg, env: "prod" }, repo, directory, mailer, storage });
    const post = (a: typeof deployed, b: unknown) => a.request("/1NEON/api/auth/signup", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1" }, body: JSON.stringify(b) });
    expect((await post(deployed, form)).status).toBe(503);
    const checked = createApp({ cfg: { ...cfg, env: "prod" }, repo, directory, mailer, storage, humanCheck: { verify: async (t) => t === "good" } });
    expect((await post(checked, { ...form, check: "bad" })).status).toBe(400);
    expect((await post(checked, { ...form, check: "good" })).status).toBe(200);
  });

  it("answers the same for an email that already has an account, and makes nothing new", async () => {
    expect((await signup({ ...form, email: OP })).status).toBe(200);
    expect(await repo.table.get(SIGNUP_PK, OP)).toBeUndefined();
    expect(await claimSignup({ repo, cfg }, OP)).toBeUndefined();
  });

  it("in dev, takes neon1 addresses only", async () => {
    const dev = createApp({ cfg: { ...cfg, env: "dev" }, repo, directory, mailer, storage, humanCheck: { verify: async () => true } });
    const post = (b: unknown) => dev.request("/1NEON/api/auth/signup", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1" }, body: JSON.stringify(b) });
    expect((await post(form)).status).toBe(403);
    expect((await post({ ...form, email: "test+p1@neon1.tech" })).status).toBe(200);
  });
});


describe("the prospect, once the code is proved", () => {
  it("gets a prospect organization with neon1 in it, and Pradeep hears about it", async () => {
    const { tenant, uid } = await prospect();
    expect(tenant.clientId).toMatch(/^NP-\d{4}$/);
    expect(tenant.slug).toMatch(/^kim-dental-[0-9a-f]{6}$/);
    expect(tenant.prospect).toMatchObject({ terms: expect.any(String) });
    const members = await repo.listMembers(tenant.id);
    expect(members.map((m) => [m.email, m.access, m.status]).sort()).toEqual([[form.email, "admin", "joined"], [OP, "admin", "joined"]]);
    expect(await repo.table.get(SIGNUP_PK, form.email)).toBeUndefined();
    const audit = await repo.table.query(`T#${tenant.id}#AUDIT`);
    expect(audit.find((a) => a.action === "prospect.signedup")).toMatchObject({ actorId: uid });
    expect(mailer.sent.some((m) => m.to === OP)).toBe(true);
  });

  it("isn't made from a sign-up older than a day", async () => {
    await signup(form);
    const row = (await repo.table.get(SIGNUP_PK, form.email))!;
    await repo.table.write([{ put: { ...row, at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }, guard: { always: true } }]);
    expect(await claimSignup({ repo, cfg }, form.email)).toBeUndefined();
  });

  it("may add projects, items, comments, and files, within the quotas", async () => {
    const { tid } = await prospect();
    for (let i = 0; i < PROSPECT_LIMITS.projects; i++) expect((await as(form.email, `/t/${tid}/projects`, "POST", { name: `Need ${i}` })).status).toBe(201);
    expect((await as(form.email, `/t/${tid}/projects`, "POST", { name: "One too many" })).status).toBe(409);
    const pid = ((await (await as(form.email, `/t/${tid}/projects`)).json()) as { id: string }[] | { projects: { id: string }[] });
    const first = Array.isArray(pid) ? pid[0]!.id : pid.projects[0]!.id;
    expect((await as(form.email, `/t/${tid}/projects/${first}/items`, "POST", { kind: "request", layer: "needs", title: "Orders come in by email" })).status).toBe(201);
    // Files: allowed kinds and sizes only
    expect((await as(form.email, `/t/${tid}/docs`, "POST", { name: "plan.pdf", contentType: "application/pdf", size: 1000, layer: "needs" })).status).toBe(201);
    expect((await as(form.email, `/t/${tid}/docs`, "POST", { name: "tool.exe", contentType: "application/octet-stream", size: 1000, layer: "needs" })).status).toBe(400);
    expect((await as(form.email, `/t/${tid}/docs`, "POST", { name: "big.pdf", contentType: "application/pdf", size: PROSPECT_LIMITS.fileBytes + 1, layer: "needs" })).status).toBe(400);
  });

  it("caps the number of files", async () => {
    const { tid } = await prospect();
    for (let i = 0; i < PROSPECT_LIMITS.files; i++) expect((await as(form.email, `/t/${tid}/docs`, "POST", { name: `f${i}.png`, contentType: "image/png", size: 1000, layer: "needs" })).status).toBe(201);
    expect((await as(form.email, `/t/${tid}/docs`, "POST", { name: "more.png", contentType: "image/png", size: 1000, layer: "needs" })).status).toBe(409);
  });

  it("can't invite, change settings, or use Neo or texts", async () => {
    const { tid } = await prospect();
    expect((await as(form.email, `/t/${tid}/members/invite`, "POST", { people: [{ email: "x@example.com", access: "viewer" }] })).status).toBe(403);
    expect((await as(form.email, `/t/${tid}/stages`, "PUT", { stages: [] })).status).toBe(403);
    expect((await as(form.email, `/t/${tid}/agreement/sign`, "POST", {})).status).toBe(403);
    expect((await as(form.email, "/neo", "POST", { question: "hi" })).status).toBe(403);
    expect((await as(form.email, "/me/phone/verify", "POST", {})).status).toBe(403);
  });

  it("pauses a prospect who makes too many changes in an hour", async () => {
    const { tid } = await prospect();
    let last = 0;
    for (let i = 0; i <= WRITE_LIMITS.prospect.hourly; i++) last = (await as(form.email, `/t/${tid}/notifications/seen`, "POST", {})).status;
    expect(last).toBe(429);
  });

  it("leaves neon1 unlimited inside the prospect organization", async () => {
    const { tid } = await prospect();
    for (let i = 0; i < PROSPECT_LIMITS.projects + 1; i++) expect((await as(OP, `/t/${tid}/projects`, "POST", { name: `Option ${i}` })).status).toBe(201);
  });
});


describe("neon1's review queue", () => {
  it("lists prospects for neon1 only", async () => {
    await prospect();
    const r = await (await as(OP, "/prospects")).json();
    expect(r.prospects).toHaveLength(1);
    expect(r.prospects[0]).toMatchObject({ name: "Kim Dental", people: [{ email: form.email }] });
    expect((await as(form.email, "/prospects")).status).toBe(403);
  });

  it("promotes a prospect to a client, lifting the limits", async () => {
    const { tid } = await prospect();
    const r = await as(OP, `/prospects/${tid}/promote`, "POST", {});
    expect(r.status).toBe(200);
    const t = (await repo.getTenant(tid))!;
    expect(t.clientId).toMatch(/^N1-\d{4}$/);
    expect(t.prospect).toBeUndefined();
    for (let i = 0; i < PROSPECT_LIMITS.projects + 1; i++) expect((await as(form.email, `/t/${tid}/projects`, "POST", { name: `Need ${i}` })).status).toBe(201);
  });

  it("suspends and resumes a prospect", async () => {
    const { tid } = await prospect();
    expect((await as(OP, `/prospects/${tid}/suspend`, "POST", {})).status).toBe(200);
    expect((await as(form.email, `/t/${tid}/projects`)).status).toBe(403);
    expect((await as(OP, `/prospects/${tid}/resume`, "POST", {})).status).toBe(200);
    expect((await as(form.email, `/t/${tid}/projects`)).status).toBe(200);
  });

  it("deletes a prospect only when its name is typed, and never a client", async () => {
    const { tid, uid } = await prospect();
    expect((await as(OP, `/prospects/${tid}/delete`, "POST", { confirm: "wrong" })).status).toBe(400);
    expect((await as(OP, `/prospects/${tid}/delete`, "POST", { confirm: "Kim Dental" })).status).toBe(200);
    expect(await repo.getTenant(tid)).toBeUndefined();
    expect(await repo.getUser(uid)).toBeUndefined();
    expect(await repo.userIdForEmail(form.email)).toBeUndefined();
    expect(directory.users.has(form.email)).toBe(false);
    // The operator's own account stays
    expect(await repo.userIdForEmail(OP)).toBe("u_op");
  });

  it("refuses to purge a client", async () => {
    const { tid } = await prospect();
    await as(OP, `/prospects/${tid}/promote`, "POST", {});
    await expect(purgeProspect({ repo, d: { storage, directory } as never, cfg }, tid)).rejects.toThrow();
  });

  it("pauses and reopens sign-up", async () => {
    expect((await as(OP, "/signup", "PUT", { paused: true })).status).toBe(200);
    expect((await signup(form)).status).toBe(503);
    expect((await as(OP, "/signup", "PUT", { paused: false })).status).toBe(200);
    expect((await signup(form)).status).toBe(200);
  });
});


describe("tidying up", () => {
  it("removes the sign-in account of a sign-up never confirmed within a day", async () => {
    await signup(form);
    const row = (await repo.table.get(SIGNUP_PK, form.email))!;
    await repo.table.write([{ put: { ...row, at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }, guard: { always: true } }]);
    expect(await sweepSignups({ repo, d: { directory } as never })).toEqual({ removed: 1 });
    expect(directory.users.has(form.email)).toBe(false);
    expect(await repo.table.get(SIGNUP_PK, form.email)).toBeUndefined();
  });

  it("checks in at 30 and 60 quiet days, gives final notice at 90, and deletes 14 days later", async () => {
    const { tid } = await prospect();
    const day = 24 * 3600 * 1000;
    const since = Date.parse((await repo.getTenant(tid))!.prospect!.since);
    const pass = (days: number) => sweepQuietProspects({ repo, d: { mailer, storage, directory } as never, cfg }, new Date(since + days * day));
    const toDana = () => mailer.sent.filter((m) => m.to === form.email).length;
    expect(await pass(10)).toMatchObject({ nudged: 0 });
    expect(await pass(31)).toMatchObject({ nudged: 1 });
    expect(toDana()).toBe(1);
    expect(await pass(31)).toMatchObject({ skipped: true });
    expect(await pass(61)).toMatchObject({ nudged: 1 });
    expect(await pass(91)).toMatchObject({ warned: 1 });
    expect(await pass(100)).toMatchObject({ deleted: 0 });
    expect(await pass(106)).toMatchObject({ deleted: 1 });
    expect(await repo.getTenant(tid)).toBeUndefined();
    expect(toDana()).toBe(3);
  });

  it("starts the clock again after a real change", async () => {
    const { tid } = await prospect();
    const day = 24 * 3600 * 1000;
    const since = Date.parse((await repo.getTenant(tid))!.prospect!.since);
    const pass = (days: number) => sweepQuietProspects({ repo, d: { mailer, storage, directory } as never, cfg }, new Date(since + days * day));
    await pass(91);
    expect((await repo.getTenant(tid))!.prospect!.warnedAt).toBeTruthy();
    // A change the prospect makes, recorded as if it happened on day 95
    await repo.table.write([{ put: { PK: `T#${tid}`, SK: "ACTIVE", at: new Date(since + 95 * day).toISOString() }, guard: { always: true } }]);
    expect(await pass(106)).toMatchObject({ deleted: 0 });
    expect((await repo.getTenant(tid))!.prospect!.warnedAt).toBeUndefined();
  });

  it("marks a real change by the prospect, but not a notifications read", async () => {
    const { tid } = await prospect();
    await as(form.email, `/t/${tid}/notifications/seen`, "POST", {});
    expect(await repo.table.get(`T#${tid}`, "ACTIVE")).toBeUndefined();
    await as(form.email, `/t/${tid}/projects`, "POST", { name: "Need" });
    expect(await repo.table.get(`T#${tid}`, "ACTIVE")).toBeTruthy();
  });
});
