// apps/web/src/lib/scenarios.test.ts - The three made-up engagements hold together: every option is a
// valid option, its hours add up inside its range, the hours logged land inside the approved terms,
// the invoices the story shows are the ones the billing rules produce, and the pieces of work agree with
// the story that shows them.


import { OptionFields, depositLines, finalLines, hoursLogged, priceOf } from "@1neon/domain";
import { describe, expect, it } from "vitest";
import { ACCESS_REVIEW, ASSISTANT_EVAL, canaryTable, CANARY, costTable, EVAL_QUESTIONS, exceptionTable, FILES, FULL_COMPARISON, monthly, reconcile, ROLLBACK_LOG, ROLLBACK_MINUTES, STOCK_SAMPLE } from "./artifacts.ts";
import { moneyOf, SCENARIO_IDS, SCENARIOS, sum, summaryOf, targetText, type Scenario } from "./scenarios.ts";


const all = SCENARIO_IDS.map((id) => SCENARIOS[id]);

describe.each(all)("$org.name", (s: Scenario) => {
  const chosen = s.options[s.chosen]!;
  const money = moneyOf(s);

  it("offers valid options, none of them forced into a set of three", () => {
    expect(s.options.length).toBeGreaterThanOrEqual(2);
    expect(s.options.length).toBeLessThanOrEqual(3);
    for (const o of s.options) {
      OptionFields.parse(o.fields);
      expect(priceOf(o.fields)).toBeDefined();
      expect(o.title.length).toBeLessThanOrEqual(160);
    }
  });

  it("writes every estimate's hours so they add up inside its own range", () => {
    for (const o of s.options) {
      const p = priceOf(o.fields)!;
      if (p.kind !== "estimate") continue;
      const total = sum(o.fields.basis ?? []);
      expect(total).toBeGreaterThanOrEqual(p.hoursLow);
      expect(total).toBeLessThanOrEqual(p.hoursHigh);
    }
  });

  it("has a rejected option, a failed test, and a limit accepted", () => {
    expect(s.declined.length + s.constraints.length).toBeGreaterThan(0);
    expect(s.updates.fail.title.length).toBeGreaterThan(0);
    expect(s.constraints.length).toBeGreaterThanOrEqual(2);
  });

  it("logs hours inside the terms in force, and bills the amounts the story says", () => {
    const logged = hoursLogged(s.hours.map((h, i) => ({ id: `t${i}`, kind: "time", status: "done", fields: { hours: h.hours } })));
    const now = s.revision ? { ...chosen.fields, hoursLow: s.revision.hoursLow, hoursHigh: s.revision.hoursHigh, depositPercent: s.revision.depositPercent } : chosen.fields;
    const p = priceOf(now)!;
    if (p.kind === "estimate") {
      expect(logged).toBeGreaterThanOrEqual(p.hoursLow);
      expect(logged).toBeLessThanOrEqual(p.hoursHigh);
    }
    const decision = { id: "i_decision", title: `Approved: ${chosen.title}`, fields: { code: `0039-r1-${"ABC"[s.chosen]}`, terms: { title: chosen.title, ...chosen.fields } } };
    const time = s.hours.map((h, i) => ({ id: `i_time${i}`, kind: "time", status: "done", fields: { hours: h.hours } }));
    const deposit = depositLines(decision);
    expect(deposit.reduce((n, l) => n + Math.round(l.qty * l.unitCents), 0)).toBe(money.depositCents);
    const invoice = { id: "i_inv1", kind: "invoice", status: "paid", fields: { type: "deposit", lines: deposit } };
    // After a scope change the final invoice bills the revised terms: its figure is the story's own
    const final = finalLines(s.revision ? { ...decision, fields: { ...decision.fields, terms: { title: chosen.title, ...now } } } : decision, [...time, invoice]);
    expect(final.reduce((n, l) => n + Math.round(l.qty * l.unitCents), 0)).toBe(money.finalCents);
    expect(money.depositCents + money.finalCents).toBe(money.earnedCents);
  });

  it("names its people and files without repeating a person or leaving a file out", () => {
    expect(s.owner.email).not.toBe(s.colleague.email);
    expect(s.owner.email).toMatch(/\.example$/);
    for (const f of s.files) expect(FILES[f.name], f.name).toBeTruthy();
    for (const p of s.pieces) expect(p.table?.rows.length ?? 1).toBeGreaterThan(0);
  });

  it("keeps every measure's readings moving toward its target", () => {
    for (const m of s.measures) {
      const seq = [m.baseline, ...m.readings];
      for (let i = 1; i < seq.length; i++) expect(m.direction === "down" ? seq[i]! <= seq[i - 1]! : seq[i]! >= seq[i - 1]!).toBe(true);
      expect(String(m.readings[2])).toBe(m.newReading);
    }
  });

  it("says nothing about the old examples", () => {
    expect(JSON.stringify(s)).not.toMatch(/bakery|Maple Street|\bMaria\b|florist|\bLena\b/i);
  });
});

describe("the summary lines the sample page quotes", () => {
  it("has one per option, with a price", () => {
    for (const s of all) {
      const lines = summaryOf(s);
      expect(lines.length).toBe(s.options.length);
      for (const l of lines) expect(l.price).toMatch(/\$/);
    }
  });
});


describe("Harborline's exception report", () => {
  it("flags only differences, and the second pass gives each a reason", () => {
    const first = reconcile(STOCK_SAMPLE, false);
    const second = reconcile(STOCK_SAMPLE, true);
    expect(first.every((e) => e.reason === "unexplained" || e.reason === "no item match")).toBe(true);
    expect(second.length).toBeLessThan(first.length);
    expect(second.filter((e) => e.reason === "unexplained").length).toBeLessThanOrEqual(2);
    expect(exceptionTable(true).rows.length).toBe(second.length);
  });
});

describe("Quillwork's cost model, canary, and evaluation", () => {
  it("sums the model to a saving and prints it", () => {
    expect(monthly("before")).toBe(2150);
    expect(monthly("after")).toBe(1010);
    const t = costTable();
    expect(t.rows.at(-1)).toEqual(["Monthly total", "$2,150", "$1,010"]);
  });

  it("counts its canary runs, and rolls back in the minutes the runbook says", () => {
    for (const c of CANARY) expect(c.identical + c.failed).toBe(c.jobs);
    expect(CANARY.some((c) => c.failed > 0)).toBe(true);
    expect(canaryTable().rows.length).toBe(CANARY.length);
    expect(FULL_COMPARISON.identical).toBe(FULL_COMPARISON.jobs);
    expect(ROLLBACK_LOG.length).toBeGreaterThan(2);
    expect(ROLLBACK_MINUTES).toBe(4);
  });

  it("recommends not building when the built-in answer is within the judges' disagreement", () => {
    expect(ASSISTANT_EVAL.length).toBe(3);
    for (const e of ASSISTANT_EVAL) expect(e.correct).toBeLessThanOrEqual(EVAL_QUESTIONS);
    expect(Math.abs(ASSISTANT_EVAL[1]!.correct - ASSISTANT_EVAL[0]!.correct)).toBeLessThanOrEqual(1);
  });
});

describe("Fenwick's access review", () => {
  it("reviews every account it counts", () => {
    expect(ACCESS_REVIEW.reviewed).toBe(ACCESS_REVIEW.accounts);
    expect(ACCESS_REVIEW.removed).toBeLessThan(ACCESS_REVIEW.accounts);
  });
});


describe("target wording", () => {
  it("says zero for none, and never a bound below zero", () => {
    expect(targetText({ direction: "down", target: 0 })).toBe("zero");
    expect(targetText({ direction: "down", target: 5 })).toBe("at most 5");
    expect(targetText({ direction: "up", target: 90 })).toBe("at least 90");
    for (const s of all) for (const m of s.measures) expect(m.target).toBeGreaterThanOrEqual(0);
  });

  it("keeps a proposal's promise inside what its acceptance measures show", () => {
    for (const s of all) {
      const said = `${s.project.name} ${s.project.outcome} ${String(s.options[s.chosen]!.fields.result)} ${s.better}`.toLowerCase();
      expect(said).not.toMatch(/no longer queue|don't queue|counts agree|one stock count/);
    }
  });
});
