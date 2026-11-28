// apps/api/src/contract.test.ts - The service agreement's contract states kept apart: handover starts
// the review and the defect period without accepting anything; silence never accepts; invoices issue
// whatever the review says; disputes leave the undisputed amount due; delays and overdue amounts allow
// a pause only when the agreement does; one overdue reminder per invoice; new options state 30%.


import { contractStates, invoiceState, todayIn, type Item } from "@1neon/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { MemoryPayments, MemoryRecords } from "./payments.ts";
import { sweepOverdueInvoices } from "./routes/reminders.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage, MemoryTexter } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const SIGN = { typedName: "Priya Raman", consent: true };
const OP = "pradeep@neon1.tech";
let repo: Repo;
let app: ReturnType<typeof createApp>;
let s: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  s = await seed(repo, OP);
  app = createApp({ cfg: { env: "local", publicUrl: "https://example.invalid", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer: new MemoryMailer(), texter: new MemoryTexter(), storage: new MemoryStorage(), payments: new MemoryPayments(), records: new MemoryRecords() });
});

async function call(as: string, method: string, path: string, body?: unknown) {
  const r = await app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": as }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}

async function flow() {
  const p = (await repo.listProjects(s.acme.id)).find((x) => x.key === "FLOW-1")!;
  const items = await repo.listItems(p.tenantId, p.id);
  return { p, items, path: `/t/${p.tenantId}/projects/${p.id}`, opt: (l: string) => items.find((i) => i.kind === "option" && i.title.startsWith(`${l}.`))! };
}

/** Approve option B and issue its deposit */
async function approvedWithDeposit() {
  const { opt, path } = await flow();
  const b = opt("B");
  expect((await call(s.raj.email, "POST", `${path}/items/${b.id}/approve`, { version: b.version, signature: SIGN })).status).toBe(201);
  const draft = (await flow()).items.find((i) => i.kind === "invoice")!;
  const issued = await call(OP, "POST", `${path}/invoices/${draft.id}/issue`, { version: draft.version });
  expect(issued.status).toBe(200);
  return { path, deposit: issued.json as Item };
}

/** Move a project's recorded event back in time, as if it happened `days` ago */
async function age(field: "waiting" | "handover" | "endNotice" | "payNotice", days: number) {
  const { p } = await flow();
  const ev = p[field]!;
  const at = new Date(Date.parse(ev.at) - days * 864e5).toISOString();
  await repo.table.write([repo.projectOp({ ...p, [field]: { ...ev, at }, version: p.version + 1 }, { version: p.version })]);
}


describe("handover, review, and acceptance", () => {
  it("records a handover that asks for review and starts the defect period, accepting nothing", async () => {
    const { path } = await approvedWithDeposit();
    const p0 = (await flow()).p;
    expect((await call(s.raj.email, "POST", `${path}/handover`, { version: p0.version, note: "The portal, its runbook, and admin access" })).status).toBe(403);
    const r = await call(OP, "POST", `${path}/handover`, { version: p0.version, note: "The portal, its runbook, and admin access" });
    expect(r.status).toBe(200);
    const { items, p } = await flow();
    // The final invoice is drafted at handover, and no handover step is accepted by it
    expect(items.filter((i) => i.kind === "invoice" && i.fields.type === "final")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "handoff").every((i) => !i.fields.accepted)).toBe(true);
    const st = (await call(s.raj.email, "GET", `${path}/contract`)).json;
    expect(st).toMatchObject({ acceptance: "pending", reviewLate: false });
    expect(st.reviewDue > todayIn()).toBe(true);
    const audit = (await repo.listAudit(s.acme.id)).find((e) => e.action === "project.handed_over")!;
    expect(audit.summary).toMatch(/Please review it by/);
    // Weeks of silence later, it still isn't accepted, and the review is only late
    expect(contractStates(p, items, "2099-01-01")).toMatchObject({ acceptance: "pending", reviewLate: true });
  });

  it("issues the final invoice while the review is still open", async () => {
    const { path } = await approvedWithDeposit();
    await call(OP, "POST", `${path}/handover`, { version: (await flow()).p.version, note: "Delivered with docs and access" });
    const final = (await flow()).items.find((i) => i.kind === "invoice" && i.fields.type === "final")!;
    expect((await call(OP, "POST", `${path}/invoices/${final.id}/issue`, { version: final.version })).status).toBe(200);
  });
});


describe("waiting on the client, pausing, and ending", () => {
  it("allows a pause only 10 business days after a delay notice, and an ending only after 30 days", async () => {
    const { path } = await flow();
    const v = async () => (await flow()).p.version;
    expect((await call(OP, "POST", `${path}/pause`, { version: await v(), reason: "waiting" })).json.error).toBe("not_allowed");
    expect((await call(OP, "POST", `${path}/waiting`, { version: await v(), need: "Admin access to the POS account" })).status).toBe(200);
    expect((await call(OP, "POST", `${path}/pause`, { version: await v(), reason: "waiting" })).json.error).toBe("not_allowed");
    expect((await call(OP, "POST", `${path}/pause`, { version: await v(), reason: "overdue" })).json.error).toBe("not_allowed");
    await age("waiting", 15);
    expect((await call(OP, "POST", `${path}/pause`, { version: await v(), reason: "waiting" })).status).toBe(200);
    expect((await call(OP, "POST", `${path}/end`, { version: await v(), reason: "waiting", note: "No access after notice" })).json.error).toBe("not_allowed");
    await age("waiting", 20);
    // 35 days on, but no notice of the ending yet
    expect((await call(OP, "POST", `${path}/end`, { version: await v(), reason: "waiting", note: "No access after notice" })).json.error).toBe("not_allowed");
    expect((await call(OP, "POST", `${path}/end-notice`, { version: await v() })).status).toBe(200);
    expect((await call(OP, "POST", `${path}/end`, { version: await v(), reason: "waiting", note: "No access after notice" })).json.error).toBe("not_allowed");
    await age("endNotice", 14);
    expect((await call(OP, "POST", `${path}/end`, { version: await v(), reason: "waiting", note: "No access after notice" })).status).toBe(200);
    const actions = (await repo.listAudit(s.acme.id)).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["project.waiting", "project.paused", "project.ended"]));
    expect((await call(s.raj.email, "POST", `${path}/waiting`, { version: await v(), need: "anything" })).status).toBe(403);
  });
});


describe("pausing over an unpaid invoice", () => {
  it("needs an undisputed amount over 7 days overdue and 2 business days' notice to pay, and a deposit is due on issue", async () => {
    const { path, deposit } = await approvedWithDeposit();
    expect(deposit.fields.termsDays).toBe(0);
    const v = async () => (await flow()).p.version;
    const pause = async () => (await call(OP, "POST", `${path}/pause`, { version: await v(), reason: "overdue" })).json.error;
    expect((await call(OP, "POST", `${path}/pay-notice`, { version: await v() })).json.error).toBe("not_allowed");
    const inv = (await flow()).items.find((i) => i.id === deposit.id)!;
    await repo.table.write([repo.itemOp({ ...inv, fields: { ...inv.fields, dueDate: "2026-01-05" }, version: inv.version + 1 }, { version: inv.version })]);
    expect(await pause()).toBe("not_allowed");
    expect((await call(OP, "POST", `${path}/pay-notice`, { version: await v() })).status).toBe(200);
    expect(await pause()).toBe("not_allowed");
    await age("payNotice", 5);
    expect(await pause()).toBeUndefined();
    expect((await repo.listAudit(s.acme.id)).map((e) => e.action)).toEqual(expect.arrayContaining(["project.pay_notice", "project.paused"]));
  });
});


describe("invoice disputes", () => {
  it("lets the decision maker dispute part of an invoice, keeps the rest due, and lets neon1 answer", async () => {
    const { path, deposit } = await approvedWithDeposit();
    const url = `${path}/invoices/${deposit.id}/dispute`;
    expect((await call(s.dana.email, "POST", url, { version: deposit.version, cents: 1000, reason: "Not ours" })).status).toBe(403);
    expect((await call(s.raj.email, "POST", url, { version: deposit.version, cents: 99_999_999, reason: "Too much" })).json.error).toBe("too_much");
    const r = await call(s.raj.email, "POST", url, { version: deposit.version, cents: 50_000, reason: "The second line wasn't agreed" });
    expect(r.status).toBe(200);
    expect((await call(s.raj.email, "POST", url, { version: r.json.version, cents: 100, reason: "Again" })).json.error).toBe("already_disputed");
    // Past due, the undisputed part is overdue; a dispute over everything owed isn't
    const items = (await flow()).items;
    const inv = items.find((i) => i.id === deposit.id)!;
    expect(invoiceState(inv, items, "2099-01-01")).toBe("overdue");
    const whole = { ...inv, fields: { ...inv.fields, dispute: { ...(inv.fields.dispute as object), cents: 225_000 } } };
    expect(invoiceState(whole, items, "2099-01-01")).toBe("open");
    const answered = await call(OP, "POST", `${url}/resolve`, { version: inv.version, note: "Credited the second line" });
    expect(answered.json.fields.dispute.resolved).toMatchObject({ note: "Credited the second line" });
  });
});


describe("the overdue reminder", () => {
  it("is sent once per invoice, the business day after it's due", async () => {
    const { deposit } = await approvedWithDeposit();
    const { p } = await flow();
    const inv = (await repo.getItem(p.tenantId, p.id, deposit.id))!;
    await repo.table.write([repo.itemOp({ ...inv, fields: { ...inv.fields, dueDate: "2027-03-01" }, version: inv.version + 1 }, { version: inv.version })]);
    // Tuesday March 2, 2027, 10am Eastern
    expect((await sweepOverdueInvoices({ repo }, new Date("2027-03-02T15:00:00Z"))).sent).toBeGreaterThanOrEqual(1);
    expect((await repo.listAudit(s.acme.id)).filter((e) => e.action === "invoice.reminded" && e.target === deposit.id)).toHaveLength(1);
    expect((await sweepOverdueInvoices({ repo }, new Date("2027-03-02T16:00:00Z"))).sent).toBe(0);
  });
});


describe("deposits", () => {
  it("states 30% on a new option unless another share is agreed", async () => {
    const { path } = await flow();
    const r = await call(OP, "POST", `${path}/items`, { kind: "option", title: "D. Smaller portal", status: "draft", fields: { pricing: "fixed", cost: "$2,000 fixed" } });
    expect(r.json.fields.depositPercent).toBe(30);
    const other = await call(OP, "POST", `${path}/items`, { kind: "option", title: "E. Riskier portal", status: "draft", fields: { pricing: "fixed", cost: "$2,000 fixed", depositPercent: 50 } });
    expect(other.json.fields.depositPercent).toBe(50);
  });
});
