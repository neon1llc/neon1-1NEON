// packages/domain/src/caliber.test.ts - The outline rubric: what counts as written, what a template's
// starter items don't count for, and the three levels the tips come from.
import { describe, expect, it } from "vitest";
import { EXAMPLE_TITLE, joinWords, outlineOf, outlineSummary } from "./caliber.ts";
import { QUICK_FIX, TEMPLATES } from "./defaults.ts";
import { REQUEST_COOLDOWN_DAYS, requestAgainAt, requestOpen } from "./requests.ts";

const SENTENCE = "Patients email forms to one inbox and staff retype them.";
const proj = (over: Partial<Parameters<typeof outlineOf>[0]> = {}) => ({ id: "p1", key: "FLOW-1", name: "Intake forms", summary: "", outcome: "", template: "blank", targetDate: undefined, ...over });
let n = 0;
const item = (kind: string, title: string, over: Record<string, unknown> = {}) => ({ id: `i${++n}`, kind: kind as never, title, body: "", status: "open", fields: {}, ...over });
const starterItems = (template: string) => (TEMPLATES.find((t) => t.id === template)?.items ?? []).map((i) => item(i.kind, i.title, { fields: i.fields ?? {} }));

describe("outlineOf", () => {
  it("starts a named project with all three core tips, in order", () => {
    const o = outlineOf(proj(), []);
    expect(o.level).toBe("begun");
    expect(o.missingCore.map((t) => t.part)).toEqual(["what", "done", "example"]);
    expect(o.have).toEqual([]);
  });

  it("is ready once what it is, what done looks like, and one real example are written", () => {
    const o = outlineOf(proj({ summary: SENTENCE, outcome: "Patients upload once, and the desk sees what's missing." }), [item("discovery", EXAMPLE_TITLE, { body: "Every Monday Dana exports the schedule to a spreadsheet and emails it.", status: "done" })]);
    expect(o.level).toBe("ready");
    expect(o.missingCore).toEqual([]);
    // Depth is offered, never required
    expect(o.missingDepth.map((t) => t.part)).toEqual(["people", "systems", "measure", "date"]);
  });

  it("is strong with the core and two of the four optional parts", () => {
    const base = { summary: SENTENCE, outcome: "Patients upload once, and the desk sees what's missing." };
    const example = item("discovery", EXAMPLE_TITLE, { body: "Every Monday Dana exports the schedule to a spreadsheet and emails it." });
    const one = outlineOf(proj({ ...base, targetDate: "2027-03-01" }), [example]);
    expect(one.level).toBe("ready");
    const two = outlineOf(proj({ ...base, targetDate: "2027-03-01" }), [example, item("asset", "The front desk's shared Gmail")]);
    expect(two.level).toBe("strong");
    expect(two.have).toEqual(expect.arrayContaining(["systems", "date"]));
  });

  it("treats short scraps as not written", () => {
    const o = outlineOf(proj({ summary: "forms", outcome: "better" }), [item("discovery", EXAMPLE_TITLE, { body: "see above" })]);
    expect(o.have).toEqual([]);
  });

  // A template's questions, systems, and numberless measures are there for the person to fill, not credit for them
  it("gives no credit for a template's starter items until they're written in", () => {
    const untouched = outlineOf(proj({ template: "cloud_migration", summary: SENTENCE, outcome: "Everything runs in the cloud with no surprises." }), [item("discovery", EXAMPLE_TITLE), ...starterItems("cloud_migration")]);
    expect(untouched.level).toBe("begun");
    expect(untouched.missingCore.map((t) => t.part)).toEqual(["example"]);
    expect(untouched.have).not.toEqual(expect.arrayContaining(["systems", "measure", "people"]));
    // The tip opens the question that's already there
    expect(untouched.missingCore[0]!.itemId).toBeTruthy();
    // Written in, they count
    const filled = starterItems("cloud_migration").map((i) => (i.title === "Servers and what runs on them" ? { ...i, body: "One file server and the billing app, both on the office closet PC." } : i.kind === "metric" && i.title === "Monthly infrastructure cost" ? { ...i, fields: { ...i.fields, baseline: 900, target: 400 } } : i));
    const o = outlineOf(proj({ template: "cloud_migration", summary: SENTENCE, outcome: "Everything runs in the cloud with no surprises." }), [item("discovery", EXAMPLE_TITLE, { body: "The nightly backup copies to a drive nobody has restored from." }), ...filled]);
    expect(o.have).toEqual(expect.arrayContaining(["systems", "measure"]));
    expect(o.level).toBe("strong");
  });

  it("counts a question the person added and answered as their example", () => {
    const o = outlineOf(proj({ summary: SENTENCE, outcome: "Patients upload once, and the desk sees what's missing." }), [item("discovery", "What happens when a form is missing a page?", { body: "The desk calls the patient and asks them to resend the whole thing." })]);
    expect(o.missingCore).toEqual([]);
  });

  it("asks a quick fix only what's wrong", () => {
    const o = outlineOf(proj({ template: QUICK_FIX, summary: "Since Tuesday's update, jobs sit in the queue and nothing prints." }), starterItems(QUICK_FIX));
    expect(o.level).toBe("strong");
    expect(o.tips).toEqual([]);
    expect(outlineOf(proj({ template: QUICK_FIX }), []).missingCore.map((t) => t.part)).toEqual(["what"]);
  });

  it("is deterministic: the same project gives the same outline", () => {
    const items = [item("asset", "Shared Gmail")];
    expect(outlineOf(proj({ summary: SENTENCE }), items)).toEqual(outlineOf(proj({ summary: SENTENCE }), items));
  });
});

describe("words", () => {
  it("lists with the serial comma", () => {
    expect(joinWords([])).toBe("");
    expect(joinWords(["G"])).toBe("G");
    expect(joinWords(["G", "H"])).toBe("G and H");
    expect(joinWords(["G", "H", "I"])).toBe("G, H, and I");
  });

  it("summarizes a project for neon1 with what's missing", () => {
    const begun = outlineOf(proj({ summary: SENTENCE }), []);
    expect(outlineSummary(begun)).toBe("FLOW-1 Intake forms: begun. Missing: what done looks like and one real example.");
  });
});

describe("the request window", () => {
  it("rolls from the request and never resets at midnight", () => {
    const at = "2026-11-19T23:50:00.000Z";
    expect(requestAgainAt(at)).toBe(new Date(Date.parse(at) + REQUEST_COOLDOWN_DAYS * 86_400_000).toISOString());
    expect(requestOpen(at, new Date("2026-11-20T01:50:00Z"))).toBe(true);
    expect(requestOpen(at, new Date("2026-11-26T23:49:00Z"))).toBe(true);
    expect(requestOpen(at, new Date("2026-11-26T23:51:00Z"))).toBe(false);
    expect(requestOpen(undefined)).toBe(false);
  });
});
