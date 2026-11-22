// apps/web/src/lib/stepup.test.ts - Confirming with a passkey: each way it can stop says what happened.


import { beforeEach, describe, expect, it, vi } from "vitest";


// The API module reads the page address when it loads
vi.hoisted(() => { (globalThis as Record<string, unknown>).location = { pathname: "/1NEON/", search: "", hostname: "localhost", origin: "http://localhost" }; });

const calls: { body: unknown }[] = [];
let replies: unknown[] = [];
vi.mock("./api.ts", async () => {
  const real = await vi.importActual<typeof import("./api.ts")>("./api.ts");
  return { ...real, api: async (_p: string, init: { body: unknown }) => { calls.push({ body: init.body }); const r = replies.shift(); if (r instanceof Error) throw r; return r; } };
});
vi.mock("./passkey.ts", () => ({ passkeyAssertion: async () => "signed" }));

beforeEach(() => { calls.length = 0; replies = []; });


describe("confirmWithPasskey", () => {
  it("names the missing passkey and does not go on to answer", async () => {
    const { confirmWithPasskey, StepUpError, NO_PASSKEY } = await import("./stepup.ts");
    replies = [{ step: "no_passkey" }];
    const e = await confirmWithPasskey("a@b.co").catch((x) => x);
    expect(e).toBeInstanceOf(StepUpError);
    expect(e.kind).toBe("no_passkey");
    expect(e.message).toBe(NO_PASSKEY);
    expect(calls).toHaveLength(1);
  });

  it("says the check did not start when the API fails it, not that the connection is bad", async () => {
    const { confirmWithPasskey, stepUpMessage } = await import("./stepup.ts");
    replies = [{ step: "failed" }];
    const e = await confirmWithPasskey("a@b.co").catch((x) => x);
    expect(stepUpMessage(e)).toMatch(/didn't start/);
    expect(stepUpMessage(e)).not.toMatch(/reach/i);
  });

  it("finishes when the passkey is accepted, and says so when it is not", async () => {
    const { confirmWithPasskey, stepUpMessage } = await import("./stepup.ts");
    replies = [{ step: "passkey", options: {} }, { step: "done" }];
    await expect(confirmWithPasskey("a@b.co")).resolves.toBeUndefined();
    replies = [{ step: "passkey", options: {} }, { step: "failed" }];
    const e = await confirmWithPasskey("a@b.co").catch((x) => x);
    expect(stepUpMessage(e)).toMatch(/wasn't accepted/);
  });
});


describe("stepUpMessage", () => {
  it("separates a cancelled prompt, a refusal, an unconfirmed write, and a dead connection", async () => {
    const { stepUpMessage } = await import("./stepup.ts");
    const { HttpError, Unconfirmed } = await import("./api.ts");
    expect(stepUpMessage(new DOMException("no", "NotAllowedError"))).toMatch(/wasn't used/);
    expect(stepUpMessage(new HttpError(403, { error: "x", message: "That code didn't match." }))).toBe("That code didn't match.");
    expect(stepUpMessage(new Unconfirmed("POST", "/auth/step"))).toMatch(/couldn't confirm/);
    expect(stepUpMessage(new TypeError("Failed to fetch"))).toMatch(/Couldn't reach 1NEON/);
    expect(stepUpMessage(new Error("odd"))).toMatch(/didn't work/);
  });
});
