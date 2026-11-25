// apps/web/src/lib/lab.test.ts - The workflow prototype's movement rules


import { describe, expect, it } from "vitest";
import { BENCH, NEON, QUICK, SEED, isReady, landing, needsReason, stepOf, stepsOf } from "../lab/model.ts";


const byKey = (k: string) => SEED.find((p) => p.key === k)!;
const neonStep = (id: string) => stepsOf(NEON).find((s) => s.id === id)!;


describe("workflow moves", () => {
  it("lands a switched project on the same board state, or the nearest earlier one", () => {
    expect(landing(byKey("FLOW-1"), QUICK).id).toBe("quote");
    expect(landing(byKey("AI-2"), BENCH).id).toBe(stepsOf(BENCH)[0]!.id);
    expect(landing(byKey("SEC-1"), QUICK).state).toBe("wrapping");
  });
  it("asks for a reason only when unapproved work reaches agreed work", () => {
    expect(needsReason(byKey("FLOW-1"), neonStep("build"))).toBe(true);
    expect(needsReason({ ...byKey("FLOW-1"), approved: true }, neonStep("build"))).toBe(false);
    expect(needsReason(byKey("AI-2"), neonStep("decide"))).toBe(false);
    expect(needsReason(byKey("AI-2"), neonStep("care"))).toBe(false);
  });
  it("offers one tap only when a hand-moved step's list is done", () => {
    const sec = byKey("SEC-1");
    expect(isReady(sec)).toBe(true);
    expect(isReady({ ...sec, ticked: sec.ticked!.slice(1) })).toBe(false);
    // A signature moves the card itself, so ticks never offer it
    const decide = byKey("FLOW-1");
    expect(isReady({ ...decide, ticked: stepOf(decide).todo.map((t) => `decide:${t}`) })).toBe(false);
  });
});
