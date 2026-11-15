// apps/web/src/lib/prospect.test.ts - The web's prospect rules: who is limited, how a prospect's state
// reads on neon1's list, and the sign-up form's small rules.


import { describe, expect, it } from "vitest";
import { limitedProspect, prospectEverywhere, prospectState, stateLabel } from "./prospect.ts";
import { elapsedSince, signUpBody, signUpProblems, signUpReady } from "./signup.ts";
import { widgetOptions } from "./turnstile.ts";


const since = "2026-11-15T10:00:00.000Z";
const prospect = { prospect: { since, terms: "2026-11-15" } };

describe("who is limited", () => {
  it("limits a prospect's own people, never neon1", () => {
    expect(limitedProspect(prospect, false)).toBe(true);
    expect(limitedProspect(prospect, true)).toBe(false);
    expect(limitedProspect({}, false)).toBe(false);
  });
  it("limits an account only when every organization of theirs is a prospect's", () => {
    expect(prospectEverywhere([prospect], false)).toBe(true);
    expect(prospectEverywhere([prospect, {}], false)).toBe(false);
    expect(prospectEverywhere([], false)).toBe(false);
    expect(prospectEverywhere([prospect], true)).toBe(false);
  });
});

describe("prospect state", () => {
  const p = prospect.prospect;
  it("orders suspended, kept, final notice, check-ins, active", () => {
    expect(prospectState({ ...p, suspendedAt: since, heldAt: since, warnedAt: since })).toBe("suspended");
    expect(prospectState({ ...p, heldAt: since, warnedAt: since })).toBe("kept");
    expect(prospectState({ ...p, warnedAt: since, notices: 2 })).toBe("final");
    expect(prospectState({ ...p, notices: 2 })).toBe("checked");
    expect(prospectState(p)).toBe("active");
  });
  it("says it in words", () => {
    expect(stateLabel({ ...p, notices: 1 })).toBe("Checked in once");
    expect(stateLabel({ ...p, notices: 2 })).toBe("Checked in 2 times");
    expect(stateLabel({ ...p, warnedAt: since })).toBe("Final notice sent");
    expect(stateLabel(p)).toBe("Active");
  });
});

describe("sign-up form", () => {
  const ok = { email: " a@b.co ", name: " Ana  Ruiz ", kind: "small", org: " Acme ", city: " Queens ", state: "NY", link: "", terms: true };
  it("needs every required field and the terms", () => {
    expect(signUpReady(ok)).toBe(true);
    expect(signUpReady({ ...ok, terms: false })).toBe(false);
    expect(signUpReady({ ...ok, org: " " })).toBe(false);
    expect(signUpReady({ ...ok, kind: "" })).toBe(false);
    expect(signUpReady({ ...ok, email: "nope" })).toBe(false);
  });
  it("asks an individual for no organization, and Something else for their words", () => {
    expect(signUpReady({ ...ok, kind: "individual", org: "" })).toBe(true);
    expect(signUpReady({ ...ok, kind: "other" })).toBe(false);
    expect(signUpReady({ ...ok, kind: "other", kindOther: "A family office" })).toBe(true);
    expect(signUpReady({ ...ok, found: "other" })).toBe(false);
    expect(signUpReady({ ...ok, found: "other", foundOther: "A podcast" })).toBe(true);
  });
  it("speaks field by field about what was typed", () => {
    expect(signUpProblems({ ...ok, name: "Ana" })).toEqual({ name: "Enter your first and last name." });
    expect(signUpProblems({ ...ok, name: "Ana", oneName: true })).toEqual({});
    expect(signUpProblems({ ...ok, city: "Albany", state: "" })).toHaveProperty("place");
    expect(signUpProblems({ ...ok, link: "not a link" })).toHaveProperty("link");
    expect(signUpProblems({ ...ok, email: "a@b" })).toHaveProperty("email");
  });
  it("takes the place and link as optional", () => {
    expect(signUpReady({ ...ok, city: "", state: "" })).toBe(true);
    expect(signUpReady({ ...ok, city: "", state: "NJ", link: "acme.com" })).toBe(true);
  });
  it("measures the time the form was open, never negative", () => {
    expect(elapsedSince(1000, 4500)).toBe(3500);
    expect(elapsedSince(5000, 1000)).toBe(0);
  });
  it("sends trimmed values, the place as City, ST, and only the answers that apply", () => {
    expect(signUpBody(ok, { check: "tok", website: "", elapsed: 5000, remember: true })).toEqual({ email: "a@b.co", name: "Ana Ruiz", kind: "small", org: "Acme", place: "Queens, NY", link: "", terms: true, check: "tok", website: "", elapsed: 5000, remember: true });
    expect(signUpBody({ ...ok, kind: "individual" }, { check: "", website: "", elapsed: 1, remember: false })).toMatchObject({ org: "" });
    expect(signUpBody({ ...ok, found: "other", foundOther: " A podcast " }, { check: "", website: "", elapsed: 1, remember: false })).toMatchObject({ found: "other", foundOther: "A podcast" });
    expect(signUpBody(ok, { check: "", website: "", elapsed: 1, remember: false })).not.toHaveProperty("found");
  });
  it("asks Turnstile for the invisible widget for sign-up", () => {
    const o = widgetOptions("key", { callback: () => undefined, expired: () => undefined, error: () => undefined });
    expect(o).toMatchObject({ sitekey: "key", action: "signup", appearance: "interaction-only", size: "flexible" });
  });
});
