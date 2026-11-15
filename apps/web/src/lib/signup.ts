// apps/web/src/lib/signup.ts - The sign-up form's small rules: when it can be sent, how long it was
// open, and what's sent. Kept apart from the form so they can be tested without a browser.


/** What a person types */
export interface SignUpFields {
  email: string;
  name: string;
  org: string;
  terms: boolean;
}


// The same shape of address the sign-in screen accepts
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


/** Can the form be sent? Every field filled and the terms ticked (the API checks again) */
export function signUpReady(f: SignUpFields) {
  return EMAIL.test(f.email.trim()) && f.name.trim().length > 0 && f.org.trim().length > 0 && f.terms;
}


/** Milliseconds the form has been open. The API treats a form filled faster than a person can as a bot,
 * so this is measured from when it was shown, never made up; a clock that went backwards counts as zero */
export function elapsedSince(shownAt: number, now = Date.now()) {
  return Math.max(0, Math.round(now - shownAt));
}


/** The body of POST /auth/signup. `website` is the hidden field: a person leaves it empty. `check` is
 * Turnstile's token, or "" when no site key is set (local runs) */
export function signUpBody(f: SignUpFields, extra: { check: string; website: string; elapsed: number; remember: boolean }) {
  return { email: f.email.trim(), name: f.name.trim(), org: f.org.trim(), terms: true as const, check: extra.check, website: extra.website, elapsed: extra.elapsed, remember: extra.remember };
}


/** What GET /auth/signup answers */
export interface SignUpInfo {
  open: boolean;
  siteKey?: string;
  terms?: string;
}
