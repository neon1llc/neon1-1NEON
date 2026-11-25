// apps/api/src/reminders.test.ts - Reminders while a client's decision waits: when they go, to whom,
// when they stop, and when neon1 is told.

import { askedToDecide, businessDaysBetween, projectDecisions, signatureDecision } from "@1neon/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { NAME_ONE, optionsEmail, sweepDecisionReminders } from "./routes/reminders.ts";
import { drainOutbox } from "./outbox.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";
import type { Config } from "./config.ts";

const OP = "pradeep@neon1.tech";
const cfg: Config = { env: "local", publicUrl: "https://example.invalid", operatorEmails: [OP], devAuth: true };
let repo: Repo;
let mailer: MemoryMailer;
let app: ReturnType<typeof createApp>;
let s: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  mailer = new MemoryMailer();
  s = await seed(repo, OP);
  app = createApp({ cfg, repo, directory: new MemoryDirectory(), mailer, storage: new MemoryStorage() });
});

// Weekday mornings in New York, in a week with no gap: Monday March 1, 2027 onward
const at = (day: number, hour = 15) => new Date(Date.UTC(2027, 2, day, hour));
const pass = (when: Date) => sweepDecisionReminders({ repo, d: { mailer } as never, cfg }, when);
const toClients = () => mailer.sent.filter((m) => m.to !== OP);
const toNeon1 = () => mailer.sent.filter((m) => m.to === OP);

/** Mark every handover step done and unaccepted in one project, as of `when` */
async function finishHandover(when: Date) {
  const p = (await repo.listProjects(s.acme.id)).find((x) => x.key === "FLOW-1")!;
  const items = await repo.listItems(p.tenantId, p.id);
  const base = items.find((i) => i.kind === "requirement")!;
  // The seed's own steps would keep the handover unfinished
  for (const i of items.filter((x) => x.kind === "handoff")) await repo.table.write([{ delete: { PK: `T#${p.tenantId}#P#${p.id}`, SK: `ITEM#${i.id}` } }]);
  const step = { ...base, id: "i_handover", kind: "handoff" as const, title: "Runbook", status: "done", fields: {}, version: 1, updatedAt: when.toISOString() };
  await repo.table.write([repo.itemOp(step, { create: true })]);
  return { p, step };
}

describe("business days", () => {
  it("counts weekdays after the start date", () => {
    expect(businessDaysBetween("2027-03-05", "2027-03-07")).toBe(0);
    expect(businessDaysBetween("2027-03-05", "2027-03-10")).toBe(3);
    expect(businessDaysBetween("2027-03-01", "2027-03-10")).toBe(7);
  });
});

describe("a proposal waiting on a choice", () => {
  it("is waiting while its price check holds, and not once it lapses", async () => {
    const p = (await repo.listProjects(s.acme.id)).find((x) => x.key === "FLOW-1")!;
    const items = await repo.listItems(p.tenantId, p.id);
    const today = new Date().toISOString().slice(0, 10);
    expect(projectDecisions(p, items, today).map((x) => x.kind)).toContain("choose");
    expect(projectDecisions(p, items, "2099-01-01").map((x) => x.kind)).not.toContain("choose");
  });

  it("also waits on the agreement signature until one covers the work", () => {
    const choice = [{ key: "choose:r", kind: "choose" as const, title: "Choose", since: "2027-03-01T00:00:00Z" }];
    expect(signatureDecision({ agreements: [] }, choice)?.kind).toBe("sign");
    expect(signatureDecision({ agreements: [{ ref: "2.3" }] as never }, choice)).toBeUndefined();
  });
});

describe("who is asked to decide", () => {
  const m = (userId: string, access: string, joinedAt: string, status = "joined") => ({ userId, access, status, joinedAt, invitedAt: joinedAt });
  const team = [m("late", "admin", "2027-02-01"), m("first", "admin", "2027-01-01"), m("a", "viewer", "2027-01-02"), m("b", "editor", "2027-01-03"), m("c", "viewer", "2027-01-04", "invited")];
  const dm = (userId: string) => ({ userId, role: "decision_maker" });

  it("asks every named decision maker who has joined", () => {
    expect(askedToDecide(team, [dm("a"), dm("b"), dm("c")])).toEqual({ named: true, ids: ["a", "b"] });
  });

  it("asks the first admin while nobody is named", () => {
    expect(askedToDecide(team, [])).toEqual({ named: false, ids: ["first"] });
  });
});

describe("the options email", () => {
  const o = (id: string, version: number) => ({ id, version, title: `Option ${id}` }) as never;
  const base = { org: "Harborline", projectKey: "FLOW-1", proposal: "Proposal 0039-r2", quick: false, url: "https://example.invalid/x", settingsUrl: "https://example.invalid/me" };

  it("lists what was added, edited, and removed, and asks for a decision maker only while none is named", () => {
    const m = optionsEmail({ ...base, before: [o("A", 1), o("B", 1), o("C", 1)], after: [o("A", 1), o("B", 2), o("D", 1)], named: false });
    expect(m.text).toContain("1 option added, 1 option edited, 1 option removed.");
    expect(m.text).toContain(NAME_ONE);
    expect(m.text).not.toContain("Option A");
    expect(optionsEmail({ ...base, before: [o("A", 1)], after: [o("A", 2)], named: true }).text).not.toContain(NAME_ONE);
  });

  it("goes to the decision maker when a proposal is issued, and the others get the usual notice", async () => {
    const p = (await repo.listProjects(s.acme.id)).find((x) => x.key === "FLOW-1")!;
    const decider = p.people.find((x) => x.role === "decision_maker")!.userId;
    const send = (path: string) => app.request(`/1NEON/api/t/${s.acme.id}/projects/${p.id}/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": OP }, body: "{}" });
    expect((await send("proposals")).status).toBe(201);
    await drainOutbox({ repo, mailer, cfg } as never, { deadline: Date.now() + 5_000 });
    const asked = mailer.sent.filter((m) => m.subject.startsWith("Options to review"));
    expect(asked.map((m) => m.to)).toEqual([(await repo.getUser(decider))!.email]);
    expect(mailer.sent.length).toBeGreaterThan(asked.length);
  });
});

describe("decision reminders", () => {
  it("tells someone named after the decision started waiting", async () => {
    const { p } = await finishHandover(at(1, 14));
    await pass(at(1));
    const members = (await repo.listMembers(s.acme.id)).filter((m) => m.email !== OP);
    const had = new Set(mailer.sent.map((m) => m.to));
    const later = members.find((m) => !had.has(m.email))!;
    const project = (await repo.listProjects(s.acme.id)).find((x) => x.id === p.id)!;
    await repo.saveProject({ ...project, people: [...project.people, { userId: later.userId, role: "decision_maker" }], version: project.version + 1 }, { version: project.version });
    mailer.sent.length = 0;
    await pass(at(1, 16));
    expect(mailer.sent.map((m) => m.to)).toEqual([later.email]);
  });

  /** The seed's own waiting decisions are first seen well before the test's handover */
  const mine = () => toClients().filter((m) => m.text.includes("Accept the handover"));

  it("emails when ready, on business days 3 and 7, then tells neon1 once", async () => {
    await finishHandover(at(1, 14));
    await pass(at(1));
    expect(mine().length).toBeGreaterThan(0);
    const readers = new Set(mine().map((m) => m.to));
    expect(mine()).toHaveLength(readers.size);
    for (const [day, total] of [[2, 1], [3, 1], [4, 2], [5, 2], [8, 2], [9, 2], [10, 3], [11, 3]] as const) {
      await pass(at(day));
      expect(mine().length, `March ${day}`).toBe(total * readers.size);
    }
    expect(toNeon1().filter((m) => m.subject.startsWith("Follow up"))).toHaveLength(1);
  });

  it("sends one email per person however many decisions wait, and one pass an hour", async () => {
    await finishHandover(at(1, 14));
    await pass(at(1));
    mailer.sent.length = 0;
    await pass(at(4));
    const people = toClients().map((m) => m.to);
    expect(new Set(people).size).toBe(people.length);
    expect(await pass(at(4))).toMatchObject({ skipped: true });
  });

  it("holds reminders outside weekday hours", async () => {
    await finishHandover(at(1, 14));
    await pass(at(1));
    mailer.sent.length = 0;
    await pass(at(4, 3));
    await pass(at(6, 15));
    expect(mine()).toHaveLength(0);
  });

  it("stops as soon as the decision is answered", async () => {
    const { p, step } = await finishHandover(at(1, 14));
    await pass(at(1));
    expect(mine().length).toBeGreaterThan(0);
    await repo.table.write([repo.itemOp({ ...step, fields: { accepted: { at: at(2).toISOString() } }, version: 2 }, { version: 1 })]);
    mailer.sent.length = 0;
    for (const day of [4, 10]) await pass(at(day));
    expect(mine()).toHaveLength(0);
    const row = await repo.table.get(`T#${p.tenantId}`, "REMIND#decisions");
    expect(Object.keys((row?.items ?? {}) as object)).not.toContain(`accept:${p.id}`);
  });

  it("starts the clock at first sight for a decision that was already waiting, with no first email", async () => {
    await finishHandover(new Date(Date.UTC(2027, 0, 4)));
    await pass(at(1));
    expect(mine()).toHaveLength(0);
    await pass(at(4));
    expect(mine().length).toBeGreaterThan(0);
  });

  it("reads a record that has no list of who was told, without repeating the news", async () => {
    const { p } = await finishHandover(at(1, 14));
    await repo.table.write([{ put: { PK: `T#${p.tenantId}`, SK: "REMIND#decisions", items: { [`accept:${p.id}`]: { since: at(1, 14).toISOString(), announced: true, sent: 0 } } }, guard: { always: true } }]);
    await pass(at(1));
    expect(mine()).toHaveLength(0);
    await pass(at(4));
    expect(mine().length).toBeGreaterThan(0);
  });

  it("tries again when the mail service refuses", async () => {
    await finishHandover(at(1, 14));
    const send = mailer.send.bind(mailer);
    mailer.send = async () => { throw new Error("refused"); };
    await pass(at(1));
    mailer.send = send;
    await pass(at(1, 16));
    expect(mine().length).toBeGreaterThan(0);
  });

  it("leaves out people who turned these emails off, and still tells neon1", async () => {
    await finishHandover(at(1, 14));
    for (const m of await repo.listMembers(s.acme.id)) {
      const u = (await repo.getUser(m.userId))!;
      await repo.table.write([{ put: { PK: `USER#${u.id}`, SK: "PROFILE", ...u, type: "user", notify: { decisions: { email: false, sms: false } } }, guard: { always: true } }]);
    }
    for (const day of [1, 4, 10]) await pass(at(day));
    expect(mine()).toHaveLength(0);
    expect(toNeon1().filter((m) => m.subject.startsWith("Follow up")).length).toBeGreaterThan(0);
  });
});
