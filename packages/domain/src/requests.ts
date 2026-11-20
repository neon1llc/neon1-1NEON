// packages/domain/src/requests.ts - Asking neon1 for an assessment or a call from inside 1NEON: the
// windows, stated once for the API (which enforces them) and the web app (which says them). A window
// rolls from the moment of the request, so it never resets at a midnight in any time zone.


const DAY = 24 * 60 * 60 * 1000;

/** Days before a project already sent for assessment can be sent again */
export const ASSESSMENT_RESEND_DAYS = 14;
/** Days before a call can be asked for again */
export const CALL_RESEND_DAYS = 7;
/** Requests per organization in one seven-day window, both kinds together */
export const REQUESTS_PER_WEEK = 5;
/** The most projects one assessment request names */
export const REQUEST_PROJECTS_MAX = 3;

/** The moment a request made at `at` can be repeated */
export function requestAgainAt(at: string, kind: "assessment" | "call" = "assessment"): string {
  return new Date(Date.parse(at) + (kind === "call" ? CALL_RESEND_DAYS : ASSESSMENT_RESEND_DAYS) * DAY).toISOString();
}

/** Is a request made at `at` still waiting out its window at `now`? */
export function requestOpen(at: string | undefined, kind: "assessment" | "call" = "assessment", now: Date = new Date()): boolean {
  return Boolean(at) && Date.parse(requestAgainAt(at!, kind)) > now.getTime();
}
