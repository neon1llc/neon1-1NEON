// apps/api/src/commercial.test.ts - Qualification of 1NEON's commercial logic through the API: signed
// terms, deposit shares, duplicate drafts, bank (ACH) payments that are late, failed, or pending,
// cancellation, refunds, a changed decision, two tabs at once, a client leaving, and the quick fix
// path. One describe per scenario, numbered as in the qualification list. The pure rules behind them
// are in packages/domain/src/commercial.test.ts. Memory store, synthetic data, dev identities.


import { InvoiceFields, balanceOf, clearingOn, failedOn, invoiceState, invoiceTotal, payableOn, type Item } from "@1neon/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { MemoryPayments, MemoryRecords } from "./payments.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage, MemoryTexter } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


// A signed approval or acceptance: the typed name and the consent box
const SIGN = { typedName: "Raj Patel", consent: true };
const OP = "pradeep@neon1.tech";
let repo: Repo;
let app: ReturnType<typeof createApp>;
let s: Awaited<ReturnType<typeof seed>>;
let payments: MemoryPayments;
let records: MemoryRecords;

// A fresh store and app per test, with Stripe (in memory) and locked copies
beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  s = await seed(repo, OP);
  payments = new MemoryPayments();
  records = new MemoryRecords();
  app = createApp({ cfg: { env: "local", publicUrl: "https://example.invalid", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer: new MemoryMailer(), texter: new MemoryTexter(), storage: new MemoryStorage(), payments, records });
});
afterEach(() => vi.useRealTimers());

/** Call the API as a seeded person */
async function call(as: string, method: string, path: string, body?: unknown) {
  const r = await app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": as }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}

/** FLOW-1, its items now, an option by letter, and its API path */
async function flow() {
  const p = (await repo.listProjects(s.acme.id)).find((x) => x.key === "FLOW-1")!;
  const items = await repo.listItems(p.tenantId, p.id);
  const opt = (letter: string) => items.find((i) => i.kind === "option" && i.title.startsWith(`${letter}.`))!;
  return { p, items, opt, path: `/t/${p.tenantId}/projects/${p.id}` };
}
const invoices = async () => (await flow()).items.filter((i) => i.kind === "invoice").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const itemNow = async (id: string) => (await flow()).items.find((i) => i.id === id)!;

/** Approve an option of FLOW-1 as Raj and return the decision */
async function approve(letter: string, extra: Record<string, unknown> = {}) {
  const { opt, path } = await flow();
  const o = opt(letter);
  const r = await call(s.raj.email, "POST", `${path}/items/${o.id}/approve`, { version: o.version, signature: SIGN, ...extra });
  expect(r.status).toBe(201);
  return r.json.decision as Item;
}

/** Issue a draft as neon1 */
async function issue(path: string, inv: Item) {
  const r = await call(OP, "POST", `${path}/invoices/${inv.id}/issue`, { version: inv.version });
  expect(r.status).toBe(200);
  return r.json as Item;
}

/** B ($4,500 fixed, 50% deposit) approved, with its deposit issued */
async function issuedDeposit() {
  const decision = await approve("B");
  const { path } = await flow();
  const draft = (await invoices())[0]!;
  return { decision, inv: await issue(path, draft), path };
}

/** The money on an invoice as the domain reads it, from what the API stored */
async function standing(invoiceId: string, today = new Date().toISOString().slice(0, 10)) {
  const items = await repo.listItems(s.acme.id, (await flow()).p.id);
  const inv = items.find((i) => i.id === invoiceId)!;
  return { inv, items, balance: balanceOf(inv, items), payable: payableOn(inv, items), clearing: clearingOn(inv, items), state: invoiceState(inv, items, today), failed: failedOn(inv, items) };
}

/** A revised copy of an approved option with different terms, shared, issued in the next revision, and approved in its place */
async function revise(from: Item, patch: Record<string, unknown>, reason = "We agreed different terms") {
  const { path } = await flow();
  const copy = await call(OP, "POST", `${path}/items`, { kind: "option", status: "draft", title: `${from.title} (revised)`.slice(0, 160), body: from.body, fields: { ...from.fields, ...patch, revises: from.id } });
  expect(copy.status).toBe(201);
  expect((await call(OP, "PATCH", `${path}/items/${copy.json.id}`, { version: copy.json.version, status: "proposed" })).status).toBe(200);
  expect((await call(OP, "POST", `${path}/proposals`, { note: "Revised terms" })).status).toBe(201);
  const fresh = await itemNow(copy.json.id);
  const r = await call(s.raj.email, "POST", `${path}/items/${fresh.id}/approve`, { version: fresh.version, reason, signature: SIGN });
  expect(r.status).toBe(201);
  return { decision: r.json.decision as Item, option: await itemNow(copy.json.id) };
}

// A Checkout session's event, signed as Stripe signs it
const event = (session: { id: string; metadata: unknown }, type: string, payment_status: string, amount = 225_000) => ({ id: `evt_${type}_${session.id}`, type, data: { object: { object: "checkout.session", id: session.id, payment_status, amount_total: amount, payment_intent: `pi_${session.id}`, payment_method_types: ["us_bank_account"], metadata: session.metadata } } });
async function hook(e: unknown) {
  const signed = await payments.sign(e);
  return app.request("/1NEON/api/billing/stripe", { method: "POST", headers: { "stripe-signature": signed.header }, body: signed.body });
}
/** Raj opens Checkout on an invoice; the session Stripe now knows */
async function checkout(path: string, inv: Item) {
  expect((await call(s.raj.email, "POST", `${path}/invoices/${inv.id}/pay`)).status).toBe(200);
  return payments.sessions.at(-1)!;
}
const byCheck = (path: string, inv: Item, amountCents: number) => call(OP, "POST", `${path}/invoices/${inv.id}/payments`, { amountCents, method: "check", ref: "1042", receivedAt: "2026-11-12" });


// 1. Revised options after approval keep the signed terms
describe("1. revised options after approval keep the signed terms", () => {
  it("never changes the approved decision or option; revised terms are a separate draft that needs its own approval", async () => {
    const decision = await approve("B");
    const { path, opt, p } = await flow();
    const b = opt("B");
    const signedTerms = structuredClone(decision.fields.terms);
    const signedHash = (decision.fields.signature as { hash: string }).hash;
    // The approved option can't be edited in any field, retitled, re-statused, or removed
    for (const patch of [{ fields: { depositPercent: 20 } }, { fields: { cost: "$1 fixed" } }, { body: "Smaller scope" }, { title: "Renamed" }, { status: "declined" }, { status: "draft" }]) {
      expect((await call(OP, "PATCH", `${path}/items/${b.id}`, { version: b.version, ...patch })).status).toBe(400);
    }
    expect((await call(OP, "DELETE", `${path}/items/${b.id}?version=${b.version}`)).status).toBe(400);
    expect((await call(OP, "PATCH", `${path}/items/${decision.id}`, { version: decision.version, title: "x" })).json.error).toBe("immutable");
    // Revised terms are drafted as a different option that points back at the one it revises
    const copy = await call(OP, "POST", `${path}/items`, { kind: "option", status: "draft", title: `${b.title} (revised)`, body: b.body, fields: { ...b.fields, depositPercent: 20, revises: b.id } });
    expect(copy.status).toBe(201);
    expect(copy.json.id).not.toBe(b.id);
    // Drafting them changed nothing that was signed, and asked for no money
    const after = (await repo.getItem(p.tenantId, p.id, decision.id))!;
    expect(after.fields.terms).toEqual(signedTerms);
    expect((await itemNow(b.id)).fields.depositPercent).toBeUndefined();
    expect((await invoices()).filter((i) => i.fields.type === "deposit")).toHaveLength(1);
    // A draft can't be approved; shared and issued, approving it needs a reason and a new signature
    expect((await call(s.raj.email, "POST", `${path}/items/${copy.json.id}/approve`, { version: copy.json.version, reason: "x y z", signature: SIGN })).json.error).toBe("not_proposed");
    await call(OP, "PATCH", `${path}/items/${copy.json.id}`, { version: copy.json.version, status: "proposed" });
    await call(OP, "POST", `${path}/proposals`, { note: "Revised terms for B: 20% deposit" });
    const fresh = await itemNow(copy.json.id);
    expect((await call(s.raj.email, "POST", `${path}/items/${fresh.id}/approve`, { version: fresh.version, signature: SIGN })).json.error).toBe("reason_required");
    expect((await call(s.dana.email, "POST", `${path}/items/${fresh.id}/approve`, { version: fresh.version, reason: "Ok", signature: SIGN })).status).toBe(403);
    const ok = await call(s.raj.email, "POST", `${path}/items/${fresh.id}/approve`, { version: fresh.version, reason: "We agreed a 20% deposit", signature: SIGN });
    expect(ok.status).toBe(201);
    // The first decision is exactly as signed, marked replaced; the new one carries the new terms and its own signature
    const first = (await repo.getItem(p.tenantId, p.id, decision.id))!;
    expect(first.fields.terms).toEqual(signedTerms);
    expect((first.fields.signature as { hash: string }).hash).toBe(signedHash);
    expect(ok.json.decision.fields).toMatchObject({ supersedes: [decision.id], terms: { depositPercent: 20 } });
    expect(ok.json.decision.fields.signature.hash).not.toBe(signedHash);
    // Both are kept as locked records
    expect(records.saved.has(`t/${s.acme.id}/p/${p.id}/decisions/${decision.id}.json`)).toBe(true);
    expect(records.saved.has(`t/${s.acme.id}/p/${p.id}/decisions/${ok.json.decision.id}.json`)).toBe(true);
  });
});


// 2. Deposit share changes: 50% to 20% to 0
describe("2. deposit share changes", () => {
  it("falls from 50% to 20% to 0 with the first deposit already invoiced: nothing more is drafted, and the final asks for the rest", async () => {
    const { decision, inv, path } = await issuedDeposit();
    expect(inv.fields).toMatchObject({ type: "deposit", lines: [{ unitCents: 225_000 }] });
    const b = (await flow()).opt("B");
    const second = await revise(b, { depositPercent: 20 });
    expect(second.decision.fields).toMatchObject({ supersedes: [decision.id], terms: { depositPercent: 20 } });
    // 20% is $900, less than the $2,250 already asked: no new deposit
    expect(await invoices()).toHaveLength(1);
    const third = await revise(second.option, { depositPercent: 0 });
    expect(third.decision.fields.terms).toMatchObject({ depositPercent: 0 });
    expect(await invoices()).toHaveLength(1);
    // At handover, the final asks only for the price less the $2,250 already invoiced
    const h = (await flow()).items.find((i) => i.kind === "handoff")!;
    expect((await call(s.raj.email, "POST", `${path}/items/${h.id}/accept`, { version: h.version, signature: SIGN })).status).toBe(200);
    const final = (await invoices()).find((i) => i.fields.type === "final")!;
    expect(invoiceTotal(InvoiceFields.parse(final.fields))).toBe(225_000);
  });

  it("rises from 20% to 50% by drafting only the difference, then to a 0% share without a new deposit", async () => {
    // B at 20% from the start: $900
    const { opt, path } = await flow();
    const b0 = opt("B");
    await call(OP, "PATCH", `${path}/items/${b0.id}`, { version: b0.version, fields: { depositPercent: 20 } });
    await call(OP, "POST", `${path}/proposals`, {});
    await approve("B");
    const first = (await invoices())[0]!;
    expect(first.fields.lines).toMatchObject([{ unitCents: 90_000 }]);
    await issue(path, first);
    // Revised to 50%: $2,250 less the $900 already invoiced is $1,350, with the earlier invoice named
    const b = (await flow()).opt("B");
    await revise(b, { depositPercent: 50 });
    const list = await invoices();
    expect(list).toHaveLength(2);
    const diff = list[1]!;
    expect(diff).toMatchObject({ status: "draft", fields: { type: "deposit" } });
    expect((diff.fields.lines as { unitCents: number; text: string }[]).map((l) => l.unitCents)).toEqual([225_000, -90_000]);
    expect(String((diff.fields.lines as { text: string }[])[1]!.text)).toContain("INV-0039-01");
    expect(invoiceTotal(InvoiceFields.parse(diff.fields))).toBe(135_000);
    // The two together ask for the 50% deposit once, not twice
    await issue(path, diff);
    const asked = (await invoices()).reduce((n, i) => n + invoiceTotal(InvoiceFields.parse(i.fields)), 0);
    expect(asked).toBe(225_000);
  });

  it("drafts no deposit at all when the approved share is 0", async () => {
    const { opt, path } = await flow();
    const b = opt("B");
    await call(OP, "PATCH", `${path}/items/${b.id}`, { version: b.version, fields: { depositPercent: 0 } });
    await call(OP, "POST", `${path}/proposals`, {});
    await approve("B");
    expect(await invoices()).toHaveLength(0);
  });
});


// 3. Duplicate drafts
describe("3. duplicate drafts", () => {
  it("lets a second deposit draft exist, but only one of the two can ever be issued", async () => {
    await approve("B");
    const { path } = await flow();
    const first = (await invoices())[0]!;
    const again = await call(OP, "POST", `${path}/invoices`, { type: "deposit" });
    expect(again.status).toBe(201);
    expect(again.json.fields.lines).toEqual(first.fields.lines);
    expect(await issue(path, first)).toMatchObject({ status: "issued" });
    // The same money would be asked twice: refused, and the draft can still be voided by deleting it
    const dup = await call(OP, "POST", `${path}/invoices/${again.json.id}/issue`, { version: again.json.version });
    expect(dup.status).toBe(409);
    expect(dup.json.error).toBe("duplicate");
    expect((await itemNow(again.json.id)).status).toBe("draft");
    expect((await call(OP, "DELETE", `${path}/items/${again.json.id}?version=${again.json.version}`)).status).toBe(200);
    const issued = (await invoices()).filter((i) => i.status === "issued");
    expect(issued).toHaveLength(1);
  });

  it("finds nothing to bill when Draft is clicked twice after the deposit was issued", async () => {
    await approve("B");
    const { path } = await flow();
    await issue(path, (await invoices())[0]!);
    // The deposit is already asked for, so a repeated request finds nothing to bill
    const clicks = await Promise.all([call(OP, "POST", `${path}/invoices`, { type: "deposit" }), call(OP, "POST", `${path}/invoices`, { type: "deposit" })]);
    expect(clicks.map((c) => c.json.error)).toEqual(["no_lines", "no_lines"]);
  });

  it("makes more drafts when Draft is clicked twice before issuing, and issuing all of them bills the deposit once", async () => {
    await approve("B");
    const { path } = await flow();
    const both = await Promise.all([call(OP, "POST", `${path}/invoices`, { type: "deposit" }), call(OP, "POST", `${path}/invoices`, { type: "deposit" })]);
    expect(both.map((c) => c.status)).toEqual([201, 201]);
    const drafts = (await invoices()).filter((i) => i.fields.type === "deposit");
    expect(drafts).toHaveLength(3);
    const results: number[] = [];
    for (const d of drafts) results.push((await call(OP, "POST", `${path}/invoices/${d.id}/issue`, { version: d.version })).status);
    expect(results.filter((x) => x === 200)).toHaveLength(1);
    const asked = (await invoices()).filter((i) => i.status === "issued").reduce((n, i) => n + invoiceTotal(InvoiceFields.parse(i.fields)), 0);
    expect(asked).toBe(225_000);
  });

  it("issues a draft once however many times the button is pressed", async () => {
    await approve("B");
    const { path } = await flow();
    const d = (await invoices())[0]!;
    const rs = await Promise.all([call(OP, "POST", `${path}/invoices/${d.id}/issue`, { version: d.version }), call(OP, "POST", `${path}/invoices/${d.id}/issue`, { version: d.version })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await invoices()).filter((i) => i.fields.number)).toHaveLength(1);
    expect((await call(OP, "POST", `${path}/invoices/${d.id}/issue`, { version: d.version + 1 })).json.error).toBe("already_issued");
  });

  it("never drafts a second final invoice at handover, and refuses to issue a repeated one", async () => {
    const { path } = await issuedDeposit();
    const h = (await flow()).items.find((i) => i.kind === "handoff")!;
    await call(s.raj.email, "POST", `${path}/items/${h.id}/accept`, { version: h.version, signature: SIGN });
    expect((await invoices()).filter((i) => i.fields.type === "final")).toHaveLength(1);
    // The same step accepted again, or the whole handover, drafts nothing more
    expect((await call(s.raj.email, "POST", `${path}/handover/accept`, { signature: SIGN })).json.error).toBe("nothing_to_accept");
    const final = (await invoices()).find((i) => i.fields.type === "final")!;
    // neon1 asking for the final by hand while one is drafted makes a copy; issuing both is refused
    const copy = await call(OP, "POST", `${path}/invoices`, { type: "final" });
    expect(copy.status).toBe(201);
    await issue(path, final);
    expect((await call(OP, "POST", `${path}/invoices/${copy.json.id}/issue`, { version: copy.json.version })).json.error).toBe("duplicate");
    expect((await invoices()).filter((i) => i.fields.type === "final" && i.status === "issued")).toHaveLength(1);
  });
});


// 4. Late ACH
describe("4. late ACH", () => {
  it("reads clearing, not overdue, past the due date, and the balance holds until the bank pays", async () => {
    const { inv, path } = await issuedDeposit();
    const session = await checkout(path, inv);
    await hook(event(session, "checkout.session.completed", "unpaid"));
    // Forty days on, well past the 15-day terms
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 40 * 86_400_000));
    const today = new Date().toISOString().slice(0, 10);
    expect(today > String(inv.fields.dueDate)).toBe(true);
    const st = await standing(inv.id, today);
    expect(st.state).toBe("clearing");
    expect(st.balance).toBe(225_000);
    expect(st.payable).toBe(0);
    expect(st.inv.status).toBe("issued");
    // Home does not nag Raj with an overdue invoice he can do nothing about
    const home = await call(s.raj.email, "GET", `/t/${s.acme.id}/workspace?waiting=all`);
    expect((home.json.waiting as { itemId: string }[]).filter((w) => w.itemId === inv.id)).toHaveLength(0);
    // The bank pays: now it is received and the invoice is paid
    await hook(event(session, "checkout.session.async_payment_succeeded", "paid"));
    const done = await standing(inv.id, today);
    expect(done.state).toBe("paid");
    expect(done.balance).toBe(0);
  });

  it("is overdue again only once the transfer fails", async () => {
    const { inv, path } = await issuedDeposit();
    const session = await checkout(path, inv);
    await hook(event(session, "checkout.session.completed", "unpaid"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 40 * 86_400_000));
    await hook(event(session, "checkout.session.async_payment_failed", "unpaid"));
    const today = new Date().toISOString().slice(0, 10);
    const st = await standing(inv.id, today);
    expect(st.state).toBe("overdue");
    const home = await call(s.raj.email, "GET", `/t/${s.acme.id}/workspace?waiting=all`);
    expect((home.json.waiting as { itemId: string; overdue?: boolean; failed?: boolean }[]).find((w) => w.itemId === inv.id)).toMatchObject({ failed: true });
  });
});


// 5. Failed ACH
describe("5. failed ACH", () => {
  it("restores the balance, makes the invoice payable again, counts no money, and a retry that clears is the only money received", async () => {
    const { inv, path } = await issuedDeposit();
    const first = await checkout(path, inv);
    await hook(event(first, "checkout.session.completed", "unpaid"));
    expect((await standing(inv.id)).balance).toBe(225_000);
    expect((await standing(inv.id)).payable).toBe(0);
    await hook(event(first, "checkout.session.async_payment_failed", "unpaid"));
    const failed = await standing(inv.id);
    expect(failed).toMatchObject({ balance: 225_000, payable: 225_000, clearing: 0 });
    expect(failed.inv.status).toBe("issued");
    expect(failed.failed?.amountCents).toBe(225_000);
    const pays = failed.items.filter((i) => i.kind === "payment");
    expect(pays).toHaveLength(1);
    expect(pays[0]!.status).toBe("failed");
    // The failure is a locked record too
    expect([...records.saved.keys()].some((k) => k.endsWith("-failed.json"))).toBe(true);
    // Payable again: a new session for the whole amount; its transfer clears
    const second = await checkout(path, inv);
    expect(second.id).not.toBe(first.id);
    expect(second.amountCents).toBe(225_000);
    await hook(event(second, "checkout.session.completed", "unpaid"));
    await hook(event(second, "checkout.session.async_payment_succeeded", "paid"));
    // A stale repeat of the first, failed session changes nothing
    await hook(event(first, "checkout.session.async_payment_succeeded", "paid"));
    const end = await standing(inv.id);
    expect(end.inv.status).toBe("paid");
    expect(end.balance).toBe(0);
    expect(end.items.filter((i) => i.kind === "payment").map((i) => i.status).sort()).toEqual(["done", "failed"]);
  });
});


// 6. Pending ACH
describe("6. pending ACH", () => {
  it("blocks a hand-recorded duplicate payment, a second Checkout, and voiding while it clears", async () => {
    const { inv, path } = await issuedDeposit();
    const session = await checkout(path, inv);
    await hook(event(session, "checkout.session.completed", "unpaid"));
    const cur = await itemNow(inv.id);
    // Any amount neon1 could record is already covered by the transfer on its way
    const full = await byCheck(path, inv, 225_000);
    expect([full.status, full.json.error]).toEqual([400, "too_much"]);
    expect((await byCheck(path, inv, 1)).json.error).toBe("too_much");
    expect((await call(s.raj.email, "POST", `${path}/invoices/${inv.id}/pay`)).json.error).toBe("clearing");
    expect((await call(OP, "POST", `${path}/invoices/${inv.id}/void`, { version: cur.version, reason: "Wrong amount" })).json.error).toBe("has_payments");
    // Nothing was written by the refusals
    const st = await standing(inv.id);
    expect(st.items.filter((i) => i.kind === "payment")).toHaveLength(1);
    expect(st.inv.status).toBe("issued");
    // A credit for a bank payment on its way is the way to correct it, once it clears
    expect(st.balance).toBe(225_000);
  });

  it("covers only what it covers: a partial transfer leaves the rest recordable by hand, never more", async () => {
    const { inv, path } = await issuedDeposit();
    const session = await checkout(path, inv);
    // The client's transfer is for $1,000 of the $2,250
    await hook(event(session, "checkout.session.completed", "unpaid", 100_000));
    expect((await standing(inv.id)).payable).toBe(125_000);
    expect((await byCheck(path, inv, 125_001)).json.error).toBe("too_much");
    expect((await byCheck(path, inv, 125_000)).json.invoice.status).toBe("issued");
    // The invoice is not paid until the transfer is received too
    expect((await standing(inv.id)).state).toBe("clearing");
    await hook(event(session, "checkout.session.async_payment_succeeded", "paid", 100_000));
    expect((await standing(inv.id)).state).toBe("paid");
    expect((await itemNow(inv.id)).status).toBe("paid");
  });
});


// 7. Cancellation after the deposit was paid
describe("7. cancellation after the deposit", () => {
  it("drafts a credit for what is given back, nothing else is billed, and the invoice reads as the credit leaves it", async () => {
    const { inv, path } = await issuedDeposit();
    expect((await byCheck(path, inv, 225_000)).json.invoice.status).toBe("paid");
    // The project is stopped and moved to Closed
    const p = (await flow()).p;
    expect((await call(OP, "POST", `${path}/move`, { version: p.version, stageId: "closed", reason: "Client cancelled" })).status).toBe(200);
    // The agreement keeps $1,000 for the work done: $1,250 of the $2,250 goes back as a credit
    const credit = await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: inv.id, lines: [{ text: "Cancelled: deposit returned, less $1,000 for the work done", unitCents: 125_000 }], note: "Client cancelled" });
    expect(credit.status).toBe(201);
    await issue(path, credit.json);
    const st = await standing(inv.id);
    // Paid $2,250, invoiced net $1,000: $1,250 is owed back, and nothing is owed by the client
    const net = invoiceTotal(InvoiceFields.parse(inv.fields)) - 125_000;
    const paid = st.items.filter((i) => i.kind === "payment" && i.status === "done").reduce((n, i) => n + Number(i.fields.amountCents), 0);
    expect(paid - net).toBe(125_000);
    expect(st.balance).toBe(0);
    expect(st.payable).toBe(0);
    // Nothing else was drafted or billed because of the stop
    expect((await invoices()).map((i) => i.fields.type)).toEqual(["deposit", "credit"]);
    // A stopped project can't have its handover accepted, so no final invoice appears
    expect((await call(s.raj.email, "POST", `${path}/handover/accept`, { signature: SIGN })).json.error).toBe("not_done");
  });

  it("holds money changes while the project is archived, and works again once it is not", async () => {
    const { inv, path } = await issuedDeposit();
    await byCheck(path, inv, 225_000);
    const p = (await flow()).p;
    const archived = await call(OP, "PATCH", path, { version: p.version, archived: true });
    expect(archived.status).toBe(200);
    const lines = [{ text: "Cancelled: deposit returned", unitCents: 225_000 }];
    expect((await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: inv.id, lines })).json.error).toBe("archived");
    // Reads and the client's own record are still there
    expect((await call(s.raj.email, "GET", path)).status).toBe(200);
    expect((await call(OP, "PATCH", path, { version: archived.json.version, archived: false })).status).toBe(200);
    expect((await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: inv.id, lines })).status).toBe(201);
  });

  it("when the decision is cancelled by changing to a cheaper option after the deposit was paid, the difference is credited once", async () => {
    const { inv, path } = await issuedDeposit();
    await byCheck(path, inv, 225_000);
    await approve("C", { reason: "Scope shrank" });
    const h = (await flow()).items.find((i) => i.kind === "handoff")!;
    await call(s.raj.email, "POST", `${path}/items/${h.id}/accept`, { version: h.version, signature: SIGN });
    const all = await invoices();
    expect(all.map((i) => i.fields.type)).toEqual(["deposit", "credit"]);
    // C's price is $750, $2,250 was paid: $1,500 comes back, not the whole deposit
    expect(invoiceTotal(InvoiceFields.parse(all[1]!.fields))).toBe(-150_000);
    expect(all[1]!.fields.appliesTo).toBe(inv.id);
  });
});


// 8. Refunds never exceed what was invoiced and paid
describe("8. refunds", () => {
  /** Option C repriced as an estimate (20 to 24 hours at $175), approved with its $1,750 deposit issued and paid */
  async function paidEstimate() {
    const { opt, path } = await flow();
    const c = opt("C");
    await call(OP, "PATCH", `${path}/items/${c.id}`, { version: c.version, fields: { pricing: "estimate", rateCents: 17_500, hoursLow: 20, hoursHigh: 24, cost: "", basis: [{ work: "All of it", hours: 22 }] } });
    await call(OP, "POST", `${path}/proposals`, {});
    await approve("C");
    const dep = (await invoices())[0]!;
    await issue(path, dep);
    await byCheck(path, dep, 175_000);
    return { dep, path };
  }
  const log = (path: string, hours: number) => call(OP, "POST", `${path}/items`, { kind: "time", title: "Work", fields: { date: "2026-11-12", hours } });

  it("drafts a refund credit when the estimate lands under the deposit, only for the difference, once, and never above what was invoiced", async () => {
    const { dep, path } = await paidEstimate();
    await log(path, 6);
    const h = (await flow()).items.find((i) => i.kind === "handoff")!;
    await call(s.raj.email, "POST", `${path}/items/${h.id}/accept`, { version: h.version, signature: SIGN });
    const credit = (await invoices()).find((i) => i.fields.type === "credit")!;
    // 6 hours at $175 is $1,050 against $1,750: $700 back, which is less than the deposit paid
    expect(invoiceTotal(InvoiceFields.parse(credit.fields))).toBe(-70_000);
    expect(credit.fields.appliesTo).toBe(dep.id);
    await issue(path, credit);
    const st = await standing(dep.id);
    expect(st.balance).toBe(0);
    // Asking again, by hand, finds nothing more to refund
    expect((await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: dep.id })).json.error).toBe("no_lines");
    expect((await invoices()).filter((i) => i.fields.type === "credit")).toHaveLength(1);
  });

  it("refuses a credit larger than the invoice it reduces, alone or added to earlier credits", async () => {
    const { dep, path } = await paidEstimate();
    const over = await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: dep.id, lines: [{ text: "Too much", unitCents: 175_001 }] });
    expect([over.status, over.json.error]).toEqual([400, "invalid"]);
    // $1,000 is fine; a second $1,000 would take the invoice below nothing
    const one = await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: dep.id, lines: [{ text: "Part", unitCents: 100_000 }] });
    expect(one.status).toBe(201);
    await issue(path, one.json);
    const two = await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: dep.id, lines: [{ text: "Part", unitCents: 100_000 }] });
    expect([two.status, two.json.error]).toEqual([400, "invalid"]);
    expect((await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: dep.id, lines: [{ text: "Rest", unitCents: 75_000 }] })).status).toBe(201);
  });

  it("refuses two drafted credits that together pass the invoice when they are issued", async () => {
    const { dep, path } = await paidEstimate();
    const a = await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: dep.id, lines: [{ text: "A", unitCents: 175_000 }] });
    expect(a.status).toBe(201);
    // The second is refused at once while the first stands; it can't be made around it
    const b = await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: dep.id, lines: [{ text: "B", unitCents: 1 }] });
    expect(b.status).toBe(400);
    await issue(path, a.json);
    expect((await standing(dep.id)).balance).toBe(0);
  });

  it("refuses a credit against a draft, a void invoice, or another credit", async () => {
    await approve("B");
    const { path } = await flow();
    const draft = (await invoices())[0]!;
    const lines = [{ text: "x", unitCents: 100 }];
    expect((await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: draft.id, lines })).status).toBe(400);
    const inv = await issue(path, draft);
    const cr = await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: inv.id, lines });
    const issuedCredit = await issue(path, cr.json);
    expect((await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: issuedCredit.id, lines })).status).toBe(400);
    await call(OP, "POST", `${path}/invoices/${inv.id}/void`, { version: inv.version, reason: "Wrong invoice" });
    expect((await call(OP, "POST", `${path}/invoices`, { type: "credit", appliesTo: inv.id, lines })).status).toBe(400);
  });
});


// 9. Change of decision after partial invoicing
describe("9. change of decision after partial invoicing", () => {
  /** A new $9,000 fixed option, shared and issued, so a bigger one can replace B */
  async function bigger() {
    const { path } = await flow();
    const r = await call(OP, "POST", `${path}/items`, { kind: "option", title: "D. Whole practice portal", status: "proposed", fields: { pricing: "fixed", cost: "$9,000 fixed" } });
    expect(r.status).toBe(201);
    expect((await call(OP, "POST", `${path}/proposals`, { note: "Adds D" })).status).toBe(201);
    return itemNow(r.json.id);
  }

  it("counts what was invoiced and paid for the earlier option toward a bigger one, and bills the total once", async () => {
    const { inv, path } = await issuedDeposit();
    await byCheck(path, inv, 100_000);
    const d = await bigger();
    const r = await call(s.raj.email, "POST", `${path}/items/${d.id}/approve`, { version: d.version, reason: "We want the whole thing", signature: SIGN });
    expect(r.status).toBe(201);
    // D's 50% deposit is $4,500, less the $2,250 invoiced for B: $2,250 more
    const list = await invoices();
    expect(list.map((i) => i.status)).toEqual(["issued", "draft"]);
    const dep2 = list[1]!;
    expect(invoiceTotal(InvoiceFields.parse(dep2.fields))).toBe(225_000);
    await issue(path, dep2);
    // The first invoice still owes what it owed; its partial payment stays on it
    expect((await standing(inv.id)).balance).toBe(125_000);
    // At handover the final asks only for the rest of $9,000
    const h = (await flow()).items.find((i) => i.kind === "handoff")!;
    await call(s.raj.email, "POST", `${path}/items/${h.id}/accept`, { version: h.version, signature: SIGN });
    const final = (await invoices()).find((i) => i.fields.type === "final")!;
    expect(invoiceTotal(InvoiceFields.parse(final.fields))).toBe(450_000);
    const total = (await invoices()).reduce((n, i) => n + invoiceTotal(InvoiceFields.parse(i.fields)), 0);
    expect(total).toBe(900_000);
  });

  it("drops an unissued deposit draft for the replaced decision, so nobody is asked for it", async () => {
    await approve("B");
    const { path } = await flow();
    const before = (await invoices())[0]!;
    const d = await bigger();
    await call(s.raj.email, "POST", `${path}/items/${d.id}/approve`, { version: d.version, reason: "Bigger", signature: SIGN });
    const list = await invoices();
    expect(list.some((i) => i.id === before.id)).toBe(false);
    expect(list).toHaveLength(1);
    expect(invoiceTotal(InvoiceFields.parse(list[0]!.fields))).toBe(450_000);
  });

  it("changing back and forth keeps one chain: the total invoiced never passes the option in force", async () => {
    const { inv, path } = await issuedDeposit();
    const b = (await flow()).opt("B");
    const second = await revise(b, { depositPercent: 50 });
    await revise(second.option, { depositPercent: 20 });
    expect((await invoices()).map((i) => i.id)).toEqual([inv.id]);
    const h = (await flow()).items.find((i) => i.kind === "handoff")!;
    await call(s.raj.email, "POST", `${path}/items/${h.id}/accept`, { version: h.version, signature: SIGN });
    const total = (await invoices()).reduce((n, i) => n + invoiceTotal(InvoiceFields.parse(i.fields)), 0);
    expect(total).toBe(450_000);
  });
});


// 10. Two tabs editing at once
describe("10. two tabs editing at once", () => {
  it("gives a stale option write a conflict and keeps the first save", async () => {
    const { opt, path } = await flow();
    const c = opt("C");
    const tab1 = await call(OP, "PATCH", `${path}/items/${c.id}`, { version: c.version, fields: { timeline: "3 weeks" } });
    expect(tab1.status).toBe(200);
    const tab2 = await call(OP, "PATCH", `${path}/items/${c.id}`, { version: c.version, fields: { timeline: "9 weeks" } });
    expect([tab2.status, tab2.json.error]).toEqual([409, "conflict"]);
    expect((await itemNow(c.id)).fields.timeline).toBe("3 weeks");
    // Written at the same moment, one wins and one is told
    const now = await itemNow(c.id);
    const both = await Promise.all([call(OP, "PATCH", `${path}/items/${c.id}`, { version: now.version, fields: { timeline: "A" } }), call(OP, "PATCH", `${path}/items/${c.id}`, { version: now.version, fields: { timeline: "B" } })]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("gives a stale draft, issue, or void a conflict, and never overwrites an issued invoice", async () => {
    await approve("B");
    const { path } = await flow();
    const d = (await invoices())[0]!;
    const tab1 = await call(OP, "PATCH", `${path}/invoices/${d.id}`, { version: d.version, termsDays: 30 });
    expect(tab1.status).toBe(200);
    expect((await call(OP, "PATCH", `${path}/invoices/${d.id}`, { version: d.version, termsDays: 5 })).json.error).toBe("conflict");
    expect((await call(OP, "POST", `${path}/invoices/${d.id}/issue`, { version: d.version })).json.error).toBe("conflict");
    expect((await itemNow(d.id)).fields.termsDays).toBe(30);
    const issued = await issue(path, tab1.json);
    expect((await call(OP, "POST", `${path}/invoices/${d.id}/void`, { version: d.version, reason: "Stale tab voiding" })).json.error).toBe("conflict");
    expect((await itemNow(d.id)).status).toBe("issued");
    // The current version may void it
    expect((await call(OP, "POST", `${path}/invoices/${d.id}/void`, { version: issued.version, reason: "Reissuing" })).status).toBe(200);
  });

  it("refuses an approval from a tab that read an older option, and keeps the decision out", async () => {
    const { opt, path } = await flow();
    const b = opt("B");
    expect((await call(OP, "PATCH", `${path}/items/${b.id}`, { version: b.version, fields: { timeline: "5 weeks" } })).status).toBe(200);
    const r = await call(s.raj.email, "POST", `${path}/items/${b.id}/approve`, { version: b.version, signature: SIGN });
    expect([r.status, r.json.error]).toEqual([409, "conflict"]);
    expect((await flow()).items.some((i) => i.kind === "decision")).toBe(false);
  });

  it("makes one decision when the same option is approved from two tabs", async () => {
    const { opt, path } = await flow();
    const b = opt("B");
    const rs = await Promise.all([1, 2].map(() => call(s.raj.email, "POST", `${path}/items/${b.id}/approve`, { version: b.version, signature: SIGN })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const { items } = await flow();
    expect(items.filter((i) => i.kind === "decision")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "invoice")).toHaveLength(1);
  });

  it("makes one decision, and one deposit, when two different options are approved from two tabs", async () => {
    const { opt, path } = await flow();
    const b = opt("B");
    const c = opt("C");
    const rs = await Promise.all([call(s.raj.email, "POST", `${path}/items/${b.id}/approve`, { version: b.version, signature: SIGN }), call(s.raj.email, "POST", `${path}/items/${c.id}/approve`, { version: c.version, signature: SIGN })]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const { items } = await flow();
    expect(items.filter((i) => i.kind === "decision")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "invoice")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "option" && i.status === "approved")).toHaveLength(1);
  });

  it("records one payment when the same hand payment is sent twice at once", async () => {
    const { inv, path } = await issuedDeposit();
    const rs = await Promise.all([byCheck(path, inv, 225_000), byCheck(path, inv, 225_000)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const st = await standing(inv.id);
    expect(st.items.filter((i) => i.kind === "payment")).toHaveLength(1);
    expect(st.inv.status).toBe("paid");
  });

  it("records no more than is owed when two partial payments race", async () => {
    const { inv, path } = await issuedDeposit();
    const rs = await Promise.all([byCheck(path, inv, 125_000), byCheck(path, inv, 125_000)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const st = await standing(inv.id);
    const paid = st.items.filter((i) => i.kind === "payment").reduce((n, i) => n + Number(i.fields.amountCents), 0);
    expect(paid).toBeLessThanOrEqual(225_000);
  });

  it("drafts one final invoice when the handover is accepted from two tabs", async () => {
    const { path } = await issuedDeposit();
    const h = (await flow()).items.find((i) => i.kind === "handoff")!;
    const rs = await Promise.all([call(s.raj.email, "POST", `${path}/items/${h.id}/accept`, { version: h.version, signature: SIGN }), call(s.raj.email, "POST", `${path}/items/${h.id}/accept`, { version: h.version, signature: SIGN })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await invoices()).filter((i) => i.fields.type === "final")).toHaveLength(1);
  });
});


// 11. A client leaving
describe("11. client exit", () => {
  /** Dana made an admin with a confirmed sign-in, so she can manage people and export when Raj goes */
  async function danaAdmin() {
    const dana = (await repo.getMember(s.acme.id, s.dana.id))!;
    expect((await call(OP, "PATCH", `/t/${s.acme.id}/members/${s.dana.id}`, { version: dana.version, access: "admin" })).status).toBe(200);
    const u = (await repo.getUser(s.dana.id))!;
    await repo.saveUser({ ...u, strongAuth: true, version: u.version + 1 }, u.version);
  }

  /** Raj approves B, the deposit is issued and partly paid, then Dana deactivates Raj */
  async function raj_leaves() {
    await danaAdmin();
    const { decision, inv, path } = await issuedDeposit();
    await byCheck(path, inv, 100_000);
    const raj = (await repo.getMember(s.acme.id, s.raj.id))!;
    const out = await call(s.dana.email, "PATCH", `/t/${s.acme.id}/members/${s.raj.id}`, { version: raj.version, status: "deactivated" });
    expect(out.status).toBe(200);
    return { decision, inv, path };
  }

  it("keeps the decision, invoices, and payments locked and exportable after the approver is deactivated", async () => {
    const { decision, inv, path } = await raj_leaves();
    const p = (await flow()).p;
    // Raj can no longer read or act
    expect((await call(s.raj.email, "GET", path)).status).toBeGreaterThanOrEqual(400);
    expect((await call(s.raj.email, "POST", `${path}/invoices/${inv.id}/pay`)).status).toBeGreaterThanOrEqual(400);
    // What he signed is untouched and can't be edited or removed by anyone
    expect((await repo.getItem(p.tenantId, p.id, decision.id))!.fields.signature).toEqual(decision.fields.signature);
    expect((await call(OP, "PATCH", `${path}/items/${decision.id}`, { version: decision.version, title: "x" })).json.error).toBe("immutable");
    expect((await call(OP, "DELETE", `${path}/items/${decision.id}?version=${decision.version}`)).json.error).toBe("immutable");
    const cur = await itemNow(inv.id);
    expect((await call(OP, "PATCH", `${path}/invoices/${inv.id}`, { version: cur.version, termsDays: 90 })).json.error).toBe("immutable");
    expect((await call(OP, "DELETE", `${path}/items/${inv.id}?version=${cur.version}`)).json.error).toBe("immutable");
    expect((await call(OP, "POST", `${path}/invoices/${inv.id}/void`, { version: cur.version, reason: "Client left" })).json.error).toBe("has_payments");
    const pay = (await flow()).items.find((i) => i.kind === "payment")!;
    expect((await call(OP, "DELETE", `${path}/items/${pay.id}?version=${pay.version}`)).json.error).toBe("immutable");
    // Another admin still sees the records and downloads everything
    const read = await call(s.dana.email, "GET", path);
    expect(read.status).toBe(200);
    expect((read.json.items as Item[]).map((i) => i.kind)).toEqual(expect.arrayContaining(["decision", "invoice", "payment"]));
    const history = await call(s.dana.email, "GET", `/t/${s.acme.id}/export/history`);
    expect(history.status).toBe(200);
    const actions = (history.json.audit as { action: string }[]).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["decision.approved", "invoice.issued", "payment.received", "member.updated"]));
    // The locked copies are still there
    expect(records.saved.has(`t/${s.acme.id}/p/${p.id}/decisions/${decision.id}.json`)).toBe(true);
    expect([...records.saved.keys()].some((k) => k.includes("/invoices/INV-0039-01"))).toBe(true);
    expect([...records.saved.keys()].some((k) => k.includes("/payments/"))).toBe(true);
    // The balance is still owed: Dana can pay the rest online
    expect((await call(s.dana.email, "POST", `${path}/invoices/${inv.id}/pay`)).status).toBe(200);
  });

  it("still records a bank payment that was on its way when the client left, and exports the trashed project with its money", async () => {
    await danaAdmin();
    const { inv, path } = await issuedDeposit();
    const session = await checkout(path, inv);
    await hook(event(session, "checkout.session.completed", "unpaid"));
    // The organization trashes the project and deactivates Raj
    const p = (await flow()).p;
    expect((await call(s.dana.email, "DELETE", `/t/${s.acme.id}/projects/${p.id}`, { version: p.version, confirm: p.key })).status).toBe(200);
    const raj = (await repo.getMember(s.acme.id, s.raj.id))!;
    expect((await call(s.dana.email, "PATCH", `/t/${s.acme.id}/members/${s.raj.id}`, { version: raj.version, status: "deactivated" })).status).toBe(200);
    // Nobody can change the money in a trashed project through the routes
    expect((await call(OP, "POST", `${path}/invoices/${inv.id}/void`, { version: inv.version, reason: "Gone" })).status).toBe(404);
    expect((await byCheck(path, inv, 1)).status).toBe(404);
    // The bank still clears it, and it is recorded
    await hook(event(session, "checkout.session.async_payment_succeeded", "paid"));
    const items = await repo.listItems(s.acme.id, p.id);
    expect(items.find((i) => i.id === inv.id)!.status).toBe("paid");
    expect(items.filter((i) => i.kind === "payment" && i.status === "done")).toHaveLength(1);
    // The export has the decision, the invoice, and the payment
    const exp = await call(s.dana.email, "GET", `/t/${s.acme.id}/export/trash`);
    expect(exp.status).toBe(200);
    const kinds = (exp.json.projects[0].items as Item[]).map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["decision", "invoice", "payment"]));
  });
});


// 12. Quick fix commercial path
describe("12. quick fix commercial path", () => {
  const HOURLY = { title: "Fix the front desk printer", body: "Reinstall the driver.", pricing: "estimate", rateCents: 15_000, hoursLow: 2, hoursHigh: 5, timeline: "This week" };

  /** A quick fix quoted and approved by Raj; its path and its one step */
  async function quickFix() {
    const made = await call(OP, "POST", `/t/${s.acme.id}/projects`, { name: "Printer won't print", template: "quick_fix" });
    const path = `/t/${s.acme.id}/projects/${made.json.id}`;
    const items = (await call(OP, "GET", path)).json.items as Item[];
    const { option } = (await call(OP, "POST", `${path}/quote`, HOURLY)).json;
    expect((await call(s.raj.email, "POST", `${path}/items/${option.id}/approve`, { version: option.version, signature: SIGN })).status).toBe(201);
    const list = async () => ((await call(OP, "GET", path)).json.items as Item[]).filter((i) => i.kind === "invoice");
    return { path, step: items.find((i) => i.kind === "handoff")!, list };
  }
  const hours = (path: string, n: number) => call(OP, "POST", `${path}/items`, { kind: "time", title: "Work", fields: { date: "2026-11-10", hours: n } });

  it("drafts no deposit, one capped invoice on acceptance, and nothing more from any later route", async () => {
    const { path, step, list } = await quickFix();
    expect(await list()).toEqual([]);
    // Nine hours worked against a 5-hour cap
    await hours(path, 9);
    const done = await call(OP, "PATCH", `${path}/items/${step.id}`, { version: step.version, status: "done" });
    const accepted = await call(s.raj.email, "POST", `${path}/items/${step.id}/accept`, { version: done.json.version, signature: SIGN });
    expect(accepted.status).toBe(200);
    const made = await list();
    expect(made.map((i) => [i.fields.type, i.status])).toEqual([["final", "draft"]]);
    expect(invoiceTotal(InvoiceFields.parse(made[0]!.fields))).toBe(75_000);
    // The one-signature handover has nothing left to accept
    expect((await call(s.raj.email, "POST", `${path}/handover/accept`, { signature: SIGN })).json.error).toBe("nothing_to_accept");
    expect(await list()).toHaveLength(1);
    // Issued, and with more hours logged afterwards, nothing more can be billed
    await issue(path, made[0]!);
    await hours(path, 3);
    expect((await call(OP, "POST", `${path}/invoices`, { type: "final" })).json.error).toBe("no_lines");
    expect((await call(OP, "POST", `${path}/invoices`, { type: "progress" })).json.error).toBe("no_lines");
    expect((await call(OP, "POST", `${path}/invoices`, { type: "deposit" })).json.error).toBe("no_lines");
  });

  it("caps a progress invoice at the high end too, and bills only what is left for the final", async () => {
    const { path, step, list } = await quickFix();
    await hours(path, 4);
    const progress = await call(OP, "POST", `${path}/invoices`, { type: "progress" });
    expect(invoiceTotal(InvoiceFields.parse(progress.json.fields))).toBe(60_000);
    await issue(path, progress.json);
    // Four more hours: the invoice for the work stops at 5 hours, $750, so $150 more is asked
    await hours(path, 4);
    const done = await call(OP, "PATCH", `${path}/items/${step.id}`, { version: step.version, status: "done" });
    await call(s.raj.email, "POST", `${path}/items/${step.id}/accept`, { version: done.json.version, signature: SIGN });
    const all = await list();
    const final = all.find((i) => i.fields.type === "final")!;
    expect(invoiceTotal(InvoiceFields.parse(final.fields))).toBe(15_000);
    expect(all.filter((i) => i.fields.type !== "credit").reduce((n, i) => n + invoiceTotal(InvoiceFields.parse(i.fields)), 0)).toBe(75_000);
  });

  it("refunds nothing when fewer hours were worked, and bills only the hours worked", async () => {
    const { path, step, list } = await quickFix();
    await hours(path, 3);
    const done = await call(OP, "PATCH", `${path}/items/${step.id}`, { version: step.version, status: "done" });
    await call(s.raj.email, "POST", `${path}/items/${step.id}/accept`, { version: done.json.version, signature: SIGN });
    const made = await list();
    expect(made.map((i) => i.fields.type)).toEqual(["final"]);
    expect(invoiceTotal(InvoiceFields.parse(made[0]!.fields))).toBe(45_000);
  });
});


// Word mark-up mapping (the pure mapping is tested in apps/web/src/lib/markup.test.ts): what the
// review sends when neon1 applies suggestions to an approved option, and what the API lets through
describe("Word mark-up: applying to an approved option", () => {
  it("is neon1's alone, makes a revised draft, never edits the signed option, and asks for no money until approved", async () => {
    const decision = await approve("B");
    const { path, opt } = await flow();
    const b = opt("B");
    const signed = structuredClone(decision.fields.terms);
    // A client can't apply a suggestion
    expect((await call(s.raj.email, "POST", `${path}/items`, { kind: "option", status: "draft", title: "x", fields: { ...b.fields, depositPercent: 20, revises: b.id } })).status).toBe(403);
    // What the review would send on the approved option itself is refused
    expect((await call(OP, "PATCH", `${path}/items/${b.id}`, { version: b.version, fields: { depositPercent: 20, fromMarkup: "doc1" } })).status).toBe(400);
    // Make revised terms: a new draft that revises B and remembers the copy it came from
    const made = await call(OP, "POST", `${path}/items`, { kind: "option", status: "draft", title: `${b.title} (revised)`.slice(0, 160), body: b.body, fields: { ...b.fields, depositPercent: 20, fromMarkup: "doc1", revises: b.id } });
    expect(made.status).toBe(201);
    expect(made.json.fields).toMatchObject({ depositPercent: 20, revises: b.id, fromMarkup: "doc1" });
    // A second apply from the same copy edits that draft (found by `revises`), not B
    const again = await call(OP, "PATCH", `${path}/items/${made.json.id}`, { version: made.json.version, fields: { ...made.json.fields, timeline: "6 weeks" } });
    expect(again.status).toBe(200);
    // B and the decision are exactly as signed, and no new money was asked for
    const now = await flow();
    expect(now.opt("B").fields).toEqual(b.fields);
    expect(now.items.find((i) => i.id === decision.id)!.fields.terms).toEqual(signed);
    expect(now.items.filter((i) => i.kind === "invoice")).toHaveLength(1);
    expect(now.items.filter((i) => i.kind === "decision")).toHaveLength(1);
  });
});
