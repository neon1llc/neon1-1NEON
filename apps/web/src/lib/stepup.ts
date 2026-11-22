// apps/web/src/lib/stepup.ts - Confirming a session with a passkey, and saying plainly why it did not work.


import { api, HttpError, Unconfirmed } from "./api.ts";
import { passkeyAssertion } from "./passkey.ts";


/** A reason the passkey check could not run or finish, worded for the person */
export class StepUpError extends Error {
  constructor(message: string, readonly kind: "no_passkey" | "other" = "other") {
    super(message);
  }
}

export const NO_PASSKEY = "No passkey works on this site yet. Add one on your profile, or use a code.";


/** Confirm with a passkey: a fresh passkey sign-in for the same email, which marks the session strong */
export async function confirmWithPasskey(email: string) {
  const r = await api<{ step: string; options?: unknown }>("/auth/step", { method: "POST", body: { op: "start", email, prefer: "passkey" } });
  if (r.step === "no_passkey") throw new StepUpError(NO_PASSKEY, "no_passkey");
  if (r.step === "failed") throw new StepUpError("The passkey check didn't start. Try again in a minute, or use a code.");
  if (r.step !== "passkey") throw new StepUpError("This account has no passkey yet. Add one on your profile, or use a code.", "no_passkey");
  const credential = await passkeyAssertion(r.options as Parameters<typeof passkeyAssertion>[0]);
  const done = await api<{ step: string }>("/auth/step", { method: "POST", body: { op: "answer", kind: "passkey", value: credential } });
  if (done.step !== "done") throw new StepUpError("The passkey wasn't accepted. Try again, or use a code.");
}


/** What happened, in words: only a request that never got an answer reads as a connection problem */
export function stepUpMessage(e: unknown): string {
  if (e instanceof StepUpError) return e.message;
  if (e instanceof DOMException) return "The passkey wasn't used. Try again when you're ready.";
  if (e instanceof HttpError) return e.body.message || "1NEON refused that. Try again, or use a code.";
  if (e instanceof Unconfirmed) return "We couldn't confirm whether that finished. Try again in a moment.";
  if (e instanceof TypeError) return "Couldn't reach 1NEON. Check your connection and try again.";
  return "That didn't work. Try again, or use a code.";
}
