// apps/api/src/routes/prospects.ts - neon1's side of sign-up: the prospects list (Pradeep's review
// queue), promoting a prospect to a client, suspending and resuming one, deleting one, and the switch
// that pauses sign-up. Operator only; every change needs a confirmed session (manage_orgs). Also the
// daily quiet-prospect pass: check-ins, a final notice, then deletion (prospect.ts quietStep), and the
// two-step deletion itself (startPurge, then finishPurge after requests drain). Clients are never
// deleted by it, and neither are suspended accounts, which wait on neon1's review list.


import { PROSPECT_GRACE_DAYS, can, formatClientId, isProspect, prospectClock, prospectDeleteOn, prospectKeepUntil, quietDeletionDue, quietStep, type Tenant } from "@1neon/domain";
import type { Context } from "hono";
import { z } from "zod";
import { body, check, fail, need, now, who, type Env } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { sentAt, type SenderKind } from "../mail.ts";
import { factMail, subjectOf } from "../lib/factmail.ts";
import { keys } from "../store/repo.ts";
import type { WriteOp } from "../store/types.ts";
import { SIGNUP_PK, SIGNUP_SWITCH, signupOpen } from "./signup.ts";


const DAY_MS = 24 * 60 * 60 * 1000;


/** When the prospect's own people last made a real change (lib/guards.ts marks it); its sign-up time if never */
async function lastActive(k: Pick<Kit, "repo">, t: Tenant) {
  const row = await k.repo.table.get(`T#${t.id}`, "ACTIVE");
  return [t.prospect?.since ?? t.createdAt, row?.at ? String(row.at) : ""].filter(Boolean).sort().at(-1)!;
}


/** A step that talks to another service, tried three times before it counts as failed */
async function retried(step: () => Promise<void>) {
  for (let i = 0; ; i++) {
    try {
      return await step();
    } catch (e) {
      if (i >= 2) throw e;
    }
  }
}


/** Deletion stopped short: what's left is kept, the organization stays marked, and the next pass retries */
export class PurgeIncomplete extends Error {
  constructor(readonly tenant: string, readonly failed: string[]) {
    super(`purgeProspect: ${failed.length} step(s) failed for ${tenant}`);
  }
}


// --- Deleting a free account -------------------------------------------------
//
// Deletion runs in two steps so nothing can slip past it:
//
// 1. Start (startPurge). The organization is marked as being deleted and a durable job row is made,
//    together, in one transaction guarded by the organization's version. A promotion, a hold, a
//    suspension, or a "Keep it" that lands first makes the guard fail, and for a quiet account every
//    expiry condition is checked again on the organization as it is now (quietDeletionDue). From the
//    mark on, its people are refused everything (lib/guards.ts prospectGuard).
//
// 2. Finish (finishPurge), at least PURGE_DRAIN_MS later. A request that read the organization just
//    before the mark can still be running, and an upload link handed out before it can still be used,
//    so nothing is listed until both have run out. Then a quiet account's last change is checked one
//    final time (a change that landed during the wait cancels the deletion), and the full inventory
//    (every partition, file, and sign-in account) is written to the job row before anything is
//    removed. A pass cut short resumes from that inventory, not from whatever records are left, so a
//    project whose own record went first is still found. Files and sign-in accounts go before any
//    row; then every row; then each step is checked. Only when every check passes does one last
//    transaction remove the organization's own record and the job row and write the receipt.

/** The job rows, one per organization being deleted, outside every partition the deletion removes */
export const PURGE_PK = "PURGE";
/** How long to wait after the mark: the longest request (28 s), the life of an upload link (300 s),
 *  and a minute to spare */
export const PURGE_DRAIN_MS = (28 + 300 + 60) * 1000;


/** What a deletion removes, written once the wait is over and kept until every step is checked */
interface Inventory {
  slug: string;
  // Every partition of the organization's rows
  pks: string[];
  // Rows in global partitions (file sweeps, reply-by-email tokens) are found by exact key
  globalRows?: { PK: string; SK: string }[];
  // Every stored file's key
  files: string[];
  // People who belonged nowhere else when it was taken
  accounts: { uid: string; email: string }[];
}

interface PurgeJob {
  PK: string;
  SK: string;
  markedAt: string;
  reason: "operator" | "quiet";
  // For a quiet deletion: the last change it was decided on
  quietSince?: string;
  inventory?: Inventory;
  // Progress, so a retry doesn't repeat what's done
  filesDone?: string[];
  accountsDone?: string[];
  attempts?: number;
  version: number;
}

type PurgeKit = Pick<Kit, "repo" | "d" | "cfg">;


/** Mark a prospect for deletion and make its job row, together. Refuses a client outright, so a
 * mistake can never reach client records. With `quiet`, the deletion is for being quiet and goes
 * ahead only if every expiry condition still holds on the organization read fresh here. Returns
 * whether deletion has begun (an organization already being deleted counts) */
export async function startPurge(k: PurgeKit, tid: string, opts: { quiet?: boolean; at?: Date } = {}) {
  const { repo } = k;
  const at = opts.at ?? new Date();
  const t = await repo.getTenant(tid);
  if (!t || !isProspect(t)) throw new Error("purgeProspect: not a prospect");
  const job = await repo.table.get(PURGE_PK, tid);
  if (t.prospect!.deletingAt) {
    // Marked by an earlier version that kept no job row: make one, counting the wait from the mark
    if (!job) await repo.table.write([{ put: { PK: PURGE_PK, SK: tid, markedAt: t.prospect!.deletingAt, reason: "operator", version: 1 }, guard: { create: true } }]);
    return { started: true as const };
  }
  const last = await lastActive(k, t);
  if (opts.quiet && !quietDeletionDue(t.prospect!, last, at)) return { started: false as const };
  const ts = at.toISOString();
  const marked: Tenant = { ...t, prospect: { ...t.prospect!, deletingAt: ts }, version: t.version + 1, updatedAt: ts };
  const row: PurgeJob = { PK: PURGE_PK, SK: tid, markedAt: ts, reason: opts.quiet ? "quiet" : "operator", ...(opts.quiet ? { quietSince: last } : {}), version: 1 };
  await repo.table.write([repo.tenantOp(marked, { version: t.version }), { put: { ...row }, guard: { create: true } }]);
  return { started: true as const };
}


/** Every partition, file, and leaving person of an organization, as it is now */
// The organization's rows outside its own partitions
async function globalRowsOf(repo: PurgeKit["repo"], tid: string): Promise<{ PK: string; SK: string }[]> {
  const watch = (await repo.table.query("DOCWATCH", `${tid}#`)).map((r) => ({ PK: String(r.PK), SK: String(r.SK) }));
  const replies = (await repo.table.query(`T#${tid}`, "REPLY#")).map((r) => keys.replyToken(String(r.SK).slice("REPLY#".length)));
  return [...watch, ...replies];
}


async function take(k: PurgeKit, t: Tenant): Promise<Inventory> {
  const { repo, cfg } = k;
  const tid = t.id;
  const projects = await repo.listProjectsWithTrash(tid);
  const pks = [`T#${tid}`, `T#${tid}#AUDIT`, `T#${tid}#P#_`, `T#${tid}#TRIN`, ...projects.map((p) => `T#${tid}#P#${p.id}`), keys.chat(tid).PK];
  const globalRows = await globalRowsOf(repo, tid);
  const files: string[] = [];
  for (const pid of [undefined, ...projects.map((p) => p.id)]) files.push(...(await repo.listDocs(tid, pid)).map((x) => x.key));
  const accounts: Inventory["accounts"] = [];
  for (const m of await repo.listMembers(tid)) {
    if (cfg.operatorEmails.includes(m.email.toLowerCase())) continue;
    if (!(await repo.membershipsOf(m.userId)).some((x) => x.tenantId !== tid)) accounts.push({ uid: m.userId, email: m.email });
  }
  return { slug: t.slug, pks, globalRows, files, accounts };
}


/** Save the job row's progress under its version, returning the saved copy */
async function saveJob(k: PurgeKit, job: PurgeJob, change: Partial<PurgeJob>): Promise<PurgeJob> {
  const next = { ...job, ...change, version: job.version + 1 };
  await k.repo.table.write([{ put: { ...next }, guard: { version: job.version } }]);
  return next;
}


/**
 * Finish a deletion that has begun: after the wait, take the inventory (once), remove files and
 * sign-in accounts, then rows, check every step, and only then write the receipt. Throws
 * PurgeIncomplete when a step fails or a check doesn't pass; the job row stays and the next pass
 * (every minute) carries on from it. Returns `pending` while the wait isn't over
 */
export async function finishPurge(k: PurgeKit, tid: string, at = new Date()): Promise<{ deleted: boolean; pending?: string; cancelled?: boolean }> {
  const { repo, d } = k;
  let row = await repo.table.get(PURGE_PK, tid);
  let t = await repo.getTenant(tid);
  if (!row) {
    // Nothing begun here, unless an earlier version marked it without a job row
    if (!t?.prospect?.deletingAt) return { deleted: false };
    await startPurge(k, tid, { at });
    row = await repo.table.get(PURGE_PK, tid);
    if (!row) return { deleted: false };
  }
  let job = row as unknown as PurgeJob;
  const ready = Date.parse(job.markedAt) + PURGE_DRAIN_MS;
  if (at.getTime() < ready) return { deleted: false, pending: new Date(ready).toISOString() };

  if (!job.inventory) {
    // A client never reaches here (promotion refuses a marked organization), but never delete one
    if (t && !isProspect(t)) {
      await repo.table.write([{ delete: { PK: PURGE_PK, SK: tid }, guard: { version: job.version } }]);
      return { deleted: false, cancelled: true };
    }
    // The last word for a quiet deletion: a change that landed while requests drained keeps it
    if (t && job.reason === "quiet" && job.quietSince && (await lastActive(k, t)) > job.quietSince) {
      await repo.table.write([
        repo.tenantOp({ ...t, prospect: { ...t.prospect!, deletingAt: undefined }, version: t.version + 1, updatedAt: at.toISOString() }, { version: t.version }),
        { delete: { PK: PURGE_PK, SK: tid }, guard: { version: job.version } },
      ]);
      console.log(JSON.stringify({ level: "info", message: "quiet deletion cancelled by a late change", tenant: tid }));
      return { deleted: false, cancelled: true };
    }
    if (!t) throw new PurgeIncomplete(tid, ["organization record missing before inventory"]);
    job = await saveJob(k, job, { inventory: await take(k, t) });
  }
  const inv = job.inventory!;
  // Anything the organization's remaining records still point to joins the inventory (nothing should,
  // after the wait, but it costs one read to be sure)
  t = await repo.getTenant(tid);
  if (t) {
    const now = await take(k, t);
    const pks = [...new Set([...inv.pks, ...now.pks])];
    const files = [...new Set([...inv.files, ...now.files])];
    const globalRows = [...new Map([...(inv.globalRows ?? []), ...(now.globalRows ?? [])].map((r) => [`${r.PK}\u0000${r.SK}`, r])).values()];
    if (pks.length > inv.pks.length || files.length > inv.files.length || globalRows.length > (inv.globalRows ?? []).length) {
      job = await saveJob(k, job, { inventory: { ...inv, pks, globalRows, files } });
    }
  }
  const { pks, files, accounts, slug } = job.inventory!;
  const globalRows = job.inventory!.globalRows ?? [];
  const failed: string[] = [];

  // Files first, so no stored bytes outlive their records
  const filesDone = new Set(job.filesDone ?? []);
  for (const key of files) {
    if (filesDone.has(key)) continue;
    await retried(() => d.storage.remove(key)).then(() => filesDone.add(key), () => failed.push(`file ${key.split("/").at(-1)}`));
  }
  // Sign-in accounts of people who belong nowhere else; someone who has since joined another
  // organization keeps theirs, and only this organization's membership goes
  const accountsDone = new Set(job.accountsDone ?? []);
  const leaving: Inventory["accounts"] = [];
  for (const p of accounts) {
    if ((await repo.membershipsOf(p.uid)).some((x) => x.tenantId !== tid)) continue;
    leaving.push(p);
    if (accountsDone.has(p.uid) || !d.directory.removeUser) continue;
    await retried(() => d.directory.removeUser!(p.email)).then(() => accountsDone.add(p.uid), () => failed.push(`account ${p.uid}`));
  }
  job = await saveJob(k, job, { filesDone: [...filesDone], accountsDone: [...accountsDone], attempts: (job.attempts ?? 0) + 1 });
  if (failed.length) {
    console.error(JSON.stringify({ level: "error", message: "prospect deletion incomplete", tenant: tid, failed }));
    throw new PurgeIncomplete(tid, failed);
  }

  // Every row: the organization's partitions (read fresh, so late rows go too), its address, and the
  // leaving people's rows. The organization's own record stays until the very end
  const rowsOf = async () => {
    const out: { PK: string; SK: string }[] = [];
    for (const pk of pks) out.push(...(await repo.table.query(pk)).map((r) => ({ PK: String(r.PK), SK: String(r.SK) })));
    for (const p of leaving) out.push(...(await repo.table.query(`USER#${p.uid}`)).map((r) => ({ PK: String(r.PK), SK: String(r.SK) })));
    for (const r of globalRows) if (await repo.table.get(r.PK, r.SK)) out.push(r);
    return out.filter((r) => !(r.PK === `T#${tid}` && r.SK === "META"));
  };
  const extra = async () => {
    const out: { PK: string; SK: string }[] = [];
    if (await repo.table.get(`SLUG#${slug}`, "META")) out.push({ PK: `SLUG#${slug}`, SK: "META" });
    for (const p of leaving) if (await repo.table.get(`EMAIL#${p.email.toLowerCase()}`, "USER")) out.push({ PK: `EMAIL#${p.email.toLowerCase()}`, SK: "USER" });
    return out;
  };
  const rows = [...(await rowsOf()), ...(await extra())];
  for (let i = 0; i < rows.length; i += 25) await repo.table.write(rows.slice(i, i + 25).map((r): WriteOp => ({ delete: r })));

  // Check every step before the receipt: no rows left, no files left
  const left = [...(await rowsOf()), ...(await extra())];
  // rowsOf checked the inventoried global rows; a sweep row queued since then counts too
  left.push(...(await repo.table.query("DOCWATCH", `${tid}#`)).map((r) => ({ PK: String(r.PK), SK: String(r.SK) })));
  for (const key of files) {
    const seen = await d.storage.inspect(key);
    if (seen.kind === "present" || seen.kind === "error") left.push({ PK: "FILE", SK: key });
  }
  if (left.length) {
    console.error(JSON.stringify({ level: "error", message: "prospect deletion check failed", tenant: tid, left: left.length }));
    throw new PurgeIncomplete(tid, left.map((r) => `left ${r.PK.split("#")[0]}`));
  }

  // The receipt, the organization's own record, and the job row, together
  const total = rows.length + 1;
  await repo.table.write([
    { delete: { PK: `T#${tid}`, SK: "META" } },
    { delete: { PK: PURGE_PK, SK: tid }, guard: { version: job.version } },
    { put: { PK: "DELETED", SK: tid, at: at.toISOString(), rows: total, accounts: leaving.length, files: files.length }, guard: { always: true } },
  ]);
  console.log(JSON.stringify({ level: "info", message: "prospect deleted", tenant: tid, rows: total, accounts: leaving.length, files: files.length }));
  return { deleted: true };
}


/** Start a deletion and finish it if the wait allows (it does only for one begun long enough ago) */
export async function purgeProspect(k: PurgeKit, tid: string, opts: { quiet?: boolean; at?: Date } = {}) {
  const { started } = await startPurge(k, tid, opts);
  if (!started) return { deleted: false as const };
  return finishPurge(k, tid, opts.at);
}


/** Every deletion under way, carried on by the once-a-minute pass until each is done */
export async function finishPurges(k: PurgeKit, opts: { at?: Date; deadline?: number } = {}) {
  let deleted = 0, waiting = 0, failed = 0, cancelled = 0;
  for (const row of await k.repo.table.query(PURGE_PK)) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    try {
      const r = await finishPurge(k, String(row.SK), opts.at);
      if (r.deleted) deleted++;
      else if (r.pending) waiting++;
      else if (r.cancelled) cancelled++;
    } catch {
      failed++;
    }
  }
  return { deleted, waiting, failed, cancelled };
}


// What each quiet-prospect email says: two kind check-ins, then the final notice. Replies reach Pradeep
export function quietEmail(t: Tenant, portal: string, step: "nudge" | "final", when: string, signup: string, at = new Date()) {
  const sent = { k: "Sent", v: sentAt(at).replace(/^Sent /, "") };
  if (step === "nudge") {
    const mail = factMail({
      kicker: "free account check-in",
      title: "Checking in",
      sub: t.name,
      preheader: "Add or update your needs any time, or reply to talk it through.",
      intro: [`If your needs have changed, update them in 1NEON, then ask for an assessment from Next step on Home and book the call.`, "If it's easier to talk, reply to this email and we'll find a time."],
      facts: [sent],
      action: { label: "Open 1NEON", url: portal },
      why: `You have a free 1NEON account for ${t.name}, and nothing has changed in it for a while.`,
      reply: "Reply to this email to reach me.",
    });
    return { subject: subjectOf("Checking in", t.name), ...mail, as: "trial" as SenderKind, replyTo: "hello@neon1.tech" };
  }
  const mail = factMail({
    kicker: "free account closing",
    title: `Your free account closes on ${when}`,
    sub: t.name,
    preheader: `Add or change anything before ${when} to keep it.`,
    intro: [`Nothing has changed in your account for three weeks. To keep it, add or change anything there before ${when}.`, `Otherwise it, its projects, and its files will be deleted on ${when}. You can sign up again any time and start fresh, or reply to this email to talk.`],
    facts: [{ k: "Closes", v: when }, sent],
    action: { label: "Open 1NEON to keep it", url: portal },
    why: `You have a free 1NEON account for ${t.name}. A final notice comes after three quiet weeks, and the account is deleted nine days later.`,
    settings: { text: "After it closes, you can start fresh.", url: signup, label: "Sign up again" },
    reply: "Reply to this email to reach me.",
  });
  return { subject: subjectOf(`Free account closes ${when}`, t.name), ...mail, as: "trial" as SenderKind, replyTo: "hello@neon1.tech" };
}


/** The quiet-prospect pass, at most once a day: check-ins, the final notice, then deletion (prospect.ts quietStep) */
export async function sweepQuietProspects(k: Pick<Kit, "repo" | "d" | "cfg">, at = new Date()) {
  const { repo, d, cfg } = k;
  // One pass a day, claimed by a row only the first caller can create
  try {
    await repo.table.write([{ put: { PK: "CONFIG", SK: `QUIET#${at.toISOString().slice(0, 10)}`, ttl: Math.floor(at.getTime() / 1000) + 3 * 86_400 }, guard: { create: true } }]);
  } catch {
    return { nudged: 0, warned: 0, deleting: 0, failed: 0, skipped: true };
  }
  let nudged = 0, warned = 0, deleting = 0, failed = 0;
  const ts = at.toISOString();
  for (let t of (await repo.listTenants()).filter((x) => isProspect(x) && !x.test)) {
    const last = await lastActive(k, t);
    const p = t.prospect!;
    // A real change since the last email: the clock and the emails start again
    if (p.noticeAt && last > p.noticeAt) {
      const next: Tenant = { ...t, prospect: { ...p, notices: undefined, noticeAt: undefined, warnedAt: undefined }, version: t.version + 1, updatedAt: ts };
      await repo.saveTenant(next, t.version);
      t = next;
    }
    const q = t.prospect!;
    // Being deleted: the once-a-minute pass (finishPurges) carries it on
    if (q.deletingAt) continue;
    // Held by neon1, or suspended: no emails and no deletion. Suspended accounts wait on neon1's
    // review list instead (Pradeep, 2026-11-16)
    if (q.heldAt || q.suspendedAt || q.fromClient || t.suspended) continue;
    const clock = prospectClock(last, q.keptUntil);
    const step = quietStep((at.getTime() - Date.parse(clock)) / DAY_MS, q.notices ?? 0, q.warnedAt ? (at.getTime() - Date.parse(q.warnedAt)) / DAY_MS : undefined);
    if (!step) continue;
    if (step === "delete") {
      // Started here, with every condition checked again on a fresh read; finished after the wait
      try {
        if ((await startPurge(k, t.id, { quiet: true, at })).started) deleting++;
      } catch {
        failed++;
      }
      continue;
    }
    const portal = `${cfg.publicUrl}/1NEON/`;
    const when = new Date(at.getTime() + PROSPECT_GRACE_DAYS * DAY_MS).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const mail = quietEmail(t, portal, step, when, `${portal}?signup=1`, at);
    // Replies reach Pradeep, so a check-in can turn into a conversation. The clock moves on only if the
    // mail service took at least one; otherwise the same email is tried again on the next pass
    const to = (await repo.listMembers(t.id)).filter((m) => m.status === "joined" && !cfg.operatorEmails.includes(m.email.toLowerCase()));
    let accepted = 0;
    for (const m of to) {
      try {
        await d.mailer.send(m.email, mail.subject, mail.text, mail.html, mail.replyTo, undefined, undefined, mail.as);
        accepted++;
      } catch (e) {
        console.error(JSON.stringify({ level: "error", message: "quiet-prospect email refused", tenant: t.id, step, error: String(e).slice(0, 200) }));
      }
    }
    if (to.length && !accepted) {
      failed++;
      continue;
    }
    const next: Tenant = { ...t, prospect: { ...q, notices: (q.notices ?? 0) + (step === "nudge" ? 1 : 0), noticeAt: ts, warnedAt: step === "final" ? ts : q.warnedAt }, version: t.version + 1, updatedAt: ts };
    await repo.saveTenant(next, t.version);
    if (step === "nudge") nudged++;
    else warned++;
  }
  return { nudged, warned, deleting, failed };
}


export function prospectRoutes(app: App, k: Kit) {
  const { repo } = k;

  /** The prospect named by :tid, for an operator in a confirmed session */
  async function prospect(c: Context<Env>) {
    check(can(who(c).actor, "manage_orgs", undefined));
    const t = await repo.getTenant(c.req.param("tid")!);
    if (!t || !isProspect(t)) fail(404, "not_found", "That prospect doesn't exist, or is already a client.");
    return t;
  }

  /** The same, for a change that makes no sense once deletion has begun (only Delete itself does) */
  async function live(c: Context<Env>) {
    const t = await prospect(c);
    if (t.prospect!.deletingAt) fail(409, "deleting", `${t.name} is being deleted.`);
    return t;
  }

  /** Save a prospect change with its audit event */
  async function save(c: Context<Env>, t: Tenant, next: Tenant, action: string, summary: string) {
    await repo.table.write([repo.tenantOp(next, { version: t.version }), repo.auditOp({ tenantId: t.id, actorId: who(c).user.id, action, target: t.id, summary })]);
    return next;
  }

  // The review queue: every prospect with when it signed up, when it was last used, and what it holds
  app.get("/prospects", async (c) => {
    check(can(who(c).actor, "read", undefined, "all"));
    const tenants = (await repo.listTenants()).filter((t) => isProspect(t) && !t.test);
    const rows = await Promise.all(tenants.map(async (t) => {
      const [members, projects] = await Promise.all([repo.listMembers(t.id), repo.listProjects(t.id)]);
      const people = members.filter((m) => !k.cfg.operatorEmails.includes(m.email.toLowerCase())).map((m) => ({ name: m.name, email: m.email }));
      // Projects as the project quota counts them (live only); files as the file quota counts them,
      // across every project including trashed ones, which keep their files until deleted
      const all = await repo.listProjectsWithTrash(t.id);
      const files = (await Promise.all([repo.listDocs(t.id, undefined), ...all.map((p) => repo.listDocs(t.id, p.id))])).flat();
      const last = await lastActive(k, t);
      const p = t.prospect!;
      return {
        id: t.id, slug: t.slug, name: t.name, clientId: t.clientId, place: t.place, link: t.link, linkedin: t.linkedin, prospect: p, people,
        projects: projects.filter((x) => !x.deletedAt).length, files: files.length, bytes: files.reduce((n, x) => n + (x.size ?? 0), 0), lastActive: last,
        // When the clock deletes it if nothing changes; none while held, suspended, or being deleted
        deleteOn: p.heldAt || p.suspendedAt || p.deletingAt ? undefined : prospectDeleteOn(prospectClock(last, p.keptUntil), p.warnedAt),
      };
    }));
    const pending = (await repo.table.query(SIGNUP_PK)).length;
    return c.json({ prospects: rows.sort((a, b) => b.prospect!.since.localeCompare(a.prospect!.since)), signup: { open: await signupOpen(k), configured: Boolean(k.cfg.signup), paused: Boolean((await repo.table.get(SIGNUP_SWITCH.PK, SIGNUP_SWITCH.SK))?.paused), pending } });
  });

  // Promote: the next client ID, and every prospect limit lifted. Nothing in the work changes
  app.post("/prospects/:tid/promote", async (c) => {
    const t = await prospect(c);
    if (t.prospect!.deletingAt) fail(409, "deleting", `${t.name} is being deleted, so it can't become a client.`);
    // A downgraded client gets its earlier client ID back
    const clientId = t.prospect!.fromClient ?? formatClientId(await repo.nextClientNumber());
    const next: Tenant = { ...t, clientId, prospect: undefined, suspended: undefined, version: t.version + 1, updatedAt: now(), updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.promoted", `${t.name} became a client (${t.clientId} → ${clientId})`));
  });

  // Suspend: its people are refused everything until it's resumed; nothing is deleted
  app.post("/prospects/:tid/suspend", async (c) => {
    const t = await live(c);
    // The banner's words, optional; older callers send no body at all
    const raw = await c.req.json().catch(() => ({}));
    const note = z.object({ note: z.string().trim().max(400).optional() }).catch({}).parse(raw).note;
    const at = now();
    const next: Tenant = { ...t, suspended: { at, why: "super", by: who(c).user.id, ...(note ? { note } : {}) }, prospect: { ...t.prospect!, suspendedAt: at }, version: t.version + 1, updatedAt: at, updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.suspended", `${t.name} was suspended`));
  });

  app.post("/prospects/:tid/resume", async (c) => {
    const t = await live(c);
    const next: Tenant = { ...t, suspended: undefined, prospect: { ...t.prospect!, suspendedAt: undefined }, version: t.version + 1, updatedAt: now(), updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.resumed", `${t.name} was resumed`));
  });

  // Keep: neon1 is talking with them elsewhere, so no quiet-prospect emails or deletion until released
  app.post("/prospects/:tid/hold", async (c) => {
    const t = await live(c);
    const next: Tenant = { ...t, prospect: { ...t.prospect!, heldAt: now(), notices: undefined, noticeAt: undefined, warnedAt: undefined }, version: t.version + 1, updatedAt: now(), updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.held", `${t.name} is kept: no reminders or deletion`));
  });

  app.post("/prospects/:tid/release", async (c) => {
    const t = await live(c);
    const next: Tenant = { ...t, prospect: { ...t.prospect!, heldAt: undefined }, version: t.version + 1, updatedAt: now(), updatedBy: who(c).user.id };
    // The clock restarts from now, so releasing never triggers an email straight away
    await repo.table.write([{ put: { PK: `T#${t.id}`, SK: "ACTIVE", at: now() }, guard: { always: true } }]);
    return c.json(await save(c, t, next, "prospect.released", `${t.name} is no longer kept`));
  });

  // Delete a prospect for good (spam, or at their request). The name must be typed to confirm
  app.post("/prospects/:tid/delete", async (c) => {
    const t = await prospect(c);
    const { confirm } = await body(c, z.object({ confirm: z.string().max(80) }));
    if (confirm.trim() !== t.name) fail(400, "confirm", "Type the organization's name exactly to delete it.");
    // Its people are shut out at once; the rest goes once requests already under way have finished
    // (finishPurge), which the once-a-minute pass sees to
    let r: Awaited<ReturnType<typeof purgeProspect>>;
    try {
      r = await purgeProspect(k, t.id);
    } catch (e) {
      if (e instanceof PurgeIncomplete) fail(502, "delete_incomplete", `Some of ${t.name}'s files or sign-ins couldn't be removed yet. It's shut out and marked for deletion, and 1NEON keeps trying every minute.`);
      throw e;
    }
    if (r.deleted) return c.json({ ok: true, deleted: true });
    return c.json({ ok: true, deleted: false, finishesBy: "pending" in r ? r.pending : undefined }, 202);
  });

  // Pause or reopen sign-up. Configuration (SIGNUP=on) still has to allow it
  app.put("/signup", async (c) => {
    check(can(who(c).actor, "manage_orgs", undefined));
    const { paused } = await body(c, z.object({ paused: z.boolean() }));
    await repo.table.write([{ put: { ...SIGNUP_SWITCH, paused, by: who(c).user.id, at: now() }, guard: { always: true } }]);
    return c.json({ open: await signupOpen(k), paused });
  });
}


/** A free account's own side of its expiry; registered with the organization routes, after :tid is resolved */
export function keepRoutes(app: App, k: Kit) {
  const { repo } = k;

  // A free account's own people: when it's deleted if nothing changes, and whether "Keep it" is still on offer
  app.get("/t/:tid/keep", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    if (!isProspect(t)) return c.json({ free: false });
    const p = t.prospect!;
    return c.json({ free: true, held: Boolean(p.heldAt), deleteOn: p.heldAt ? undefined : prospectDeleteOn(prospectClock(await lastActive(k, t), p.keptUntil), p.warnedAt), kept: p.keptAt, canKeep: !p.keptAt && !p.heldAt });
  });

  // Keep it 30 more days, once: 30 days past the date shown now (Pradeep, 2026-11-16), so pressing it
  // early never loses days, and any notice is withdrawn. Once ever, so it can't be stacked
  app.post("/t/:tid/keep", async (c) => {
    need(c, "write");
    const t = c.get("tenant");
    if (!isProspect(t)) fail(400, "not_free", "Only a free account expires.");
    const p = t.prospect!;
    if (p.keptAt) fail(409, "kept", "This account was already kept once. Any change you make keeps it longer, or ask neon1 to keep it.");
    const at = now();
    const shown = prospectDeleteOn(prospectClock(await lastActive(k, t), p.keptUntil), p.warnedAt);
    const keptUntil = prospectKeepUntil(shown, new Date(at));
    const next: Tenant = { ...t, prospect: { ...p, keptAt: at, keptUntil, notices: undefined, noticeAt: undefined, warnedAt: undefined }, version: t.version + 1, updatedAt: at, updatedBy: who(c).user.id };
    // Guarded by the organization's version, so it can't cross a deletion that began meanwhile
    await repo.table.write([repo.tenantOp(next, { version: t.version }), repo.auditOp({ tenantId: t.id, actorId: who(c).user.id, action: "prospect.kept", target: t.id, summary: `${t.name} was kept 30 more days, until ${keptUntil.slice(0, 10)}` })]);
    return c.json({ deleteOn: keptUntil });
  });
}
