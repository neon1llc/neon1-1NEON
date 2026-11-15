// apps/web/src/lib/signup.ts - The sign-up form's small rules: when it can be sent, how long it was
// open, and what's sent. Kept apart from the form so they can be tested without a browser.


import { emailShapeOk, joinPlace, nameProblem, normalizeLink, placeShapeProblem, textProblem } from "@1neon/domain";


/** What a person types. `kind` is "Which describes you best?"; `org` is asked for every answer but an
 * individual; `kindOther` and `foundOther` are their words for "Something else" and "Somewhere else" */
export interface SignUpFields {
  email: string;
  name: string;
  oneName?: boolean;
  kind: string;
  kindOther?: string;
  org: string;
  // Where the business is based (city and state, or the state alone) and its website: both optional
  city?: string;
  state?: string;
  link: string;
  found?: string;
  foundOther?: string;
  terms: boolean;
}


/** Is the link field fine? Empty, or something that makes a web address */
export function linkOk(link: string) {
  return link.trim() === "" || normalizeLink(link) !== undefined;
}


/** Does this answer need an organization's name? Every one but an individual's */
export const needsOrg = (kind: string) => kind !== "" && kind !== "individual";


/**
 * What the form can tell before sending, field by field: the same rules the API runs first (forms.ts),
 * so most problems show beside their field at once. The API's outside checks (a mail domain, a website
 * that answers, a real place) come back the same way after sending. Empty fields that are required are
 * left to the button, which stays off until they're filled; this only speaks about what was typed
 */
export function signUpProblems(f: SignUpFields): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.email.trim() && !emailShapeOk(f.email)) out.email = "Enter a full email address, like you@company.com.";
  const name = f.name.trim() ? nameProblem(f.name, f.oneName) : undefined;
  if (name) out.name = name;
  const kindOther = f.kind === "other" ? textProblem(f.kindOther ?? "", "what describes you") : undefined;
  if (kindOther) out.kindOther = kindOther;
  const org = needsOrg(f.kind) ? textProblem(f.org, "your organization's name") : undefined;
  if (org) out.org = org;
  if (!linkOk(f.link)) out.link = "Enter a web address, like yourbusiness.com.";
  const place = placeShapeProblem(f.city ?? "", f.state ?? "");
  if (place) out.place = place;
  const foundOther = f.found === "other" ? textProblem(f.foundOther ?? "", "where you found neon1") : undefined;
  if (foundOther) out.foundOther = foundOther;
  return out;
}


/** Can the form be sent? Every required field filled (an organization's name unless individual, their
 * words when they picked "Something else" or "Somewhere else"), nothing that fails the rules above, and
 * the terms ticked (the API checks all of it again) */
export function signUpReady(f: SignUpFields) {
  const filled = f.email.trim() && f.name.trim() && f.kind && (!needsOrg(f.kind) || f.org.trim()) && (f.kind !== "other" || f.kindOther?.trim()) && (f.found !== "other" || f.foundOther?.trim());
  return Boolean(filled) && Object.keys(signUpProblems(f)).length === 0 && f.terms;
}


/** Milliseconds the form has been open. The API treats a form filled faster than a person can as a bot,
 * so this is measured from when it was shown, never made up; a clock that went backwards counts as zero */
export function elapsedSince(shownAt: number, now = Date.now()) {
  return Math.max(0, Math.round(now - shownAt));
}


/** The body of POST /auth/signup. `website` is the hidden field: a person leaves it empty. `check` is
 * Turnstile's token, or "" when no site key is set (local runs) */
export function signUpBody(f: SignUpFields, extra: { check: string; website: string; elapsed: number; remember: boolean }) {
  return {
    email: f.email.trim(),
    name: f.name.trim().replace(/\s+/g, " "),
    ...(f.oneName ? { oneName: true } : {}),
    kind: f.kind,
    ...(f.kind === "other" ? { kindOther: (f.kindOther ?? "").trim() } : {}),
    org: needsOrg(f.kind) ? f.org.trim() : "",
    place: joinPlace(f.city ?? "", f.state ?? ""),
    link: f.link.trim(),
    ...(f.found ? { found: f.found } : {}),
    ...(f.found === "other" ? { foundOther: (f.foundOther ?? "").trim() } : {}),
    terms: true as const,
    check: extra.check,
    website: extra.website,
    elapsed: extra.elapsed,
    remember: extra.remember,
  };
}


/** What GET /auth/signup answers */
export interface SignUpInfo {
  open: boolean;
  siteKey?: string;
  terms?: string;
}
