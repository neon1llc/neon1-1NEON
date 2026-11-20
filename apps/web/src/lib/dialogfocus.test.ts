// apps/web/src/lib/dialogfocus.test.ts - Where focus goes when a dialog opens: left alone when a box inside took it
// (the search field), and put on the first control when the dialog still has none.

import { describe, expect, it } from "vitest";
import { firstControl, FOCUSABLE, needsInitialFocus } from "./dialogfocus.ts";


/** A dialog with some descendants, enough of the DOM for these two functions */
const dialogWith = (inside: unknown[], controls: string[] = []) => ({
  contains: (n: unknown) => inside.includes(n),
  querySelector: (selector: string) => (selector === FOCUSABLE ? controls[0] ?? null : null),
});

describe("needsInitialFocus", () => {
  const input = { id: "input" };
  const outside = { id: "behind" };
  it("is false once something inside the dialog has focus, such as an autoFocus box", () => {
    const d = dialogWith([input]);
    expect(needsInitialFocus(d, input)).toBe(false);
  });
  it("is true when the dialog itself has focus, as when it opens empty, or when focus stayed on the page behind", () => {
    const d = dialogWith([input]);
    expect(needsInitialFocus(Object.assign(d, { self: true }), d)).toBe(true);
    expect(needsInitialFocus(d, outside)).toBe(true);
    expect(needsInitialFocus(d, null)).toBe(true);
  });
});

describe("firstControl", () => {
  it("is the dialog's first control, or nothing for a dialog without one", () => {
    expect(firstControl(dialogWith([], ["the yes button", "the no button"]))).toBe("the yes button");
    expect(firstControl(dialogWith([]))).toBeNull();
  });
  it("counts links, enabled buttons and fields, and leaves out what can't take focus", () => {
    expect(FOCUSABLE).toContain("a[href]");
    expect(FOCUSABLE).toContain("button:not([disabled])");
    expect(FOCUSABLE).toContain('input:not([disabled]):not([type="hidden"])');
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
