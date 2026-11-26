// packages/domain/src/prospect.ts - Prospects: organizations that signed themselves up from the site
// and aren't clients yet. Distrust before trust: a prospect's own people get a short allowlist of
// changes and small quotas until neon1 promotes the organization. neon1 acting inside a prospect
// organization is never limited by these rules. Shared by the API (enforcement) and the web app (hiding
// what would be refused), and tested in prospect.test.ts.


import type { Tenant } from "./model.ts";
import { DESCRIBES, type Describes } from "./forms.ts";


/** The portal terms edition shown at sign-up and recorded with it: the terms' "Last updated" date.
 * Change it whenever the terms in apps/web/src/legal change */
export const PORTAL_TERMS_EDITION = "2026-11-15";


/** "How did you find us?" on the sign-up form: optional, one answer. Ordered by where people most
 * likely come from (search and LinkedIn first), then the rest, with "other" last. Stored on the prospect
 * and shown only to neon1 */
export const FOUND_VIA = {
  google: "Google search",
  linkedin: "LinkedIn",
  referral: "A referral or word of mouth",
  maps: "Google Maps or Business Profile",
  github: "GitHub",
  upwork: "Upwork",
  blog: "The neon1 blog",
  ai: "An AI assistant",
  other: "Somewhere else",
} as const;
export type FoundVia = keyof typeof FOUND_VIA;


/** How a prospect found neon1, in words: the list's label, or their own words for "Somewhere else" */
export function foundLabel(p: { found?: string; foundOther?: string }): string {
  if (p.found === "other" && p.foundOther) return p.foundOther;
  return FOUND_VIA[p.found as FoundVia] ?? p.found ?? "";
}

/** Who a prospect said they are, in words: the list's label, or their own words for "Something else" */
export function describesLabel(p: { kind?: string; kindOther?: string }): string {
  if (p.kind === "other" && p.kindOther) return p.kindOther;
  return DESCRIBES[p.kind as Describes] ?? p.kind ?? "";
}
export const FOUND_KEYS = Object.keys(FOUND_VIA) as [FoundVia, ...FoundVia[]];


/** The limits on a prospect organization's own people */
export const PROSPECT_LIMITS = {
  // Live projects (trashed ones don't count)
  projects: 3,
  // Items in one project, of any kind
  itemsPerProject: 50,
  // Files across the organization, each file's size, and the total
  files: 10,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 50 * 1024 * 1024,
} as const;


/**
 * Quiet prospects (Pradeep, 2026-11-15): the clock counts days since the prospect's people last made a
 * real change (a project, item, comment, file, or event; signing in alone doesn't count). Friendly
 * check-ins go out at each PROSPECT_NUDGE_DAYS, a final notice at PROSPECT_FINAL_DAYS, and the
 * organization and its files are deleted PROSPECT_GRACE_DAYS after the final notice. Any real change
 * starts the clock again, and neon1 can hold a prospect it's talking to elsewhere. Clients are never deleted
 */
export const PROSPECT_NUDGE_DAYS = [7, 14] as const;
export const PROSPECT_FINAL_DAYS = 21;
export const PROSPECT_GRACE_DAYS = 9;


/** The day a quiet free account's clock counts from: its last real change, unless "Keep it 30 more
 * days" pushed the expiry further out. Keeping it (Pradeep, 2026-11-16) adds 30 days to the date
 * already shown, so pressing it early never loses days; `keptUntil` is that new date, and the clock
 * runs as if the last change were PROSPECT_FINAL_DAYS + PROSPECT_GRACE_DAYS before it */
export function prospectClock(lastActive: string, keptUntil?: string): string {
  if (!keptUntil) return lastActive;
  const day = 24 * 60 * 60 * 1000;
  const fromKeep = new Date(Date.parse(keptUntil) - (PROSPECT_FINAL_DAYS + PROSPECT_GRACE_DAYS) * day).toISOString();
  return fromKeep > lastActive ? fromKeep : lastActive;
}


/** The day a quiet free account is deleted if nothing changes: PROSPECT_GRACE_DAYS after the final
 * notice once it's gone out, else PROSPECT_FINAL_DAYS + PROSPECT_GRACE_DAYS (30) after the clock's
 * start (prospectClock) */
export function prospectDeleteOn(clock: string, warnedAt?: string): string {
  const day = 24 * 60 * 60 * 1000;
  const from = warnedAt ? Date.parse(warnedAt) + PROSPECT_GRACE_DAYS * day : Date.parse(clock) + (PROSPECT_FINAL_DAYS + PROSPECT_GRACE_DAYS) * day;
  return new Date(from).toISOString();
}


/** "Keep it 30 more days": the new expiry, 30 days past the one shown now (never earlier than 30
 * days from `at`, in case the shown date has already slipped past) */
export function prospectKeepUntil(currentDeleteOn: string, at: Date): string {
  const day = 24 * 60 * 60 * 1000;
  const keep = (PROSPECT_FINAL_DAYS + PROSPECT_GRACE_DAYS) * day;
  return new Date(Math.max(Date.parse(currentDeleteOn), at.getTime()) + keep).toISOString();
}


/**
 * Is a quiet free account due for deletion right now? Every condition the daily pass decided on,
 * checked again on the organization as it is now, so a hold, a suspension, a keep, or a change that
 * landed after the pass read it stops the deletion. Suspended accounts are never deleted by the
 * clock (Pradeep, 2026-11-16): they wait on neon1's review list until it resumes or deletes them
 */
export function quietDeletionDue(p: NonNullable<Tenant["prospect"]>, lastActive: string, at: Date): boolean {
  if (p.heldAt || p.suspendedAt || p.deletingAt) return false;
  // A real change after the last email restarts the emails, so it can't be due
  if (p.noticeAt && lastActive > p.noticeAt) return false;
  const day = 24 * 60 * 60 * 1000;
  const clock = prospectClock(lastActive, p.keptUntil);
  const step = quietStep((at.getTime() - Date.parse(clock)) / day, p.notices ?? 0, p.warnedAt ? (at.getTime() - Date.parse(p.warnedAt)) / day : undefined);
  return step === "delete";
}


/** Which quiet-prospect email is due, given quiet days and how many have gone out (`sent`):
 * a check-in, the final notice, deletion, or nothing yet */
export function quietStep(quietDays: number, sent: number, finalAgeDays?: number): "nudge" | "final" | "delete" | undefined {
  if (finalAgeDays !== undefined) return finalAgeDays >= PROSPECT_GRACE_DAYS ? "delete" : undefined;
  if (quietDays >= PROSPECT_FINAL_DAYS) return "final";
  const due = PROSPECT_NUDGE_DAYS.filter((d) => quietDays >= d).length;
  return due > sent ? "nudge" : undefined;
}


/** The kinds of file a prospect may upload: documents and pictures, never programs or archives.
 * Each entry pairs the declared type with the extensions that may carry it; both must agree */
export const PROSPECT_FILE_TYPES: Record<string, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
};


/** The extensions a prospect may upload, for the file picker's accept list */
export const PROSPECT_ACCEPT = Object.values(PROSPECT_FILE_TYPES).flat().map((e) => `.${e}`).join(",");


/** May a prospect upload a file with this name and declared type? */
export function prospectFileAllowed(name: string, contentType: string): boolean {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  const allowed = PROSPECT_FILE_TYPES[contentType.trim().toLowerCase()];
  return Boolean(ext && allowed?.includes(ext));
}


/** Is this organization a prospect (signed itself up, not yet promoted)? */
export const isProspect = (t: Pick<Tenant, "prospect"> | undefined) => Boolean(t?.prospect);

/** Is this prospect organization suspended, or being deleted? Its members are refused everything */
export const isSuspended = (t: Pick<Tenant, "prospect"> | undefined) => Boolean(t?.prospect?.suspendedAt || t?.prospect?.deletingAt);


// The changes a prospect's own people may make, by method and path under /t/:tid. Anything not listed
// is refused: inviting people, settings, signing, approvals, proposals, quotes, invoices, and payments
const ALLOWED: [method: string, path: RegExp][] = [
  // Where they're based and their link, which sign-up asked for
  ["PUT", /^\/profile$/],
  ["POST", /^\/projects$/],
  ["PATCH", /^\/projects\/[^/]+$/],
  ["DELETE", /^\/projects\/[^/]+$/],
  ["POST", /^\/projects\/[^/]+\/move$/],
  ["POST", /^\/projects\/[^/]+\/items$/],
  ["PATCH", /^\/projects\/[^/]+\/items\/[^/]+$/],
  ["DELETE", /^\/projects\/[^/]+\/items\/[^/]+$/],
  ["POST", /^\/projects\/[^/]+\/items\/[^/]+\/comments$/],
  ["DELETE", /^\/projects\/[^/]+\/items\/[^/]+\/comments\/[^/]+$/],
  ["POST", /^\/projects\/[^/]+\/edits$/],
  ["DELETE", /^\/projects\/[^/]+\/edits\/[^/]+$/],
  ["POST", /^\/events$/],
  ["PATCH", /^\/events\/[^/]+$/],
  ["DELETE", /^\/events\/[^/]+$/],
  ["POST", /^\/docs$/],
  ["POST", /^\/docs\/[^/]+\/done$/],
  ["DELETE", /^\/docs\/[^/]+$/],
  ["POST", /^\/notifications\/(read-all|[^/]+\/read)$/],
  // The organization's chat with neon1: writing, and editing one's own message
  ["POST", /^\/chat$/],
  ["PATCH", /^\/chat\/[^/]+$/],
  ["POST", /^\/chat\/[^/]+\/report$/],
  // Asking neon1 for an assessment or a call: the point of a free account
  ["POST", /^\/requests$/],
  ["PUT", /^\/requests\/assessment$/],
  ["DELETE", /^\/requests\/assessment$/],
  // Keeping a quiet account 30 more days, once (routes/prospects.ts)
  ["POST", /^\/keep$/],
];


/**
 * May a prospect's own person make this request? `rest` is the path after /t/:tid ("" for the
 * organization itself). Reads are always allowed; changes only when listed above
 */
export function prospectMay(method: string, rest: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return true;
  const path = rest.replace(/\/+$/, "");
  return ALLOWED.some(([am, re]) => am === m && re.test(path));
}


/** The prospect number's form: NP-0001 */
export function formatProspectId(n: number): string {
  return `NP-${String(n).padStart(4, "0")}`;
}
