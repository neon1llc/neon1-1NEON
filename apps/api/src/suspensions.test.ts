// apps/api/src/suspensions.test.ts - Suspensions: an organization or one account reads only, keeps its profile,
// asks super to recommission it with a reason, and super lifts it. Downgrading keeps the client ID and the
// work; the inactivity pass reminds, then suspends; repeated chat mutes suspend for abuse. Nothing is deleted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INACTIVE_DAYS, type Tenant } from "@1neon/domain";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryPusher, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";
import { countAbuse, sweepDormant } from "./routes/suspensions.ts";


const OP = "pradeep@neon1.tech";
const PRIYA = "priya@harborlineoutfitters.example";
const TOMAS = "tomas@harborlineoutfitters.example";
const DAY = 24 * 3600 * 1000;
const cfg = { env: "local" as const, publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true };
let app: ReturnType<typeof createApp>;
let repo: Repo;
let mailer: MemoryMailer;
let s: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  repo = new Repo(new MemoryTable());
  mailer = new MemoryMailer();
  s = await seed(repo, OP);
  app = createApp({ cfg, repo, directory: new MemoryDirectory(), mailer, pusher: new MemoryPusher(), storage: new MemoryStorage() });
});
afterEach(() => vi.useRealTimers());

const as = (email: string, path: string, method = "GET", b?: unknown) =>
  app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": email }, body: b === undefined ? undefined : JSON.stringify(b) });
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;
const kit = () => ({ repo, d: { mailer } as never, cfg: cfg as never });


describe("an organization suspension", () => {
  it("reads only, with super's note or the default on the banner, and lifts on recommission", async () => {
    const tid = s.acme.id;
    expect((await as(OP, `/orgs/${tid}/suspend`, "POST", { note: "Back when the contract is signed." })).status).toBe(200);
    // Members still sign in and read, and see the note
    const org = await json(await as(PRIYA, `/t/${tid}`));
    expect(org.suspension).toMatchObject({ scope: "org", why: "super", note: "Back when the contract is signed." });
    expect((await as(PRIYA, `/t/${tid}/projects`)).status).toBe(200);
    // Every change is refused, in the banner's words
    const r = await as(PRIYA, `/t/${tid}/projects`, "POST", { name: "New", template: "blank" });
    expect(r.status).toBe(403);
    expect((await json(r)).message).toBe("Back when the contract is signed.");
    // super is never held back
    expect((await as(OP, `/t/${tid}/chat`, "POST", { text: "I'm here when you're ready." })).status).toBe(201);
    expect((await as(OP, `/orgs/${tid}/recommission`, "POST", {})).status).toBe(200);
    expect((await json(await as(PRIYA, `/t/${tid}`))).suspension).toBeUndefined();
  });

  it("shows the default message when super gives none, and keeps chat open", async () => {
    const tid = s.acme.id;
    await as(OP, `/orgs/${tid}/suspend`, "POST", {});
    const r = await as(TOMAS, `/t/${tid}/projects`, "POST", { name: "New", template: "blank" });
    expect((await json(r)).message).toMatch(/^This organization is suspended/);
    vi.setSystemTime(Date.now() + 3000);
    expect((await as(TOMAS, `/t/${tid}/chat`, "POST", { text: "Why are we paused?" })).status).toBe(201);
  });

  it("never suspends neon1's own organization", async () => {
    expect((await as(OP, `/orgs/${s.neon1.id}/suspend`, "POST", {})).status).toBe(409);
  });

  it("is super's alone to place", async () => {
    expect((await as(PRIYA, `/orgs/${s.acme.id}/suspend`, "POST", {})).status).toBe(403);
  });
});


describe("one account's suspension", () => {
  it("holds only that person, and admins see super's note", async () => {
    const tid = s.acme.id;
    await as(OP, `/orgs/${tid}/members/${s.dana.id}/suspend`, "POST", { note: "Talk to me first." });
    expect((await as(TOMAS, `/t/${tid}/projects`, "POST", { name: "New", template: "blank" })).status).toBe(403);
    expect((await json(await as(PRIYA, `/t/${tid}`))).suspension).toBeUndefined();
    const people = (await (await as(PRIYA, `/t/${tid}/members`)).json()) as { userId: string; suspended?: { note?: string } }[];
    expect(people.find((p) => p.userId === s.dana.id)?.suspended?.note).toBe("Talk to me first.");
  });

  it("can't be placed on super", async () => {
    expect((await as(OP, `/orgs/${s.harbor.id}/members/${s.pradeep.id}/suspend`, "POST", {})).status).toBe(409);
  });
});


describe("asking to be recommissioned", () => {
  it("needs a reason, reaches super's list, and closes when super lifts it", async () => {
    const tid = s.acme.id;
    await as(OP, `/orgs/${tid}/members/${s.dana.id}/suspend`, "POST", {});
    expect((await as(TOMAS, `/t/${tid}/recommission`, "POST", { scope: "account", reason: " " })).status).toBe(400);
    expect((await as(TOMAS, `/t/${tid}/recommission`, "POST", { scope: "account", reason: "I was out on leave." })).status).toBe(201);
    // One open request per thing asked for
    expect((await as(PRIYA, `/t/${tid}/recommission`, "POST", { scope: "account", userId: s.dana.id, reason: "He's back." })).status).toBe(409);
    const list = await json(await as(OP, "/suspensions"));
    expect(list.requests).toEqual([expect.objectContaining({ scope: "account", userId: s.dana.id, reason: "I was out on leave.", state: "open" })]);
    await as(OP, `/orgs/${tid}/members/${s.dana.id}/recommission`, "POST", {});
    expect(((await json(await as(OP, "/suspensions"))).requests as { state: string }[])[0]!.state).toBe("done");
  });

  it("lets an admin ask for the organization, but not an editor", async () => {
    const tid = s.acme.id;
    await as(OP, `/orgs/${tid}/suspend`, "POST", {});
    expect((await as(TOMAS, `/t/${tid}/recommission`, "POST", { scope: "org", reason: "Please." })).status).toBe(403);
    expect((await as(PRIYA, `/t/${tid}/recommission`, "POST", { scope: "org", reason: "We signed today." })).status).toBe(201);
  });

  it("refuses asking for something that isn't suspended", async () => {
    expect((await as(TOMAS, `/t/${s.acme.id}/recommission`, "POST", { scope: "account", reason: "Just in case." })).status).toBe(403);
  });
});


describe("downgrading a client", () => {
  it("makes it a potential with its client ID, work, and no deletion clock, and promotion gives the ID back", async () => {
    const tid = s.acme.id;
    const id = s.acme.clientId;
    expect((await as(OP, `/orgs/${tid}/downgrade`, "POST", {})).status).toBe(200);
    const t = (await repo.getTenant(tid))!;
    expect(t.prospect).toMatchObject({ fromClient: id });
    expect(t.clientId).toBe(id);
    expect((await as(PRIYA, `/t/${tid}/projects`)).status).toBe(200);
    const prospects = await json(await as(OP, "/prospects"));
    expect((prospects.prospects as { id: string }[]).some((p) => p.id === tid)).toBe(true);
    expect((await as(OP, `/prospects/${tid}/promote`, "POST", {})).status).toBe(200);
    expect((await repo.getTenant(tid))!).toMatchObject({ clientId: id, prospect: undefined });
  });
});


describe("the inactivity pass", () => {
  /** Make everyone in Harborline last seen `days` ago */
  async function quiet(days: number) {
    const at = new Date(Date.now() - days * DAY).toISOString();
    for (const m of await repo.listMembers(s.acme.id)) await repo.saveMember({ ...m, lastSeenAt: at, joinedAt: at }, { version: m.version });
    const t = (await repo.getTenant(s.acme.id))!;
    await repo.saveTenant({ ...t, createdAt: at, version: t.version + 1 } as Tenant, t.version);
    await repo.table.write([{ delete: { PK: `T#${s.acme.id}`, SK: "ACTIVE" } }]);
  }

  it("reminds admins at 30 days, then suspends at the limit with the automatic reason", async () => {
    await quiet(31);
    expect(await sweepDormant(kit(), new Date())).toMatchObject({ suspended: 0 });
    // Only Harborline's joined admin hears; its editor doesn't
    expect(mailer.sent.map((m) => m.to)).toEqual([PRIYA]);
    expect((await repo.getTenant(s.acme.id))!.dormant).toMatchObject({ notices: 1 });
    // Once a day only
    expect(await sweepDormant(kit(), new Date())).toMatchObject({ skipped: true });
    // The other two reminders, a day apart at the least, then a week before the suspension
    await quiet(INACTIVE_DAYS + 1);
    expect(await sweepDormant(kit(), new Date(Date.now() + DAY))).toMatchObject({ suspended: 0 });
    expect(await sweepDormant(kit(), new Date(Date.now() + 2 * DAY))).toMatchObject({ suspended: 0 });
    expect((await repo.getTenant(s.acme.id))!.dormant).toMatchObject({ notices: 3 });
    expect(await sweepDormant(kit(), new Date(Date.now() + 5 * DAY))).toMatchObject({ suspended: 0 });
    expect(await sweepDormant(kit(), new Date(Date.now() + 9 * DAY))).toMatchObject({ suspended: 1 });
    expect((await repo.getTenant(s.acme.id))!.suspended).toMatchObject({ why: "inactive" });
    expect((await json(await as(PRIYA, `/t/${s.acme.id}`))).suspension).toMatchObject({ why: "inactive" });
  });

  it("skips kept organizations and starts the clock again when keeping stops", async () => {
    await quiet(INACTIVE_DAYS + 5);
    await as(OP, `/orgs/${s.acme.id}/keep`, "POST", { keep: true });
    expect(await sweepDormant(kit(), new Date())).toMatchObject({ suspended: 0 });
    await as(OP, `/orgs/${s.acme.id}/keep`, "POST", { keep: false });
    expect(await sweepDormant(kit(), new Date(Date.now() + DAY))).toMatchObject({ suspended: 0, noticed: 0 });
  });
});


describe("abuse", () => {
  it("suspends an account after the third automatic mute, and closes its chat", async () => {
    const tenant = { id: s.acme.id };
    const tomas = { id: s.dana.id, name: "Tomas Greer", email: TOMAS };
    expect(await countAbuse(kit(), tenant, tomas)).toBe(false);
    expect(await countAbuse(kit(), tenant, tomas)).toBe(false);
    expect(await countAbuse(kit(), tenant, tomas)).toBe(true);
    expect((await repo.getMember(s.acme.id, s.dana.id))!.suspended).toMatchObject({ why: "abuse" });
    vi.setSystemTime(Date.now() + 3000);
    expect((await as(TOMAS, `/t/${s.acme.id}/chat`, "POST", { text: "hello" })).status).toBe(403);
  });
});


describe("super's chat inbox", () => {
  it("lists every organization, so super can write first", async () => {
    const r = await json(await as(OP, "/chat/inbox"));
    const orgs = r.orgs as { name: string; potential: boolean }[];
    expect(orgs.map((o) => o.name)).toEqual(expect.arrayContaining(["Harborline Outfitters", "Calder Building Supply"]));
    expect(orgs.find((o) => o.name === "Calder Building Supply")?.potential).toBe(true);
    expect((await as(OP, `/t/${s.harbor.id}/chat`, "POST", { text: "Hi, it's Pradeep." })).status).toBe(201);
  });
});
