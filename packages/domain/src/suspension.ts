// packages/domain/src/suspension.ts - Suspensions, recommissioning, and the inactivity clock. A suspended
// organization or account can still sign in, read everything, and edit its own profile; every other change
// is refused until super recommissions it. Nothing is ever deleted by a suspension. Shared by the API
// (enforcement, the daily pass) and the web app (banner, hiding what would be refused). Tested in
// suspension.test.ts.


import { z } from "zod";
import { id, isoDate, type Member, type Suspension, type SuspendWhy, type Tenant } from "./model.ts";


/**
 * The inactivity clock (Pradeep, 2026-11-27): days since anyone but super in the organization last signed in
 * or changed something. Reminders go to its admins at INACTIVE_NOTICE_DAYS, the last a week ahead, and it is
 * suspended with an automatic reason at INACTIVE_DAYS. Covers clients and clients super downgraded; free
 * accounts keep their own clock (prospect.ts), and a kept, test, or already suspended organization is skipped
 */
export const INACTIVE_DAYS = 60;
export const INACTIVE_NOTICE_DAYS = [30, 45, 53] as const;


/** The banner's words when super gave none, one per reason, for an account; an organization's say so */
export const SUSPEND_DEFAULT: Record<SuspendWhy, string> = {
  super: "This account is suspended. You can look around, pay invoices, and edit your profile until it's recommissioned.",
  inactive: `No activity for ${INACTIVE_DAYS} days, so this organization is suspended. Ask to recommission it to pick up where you left off.`,
  abuse: "Suspended for messages that broke the portal's rules.",
};
const ORG_DEFAULT = "This organization is suspended. You can look around, pay invoices, and edit your profile until it's recommissioned.";


/** The suspension in force for this person here, the organization's first; undefined when free to act.
 * A free account's older `prospect.suspendedAt` reads as super's own suspension */
export function suspensionOf(t: Pick<Tenant, "suspended" | "prospect"> | undefined, m?: Pick<Member, "suspended">): (Suspension & { scope: "org" | "account" }) | undefined {
  if (t?.suspended) return { ...t.suspended, scope: "org" };
  if (t?.prospect?.suspendedAt) return { at: t.prospect.suspendedAt, why: "super", scope: "org" };
  if (m?.suspended) return { ...m.suspended, scope: "account" };
  return undefined;
}


/** What the banner says */
export const suspendText = (s: Pick<Suspension, "why" | "note"> & { scope?: "org" | "account" }) => s.note?.trim() || (s.scope === "org" && s.why === "super" ? ORG_DEFAULT : SUSPEND_DEFAULT[s.why]);


// Changes a suspended person may still make, by method and path under /t/:tid: asking for recommissioning,
// marking notifications read, paying an invoice (money owed is never held up), and (except after abuse)
// writing to super in the chat
const ALWAYS: [method: string, path: RegExp][] = [
  ["POST", /^\/recommission$/],
  ["POST", /^\/projects\/[^/]+\/invoices\/[^/]+\/pay$/],
  ["POST", /^\/notifications\/(read-all|[^/]+\/read)$/],
];
const CHAT: [method: string, path: RegExp][] = [
  ["POST", /^\/chat$/],
  ["PATCH", /^\/chat\/[^/]+$/],
];


/** May a suspended person make this request? `rest` is the path after /t/:tid. Reads are always allowed */
export function suspendedMay(method: string, rest: string, why: SuspendWhy): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return true;
  const path = rest.replace(/\/+$/, "");
  const list = why === "abuse" ? ALWAYS : [...ALWAYS, ...CHAT];
  return list.some(([am, re]) => am === m && re.test(path));
}


// --- Recommissioning ---------------------------------------------------------

/** A request to lift a suspension: for the whole organization, or for one account in it */
export const RecommissionScope = z.enum(["org", "account"]);
export const Recommission = z.object({
  id: id,
  tenantId: id,
  orgName: z.string().max(120),
  scope: RecommissionScope,
  // The account to lift, for scope "account"
  userId: id.optional(),
  userName: z.string().max(120).optional(),
  by: id,
  byName: z.string().max(120),
  reason: z.string().trim().min(1).max(1000),
  at: isoDate,
  state: z.enum(["open", "done", "dismissed"]),
  closedAt: isoDate.optional(),
});
export type Recommission = z.infer<typeof Recommission>;
export const RecommissionAsk = z.object({ scope: RecommissionScope, userId: id.optional(), reason: z.string().trim().min(1, "Say why it should be recommissioned.").max(1000) });


/**
 * May this member ask to lift this suspension? Anyone may ask for their own account; an admin may also ask
 * for a colleague's and for the organization. Only something actually suspended can be asked for
 */
export function canAskRecommission(
  asker: Pick<Member, "userId" | "access">,
  ask: { scope: "org" | "account"; userId?: string },
  t: Pick<Tenant, "suspended" | "prospect">,
  target?: Pick<Member, "userId" | "suspended">,
): boolean {
  if (ask.scope === "org") return asker.access === "admin" && suspensionOf(t)?.scope === "org";
  if (!target?.suspended) return false;
  return target.userId === asker.userId || asker.access === "admin";
}


// --- Inactivity --------------------------------------------------------------

/** Does the inactivity clock cover this organization? */
export function dormantCovered(t: Pick<Tenant, "slug" | "test" | "keptAt" | "suspended" | "prospect" | "deletingAt">): boolean {
  if (t.deletingAt || t.test || t.keptAt || t.suspended || t.slug === "neon1") return false;
  // Self-signed-up free accounts have their own clock; a downgraded client does not
  return !t.prospect || Boolean(t.prospect.fromClient && !t.prospect.suspendedAt && !t.prospect.deletingAt);
}


/** Days between the last reminder and the suspension, at the least */
export const INACTIVE_LAST_NOTICE_DAYS = 7;


/**
 * What the clock does now, given quiet days, reminders sent since the last activity, and days since the last
 * one. Every reminder goes out before a suspension, the last at least a week ahead, so an organization already
 * long quiet when the clock starts gets its reminders first rather than a sudden suspension
 */
export function dormantStep(quietDays: number, sent: number, sinceNotice = Infinity): "notice" | "suspend" | undefined {
  if (sent < INACTIVE_NOTICE_DAYS.length) return quietDays >= INACTIVE_NOTICE_DAYS[sent]! && sinceNotice >= 1 ? "notice" : undefined;
  return quietDays >= INACTIVE_DAYS && sinceNotice >= INACTIVE_LAST_NOTICE_DAYS ? "suspend" : undefined;
}


// --- Abuse ---------------------------------------------------------------------

/** Automatic chat mutes (chatguard) in ABUSE_WINDOW_DAYS that suspend the account for abuse */
export const ABUSE_MUTES_TO_SUSPEND = 3;
export const ABUSE_WINDOW_DAYS = 30;
