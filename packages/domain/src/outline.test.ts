// packages/domain/src/outline.test.ts - The outline parts read from what a project already holds.


import { describe, expect, it } from "vitest";
import { EXAMPLE_TITLE, listWords, outlineOf, outlineTip } from "./outline.ts";


describe("outlineOf", () => {
  it("counts nothing for a project with only a name and starter questions", () => {
    const o = outlineOf({}, [{ kind: "discovery", title: "Who does this work, and how often?" }, { kind: "asset", title: "Servers and what runs on them" }]);
    expect(o.have).toEqual([]);
    expect(o.level).toBe("started");
  });

  it("is outlined once what, today, and done are written, and complete with all six", () => {
    const p = { summary: "Patients email forms to one inbox.", outcome: "Patients upload once, and the desk sees gaps." };
    const items = [{ kind: "discovery", title: EXAMPLE_TITLE, body: "Every Monday Dana retypes twenty forms." }];
    expect(outlineOf(p, items).level).toBe("outlined");
    const all = outlineOf({ ...p, targetDate: "2027-01-31" }, [
      ...items,
      { kind: "asset", title: "Google Workspace and the EHR" },
      { kind: "metric", title: "Minutes per form", fields: { baseline: 12 } },
    ]);
    expect(all.missing).toEqual([]);
    expect(all.level).toBe("complete");
  });

  it("ignores a placeholder answer", () => {
    expect(outlineOf({ summary: "tbd" }, []).have).not.toContain("what");
  });
});


describe("words", () => {
  it("joins with the Oxford comma and caps the tip", () => {
    expect(listWords(["a", "b", "c"])).toBe("a, b, and c");
    expect(listWords(["a", "b"])).toBe("a and b");
    expect(outlineTip(["done", "measure"])).toBe("add what will be true when it's done and a measure with where it is now");
    // More missing than the tip names: it names the first three and ends there, never "..., and more."
    const long = outlineTip(["what", "today", "done", "who"]);
    expect(long).toBe("add a sentence on what this is, one real example of how it works today, and what will be true when it's done");
    expect(long).not.toMatch(/and more/);
    expect(outlineTip(["what", "today", "done", "who", "measure", "limits"], 6)).toMatch(/a target date or any limits, such as budget or must-nots$/);
  });
});


describe("readinessOf", () => {
  it("counts the outline, the assessment, options, and the decision, reaching 100 only with a decision", async () => {
    const { readinessOf } = await import("./outline.ts");
    expect(readinessOf({}, []).percent).toBe(0);
    expect(readinessOf({ summary: "Patients email forms to one inbox." }, [], "2026-11-19T00:00:00Z").percent).toBe(20);
    const opt = { kind: "option", title: "Use the EHR's portal", status: "proposed" };
    expect(readinessOf({}, [opt]).steps).toMatchObject({ assess: true, options: true, decide: false });
    expect(readinessOf({}, [opt, { kind: "decision", title: "Approved" }]).percent).toBe(100);
  });
});
