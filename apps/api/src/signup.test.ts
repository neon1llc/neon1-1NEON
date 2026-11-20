// apps/api/src/signup.test.ts - Prospect sign-up end to end on the in-memory stack: the form's guards
// and counters, the prospect made only once the code is proved, the prospect allowlist and quotas,
// costly features refused, neon1's review queue (promote, suspend, delete), the unconfirmed sign-up
// sweep, and the quiet-prospect emails and deletion.
import { beforeEach, describe, expect, it } from "vitest";
import { PROSPECT_LIMITS, type User } from "@1neon/domain";
import { createApp } from "./app.ts";
import { claimSignup, SIGNUP_LIMITS, SIGNUP_PK, sweepSignups } from "./routes/signup.ts";
import { WRITE_LIMITS } from "./lib/guards.ts";
import { PURGE_DRAIN_MS, PURGE_PK, PurgeIncomplete, finishPurge, finishPurges, purgeProspect, startPurge, sweepQuietProspects } from "./routes/prospects.ts";
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

const form = { email: "dana@example.com", name: "Dana Kim", kind: "small", org: "Kim Dental", link: "kimdental.com", terms: true, elapsed: 8000 };
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
    const r = await (await app.request("/1NEON/api/auth/signup")).json() as unknown;
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

  it("takes where the business is based and a link as optional, and keeps them on the organization", async () => {
    expect((await signup({ ...form, email: "d@example.com", link: "" }, "198.51.100.10")).status).toBe(200);
    expect((await signup({ ...form, link: "javascript:alert(1)" })).status).toBe(400);
    expect((await signup({ ...form, link: "", place: "Queens, NY" })).status).toBe(200);
    const { tenant } = await prospect("b@example.com");
    expect(tenant).toMatchObject({ link: "https://kimdental.com/" });
    const p2 = await signup({ ...form, email: "c@example.com", link: "", place: "Queens, NY" }, "198.51.100.9");
    expect(p2.status).toBe(200);
    expect((await claimSignup({ repo, cfg }, "c@example.com"))).toBeTruthy();
  });

  it("keeps how they found neon1, if they said, and refuses an answer not on the list", async () => {
    expect((await signup({ ...form, email: "f@example.com", found: "billboard" }, "198.51.100.11")).status).toBe(400);
    expect((await signup({ ...form, email: "f@example.com", found: "linkedin" }, "198.51.100.11")).status).toBe(200);
    const uid = await claimSignup({ repo, cfg }, "f@example.com");
    const tenant = (await repo.getTenant((await repo.membershipsOf(uid!))[0]!.tenantId))!;
    expect(tenant.prospect?.found).toBe("linkedin");
    const { tenant: plain } = await prospect("g@example.com");
    expect(plain.prospect?.found).toBeUndefined();
  });

  it("checks each field and answers field by field, before any counter moves", async () => {
    const r = await signup({ ...form, email: "nope", name: "D4na", kind: "other", kindOther: "", found: "other", foundOther: "" });
    expect(r.status).toBe(400);
    const b = await r.json() as { error: string; current: { fields: Record<string, string> } };
    expect(b.error).toBe("check_fields");
    expect(Object.keys(b.current.fields).sort()).toEqual(["email", "foundOther", "kindOther", "name"]);
    expect(b.current.fields.name).toMatch(/numbers/);
    // Six tries with mistakes, then a clean one, all from one address: the hourly cap (3) was never touched
    for (let i = 0; i < 6; i++) expect((await signup({ ...form, name: "x" })).status).toBe(400);
    expect((await signup(form)).status).toBe(200);
  });

  it("needs an organization's name except from an individual, whose account is named for them", async () => {
    const r = await signup({ ...form, org: "" });
    expect(((await r.json()) as { current: { fields: Record<string, string> } }).current.fields.org).toMatch(/organization's name/);
    expect((await signup({ ...form, email: "solo@example.com", kind: "individual", org: "", oneName: true, name: "Madonna" }, "198.51.100.12")).status).toBe(200);
    const uid = await claimSignup({ repo, cfg }, "solo@example.com");
    const tenant = (await repo.getTenant((await repo.membershipsOf(uid!))[0]!.tenantId))!;
    expect(tenant.name).toBe("Madonna");
    expect(tenant.prospect).toMatchObject({ kind: "individual" });
  });

  it("lets \"Something else\" leave the organization's name out, and names that account for them", async () => {
    expect((await signup({ ...form, email: "club@example.com", kind: "other", kindOther: "A chess club", org: "" }, "198.51.100.14")).status).toBe(200);
    const uid = await claimSignup({ repo, cfg }, "club@example.com");
    const tenant = (await repo.getTenant((await repo.membershipsOf(uid!))[0]!.tenantId))!;
    expect(tenant.name).toBe("Dana Kim");
    expect(tenant.prospect).toMatchObject({ kind: "other", kindOther: "A chess club" });
  });

  it("keeps their own words for Something else and Somewhere else, and refuses rude or junk answers", async () => {
    const bad = await signup({ ...form, org: "fuck off", kind: "other", kindOther: "asdf" });
    expect(((await bad.json()) as { current: { fields: Record<string, string> } }).current.fields).toMatchObject({ org: expect.stringMatching(/reword/), kindOther: expect.stringMatching(/real answer/) });
    expect((await signup({ ...form, email: "h@example.com", kind: "other", kindOther: "A family office", found: "other", foundOther: "A podcast" }, "198.51.100.13")).status).toBe(200);
    const uid = await claimSignup({ repo, cfg }, "h@example.com");
    const tenant = (await repo.getTenant((await repo.membershipsOf(uid!))[0]!.tenantId))!;
    expect(tenant.prospect).toMatchObject({ kind: "other", kindOther: "A family office", found: "other", foundOther: "A podcast" });
  });

  it("with the outside checks, refuses throwaway mailboxes and domains that take no mail, and takes any link and place", async () => {
    app = createApp({ cfg, repo, directory, mailer, storage, vetting: {
      mailDomain: async (d) => (d === "nomail.example" ? "no_mail" : "ok"),
      disposable: async (d) => d === "mailinator.com",
      place: async (city, st) => (city.toLowerCase() === "albany" && st === "NY" ? "Albany" : undefined),
    } });
    const fields = async (b: unknown) => ((await (await signup(b)).json()) as { current?: { fields: Record<string, string> } }).current?.fields;
    expect((await fields({ ...form, email: "a@mailinator.com" }))?.email).toMatch(/Temporary/);
    expect((await fields({ ...form, email: "a@nomail.example" }))?.email).toMatch(/doesn't receive email/);
    // A link is never visited, and a town the list doesn't know is kept as typed
    expect((await fields({ ...form, link: "brand-new-site.example" }))?.link).toBeUndefined();
    expect((await fields({ ...form, place: "Gotham, NY" }))?.place).toBeUndefined();
    expect((await fields({ ...form, place: "Toronto, Canada" }))?.place).toBeUndefined();
    expect((await signup({ ...form, email: "p@example.com", place: "albany, ny" }, "198.51.100.14")).status).toBe(200);
    const uid = await claimSignup({ repo, cfg }, "p@example.com");
    expect((await repo.getTenant((await repo.membershipsOf(uid!))[0]!.tenantId))!.place).toBe("Albany, NY");
  });

  it("lets the prospect's admin change the place and link without confirming it's them", async () => {
    const { tid, tenant } = await prospect("e@example.com");
    const put = (b: unknown) => as("e@example.com", `/t/${tid}/profile`, "PUT", b);
    expect((await put({ version: tenant.version, place: "", link: "bad link" })).status).toBe(400);
    const r = await put({ version: tenant.version, place: "Bayside, NY", link: "" });
    expect(r.status).toBe(200);
    const after = (await repo.getTenant(tid))!;
    expect(after.place).toBe("Bayside, NY");
    expect(after.link).toBeUndefined();
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
    const r = (await (await as(OP, "/prospects")).json()) as { prospects: unknown[] };
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
    // Shut out at once; the rest goes once requests already under way have finished
    expect((await as(OP, `/prospects/${tid}/delete`, "POST", { confirm: "Kim Dental" })).status).toBe(202);
    expect((await as(form.email, `/t/${tid}/projects`)).status).toBe(403);
    expect(await repo.getTenant(tid)).toBeTruthy();
    expect(await finishPurges({ repo, d: { mailer, storage, directory } as never, cfg }, { at: afterDrain() })).toMatchObject({ deleted: 1 });
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


/** A moment after every request and upload link that began before a deletion has run out */
const afterDrain = (from = Date.now()) => new Date(from + PURGE_DRAIN_MS + 1000);


/** A prospect with a general file and a trashed project holding a file of its own */
async function withTrashedFile() {
  const p = await prospect();
  await as(form.email, `/t/${p.tid}/docs`, "POST", { name: "general.pdf", contentType: "application/pdf", size: 1000, layer: "needs" });
  const proj = (await (await as(form.email, `/t/${p.tid}/projects`, "POST", { name: "Old idea" })).json()) as { id: string };
  expect((await as(form.email, `/t/${p.tid}/docs`, "POST", { name: "kept.pdf", contentType: "application/pdf", size: 1000, layer: "needs", projectId: proj.id })).status).toBe(201);
  const row = (await repo.table.get(`T#${p.tid}`, `PROJ#${proj.id}`))!;
  await repo.table.write([{ put: { ...row, deletedAt: new Date().toISOString(), archived: true }, guard: { always: true } }]);
  const keys = [...(await repo.listDocs(p.tid, undefined)), ...(await repo.listDocs(p.tid, proj.id))].map((x) => x.key);
  for (const key of keys) storage.files.set(key, { type: "application/pdf", bytes: new Uint8Array(1000) });
  return { ...p, pid: proj.id, keys };
}


describe("deleting a free account", () => {
  const kit = () => ({ repo, d: { mailer, storage, directory } as never, cfg });

  it("reaches trashed projects: their rows and their files go too, and a receipt stays", async () => {
    const { tid, pid, keys } = await withTrashedFile();
    expect(keys).toHaveLength(2);
    await purgeProspect(kit(), tid);
    await finishPurge(kit(), tid, afterDrain());
    for (const key of keys) expect(storage.files.has(key)).toBe(false);
    expect(await repo.table.query(`T#${tid}#P#${pid}`)).toHaveLength(0);
    expect(await repo.table.query(`T#${tid}`)).toHaveLength(0);
    expect(await repo.table.get("DELETED", tid)).toMatchObject({ files: 2, accounts: 1 });
    // The job row goes with the receipt
    expect(await repo.table.get(PURGE_PK, tid)).toBeUndefined();
  });

  it("counts a trashed project's files toward the storage limit", async () => {
    const { tid } = await withTrashedFile();
    for (let i = 2; i < PROSPECT_LIMITS.files; i++) expect((await as(form.email, `/t/${tid}/docs`, "POST", { name: `f${i}.png`, contentType: "image/png", size: 1000, layer: "needs" })).status).toBe(201);
    expect((await as(form.email, `/t/${tid}/docs`, "POST", { name: "more.png", contentType: "image/png", size: 1000, layer: "needs" })).status).toBe(409);
  });

  it("removes nothing until requests already under way have run out", async () => {
    const { tid, keys } = await withTrashedFile();
    expect(await purgeProspect(kit(), tid)).toMatchObject({ deleted: false, pending: expect.any(String) });
    expect(await finishPurge(kit(), tid, new Date(Date.now() + PURGE_DRAIN_MS - 5000))).toMatchObject({ deleted: false, pending: expect.any(String) });
    for (const key of keys) expect(storage.files.has(key)).toBe(true);
    expect((await repo.getTenant(tid))!.prospect!.deletingAt).toBeTruthy();
    expect((await as(form.email, `/t/${tid}/projects`)).status).toBe(403);
  });

  it("also removes what a request already under way wrote after the mark", async () => {
    const { tid, pid } = await withTrashedFile();
    await startPurge(kit(), tid);
    // A request that read the organization just before the mark lands its writes during the wait: a
    // file in a new project, and the project itself
    const ts = new Date().toISOString();
    const late = { tenantId: tid, id: "p_late", key: "LATE-1", name: "Late", template: "blank", stageId: "s", stageEnteredAt: ts, health: "not_started", rank: "m", people: [], flags: [], archived: false, version: 1, createdAt: ts, updatedAt: ts, updatedBy: "x" };
    await repo.table.write([{ put: { PK: `T#${tid}`, SK: "PROJ#p_late", type: "project", ...late }, guard: { create: true } }]);
    const doc = (await repo.listDocs(tid, pid))[0]!;
    const key = doc.key.replace(doc.id, "d_late").replace(pid, "p_late");
    await repo.table.write([{ put: { PK: `T#${tid}#P#p_late`, SK: "DOC#d_late", type: "doc", ...doc, id: "d_late", projectId: "p_late", key }, guard: { create: true } }]);
    storage.files.set(key, { type: "application/pdf", bytes: new Uint8Array(10) });
    expect(await finishPurge(kit(), tid, afterDrain())).toEqual({ deleted: true });
    expect(storage.files.has(key)).toBe(false);
    expect(await repo.table.query(`T#${tid}#P#p_late`)).toHaveLength(0);
  });

  it("keeps its inventory until every step is checked, so a pass cut short still finds every partition", async () => {
    const { tid, pid, keys } = await withTrashedFile();
    await startPurge(kit(), tid);
    const remove = storage.remove.bind(storage);
    storage.remove = async (key: string) => { if (key === keys[1]) throw new Error("SlowDown"); return remove(key); };
    await expect(finishPurge(kit(), tid, afterDrain())).rejects.toBeInstanceOf(PurgeIncomplete);
    const job = (await repo.table.get(PURGE_PK, tid))!;
    expect((job.inventory as { pks: string[] }).pks).toContain(`T#${tid}#P#${pid}`);
    // The pass was cut short after the project's own record went: its partition can no longer be found
    // from the organization's records, only from the inventory
    await repo.table.write([{ delete: { PK: `T#${tid}`, SK: `PROJ#${pid}` } }]);
    expect((await repo.listProjectsWithTrash(tid)).map((p) => p.id)).not.toContain(pid);
    storage.remove = remove;
    expect(await finishPurge(kit(), tid, afterDrain())).toEqual({ deleted: true });
    expect(await repo.table.query(`T#${tid}#P#${pid}`)).toHaveLength(0);
    for (const key of keys) expect(storage.files.has(key)).toBe(false);
    expect(await repo.table.get(PURGE_PK, tid)).toBeUndefined();
  });

  it("doesn't write the receipt while anything is left, and tries again", async () => {
    const { tid, keys } = await withTrashedFile();
    await startPurge(kit(), tid);
    // The store says it removed a file but it's still there
    const remove = storage.remove.bind(storage);
    storage.remove = async () => undefined;
    await expect(finishPurge(kit(), tid, afterDrain())).rejects.toBeInstanceOf(PurgeIncomplete);
    expect(await repo.table.get("DELETED", tid)).toBeUndefined();
    expect(await repo.table.get(PURGE_PK, tid)).toBeTruthy();
    expect(await repo.getTenant(tid)).toBeTruthy();
    storage.remove = remove;
    // Files marked done were removed once already; the check finds them and the retry has to clear them
    const job = (await repo.table.get(PURGE_PK, tid))!;
    await repo.table.write([{ put: { ...job, filesDone: [], version: Number(job.version) + 1 }, guard: { version: Number(job.version) } }]);
    expect(await finishPurges(kit(), { at: afterDrain() })).toMatchObject({ deleted: 1 });
    for (const key of keys) expect(storage.files.has(key)).toBe(false);
  });

  it("stops before any row goes when a file can't be removed, keeps it shut out, and finishes on a later pass", async () => {
    const { tid, keys } = await withTrashedFile();
    const remove = storage.remove.bind(storage);
    storage.remove = async () => { throw new Error("SlowDown"); };
    await purgeProspect(kit(), tid);
    await expect(finishPurge(kit(), tid, afterDrain())).rejects.toBeInstanceOf(PurgeIncomplete);
    const t = (await repo.getTenant(tid))!;
    expect(t.prospect!.deletingAt).toBeTruthy();
    expect((await repo.listDocs(tid, undefined)).length).toBe(1);
    expect(await repo.userIdForEmail(form.email)).toBeTruthy();
    expect((await as(form.email, `/t/${tid}/projects`)).status).toBe(403);
    storage.remove = remove;
    expect(await finishPurges(kit(), { at: afterDrain() })).toMatchObject({ deleted: 1, failed: 0 });
    expect(await repo.getTenant(tid)).toBeUndefined();
    for (const key of keys) expect(storage.files.has(key)).toBe(false);
  });

  it("keeps a person's data when their sign-in account can't be removed", async () => {
    const { tid } = await prospect();
    directory.removeUser = async () => { throw new Error("TooManyRequests"); };
    await purgeProspect(kit(), tid);
    await expect(finishPurge(kit(), tid, afterDrain())).rejects.toBeInstanceOf(PurgeIncomplete);
    expect(await repo.userIdForEmail(form.email)).toBeTruthy();
    expect(await repo.getTenant(tid)).toBeTruthy();
  });

  it("keeps the sign-in of someone who joined another organization during the wait", async () => {
    const a = await prospect();
    const b = await prospect("b@example.com");
    await startPurge(kit(), a.tid);
    // Dana joins B's organization before the wait is over
    const m = (await repo.listMembers(b.tid))[0]!;
    await repo.table.write([repo.memberOp({ ...m, userId: a.uid, email: form.email, name: "Dana" }, { create: true })]);
    expect(await finishPurge(kit(), a.tid, afterDrain())).toEqual({ deleted: true });
    expect(await repo.userIdForEmail(form.email)).toBe(a.uid);
    expect(directory.users.has(form.email)).toBe(true);
  });

  it("can't promote an organization being deleted, and a promotion that lands first stops the deletion", async () => {
    const a = await prospect();
    await startPurge(kit(), a.tid);
    expect((await as(OP, `/prospects/${a.tid}/promote`, "POST", {})).status).toBe(409);
    // Nor hold, suspend, or resume it
    for (const verb of ["hold", "suspend", "resume", "release"]) expect((await as(OP, `/prospects/${a.tid}/${verb}`, "POST", {})).status).toBe(409);
    // The other order: the purge read the prospect, then the promotion landed before its mark
    const b = await prospect("b@example.com");
    const stale = (await repo.getTenant(b.tid))!;
    const get = repo.getTenant.bind(repo);
    repo.getTenant = async (id: string) => (id === b.tid ? stale : get(id));
    expect((await as(OP, `/prospects/${b.tid}/promote`, "POST", {})).status).toBe(200);
    await expect(purgeProspect(kit(), b.tid)).rejects.toThrow();
    repo.getTenant = get;
    const after = (await repo.getTenant(b.tid))!;
    expect(after.prospect).toBeUndefined();
    expect(await repo.table.get(PURGE_PK, b.tid)).toBeUndefined();
    expect(await repo.userIdForEmail("b@example.com")).toBeTruthy();
  });
});


describe("deleting a quiet free account", () => {
  const kit = () => ({ repo, d: { mailer, storage, directory } as never, cfg });
  const day = 24 * 3600 * 1000;
  /** A prospect whose final notice went out `ago` days before now */
  async function warned(ago = 10) {
    const p = await prospect();
    const t = (await repo.getTenant(p.tid))!;
    const at = (n: number) => new Date(Date.now() - n * day).toISOString();
    await repo.table.write([{ put: { PK: `T#${p.tid}`, SK: "ACTIVE", at: at(ago + 21) }, guard: { always: true } }]);
    await repo.saveTenant({ ...t, prospect: { ...t.prospect!, since: at(ago + 21), notices: 2, noticeAt: at(ago), warnedAt: at(ago) }, version: t.version + 1 }, t.version);
    return p;
  }

  for (const change of ["heldAt", "suspendedAt", "keptUntil"] as const) {
    it(`checks every condition again on a fresh read: ${change} set after the pass decided stops it`, async () => {
      const { tid } = await warned();
      const stale = (await repo.getTenant(tid))!;
      const t = { ...stale, prospect: { ...stale.prospect!, ...(change === "keptUntil" ? { keptAt: new Date().toISOString(), keptUntil: new Date(Date.now() + 40 * day).toISOString(), notices: undefined, noticeAt: undefined, warnedAt: undefined } : { [change]: new Date().toISOString() }) }, version: stale.version + 1 };
      await repo.saveTenant(t, stale.version);
      // The pass read the organization before the change
      const list = repo.listTenants.bind(repo);
      repo.listTenants = async () => (await list()).map((x) => (x.id === tid ? stale : x));
      expect(await sweepQuietProspects(kit(), new Date())).toMatchObject({ deleting: 0 });
      repo.listTenants = list;
      expect((await repo.getTenant(tid))!.prospect!.deletingAt).toBeUndefined();
      expect(await repo.table.get(PURGE_PK, tid)).toBeUndefined();
    });
  }

  it("is due on the same fresh read when nothing changed", async () => {
    const { tid } = await warned();
    expect(await sweepQuietProspects(kit(), new Date())).toMatchObject({ deleting: 1 });
    expect(await repo.table.get(PURGE_PK, tid)).toMatchObject({ reason: "quiet" });
  });

  it("is cancelled by a change that lands while requests drain", async () => {
    const { tid } = await warned();
    expect(await startPurge(kit(), tid, { quiet: true })).toEqual({ started: true });
    // A request already under way when the mark landed records a real change
    await repo.table.write([{ put: { PK: `T#${tid}`, SK: "ACTIVE", at: new Date(Date.now() + 1000).toISOString() }, guard: { always: true } }]);
    expect(await finishPurge(kit(), tid, afterDrain())).toEqual({ deleted: false, cancelled: true });
    expect((await repo.getTenant(tid))!.prospect!.deletingAt).toBeUndefined();
    expect(await repo.table.get(PURGE_PK, tid)).toBeUndefined();
    expect((await as(form.email, `/t/${tid}/projects`)).status).toBe(200);
  });

  it("never deletes a suspended account, and lists it for review", async () => {
    const { tid } = await warned(40);
    const t = (await repo.getTenant(tid))!;
    await repo.saveTenant({ ...t, prospect: { ...t.prospect!, suspendedAt: new Date(Date.now() - 50 * day).toISOString() }, version: t.version + 1 }, t.version);
    expect(await sweepQuietProspects(kit(), new Date())).toMatchObject({ deleting: 0, nudged: 0, warned: 0 });
    expect(await startPurge(kit(), tid, { quiet: true })).toEqual({ started: false });
    const r = (await (await as(OP, "/prospects")).json()) as { prospects: { id: string; deleteOn?: string; prospect: { suspendedAt?: string } }[] };
    const row = r.prospects.find((x) => x.id === tid)!;
    expect(row.prospect.suspendedAt).toBeTruthy();
    expect(row.deleteOn).toBeUndefined();
  });
});


describe("neon1's Potentials view", () => {
  it("counts files as the quota does, trashed projects included", async () => {
    const { tid } = await withTrashedFile();
    const r = (await (await as(OP, "/prospects")).json()) as { prospects: { id: string; files: number; bytes: number; projects: number; deleteOn?: string }[] };
    const row = r.prospects.find((x) => x.id === tid)!;
    expect(row).toMatchObject({ files: 2, bytes: 2000, projects: 0, deleteOn: expect.any(String) });
  });
});


describe("prospect quotas under concurrent requests", () => {
  it("lets only one of many simultaneous creates take the last project place", async () => {
    const { tid } = await prospect();
    for (let i = 0; i < PROSPECT_LIMITS.projects - 1; i++) expect((await as(form.email, `/t/${tid}/projects`, "POST", { name: `Need ${i}` })).status).toBe(201);
    const statuses = await Promise.all(Array.from({ length: 6 }, async (_, i) => (await as(form.email, `/t/${tid}/projects`, "POST", { name: `Race ${i}` })).status));
    expect(statuses.filter((x: number) => x === 201)).toHaveLength(1);
    expect(statuses.every((x: number) => x === 201 || x === 409)).toBe(true);
    expect((await repo.listProjects(tid)).filter((p) => !p.deletedAt)).toHaveLength(PROSPECT_LIMITS.projects);
  });

  it("lets only one of many simultaneous uploads take the last file place", async () => {
    const { tid } = await prospect();
    for (let i = 0; i < PROSPECT_LIMITS.files - 1; i++) expect((await as(form.email, `/t/${tid}/docs`, "POST", { name: `f${i}.png`, contentType: "image/png", size: 1000, layer: "needs" })).status).toBe(201);
    const statuses = await Promise.all(Array.from({ length: 6 }, async (_, i) => (await as(form.email, `/t/${tid}/docs`, "POST", { name: `r${i}.png`, contentType: "image/png", size: 1000, layer: "needs" })).status));
    expect(statuses.filter((x: number) => x === 201)).toHaveLength(1);
    expect((await repo.listDocs(tid, undefined))).toHaveLength(PROSPECT_LIMITS.files);
  });

  it("lets only one of many simultaneous items take a project's last place", async () => {
    const { tid } = await prospect();
    const pr = (await (await as(form.email, `/t/${tid}/projects`, "POST", { name: "Need" })).json()) as { id: string };
    const have = (await repo.listItems(tid, pr.id)).length;
    for (let i = have; i < PROSPECT_LIMITS.itemsPerProject - 1; i++) {
      await repo.table.write([{ put: { PK: `T#${tid}#P#${pr.id}`, SK: `ITEM#i_fill${i}`, type: "item", id: `i_fill${i}`, tenantId: tid, projectId: pr.id, kind: "request", title: "x", status: "open", body: "", fields: {}, rank: "m", version: 1, createdAt: "", updatedAt: "", updatedBy: "" }, guard: { create: true } }]);
    }
    const statuses = await Promise.all(Array.from({ length: 6 }, async (_, i) => (await as(form.email, `/t/${tid}/projects/${pr.id}/items`, "POST", { kind: "request", title: `Race ${i}` })).status));
    expect(statuses.filter((x: number) => x === 201)).toHaveLength(1);
    expect(await repo.listItems(tid, pr.id)).toHaveLength(PROSPECT_LIMITS.itemsPerProject);
  });

  it("never limits neon1 inside a prospect organization", async () => {
    const { tid } = await prospect();
    const statuses = await Promise.all(Array.from({ length: PROSPECT_LIMITS.projects + 2 }, async (_, i) => (await as(OP, `/t/${tid}/projects`, "POST", { name: `Op ${i}` })).status));
    expect(statuses.every((x: number) => x === 201)).toBe(true);
  });
});


describe("a free account's expiry", () => {
  it("shows when it's deleted, and keeps it 30 more days once", async () => {
    const { tid } = await prospect();
    const k = (await (await as(form.email, `/t/${tid}/keep`)).json()) as { free: boolean; deleteOn: string; canKeep: boolean };
    expect(k).toMatchObject({ free: true, canKeep: true });
    const since = Date.parse((await repo.getTenant(tid))!.prospect!.since);
    expect(Math.round((Date.parse(k.deleteOn) - since) / 86_400_000)).toBe(30);
    // After the final notice, keeping it withdraws the notice and moves the date
    await sweepQuietProspects({ repo, d: { mailer, storage, directory } as never, cfg }, new Date(since + 21.1 * 86_400_000));
    expect((await repo.getTenant(tid))!.prospect!.warnedAt).toBeTruthy();
    const shown = ((await (await as(form.email, `/t/${tid}/keep`)).json()) as { deleteOn: string }).deleteOn;
    const kept = (await as(form.email, `/t/${tid}/keep`, "POST", {}));
    expect(kept.status).toBe(200);
    // 30 days past the date that was shown, not 30 days from today
    expect(Math.round((Date.parse(((await kept.json()) as { deleteOn: string }).deleteOn) - Date.parse(shown)) / 86_400_000)).toBe(30);
    const t = (await repo.getTenant(tid))!;
    expect(t.prospect!.warnedAt).toBeUndefined();
    expect(t.prospect!.keptAt).toBeTruthy();
    expect((await as(form.email, `/t/${tid}/keep`, "POST", {})).status).toBe(409);
    expect(((await (await as(form.email, `/t/${tid}/keep`)).json()) as { canKeep: boolean }).canKeep).toBe(false);
  });

  it("adds 30 days to the shown date even when pressed on day one, and the emails follow the new date", async () => {
    const { tid } = await prospect();
    const day = 24 * 3600 * 1000;
    const since = Date.parse((await repo.getTenant(tid))!.prospect!.since);
    const r = (await (await as(form.email, `/t/${tid}/keep`, "POST", {})).json()) as { deleteOn: string };
    expect(Math.round((Date.parse(r.deleteOn) - since) / day)).toBe(60);
    expect(((await (await as(form.email, `/t/${tid}/keep`)).json()) as { deleteOn: string }).deleteOn).toBe(r.deleteOn);
    const pass = (days: number) => sweepQuietProspects({ repo, d: { mailer, storage, directory } as never, cfg }, new Date(since + days * day));
    expect(await pass(8)).toMatchObject({ nudged: 0 });
    expect(await pass(30.2)).toMatchObject({ nudged: 0, warned: 0, deleting: 0 });
    expect(await pass(37.2)).toMatchObject({ nudged: 1 });
    expect(await pass(51.2)).toMatchObject({ warned: 1 });
    expect(await pass(59)).toMatchObject({ deleting: 0 });
    expect(await pass(60.3)).toMatchObject({ deleting: 1 });
  });

  it("says a client's account doesn't expire", async () => {
    const { tid } = await prospect();
    await as(OP, `/prospects/${tid}/promote`, "POST", {});
    expect(await (await as(form.email, `/t/${tid}/keep`)).json()).toEqual({ free: false });
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

  it("checks in at 7 and 14 quiet days, gives final notice at 21, and deletes on day 30", async () => {
    const { tid } = await prospect();
    const day = 24 * 3600 * 1000;
    const since = Date.parse((await repo.getTenant(tid))!.prospect!.since);
    const pass = (days: number) => sweepQuietProspects({ repo, d: { mailer, storage, directory } as never, cfg }, new Date(since + days * day));
    const toDana = () => mailer.sent.filter((m) => m.to === form.email);
    expect(await pass(3)).toMatchObject({ nudged: 0 });
    expect(await pass(7.1)).toMatchObject({ nudged: 1 });
    expect(toDana()).toHaveLength(1);
    expect(toDana()[0]!.replyTo).toBe("hello@neon1.tech");
    // A second pass the same UTC day is skipped (the same moment, so the test never straddles midnight)
    expect(await pass(7.1)).toMatchObject({ skipped: true });
    expect(await pass(14.1)).toMatchObject({ nudged: 1 });
    expect(await pass(21.1)).toMatchObject({ warned: 1 });
    expect(toDana()[2]!.text).toContain("sign up again");
    expect(await pass(25)).toMatchObject({ deleting: 0 });
    expect(await pass(30.2)).toMatchObject({ deleting: 1 });
    expect(await finishPurges({ repo, d: { mailer, storage, directory } as never, cfg }, { at: afterDrain(since + 30.2 * day) })).toMatchObject({ deleted: 1 });
    expect(await repo.getTenant(tid)).toBeUndefined();
    expect(toDana()).toHaveLength(3);
  });

  it("doesn't move the clock when the final notice is refused, and sends it again the next day", async () => {
    const { tid } = await prospect();
    const day = 24 * 3600 * 1000;
    const since = Date.parse((await repo.getTenant(tid))!.prospect!.since);
    const pass = (days: number) => sweepQuietProspects({ repo, d: { mailer, storage, directory } as never, cfg }, new Date(since + days * day));
    await pass(7.1);
    await pass(14.1);
    const send = mailer.send.bind(mailer);
    mailer.send = async () => { throw new Error("MessageRejected"); };
    expect(await pass(21.1)).toMatchObject({ warned: 0, failed: 1 });
    expect((await repo.getTenant(tid))!.prospect!.warnedAt).toBeUndefined();
    // Still no final notice that went out, so day 30 deletes nothing
    expect(await pass(30.2)).toMatchObject({ deleting: 0 });
    mailer.send = send;
    expect(await pass(31.2)).toMatchObject({ warned: 1 });
    expect(await repo.getTenant(tid)).toBeTruthy();
  });

  it("sends nothing and deletes nothing while neon1 keeps a prospect", async () => {
    const { tid } = await prospect();
    const day = 24 * 3600 * 1000;
    const since = Date.parse((await repo.getTenant(tid))!.prospect!.since);
    expect((await as(OP, `/prospects/${tid}/hold`, "POST", {})).status).toBe(200);
    for (const d of [8, 15, 22, 40]) await sweepQuietProspects({ repo, d: { mailer, storage, directory } as never, cfg }, new Date(since + d * day));
    expect(await repo.getTenant(tid)).toBeTruthy();
    expect(mailer.sent.filter((m) => m.to === form.email)).toHaveLength(0);
  });

  it("starts the clock again after a real change", async () => {
    const { tid } = await prospect();
    const day = 24 * 3600 * 1000;
    const since = Date.parse((await repo.getTenant(tid))!.prospect!.since);
    const pass = (days: number) => sweepQuietProspects({ repo, d: { mailer, storage, directory } as never, cfg }, new Date(since + days * day));
    await pass(21.1);
    expect((await repo.getTenant(tid))!.prospect!.warnedAt).toBeTruthy();
    // A change the prospect makes, recorded as if it happened on day 25
    await repo.table.write([{ put: { PK: `T#${tid}`, SK: "ACTIVE", at: new Date(since + 25 * day).toISOString() }, guard: { always: true } }]);
    expect(await pass(30.2)).toMatchObject({ deleting: 0 });
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


describe("asking neon1 for an assessment or a call", () => {
  it("emails neon1 with the person as Reply-To, records it, and remembers when", async () => {
    const { tid } = await prospect("r@example.com");
    const r = await as("r@example.com", `/t/${tid}/requests`, "POST", { kind: "assessment", note: "The intake form first" });
    expect(r.status).toBe(200);
    const mail = mailer.sent.find((m) => m.to === "hello@neon1.tech")!;
    expect(mail.subject).toMatch(/^Assessment requested — Kim Dental \(NP-\d{4}\)$/);
    expect(mail.as).toBe("reach");
    expect(mail.replyTo).toBe("r@example.com");
    expect(mail.text).toContain("The intake form first");
    const seen = await (await as("r@example.com", `/t/${tid}/requests`)).json() as Record<string, { at: string }>;
    expect(seen.assessment?.at).toBeTruthy();
    expect(seen.call).toBeUndefined();
    expect((await as("r@example.com", `/t/${tid}/requests`, "POST", { kind: "nonsense" })).status).toBe(400);
  });

  it("caps requests per organization each day", async () => {
    const { tid } = await prospect("cap@example.com");
    const ask = () => as("cap@example.com", `/t/${tid}/requests`, "POST", { kind: "call" });
    for (let i = 0; i < 4; i++) expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
  });
});
