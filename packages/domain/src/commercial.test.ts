// packages/domain/src/commercial.test.ts - Qualification of the commercial rules in pure form: how the
// deposit, final invoice, and refund follow a changing decision, and how an invoice reads while a
// bank payment clears or fails. The numbered groups match the qualification list (1 to 12); the
// routes that enforce the same rules are checked in apps/api/src/commercial.test.ts.


import { describe, expect, it } from "vitest";
import { balanceOf, billedOn, clearingOn, depositLines, failedOn, finalLines, invoiceState, invoiceTotal, lineage, payableOn, priceOf, refundCredit } from "./billing.ts";


// A stored record of a kind, with fields
const rec = (id: string, kind: string, status: string, fields: Record<string, unknown>, title = id) => ({ id, kind, status, fields, title });
const inv = (id: string, status: string, f: Record<string, unknown>) => rec(id, "invoice", status, { termsDays: 15, taxCents: 0, ...f });
const pay = (id: string, invoiceId: string, amountCents: number, status = "done") => rec(id, "payment", status, { invoiceId, amountCents, method: "ach", receivedAt: "2026-11-12", recordedBy: "u1" });
const time = (id: string, hours: number) => rec(id, "time", "done", { date: "2026-11-12", hours });

// A fixed $4,500 option's terms, with the deposit share the decision agreed
const fixed = (depositPercent?: number) => ({ title: "B. Portal", cost: "$4,500 fixed", pricing: "fixed", ...(depositPercent === undefined ? {} : { depositPercent }) });
const decision = (id: string, terms: Record<string, unknown>, supersedes?: string[]) => rec(id, "decision", "approved", { code: `0039-r1-${id}`, terms, supersedes });
// An issued invoice that asked for `cents` on a decision
const issued = (id: string, ref: string, cents: number, type = "deposit", status = "issued", n = 1) => inv(id, status, { type, number: `INV-0039-0${n}`, issuedAt: `2026-11-0${n}T10:00:00.000Z`, dueDate: "2026-11-20", lines: [{ text: "x", qty: 1, unitCents: cents, ref }] });


// 1. Revised options after approval keep the signed terms
describe("1. signed terms stay with the decision", () => {
  it("bills from the decision's frozen terms, however the option or a later decision reads", () => {
    const signed = decision("d1", fixed(50));
    // The signed decision asks 50% of $4,500, and always will
    expect(depositLines(signed).map((l) => l.unitCents)).toEqual([225_000]);
    // A revised decision is a different record; reading the first one again gives the same answer
    const revised = decision("d2", fixed(20), ["d1"]);
    expect(depositLines(revised).map((l) => l.unitCents)).toEqual([90_000]);
    expect(depositLines(signed).map((l) => l.unitCents)).toEqual([225_000]);
    expect(priceOf(signed.fields.terms as never)).toMatchObject({ kind: "fixed", totalCents: 450_000, depositPercent: 50 });
  });
});


// 2. Deposit share changes: 50% to 20% to 0, and the other way
describe("2. deposit share changes", () => {
  const d50 = decision("d1", fixed(50));
  const dep50 = issued("i1", "d1", 225_000);

  it("asks nothing more when the share falls to 20%, then to 0, with 50% already invoiced", () => {
    const d20 = decision("d2", fixed(20), ["d1"]);
    // 20% is $900, less than the $2,250 already invoiced: no deposit
    expect(depositLines(d20, undefined, [d50, dep50, d20])).toEqual([]);
    const d0 = decision("d3", fixed(0), ["d2", "d1"]);
    expect(depositLines(d0, undefined, [d50, dep50, d0])).toEqual([]);
    // What was invoiced still counts toward the work, so the final asks only for the rest
    expect(finalLines(d20, [d50, dep50, d20]).map((l) => l.unitCents)).toEqual([225_000]);
    expect(finalLines(d0, [d50, dep50, d0]).map((l) => l.unitCents)).toEqual([225_000]);
  });

  it("drafts only the difference when the share rises, with the earlier invoice named", () => {
    const d20 = decision("d2", fixed(20));
    const dep20 = issued("i2", "d2", 90_000);
    const d50b = decision("d3", fixed(50), ["d2"]);
    const lines = depositLines(d50b, undefined, [d20, dep20, d50b]);
    expect(lines.map((l) => l.unitCents)).toEqual([225_000, -90_000]);
    expect(lines[1]!.text).toContain("INV-0039-01");
    expect(invoiceTotal({ type: "deposit", taxCents: 0, lines })).toBe(135_000);
  });

  it("changes the suggestion with the share: 50, 20, 0 on a clean decision", () => {
    expect(depositLines(decision("a", fixed(50))).map((l) => l.unitCents)).toEqual([225_000]);
    expect(depositLines(decision("b", fixed(20))).map((l) => l.unitCents)).toEqual([90_000]);
    expect(depositLines(decision("c", fixed(0)))).toEqual([]);
  });

  it("ignores a draft and a void deposit when working out what was invoiced", () => {
    const d20 = decision("d2", fixed(20), ["d1"]);
    const draft = issued("i3", "d1", 225_000, "deposit", "draft");
    const voided = issued("i4", "d1", 225_000, "deposit", "void");
    expect(billedOn(d20, [d50, draft, voided, d20])).toBe(0);
    expect(depositLines(d20, undefined, [d50, draft, voided, d20]).map((l) => l.unitCents)).toEqual([90_000]);
  });
});


// 3. Duplicate drafts: the suggestion only counts what was issued, so a draft never hides a second
describe("3. duplicate drafts", () => {
  it("suggests the same deposit while the first is still a draft, and nothing once one is issued", () => {
    const d = decision("d1", fixed(50));
    const draft = issued("i1", "d1", 225_000, "deposit", "draft");
    expect(depositLines(d, undefined, [d, draft]).map((l) => l.unitCents)).toEqual([225_000]);
    // Once either is issued, a third suggestion is empty: the same money is never asked twice
    const out = { ...draft, status: "issued" };
    expect(depositLines(d, undefined, [d, out])).toEqual([]);
    expect(finalLines(d, [d, out]).map((l) => l.unitCents)).toEqual([225_000]);
  });
});


// 4, 5, 6. A bank transfer on its way, refused, and pending
describe("4. late ACH: clearing past the due date", () => {
  const i = inv("i1", "issued", { type: "deposit", lines: [{ text: "x", qty: 1, unitCents: 225_000 }], dueDate: "2026-11-20" });

  it("reads clearing, not overdue, and the balance is not reduced until it is received", () => {
    const started = pay("p1", "i1", 225_000, "pending");
    for (const today of ["2026-11-19", "2026-11-20", "2026-11-21", "2026-12-31"]) expect(invoiceState(i, [i, started], today)).toBe("clearing");
    expect(balanceOf(i, [i, started])).toBe(225_000);
    expect(payableOn(i, [i, started])).toBe(0);
    // Received: paid, and the balance finally drops
    const done = { ...started, status: "done" };
    expect(balanceOf(i, [i, done])).toBe(0);
    expect(invoiceState(i, [i, done], "2026-12-31")).toBe("paid");
  });

  it("is overdue again when the transfer covers only part of what is owed", () => {
    const part = pay("p1", "i1", 100_000, "pending");
    expect(invoiceState(i, [i, part], "2026-11-21")).toBe("overdue");
    expect(payableOn(i, [i, part])).toBe(125_000);
  });
});

describe("5. failed ACH", () => {
  const i = inv("i1", "issued", { type: "deposit", lines: [{ text: "x", qty: 1, unitCents: 225_000 }], dueDate: "2026-11-20" });

  it("restores the balance and the payable amount, and counts no money", () => {
    const failed = pay("p1", "i1", 225_000, "failed");
    expect(balanceOf(i, [i, failed])).toBe(225_000);
    expect(clearingOn(i, [i, failed])).toBe(0);
    expect(payableOn(i, [i, failed])).toBe(225_000);
    expect(invoiceState(i, [i, failed], "2026-11-15")).toBe("open");
    expect(invoiceState(i, [i, failed], "2026-11-25")).toBe("overdue");
    expect(failedOn(i, [i, failed])?.amountCents).toBe(225_000);
  });

  it("pending, then failed, then a second try pending: only the live one blocks", () => {
    const first = pay("p1", "i1", 225_000, "failed");
    const second = pay("p2", "i1", 225_000, "pending");
    expect(payableOn(i, [i, first, second])).toBe(0);
    expect(invoiceState(i, [i, first, second], "2026-11-25")).toBe("clearing");
    expect(failedOn(i, [i, first, second])).toBeUndefined();
  });
});

describe("6. pending ACH", () => {
  it("is not capped past what is owed, so a hand-recorded duplicate leaves nothing payable", () => {
    const i = inv("i1", "issued", { type: "deposit", lines: [{ text: "x", qty: 1, unitCents: 225_000 }], dueDate: "2026-11-20" });
    const started = pay("p1", "i1", 225_000, "pending");
    // The clearing amount never exceeds the balance, and what can be recorded or paid is zero
    expect(clearingOn(i, [i, started])).toBe(225_000);
    expect(payableOn(i, [i, started])).toBe(0);
    // Two transfers started for the same money still clear only what is owed
    expect(clearingOn(i, [i, started, pay("p2", "i1", 225_000, "pending")])).toBe(225_000);
    expect(payableOn(i, [i, started, pay("p2", "i1", 225_000, "pending")])).toBe(0);
  });
});


// 8. Refunds: never more than what was invoiced for the work
describe("8. refunds", () => {
  const est = { title: "B. Setup", pricing: "estimate", rateCents: 17_500, hoursLow: 20, hoursHigh: 24 };
  const d = decision("d1", est);
  const dep = issued("i1", "d1", 175_000);

  it("credits the difference when the hours worked come to less than the deposit, once", () => {
    const items = [d, dep, time("t1", 6)];
    const r = refundCredit(d, items)!;
    expect(r.appliesTo).toBe("i1");
    expect(r.lines.map((l) => l.unitCents)).toEqual([70_000]);
    // Drafted or issued, the credit suppresses a second suggestion; void brings it back
    const credit = inv("c1", "draft", { type: "credit", appliesTo: "i1", lines: r.lines });
    expect(refundCredit(d, [...items, credit])).toBeUndefined();
    expect(refundCredit(d, [...items, { ...credit, status: "void" }])).toBeDefined();
  });

  it("gives back everything when no hours were worked, never more than was invoiced", () => {
    const r = refundCredit(d, [d, dep])!;
    expect(r.lines[0]!.unitCents).toBe(175_000);
    const credit = inv("c1", "issued", { type: "credit", appliesTo: "i1", lines: r.lines });
    // Invoice less credit is zero, never negative, so the balance can't go below nothing
    expect(balanceOf(dep, [dep, credit])).toBe(0);
  });

  it("refunds nothing when the work covers the deposit", () => {
    expect(refundCredit(d, [d, dep, time("t1", 10)])).toBeUndefined();
    expect(refundCredit(d, [d, dep, time("t1", 12)])).toBeUndefined();
  });

  it("with two invoices on the work, the credit still fits within the invoice it names", () => {
    // $1,750 deposit and a $500 progress invoice; no hours were worked, so $2,250 comes back, but a
    // credit reduces one invoice and can't take it below nothing
    const progress = issued("i2", "d1", 50_000, "progress", "issued", 2);
    const r = refundCredit(d, [d, dep, progress])!;
    const target = r.appliesTo === "i1" ? dep : progress;
    expect(r.lines[0]!.unitCents).toBeLessThanOrEqual(invoiceTotal(target.fields as never));
  });
});


// 9. Change of decision after partial invoicing
describe("9. change of decision", () => {
  it("counts money invoiced for earlier decisions through the whole chain toward the new one", () => {
    const a = decision("a", fixed(50));
    const b = decision("b", { ...fixed(50), cost: "$3,000 fixed" }, ["a"]);
    const c = decision("c", { ...fixed(50), cost: "$6,000 fixed" }, ["b", "a"]);
    const onA = issued("i1", "a", 225_000);
    const onB = issued("i2", "b", 50_000, "progress", "issued", 2);
    const items = [a, b, c, onA, onB];
    expect([...lineage(c, items)].sort()).toEqual(["a", "b", "c"]);
    expect(billedOn(c, items)).toBe(275_000);
    // C's own deposit is $3,000, less the $2,750 invoiced: $250 more
    expect(depositLines(c, undefined, items).map((l) => l.unitCents)).toEqual([300_000, -275_000]);
    // And the final asks for the rest of $6,000
    expect(finalLines(c, items).map((l) => l.unitCents)).toEqual([325_000]);
  });

  it("does not count another decision that did not lead to this one", () => {
    const a = decision("a", fixed(50));
    const other = decision("z", fixed(50));
    expect(billedOn(a, [a, other, issued("i9", "z", 225_000)])).toBe(0);
  });

  it("refunds what was invoiced beyond a cheaper option's price", () => {
    const a = decision("a", fixed(50));
    const small = decision("b", { ...fixed(50), cost: "$750 fixed" }, ["a"]);
    const items = [a, small, issued("i1", "a", 225_000)];
    expect(finalLines(small, items)).toEqual([]);
    expect(refundCredit(small, items)!.lines[0]!.unitCents).toBe(150_000);
  });
});


// 12. Quick fix: capped hours, nothing up front
describe("12. quick fix commercial path", () => {
  const quick = decision("q", { title: "Fix the printer", pricing: "estimate", rateCents: 15_000, hoursLow: 2, hoursHigh: 5, depositPercent: 0 });

  it("asks nothing up front and bills never past the high end", () => {
    expect(depositLines(quick, undefined, [quick])).toEqual([]);
    const lines = finalLines(quick, [quick, time("t1", 9)]);
    expect(invoiceTotal({ type: "final", taxCents: 0, lines })).toBe(75_000);
    expect(lines.filter((l) => l.unitCents > 0).reduce((n, l) => n + l.qty, 0)).toBe(5);
  });

  it("once the final is issued, hours logged beyond the cap bill nothing more", () => {
    const final = issued("i1", "q", 75_000, "final");
    expect(finalLines(quick, [quick, final, time("t1", 9)])).toEqual([]);
    expect(refundCredit(quick, [quick, final, time("t1", 9)])).toBeUndefined();
  });
});
