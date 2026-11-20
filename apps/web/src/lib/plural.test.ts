// apps/web/src/lib/plural.test.ts - Counts read right at one, zero, and many.

import { describe, expect, it } from "vitest";
import { noun, plural } from "./plural.ts";


describe("plural", () => {
  it("is singular only at exactly one", () => {
    expect(plural(1, "project")).toBe("1 project");
    expect(plural(0, "project")).toBe("0 projects");
    expect(plural(2, "project")).toBe("2 projects");
    expect(noun(1, "file")).toBe("file");
    expect(noun(11, "file")).toBe("files");
  });
  it("takes an irregular plural", () => {
    expect(plural(1, "person", "people")).toBe("1 person");
    expect(plural(3, "person", "people")).toBe("3 people");
  });
});
