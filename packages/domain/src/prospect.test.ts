// packages/domain/src/prospect.test.ts - The prospect allowlist and file rules: everything not listed is
// refused, and a file's declared type and extension must agree.
import { normalizeLink } from "./api.ts";


import { describe, expect, it } from "vitest";
import { formatProspectId, isProspect, isSuspended, prospectFileAllowed, prospectMay } from "./prospect.ts";


describe("prospectMay", () => {
  // Reads are never limited
  it("allows every read", () => {
    expect(prospectMay("GET", "/projects/p1/items")).toBe(true);
    expect(prospectMay("HEAD", "")).toBe(true);
  });

  // The work a prospect came for: projects, needs, comments, files
  it("allows the listed changes", () => {
    for (const [m, p] of [["POST", "/projects"], ["PATCH", "/projects/p1"], ["POST", "/projects/p1/items"], ["PATCH", "/projects/p1/items/i1"], ["POST", "/projects/p1/items/i1/comments"], ["POST", "/docs"], ["POST", "/docs/d1/done"], ["DELETE", "/docs/d1"], ["POST", "/notifications/seen"]]) {
      expect(prospectMay(m!, p!), `${m} ${p}`).toBe(true);
    }
  });

  // Anything that invites, signs, approves, or touches money is refused
  it("refuses everything else", () => {
    for (const [m, p] of [["POST", "/members/invite"], ["PATCH", "/members/u1"], ["PUT", "/stages"], ["POST", "/agreement/sign"], ["POST", "/projects/p1/items/i1/approve"], ["POST", "/projects/p1/items/i1/agree"], ["POST", "/projects/p1/items/i1/accept"], ["POST", "/projects/p1/proposals"], ["POST", "/projects/p1/quote"], ["POST", "/projects/p1/invoices"], ["POST", "/projects/p1/invoices/v1/pay"], ["POST", "/projects/p1/handover/accept"], ["POST", "/projects/p1/items/i1/comments/c1"], ["PATCH", "/projects"]]) {
      expect(prospectMay(m!, p!), `${m} ${p}`).toBe(false);
    }
  });

  // A path can't sneak past the anchors
  it("matches whole paths only", () => {
    expect(prospectMay("POST", "/projects/p1/items/i1/approve/x")).toBe(false);
    expect(prospectMay("POST", "/projectsx")).toBe(false);
    expect(prospectMay("POST", "/projects/")).toBe(true);
  });
});


describe("prospect files", () => {
  it("needs a listed type whose extension agrees", () => {
    expect(prospectFileAllowed("plan.pdf", "application/pdf")).toBe(true);
    expect(prospectFileAllowed("photo.JPG", "image/jpeg")).toBe(true);
    expect(prospectFileAllowed("photo.png", "image/jpeg")).toBe(false);
    expect(prospectFileAllowed("tool.exe", "application/octet-stream")).toBe(false);
    expect(prospectFileAllowed("archive.zip", "application/zip")).toBe(false);
    expect(prospectFileAllowed("page.html", "text/html")).toBe(false);
    expect(prospectFileAllowed("noextension", "application/pdf")).toBe(false);
    expect(prospectFileAllowed("macro.docm", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
  });
});


describe("prospect state", () => {
  it("reads the tenant's prospect field", () => {
    expect(isProspect({ prospect: undefined })).toBe(false);
    expect(isProspect({ prospect: { since: "2026-11-15T00:00:00Z", terms: "1.0" } })).toBe(true);
    expect(isSuspended({ prospect: { since: "2026-11-15T00:00:00Z", terms: "1.0", suspendedAt: "2026-11-16T00:00:00Z" } })).toBe(true);
    expect(formatProspectId(7)).toBe("NP-0007");
  });
});


describe("quietStep", () => {
  it("checks in at 7 and 14 quiet days, gives final notice at 21, deletes on day 30", async () => {
    const { quietStep } = await import("./prospect.ts");
    expect(quietStep(3, 0)).toBeUndefined();
    expect(quietStep(7, 0)).toBe("nudge");
    expect(quietStep(10, 1)).toBeUndefined();
    expect(quietStep(14, 1)).toBe("nudge");
    expect(quietStep(18, 2)).toBeUndefined();
    expect(quietStep(21, 2)).toBe("final");
    expect(quietStep(25, 2, 4)).toBeUndefined();
    expect(quietStep(30, 2, 9)).toBe("delete");
    // A pass missed for days still sends one email at a time, never a burst
    expect(quietStep(16, 0)).toBe("nudge");
  });
});


describe("normalizeLink", () => {
  it("makes typed addresses into full https links and refuses anything else", () => {
    expect(normalizeLink("kimbakery.com")).toBe("https://kimbakery.com/");
    expect(normalizeLink(" https://www.yelp.com/biz/kim-bakery ")).toBe("https://www.yelp.com/biz/kim-bakery");
    expect(normalizeLink("http://example.org/a?b=1")).toBe("http://example.org/a?b=1");
    for (const bad of ["", "kim bakery", "javascript:alert(1)", "ftp://x.com", "localhost", "https://user:pw@x.com", "data:text/html,hi"]) expect(normalizeLink(bad)).toBeUndefined();
  });
});
