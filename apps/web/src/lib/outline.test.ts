// apps/web/src/lib/outline.test.ts - The lines Next step shows, from what the rubric finds.
import { describe, expect, it } from "vitest";
import { outlineOf, EXAMPLE_TITLE, type Outline } from "@1neon/domain";
import { outlineStatus, shortNotes, tipPath } from "./outline.ts";

const slug = (l: "needs" | "observation") => (l === "needs" ? "needs" : "observe");
const base = { template: "blank", targetDate: undefined as string | undefined };
const begun = (key: string, over: Record<string, unknown> = {}): Outline => outlineOf({ id: key, key, name: `Name ${key}`, summary: "", outcome: "", ...base, ...over }, []);
const ready = (key: string): Outline => outlineOf({ id: key, key, name: `Name ${key}`, summary: "Patients email forms to one inbox.", outcome: "Patients upload once and the desk sees gaps.", ...base }, [{ id: "x", kind: "discovery", title: EXAMPLE_TITLE, body: "Every Monday the schedule is exported by hand and emailed.", status: "done", fields: {} }]);
const strong = (key: string): Outline => outlineOf({ id: key, key, name: `Name ${key}`, summary: "Patients email forms to one inbox.", outcome: "Patients upload once and the desk sees gaps.", ...base, targetDate: "2027-01-01" }, [{ id: "x", kind: "discovery", title: EXAMPLE_TITLE, body: "Every Monday the schedule is exported by hand and emailed.", status: "done", fields: {} }, { id: "y", kind: "asset", title: "Shared Gmail inbox", body: "", status: "open", fields: {} }]);

describe("outlineStatus", () => {
  it("says nothing is outlined yet when there are no projects", () => {
    expect(outlineStatus([])).toMatchObject({ lines: [], closing: "Start a project to have something to assess." });
  });

  it("names what a begun project still needs, and points Continue at the first of it", () => {
    const s = outlineStatus([begun("ABC-1", { summary: "Patients email forms to one inbox." })]);
    expect(s.lines[0]).toMatchObject({ lead: "You've begun outlining ABC-1.", tip: "Add what done looks like and one real example." });
    expect(s.lines[0]!.next?.part).toBe("done");
    expect(s.closing).toBe("You can request the assessment now, or add more first.");
  });

  it("gives one line each for several projects, and groups the well-outlined ones", () => {
    const s = outlineStatus([begun("ABC-1"), ready("ABC-2"), strong("XYZ-1"), strong("XYZ-2")]);
    expect(s.lines.map((l) => l.lead)).toEqual(["You've begun outlining ABC-1.", "ABC-2 has the basics."]);
    expect(s.lines[1]!.tip).toBe("You can still add who does the work and the systems involved.");
    expect(s.strong?.text).toBe("XYZ-1 and XYZ-2 are well outlined.");
    expect(s.closing).toBe("I see you've outlined ABC-1, ABC-2, XYZ-1, and XYZ-2. If you're ready for eyes, request the assessment below.");
  });

  it("shows only the grouped sentence when everything is well outlined", () => {
    const s = outlineStatus([strong("ABC-1")]);
    expect(s.lines).toEqual([]);
    expect(s.strong?.text).toBe("ABC-1 is well outlined.");
  });
});

describe("shortNotes", () => {
  it("lists what could still be added, only for projects below the basics", () => {
    expect(shortNotes([begun("ABC-2"), ready("ABC-1")])).toEqual([{ key: "ABC-2", text: "You can still optionally add what it is, what done looks like, and one real example to ABC-2." }]);
    expect(shortNotes([ready("ABC-1"), strong("XYZ-1")])).toEqual([]);
  });
});

describe("tipPath", () => {
  it("opens the overview, a layer tab, or the item itself", () => {
    const o = begun("ABC-1");
    expect(tipPath("/o/acme", o, { where: "overview" }, slug)).toBe("/o/acme/projects/ABC-1");
    expect(tipPath("/o/acme", o, { where: "observation" }, slug)).toBe("/o/acme/projects/ABC-1/observe");
    expect(tipPath("/o/acme", o, { where: "needs", itemId: "i9" }, slug)).toBe("/o/acme/projects/ABC-1/needs#item-i9");
  });
});
