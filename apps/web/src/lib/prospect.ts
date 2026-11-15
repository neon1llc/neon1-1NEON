// apps/web/src/lib/prospect.ts - What the web app needs to know about prospects: whether to limit what
// a person sees, how an organization's prospect state reads on the operator's list, and the plain
// words for it. The rules themselves live in packages/domain/src/prospect.ts, shared with the API.


import { isProspect, isSuspended, type Tenant } from "@1neon/domain";


/** The same link neon1.tech uses for "Book a call" */
export const BOOK_A_CALL = "https://calendly.com/1isgladtobeofservice/neon1-consultation";


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
export type ProspectState = "suspended" | "kept" | "final" | "checked" | "active";
/** In this order: suspended is what the person sees, kept means no reminders or deletion, then the
 * quiet-prospect emails (the final notice, then check-ins), which a real change by them clears */
export function prospectState(p: NonNullable<Tenant["prospect"]>): ProspectState {
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
  return { suspended: "Suspended", kept: "Kept", final: "Final notice sent", active: "Active" }[s];
}


/** One row of GET /prospects */
export interface ProspectRow {
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
  files: number;
  lastActive?: string;
}


/** GET /prospects */
export interface ProspectsResponse {
  prospects: ProspectRow[];
  // open: sign-up is on right now; configured: the server allows it at all; paused: neon1 paused it
  signup: { open: boolean; configured: boolean; paused: boolean; pending: number };
}
