// apps/web/src/lib/matrix-tokens.test.ts - Keeps the dark theme's text colors on the site's shared tokens
// (--m-ink, --m-ink-soft, --m-muted, --m-faint, from neon1.tech's /shared/neon1.css) and the fallbacks equal to them.


import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";


const FALLBACK = { "--m-ink": "#EDF1ED", "--m-ink-soft": "#E3E7E4", "--m-muted": "#CBD1CC", "--m-faint": "#B1B8B2" } as const;
const css = ["../styles/app.css", "../live/live.css"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");


describe("matrix text tokens", () => {
  it("every use of a shared token carries the agreed fallback", () => {
    const uses = [...css.matchAll(/var\((--m-[a-z-]+)(?:,\s*([^)]*))?\)/g)];
    expect(uses.length).toBeGreaterThan(0);
    for (const [, name, fallback] of uses) {
      expect(FALLBACK, name).toHaveProperty(name!);
      expect(fallback?.trim().toUpperCase(), name).toBe(FALLBACK[name as keyof typeof FALLBACK]);
    }
  });

  it("no old muted greens are left as text colors", () => {
    for (const old of ["#84A98C", "#D6F5DC", "#A3C2AA", "#8FAE97", "#6F8F77", "#C9F5D6"]) expect(css.toUpperCase(), old).not.toContain(old);
  });
});
