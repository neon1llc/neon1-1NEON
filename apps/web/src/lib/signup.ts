// apps/web/src/lib/signup.ts - The sign-up form's small rules: when it can be sent, how long it was
// open, and what's sent. Kept apart from the form so they can be tested without a browser.


import { normalizeLink } from "@1neon/domain";


/** What a person types */
export interface SignUpFields {
  email: string;
  name: string;
  org: string;
  // Where the business is based, and its website or a public page: both optional
  place: string;
  link: string;
  // "How did you find us?": a FOUND_VIA key, or "" when they didn't say
  found?: string;
  terms: boolean;
}


// The same shape of address the sign-in screen accepts
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


/** Is the link field fine? Empty, or something that makes a web address */
export function linkOk(link: string) {
  return link.trim() === "" || normalizeLink(link) !== undefined;
}


/** Can the form be sent? Email, name, and organization filled, a link (if any) that works, and the terms
 * ticked (the API checks again). The place and link are optional */
export function signUpReady(f: SignUpFields) {
  return EMAIL.test(f.email.trim()) && f.name.trim().length > 0 && f.org.trim().length > 0 && linkOk(f.link) && f.terms;
}


/** Milliseconds the form has been open. The API treats a form filled faster than a person can as a bot,
 * so this is measured from when it was shown, never made up; a clock that went backwards counts as zero */
export function elapsedSince(shownAt: number, now = Date.now()) {
  return Math.max(0, Math.round(now - shownAt));
}


/** The body of POST /auth/signup. `website` is the hidden field: a person leaves it empty. `check` is
 * Turnstile's token, or "" when no site key is set (local runs) */
export function signUpBody(f: SignUpFields, extra: { check: string; website: string; elapsed: number; remember: boolean }) {
  return { email: f.email.trim(), name: f.name.trim(), org: f.org.trim(), place: f.place.trim(), link: f.link.trim(), ...(f.found ? { found: f.found } : {}), terms: true as const, check: extra.check, website: extra.website, elapsed: extra.elapsed, remember: extra.remember };
}


/** What GET /auth/signup answers */
export interface SignUpInfo {
  open: boolean;
  siteKey?: string;
  terms?: string;
}
