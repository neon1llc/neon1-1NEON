// apps/web/src/lib/prospect.ts - What the web app needs to know about prospects: whether to limit what
// a person sees, how an organization's prospect state reads on the operator's list, and the plain
// words for it. The rules themselves live in packages/domain/src/prospect.ts, shared with the API.


import { isProspect, isSuspended, PROSPECT_LIMITS, type Tenant } from "@1neon/domain";


/** The same link neon1.tech uses for "Book a call" */
export const BOOK_A_CALL = "https://calendly.com/1isgladtobeofservice/neon1-consultation";


/** Why "Request assessment" is off, in the words shown beside it; undefined when nothing stops it. A note that has a problem
 * says so under its own box, so this only points there */
export function askBlocker(o: { chosen: number; several: boolean; note: string; noteProblem?: string }): string | undefined {
  const noNote = !o.note.trim();
  if (noNote && o.chosen === 0 && o.several) return "Add a note and choose a project to enable this.";
  if (noNote) return "Add a note to enable this.";
  if (o.noteProblem) return "Fix the note to enable this.";
  if (o.chosen === 0) return "Choose a project to enable this.";
  return undefined;
}


/** What a free account's file area holds, in one line: the same numbers the API refuses at (PROSPECT_LIMITS) */
export function fileLimitsLine(): string {
  const mb = (bytes: number) => bytes / 1024 / 1024;
  return `Up to ${PROSPECT_LIMITS.files} files, ${mb(PROSPECT_LIMITS.fileBytes)} MB each and ${mb(PROSPECT_LIMITS.totalBytes)} MB in all.`;
}


/** Is this person limited as a prospect here? neon1 acting inside a prospect organization never is,
 * which is also what the API does, so nothing is hidden that would have worked */
export function limitedProspect(org: Pick<Tenant, "prospect"> | undefined, operator: boolean) {
  return !operator && isProspect(org);
}


/** Is this person limited everywhere? True when they aren't neon1 and every organization they belong
 * to (all known) is a prospect's; used for account-level things such as Neo and texts */
export function prospectEverywhere(orgs: (Pick<Tenant, "prospect"> | undefined)[], operator: boolean) {
  return !operator && orgs.length > 0 && orgs.every((o) => isProspect(o));
}


/** Where a prospect stands, for the operator's list */
export type ProspectState = "deleting" | "suspended" | "kept" | "final" | "checked" | "active";
/** In this order: suspended is what the person sees, kept means no reminders or deletion, then the
 * quiet-prospect emails (the final notice, then check-ins), which a real change by them clears */
export function prospectState(p: NonNullable<Tenant["prospect"]>): ProspectState {
  if (p.deletingAt) return "deleting";
  if (isSuspended({ prospect: p })) return "suspended";
  if (p.heldAt) return "kept";
  if (p.warnedAt) return "final";
  if (p.notices) return "checked";
  return "active";
}
/** The state in words; check-ins say how many */
export function stateLabel(p: NonNullable<Tenant["prospect"]>) {
  const s = prospectState(p);
  if (s === "checked") return p.notices === 1 ? "Checked in once" : `Checked in ${p.notices} times`;
  return { deleting: "Being deleted", suspended: "Suspended", kept: "Kept", final: "Final notice sent", active: "Active" }[s];
}


/** One row of GET /prospects */
export interface ProspectRow {
  linkedin?: string;
  id: string;
  slug: string;
  name: string;
  clientId: string;
  // Where they're based and their website or public page, as given at sign-up
  place?: string;
  link?: string;
  prospect: NonNullable<Tenant["prospect"]>;
  people: { name: string; email: string }[];
  projects: number;
  // Files and their bytes as the quota counts them, trashed projects included
  files: number;
  bytes?: number;
  lastActive?: string;
  // When the clock deletes it if nothing changes; none while kept, suspended, or being deleted
  deleteOn?: string;
}


/** GET /prospects */
export interface ProspectsResponse {
  prospects: ProspectRow[];
  // open: sign-up is on right now; configured: the server allows it at all; paused: neon1 paused it
  signup: { open: boolean; configured: boolean; paused: boolean; pending: number };
}
