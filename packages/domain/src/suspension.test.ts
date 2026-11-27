// packages/domain/src/suspension.test.ts - What a suspension still allows, who may ask to lift it, and the
// inactivity clock's steps.
import { describe, expect, it } from "vitest";
import { canAskRecommission, dormantCovered, dormantStep, INACTIVE_DAYS, suspendedMay, suspensionOf, suspendText, SUSPEND_DEFAULT } from "./suspension.ts";


const at = "2026-11-27T00:00:00.000Z";


describe("suspendedMay", () => {
  it("reads, asks, marks notifications, and chats, and nothing else", () => {
    expect(suspendedMay("GET", "/projects", "super")).toBe(true);
    expect(suspendedMay("POST", "/recommission", "inactive")).toBe(true);
    expect(suspendedMay("POST", "/notifications/read-all", "super")).toBe(true);
    expect(suspendedMay("POST", "/chat", "super")).toBe(true);
    expect(suspendedMay("POST", "/projects/p1/invoices/i1/pay", "abuse")).toBe(true);
    expect(suspendedMay("POST", "/projects", "super")).toBe(false);
    expect(suspendedMay("PUT", "/profile", "super")).toBe(false);
  });

  it("closes chat after abuse", () => {
    expect(suspendedMay("POST", "/chat", "abuse")).toBe(false);
    expect(suspendedMay("POST", "/recommission", "abuse")).toBe(true);
  });
});


describe("suspensionOf", () => {
  it("puts the organization's first, reads a free account's older mark, then the account's", () => {
    expect(suspensionOf({ suspended: { at, why: "super" } }, { suspended: { at, why: "abuse" } })).toMatchObject({ scope: "org", why: "super" });
    expect(suspensionOf({ prospect: { since: at, terms: "x", suspendedAt: at } })).toMatchObject({ scope: "org", why: "super" });
    expect(suspensionOf({}, { suspended: { at, why: "abuse" } })).toMatchObject({ scope: "account" });
    expect(suspensionOf({}, {})).toBeUndefined();
  });

  it("says super's note, or the default", () => {
    expect(suspendText({ why: "super", note: " Talk soon. " })).toBe("Talk soon.");
    expect(suspendText({ why: "inactive" })).toBe(SUSPEND_DEFAULT.inactive);
    expect(suspendText({ why: "super", scope: "org" })).toMatch(/^This organization is suspended/);
  });
});


describe("canAskRecommission", () => {
  const org = { suspended: { at, why: "super" as const } };
  it("lets anyone ask for their own account and an admin for a colleague's or the organization", () => {
    const held = { userId: "u2", suspended: { at, why: "super" as const } };
    expect(canAskRecommission({ userId: "u2", access: "viewer" }, { scope: "account", userId: "u2" }, {}, held)).toBe(true);
    expect(canAskRecommission({ userId: "u3", access: "editor" }, { scope: "account", userId: "u2" }, {}, held)).toBe(false);
    expect(canAskRecommission({ userId: "u1", access: "admin" }, { scope: "account", userId: "u2" }, {}, held)).toBe(true);
    expect(canAskRecommission({ userId: "u1", access: "admin" }, { scope: "org" }, org)).toBe(true);
    expect(canAskRecommission({ userId: "u3", access: "editor" }, { scope: "org" }, org)).toBe(false);
    expect(canAskRecommission({ userId: "u1", access: "admin" }, { scope: "org" }, {})).toBe(false);
  });
});


describe("the inactivity clock", () => {
  it("reminds at each notice day, once, then suspends at the limit a week after the last reminder", () => {
    expect(dormantStep(29, 0)).toBeUndefined();
    expect(dormantStep(30, 0)).toBe("notice");
    expect(dormantStep(31, 1, 1)).toBeUndefined();
    expect(dormantStep(53, 2, 8)).toBe("notice");
    expect(dormantStep(INACTIVE_DAYS, 3, 7)).toBe("suspend");
    expect(dormantStep(INACTIVE_DAYS, 3, 2)).toBeUndefined();
  });

  it("sends every reminder first when the clock starts on an organization already long quiet", () => {
    expect(dormantStep(200, 0)).toBe("notice");
    expect(dormantStep(200, 1, 0.5)).toBeUndefined();
    expect(dormantStep(201, 1, 1)).toBe("notice");
    expect(dormantStep(202, 2, 1)).toBe("notice");
    expect(dormantStep(203, 3, 1)).toBeUndefined();
    expect(dormantStep(209, 3, 7)).toBe("suspend");
  });

  it("covers clients and downgraded clients, never free accounts, kept, test, or neon1's own", () => {
    expect(dormantCovered({ slug: "acme" })).toBe(true);
    expect(dormantCovered({ slug: "acme", prospect: { since: at, terms: "x" } })).toBe(false);
    expect(dormantCovered({ slug: "acme", prospect: { since: at, terms: "client", fromClient: "N1-0004" } })).toBe(true);
    expect(dormantCovered({ slug: "acme", keptAt: at })).toBe(false);
    expect(dormantCovered({ slug: "acme", test: true })).toBe(false);
    expect(dormantCovered({ slug: "neon1" })).toBe(false);
  });
});
