// apps/web/src/lib/faq.test.ts - Every FAQ answer has a unique, stable anchor, and the everyday
// searches people tried (lost phone, support, invoice, and the recovery and export variants) reach
// an answer rather than "no answers match".


import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROSPECT_LIMITS } from "@1neon/domain";
import { ALIAS_IDS, aliasesOf, marker, matches, parse, slug } from "./faq.ts";
import { fileLimitsLine } from "./prospect.ts";


const FAQ = parse(readFileSync(new URL("../help/faqs.md", import.meta.url), "utf8"));
const all = FAQ.topics.flatMap((t) => t.items);


describe("faq anchors", () => {
  it("builds anchors the way the knowledge center does", () => {
    expect(slug("I didn't get the sign-in code.")).toBe("i-didn-t-get-the-sign-in-code");
    expect(slug("What's a passkey?")).toBe("what-s-a-passkey");
  });

  it("gives every question its own anchor", () => {
    const ids = all.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toBe(true);
  });

  it("only keeps aliases for questions that exist", () => {
    const ids = new Set(all.map((i) => i.id));
    for (const id of ALIAS_IDS) {
      expect(ids.has(id)).toBe(true);
      expect(aliasesOf(id).length).toBeGreaterThan(0);
    }
  });
});


describe("faq lengths", () => {
  // The answer that offers the walkthroughs says the same length their own cards do
  it("says how long the full story takes, as measured", () => {
    // Read from the source, since where.ts looks at the page's address when it loads
    const length = /FULL_LENGTH = "([^"]+)"/.exec(readFileSync(new URL("../live/where.ts", import.meta.url), "utf8"))?.[1];
    const raw = readFileSync(new URL("../help/faqs.md", import.meta.url), "utf8");
    expect(length).toBeTruthy();
    expect(raw).toContain(`the full story takes ${length}.`);
  });
});


describe("faq promises", () => {
  const raw = readFileSync(new URL("../help/faqs.md", import.meta.url), "utf8");
  it("states a free account's file limits as the API enforces them", () => {
    const mb = (n: number) => n / 1024 / 1024;
    expect(raw).toContain(`holds up to ${PROSPECT_LIMITS.files} files, ${mb(PROSPECT_LIMITS.fileBytes)} MB each and ${mb(PROSPECT_LIMITS.totalBytes)} MB in all`);
    // The upload control says the same in one line
    expect(fileLimitsLine().replace(/^Up to/, "up to")).toBe(`up to ${PROSPECT_LIMITS.files} files, ${mb(PROSPECT_LIMITS.fileBytes)} MB each and ${mb(PROSPECT_LIMITS.totalBytes)} MB in all.`);
    expect(raw).not.toMatch(/Any file up to 100 MB/);
  });
  it("offers Create an account only while sign-up is open", () => {
    expect(raw).toContain("When sign-up is open, choose **Create an account** on the sign-in screen");
  });
});


describe("faq search", () => {
  const hits = (query: string) => all.filter((i) => matches(i, query)).map((i) => i.id);

  it.each(["lost phone", "support", "invoice", "recovery", "export", "2FA", "MFA", "passkey", "phone lost", "markup", "change order", "expired quote", "reimburse"])("finds an answer for %s", (query) => {
    expect(hits(query).length).toBeGreaterThan(0);
  });

  it("puts the recovery answer under lost phone, and billing under invoice", () => {
    expect(hits("lost phone")).toContain("i-lost-my-phone-or-my-authenticator-app");
    expect(hits("invoice")).toContain("where-are-invoices-and-payments");
    expect(hits("export")).toContain("can-we-get-a-copy-of-our-data");
  });

  it("still finds nothing for nonsense", () => {
    expect(hits("zebra quantum")).toEqual([]);
  });
});


describe("faq search marks", () => {
  const split = (text: string, q: string) => text.split(marker(q)!).filter((_, i) => i % 2);
  it("marks each typed word, whatever its case", () => expect(split("Lost phone? A lost one.", "lost PHONE")).toEqual(["Lost", "phone", "lost"]));
  it("takes punctuation literally", () => expect(split("Costs $15 (about).", "$15 (about)")).toEqual(["$15", "(about)"]));
  it("marks nothing for an empty search or single letters", () => expect(marker("  a ")).toBeUndefined());
});

