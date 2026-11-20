// packages/domain/src/requests.ts - Asking neon1 for an assessment or a call from inside 1NEON: the limit,
// stated once for the API (which enforces it) and the web app (which says it). One request of each kind is
// open at a time, and a new one can go out REQUEST_COOLDOWN_DAYS after the last. The window rolls from the
// moment of the request; it is never a calendar day, so it doesn't reset at midnight in any time zone.


/** What can be asked for */
export type RequestKind = "assessment" | "call";

/** Days after a request before the same kind can be sent again from the same account */
export const REQUEST_COOLDOWN_DAYS = 7;

/** The most projects one assessment request can name (a free account holds three) */
export const REQUEST_PROJECTS_MAX = 10;

/** The moment a request made at `at` can be repeated */
export function requestAgainAt(at: string): string {
  return new Date(Date.parse(at) + REQUEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Is a request made at `at` still open (not yet repeatable) at `now`? */
export function requestOpen(at: string | undefined, now: Date = new Date()): boolean {
  return Boolean(at) && Date.parse(requestAgainAt(at!)) > now.getTime();
}
