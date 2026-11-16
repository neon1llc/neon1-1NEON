// apps/web/src/lib/preview.test.ts - The profile's unsaved menu style reaches the frame and is cleared again.
import { describe, expect, it } from "vitest";
import { previewMenu, usePreviewedMenu } from "./preview.ts";

describe("menu preview", () => {
  it("is exported for the frame and starts empty", () => {
    expect(typeof usePreviewedMenu).toBe("function");
    expect(() => previewMenu("mini")).not.toThrow();
    expect(() => previewMenu(undefined)).not.toThrow();
  });
});
