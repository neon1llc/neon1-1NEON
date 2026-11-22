// apps/api/src/auth.test.ts - On-page sign-in against a scripted Cognito: the choice step when a passkey was asked for and none is offered.


import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { CognitoAuth } from "./auth.ts";


// Cognito's answers in order, and the calls made to it
function build(script: Record<string, unknown>[]) {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const auth = new CognitoAuth({ userPoolId: "us-east-1_test", clientId: "client", authDomain: "auth.example", publicUrl: "https://dev.neon1.tech" });
  (auth as unknown as { idp: unknown }).idp = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      calls.push({ name: cmd.constructor.name, input: cmd.input });
      const next = script.shift();
      if (!next) throw new Error("script ran out");
      return next;
    },
  };
  return { auth, calls };
}

// Runs one auth call inside a request, returning its answer and the cookies it set
async function run(fn: (c: import("hono").Context) => Promise<unknown>, cookie = "") {
  const app = new Hono();
  let out: unknown;
  app.post("/", async (c) => { out = await fn(c); return c.text("ok"); });
  const res = await app.request("/", { method: "POST", headers: cookie ? { cookie } : {} });
  return { out: out as { next: { step: string; methods?: string[] } }, cookies: res.headers.get("set-cookie") ?? "" };
}


describe("a passkey asked for", () => {
  it("says no passkey works here, and sends no code, when Cognito offers only an email code", async () => {
    const { auth, calls } = build([{ ChallengeName: "SELECT_CHALLENGE", Session: "s1", AvailableChallenges: ["EMAIL_OTP"] }]);
    const { out } = await run((c) => auth.start(c, "pradeep@neon1.tech", true, "passkey"));
    expect(out.next.step).toBe("no_passkey");
    // Only the start call: nothing answered the choice, so no code was emailed
    expect(calls.map((x) => x.name)).toEqual(["InitiateAuthCommand"]);
  });

  it("goes straight to the passkey when Cognito offers it", async () => {
    const { auth } = build([{ ChallengeName: "WEB_AUTHN", Session: "s2", ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: "{\"challenge\":\"abc\"}" } }]);
    const { out } = await run((c) => auth.start(c, "pradeep@neon1.tech", true, "passkey"));
    expect(out.next.step).toBe("passkey");
  });
});


describe("a plain sign-in", () => {
  it("sends the code at once when only a code is on offer, using the session in Cognito's answer", async () => {
    const { auth, calls } = build([
      { ChallengeName: "SELECT_CHALLENGE", Session: "s1", AvailableChallenges: ["EMAIL_OTP"] },
      { ChallengeName: "EMAIL_OTP", Session: "s2" },
    ]);
    // No step cookie reaches the request: the session must come from the answer, not the cookie
    const { out } = await run((c) => auth.start(c, "raj@example.com"));
    expect(out.next.step).toBe("code");
    expect(calls[1]!.name).toBe("RespondToAuthChallengeCommand");
    expect(calls[1]!.input).toMatchObject({ ChallengeName: "SELECT_CHALLENGE", Session: "s1", ChallengeResponses: { ANSWER: "EMAIL_OTP" } });
  });

  it("offers the choice when a passkey and a code are both on offer", async () => {
    const { auth, calls } = build([{ ChallengeName: "SELECT_CHALLENGE", Session: "s1", AvailableChallenges: ["WEB_AUTHN", "EMAIL_OTP"] }]);
    const { out } = await run((c) => auth.start(c, "raj@example.com"));
    expect(out.next).toEqual({ step: "choose", methods: ["passkey", "code"] });
    expect(calls).toHaveLength(1);
  });

  it("fails when nothing is on offer", async () => {
    const { auth } = build([{ ChallengeName: "SELECT_CHALLENGE", Session: "s1", AvailableChallenges: [] }]);
    const { out } = await run((c) => auth.start(c, "raj@example.com"));
    expect(out.next.step).toBe("failed");
  });
});
