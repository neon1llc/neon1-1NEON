// apps/api/src/lib/guards.ts - Limits that keep one account from running away with the portal:
// change counters for everyone, and the prospect rules (packages/domain/src/prospect.ts) for people in
// an organization that signed itself up. neon1's operator is never limited inside a prospect
// organization, and its own change counter is the same as everyone's.


import { PROSPECT_LIMITS, isProspect, isSuspended, prospectFileAllowed, prospectMay } from "@1neon/domain";
import type { Context } from "hono";
import { fail, who, type Env } from "./http.ts";
import type { Kit } from "./kit.ts";


// Changes one person may make, for everyone and, tighter, for a prospect's own people
export const WRITE_LIMITS = {
  everyone: { hourly: 300, daily: 2000 },
  prospect: { hourly: 60, daily: 300 },
} as const;
// Counters only need to outlive the day they count
const KEEP_S = 2 * 24 * 60 * 60;

// Requests that cost money per use, which a prospect-only account may not make: Neo (Bedrock), and
// anything that sends a text message
const COSTLY: [method: string, path: RegExp][] = [
  ["POST", /\/neo$/],
  ["POST", /\/me\/phone\/(verify|confirm)$/],
  ["POST", /\/me\/text-factor$/],
  ["POST", /\/me\/confirm\/text$/],
];


/** True for a state-changing request */
const changes = (c: Context) => !["GET", "HEAD", "OPTIONS"].includes(c.req.method);


/** Count one change against a person's hourly and daily allowance; past either, the change is refused */
async function countChange(k: Pick<Kit, "repo">, scope: string, uid: string, limits: { hourly: number; daily: number }) {
  const hour = new Date().toISOString().slice(0, 13);
  const until = Math.floor(Date.now() / 1000) + KEEP_S;
  const h = await k.repo.table.increment("COUNTER", `WRITES#${scope}#${uid}#${hour}`, 1, until);
  const d = await k.repo.table.increment("COUNTER", `WRITES#${scope}#${uid}#${hour.slice(0, 10)}`, 1, until);
  if (h > limits.hourly || d > limits.daily) fail(429, "too_many_changes", "That's a lot of changes in a short time, so 1NEON is pausing yours for a while. Try again later, or email hello@neon1.tech.");
}


/**
 * Is this person limited to prospect rules everywhere? True when they aren't neon1 and every active
 * membership they hold is in a prospect organization (or they hold none)
 */
export async function prospectOnly(k: Pick<Kit, "repo">, uid: string, operator: boolean) {
  if (operator) return false;
  const active = (await k.repo.membershipsOf(uid)).filter((m) => m.status !== "deactivated");
  const tenants = await Promise.all(active.map((m) => k.repo.getTenant(m.tenantId)));
  return tenants.every((t) => !t || isProspect(t));
}


/** After sign-in: everyone's change counter, and no costly requests from prospect-only accounts */
export function accountGuard(k: Pick<Kit, "repo">) {
  return async (c: Context<Env>, next: () => Promise<void>) => {
    const { user, actor } = who(c);
    if (changes(c)) {
      await countChange(k, "ALL", user.id, WRITE_LIMITS.everyone);
      if (COSTLY.some(([m, re]) => m === c.req.method && re.test(c.req.path)) && (await prospectOnly(k, user.id, actor.operator))) {
        fail(403, "prospect_limit", "That opens once we're working together. Email hello@neon1.tech, or keep adding your needs here.");
      }
    }
    await next();
  };
}


// Requests this guard has already looked at; it's registered for "/t/:tid" and "/t/:tid/*", and a
// request matched by both must be counted once
const seen = new WeakSet<object>();

/** Inside an organization: a prospect's own people get the allowlist, a tighter counter, and nothing while suspended */
export function prospectGuard(k: Pick<Kit, "repo">) {
  return async (c: Context<Env>, next: () => Promise<void>) => {
    if (seen.has(c.req.raw)) return next();
    seen.add(c.req.raw);
    const tenant = c.get("tenant");
    const { user, actor } = who(c);
    if (isProspect(tenant) && !actor.operator) {
      if (isSuspended(tenant)) fail(403, "suspended", "This account is paused. Email hello@neon1.tech if you think that's a mistake.");
      // The path after /t/:tid, which the allowlist is written against
      const rest = c.req.path.replace(/^.*?\/t\/[^/]+/, "");
      if (!prospectMay(c.req.method, rest)) fail(403, "prospect_limit", "That opens once we're working together. Email hello@neon1.tech, or keep adding your needs here.");
      if (changes(c)) await countChange(k, "PROSPECT", user.id, WRITE_LIMITS.prospect);
      await next();
      // A real change that landed starts the quiet-prospect clock again (routes/prospects.ts). Marking
      // notifications seen and edit markers don't count
      if (changes(c) && c.res.status < 400 && !/^\/(notifications\/seen|projects\/[^/]+\/edits)/.test(rest)) {
        await k.repo.table.write([{ put: { PK: `T#${tenant.id}`, SK: "ACTIVE", at: new Date().toISOString() }, guard: { always: true } }]).catch(() => undefined);
      }
      return;
    }
    await next();
  };
}


// --- Prospect quotas -------------------------------------------------------

// Said when a quota is reached: what to do instead
const QUOTA_NEXT = "Email hello@neon1.tech, and we'll make room once we're working together.";

/** Is this request from a prospect's own person (neon1 is never limited)? */
const limited = (c: Context<Env>) => isProspect(c.get("tenant")) && !who(c).actor.operator;


/** Before a new project: a prospect keeps at most PROSPECT_LIMITS.projects live */
export async function projectQuota(k: Pick<Kit, "repo">, c: Context<Env>) {
  if (!limited(c)) return;
  const live = (await k.repo.listProjects(c.get("tenant").id)).filter((p) => !p.deletedAt);
  if (live.length >= PROSPECT_LIMITS.projects) fail(409, "quota_projects", `A new account holds up to ${PROSPECT_LIMITS.projects} projects. ${QUOTA_NEXT}`);
}


/** Before a new item: at most PROSPECT_LIMITS.itemsPerProject in one project */
export async function itemQuota(k: Pick<Kit, "repo">, c: Context<Env>, pid: string) {
  if (!limited(c)) return;
  const items = await k.repo.listItems(c.get("tenant").id, pid);
  if (items.length >= PROSPECT_LIMITS.itemsPerProject) fail(409, "quota_items", `A new account holds up to ${PROSPECT_LIMITS.itemsPerProject} items in a project. ${QUOTA_NEXT}`);
}


/** Before a new file: an allowed kind, at most the size, the count, and the total across the organization */
export async function fileQuota(k: Pick<Kit, "repo">, c: Context<Env>, f: { name: string; contentType: string; size: number }) {
  if (!limited(c)) return;
  if (!prospectFileAllowed(f.name, f.contentType)) fail(400, "file_type", "A new account can add PDFs, pictures, text, CSV, and Word, Excel, or PowerPoint files.");
  if (f.size > PROSPECT_LIMITS.fileBytes) fail(400, "file_size", `A new account can add files up to ${PROSPECT_LIMITS.fileBytes / 1024 / 1024} MB.`);
  const tid = c.get("tenant").id;
  const projects = await k.repo.listProjects(tid);
  // Every file record counts, uploading or failed included, so starting many at once can't slip past
  const docs = (await Promise.all([k.repo.listDocs(tid, undefined), ...projects.map((p) => k.repo.listDocs(tid, p.id))])).flat();
  if (docs.length >= PROSPECT_LIMITS.files) fail(409, "quota_files", `A new account holds up to ${PROSPECT_LIMITS.files} files. ${QUOTA_NEXT}`);
  const total = docs.reduce((n, x) => n + (x.size ?? 0), 0);
  if (total + f.size > PROSPECT_LIMITS.totalBytes) fail(409, "quota_bytes", `A new account holds up to ${PROSPECT_LIMITS.totalBytes / 1024 / 1024} MB of files. ${QUOTA_NEXT}`);
}
