// packages/domain/src/prospect.ts - Prospects: organizations that signed themselves up from the site
// and aren't clients yet. Distrust before trust: a prospect's own people get a short allowlist of
// changes and small quotas until neon1 promotes the organization. neon1 acting inside a prospect
// organization is never limited by these rules. Shared by the API (enforcement) and the web app (hiding
// what would be refused), and tested in prospect.test.ts.


import type { Tenant } from "./model.ts";


/** The portal terms edition shown at sign-up and recorded with it: the terms' "Last updated" date.
 * Change it whenever the terms in apps/web/src/legal change */
export const PORTAL_TERMS_EDITION = "2026-11-15";


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
 * starts the clock again. Clients are never deleted
 */
export const PROSPECT_NUDGE_DAYS = [30, 60] as const;
export const PROSPECT_FINAL_DAYS = 90;
export const PROSPECT_GRACE_DAYS = 14;


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

/** Is this prospect organization suspended? Its members are refused everything until it's resumed */
export const isSuspended = (t: Pick<Tenant, "prospect"> | undefined) => Boolean(t?.prospect?.suspendedAt);


// The changes a prospect's own people may make, by method and path under /t/:tid. Anything not listed
// is refused: inviting people, settings, signing, approvals, proposals, quotes, invoices, and payments
const ALLOWED: [method: string, path: RegExp][] = [
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
  ["POST", /^\/notifications\/seen$/],
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
