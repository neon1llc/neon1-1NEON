// apps/api/src/routes/prospects.ts - neon1's side of sign-up: the prospects list (Pradeep's review
// queue), promoting a prospect to a client, suspending and resuming one, deleting one, and the switch
// that pauses sign-up. Operator only; every change needs a confirmed session (manage_orgs). Also the
// daily quiet-prospect pass: check-ins, a final notice, then deletion (prospect.ts quietStep). Clients
// are never deleted by it.


import { PROSPECT_GRACE_DAYS, can, formatClientId, isProspect, quietStep, type Tenant } from "@1neon/domain";
import type { Context } from "hono";
import { z } from "zod";
import { body, check, fail, now, who, type Env } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { branded, link } from "../mail.ts";
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


/**
 * Delete a prospect organization for good: its rows, its files (trashed projects' too), and the
 * accounts of people who belong nowhere else. Refuses a client outright, so a mistake can never reach
 * client records. The organization is first marked as being deleted, in one write guarded by its
 * version, so a promotion or another change that lands first stops it, and once marked it can't be
 * promoted and its people are shut out. Files and sign-in accounts go before any row; if one can't be
 * removed, nothing else is deleted, the failure is logged, and PurgeIncomplete is thrown, so the next
 * pass (or neon1 pressing Delete again) finishes it. A pass ends with a small receipt holding no content
 */
export async function purgeProspect(k: Pick<Kit, "repo" | "d" | "cfg">, tid: string, opts: { quietSince?: string } = {}) {
  const { repo, d, cfg } = k;
  let t = await repo.getTenant(tid);
  if (!t || !isProspect(t)) throw new Error("purgeProspect: not a prospect");
  if (!t.prospect!.deletingAt) {
    const marked: Tenant = { ...t, prospect: { ...t.prospect!, deletingAt: new Date().toISOString() }, version: t.version + 1, updatedAt: new Date().toISOString() };
    await repo.saveTenant(marked, t.version);
    t = marked;
    // A deletion for being quiet stops if the prospect made a change before the mark landed
    if (opts.quietSince) {
      const last = await lastActive(k, t);
      if (last > opts.quietSince) {
        await repo.saveTenant({ ...t, prospect: { ...t.prospect!, deletingAt: undefined }, version: t.version + 1 }, t.version);
        return { deleted: false as const };
      }
    }
  }
  const projects = await repo.listProjectsWithTrash(tid);
  const partitions = [`T#${tid}#P#_`, ...projects.map((p) => `T#${tid}#P#${p.id}`)];
  const failed: string[] = [];
  let files = 0;
  // Files first, so no stored bytes outlive their records
  for (const pid of [undefined, ...projects.map((p) => p.id)]) {
    for (const x of await repo.listDocs(tid, pid)) await retried(() => d.storage.remove(x.key)).then(() => files++, () => failed.push(`file ${x.id}`));
  }
  // People who belong to no other organization lose their account too
  const members = await repo.listMembers(tid);
  const leaving: { uid: string; email: string }[] = [];
  for (const m of members) {
    if (cfg.operatorEmails.includes(m.email.toLowerCase())) continue;
    const elsewhere = (await repo.membershipsOf(m.userId)).some((x) => x.tenantId !== tid);
    if (!elsewhere) leaving.push({ uid: m.userId, email: m.email });
  }
  for (const p of leaving) if (d.directory.removeUser) await retried(() => d.directory.removeUser!(p.email)).catch(() => failed.push(`account ${p.uid}`));
  if (failed.length) {
    console.error(JSON.stringify({ level: "error", message: "prospect deletion incomplete", tenant: tid, failed }));
    throw new PurgeIncomplete(tid, failed);
  }
  // Every row: the organization's partitions, its audit trail, its address, and the leaving people's rows
  const gather = async () => {
    const rows: { PK: string; SK: string }[] = [];
    for (const pk of [`T#${tid}`, `T#${tid}#AUDIT`, ...partitions]) rows.push(...(await repo.table.query(pk)).map((r) => ({ PK: String(r.PK), SK: String(r.SK) })));
    return rows.filter((r) => !(r.PK === `T#${tid}` && r.SK === "META"));
  };
  const rows = await gather();
  rows.push({ PK: `SLUG#${t.slug}`, SK: "META" });
  for (const p of leaving) {
    rows.push(...(await repo.table.query(`USER#${p.uid}`)).map((r) => ({ PK: String(r.PK), SK: String(r.SK) })));
    rows.push({ PK: `EMAIL#${p.email.toLowerCase()}`, SK: "USER" });
  }
  // In small transactions; the tenant's own row goes last, so a pass cut short can be run again
  for (let i = 0; i < rows.length; i += 25) await repo.table.write(rows.slice(i, i + 25).map((r): WriteOp => ({ delete: r })));
  // Anything written while the rows went (a request already under way) goes too
  const late = await gather();
  for (let i = 0; i < late.length; i += 25) await repo.table.write(late.slice(i, i + 25).map((r): WriteOp => ({ delete: r })));
  // The receipt: that it happened and how much went, nothing that was in it
  await repo.table.write([
    { delete: { PK: `T#${tid}`, SK: "META" } },
    { put: { PK: "DELETED", SK: tid, at: new Date().toISOString(), rows: rows.length + late.length + 1, accounts: leaving.length, files }, guard: { always: true } },
  ]);
  console.log(JSON.stringify({ level: "info", message: "prospect deleted", tenant: tid, rows: rows.length + late.length + 1, accounts: leaving.length }));
  return { deleted: true as const };
}


// What each quiet-prospect email says: two kind check-ins, then the final notice. Replies reach Pradeep
function quietEmail(t: Tenant, portal: string, step: "nudge" | "final", when: string, signup: string) {
  if (step === "nudge") {
    return {
      subject: `How are things going with ${t.name}?`,
      preheader: "Add or update your needs any time, or reply to talk it through.",
      heading: "Checking in",
      paras: [`I wanted to check in on ${t.name}. If your needs have changed, update them on ${link("1NEON", portal)}, then ask for an assessment or a call from Next step on Home.`, "If it's easier to talk, reply to this email and we'll find a time."],
      text: `I wanted to check in on ${t.name}. If your needs have changed, update them on 1NEON, then ask for an assessment or a call from Next step on Home: ${portal}\n\nIf it's easier to talk, reply to this email and we'll find a time.`,
    };
  }
  return {
    subject: `Your 1NEON space for ${t.name} closes on ${when}`,
    preheader: `Add or change anything before ${when} to keep it.`,
    heading: "Keep your 1NEON space?",
    paras: [`Nothing has changed in ${t.name} on ${link("1NEON", portal)} for three weeks. To keep it, add or change anything there before ${when}.`, `Otherwise ${t.name}, its projects, and its files will be deleted on ${when}. You can ${link("sign up again", signup)} any time and start fresh, or reply to this email to talk.`],
    text: `Nothing has changed in ${t.name} on 1NEON for three weeks. To keep it, add or change anything there before ${when}: ${portal}\n\nOtherwise ${t.name}, its projects, and its files will be deleted on ${when}. You can sign up again any time and start fresh (${signup}), or reply to this email to talk.`,
  };
}


/** The quiet-prospect pass, at most once a day: check-ins, the final notice, then deletion (prospect.ts quietStep) */
export async function sweepQuietProspects(k: Pick<Kit, "repo" | "d" | "cfg">, at = new Date()) {
  const { repo, d, cfg } = k;
  // One pass a day, claimed by a row only the first caller can create
  try {
    await repo.table.write([{ put: { PK: "CONFIG", SK: `QUIET#${at.toISOString().slice(0, 10)}`, ttl: Math.floor(at.getTime() / 1000) + 3 * 86_400 }, guard: { create: true } }]);
  } catch {
    return { nudged: 0, warned: 0, deleted: 0, failed: 0, skipped: true };
  }
  let nudged = 0, warned = 0, deleted = 0, failed = 0;
  const ts = at.toISOString();
  for (let t of (await repo.listTenants()).filter(isProspect)) {
    const last = await lastActive(k, t);
    const p = t.prospect!;
    // A real change since the last email: the clock and the emails start again
    if (p.noticeAt && last > p.noticeAt) {
      const next: Tenant = { ...t, prospect: { ...p, notices: undefined, noticeAt: undefined, warnedAt: undefined }, version: t.version + 1, updatedAt: ts };
      await repo.saveTenant(next, t.version);
      t = next;
    }
    const q = t.prospect!;
    // A deletion that stopped short: finish it
    if (q.deletingAt) {
      try {
        if ((await purgeProspect(k, t.id)).deleted) deleted++;
      } catch {
        failed++;
      }
      continue;
    }
    // Held by neon1, or suspended: no emails and no deletion
    if (q.heldAt || q.suspendedAt) continue;
    const step = quietStep((at.getTime() - Date.parse(last)) / DAY_MS, q.notices ?? 0, q.warnedAt ? (at.getTime() - Date.parse(q.warnedAt)) / DAY_MS : undefined);
    if (!step) continue;
    if (step === "delete") {
      try {
        if ((await purgeProspect(k, t.id, { quietSince: last })).deleted) deleted++;
      } catch {
        failed++;
      }
      continue;
    }
    const portal = `${cfg.publicUrl}/1NEON/`;
    const when = new Date(at.getTime() + PROSPECT_GRACE_DAYS * DAY_MS).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const mail = quietEmail(t, portal, step, when, `${portal}?signup=1`);
    const html = branded({ label: "your 1NEON space", preheader: mail.preheader, heading: mail.heading, body: mail.paras.map((x, i) => `<p style="margin:${i ? "14px" : "0"} 0 0">${x}</p>`).join(""), button: { label: "Open 1NEON", url: portal }, at });
    // Replies reach Pradeep, so a check-in can turn into a conversation. The clock moves on only if the
    // mail service took at least one; otherwise the same email is tried again on the next pass
    const to = (await repo.listMembers(t.id)).filter((m) => m.status === "joined" && !cfg.operatorEmails.includes(m.email.toLowerCase()));
    let accepted = 0;
    for (const m of to) {
      try {
        await d.mailer.send(m.email, mail.subject, mail.text, html, "hello@neon1.tech");
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
  return { nudged, warned, deleted, failed };
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

  /** Save a prospect change with its audit event */
  async function save(c: Context<Env>, t: Tenant, next: Tenant, action: string, summary: string) {
    await repo.table.write([repo.tenantOp(next, { version: t.version }), repo.auditOp({ tenantId: t.id, actorId: who(c).user.id, action, target: t.id, summary })]);
    return next;
  }

  // The review queue: every prospect with when it signed up, when it was last used, and what it holds
  app.get("/prospects", async (c) => {
    check(can(who(c).actor, "read", undefined, "all"));
    const tenants = (await repo.listTenants()).filter(isProspect);
    const rows = await Promise.all(tenants.map(async (t) => {
      const [members, projects] = await Promise.all([repo.listMembers(t.id), repo.listProjects(t.id)]);
      const people = members.filter((m) => !k.cfg.operatorEmails.includes(m.email.toLowerCase())).map((m) => ({ name: m.name, email: m.email }));
      const live = projects.filter((p) => !p.deletedAt);
      const files = (await Promise.all([repo.listDocs(t.id, undefined), ...live.map((p) => repo.listDocs(t.id, p.id))])).flat().length;
      return { id: t.id, slug: t.slug, name: t.name, clientId: t.clientId, place: t.place, link: t.link, prospect: t.prospect, people, projects: live.length, files, lastActive: await lastActive(k, t) };
    }));
    const pending = (await repo.table.query(SIGNUP_PK)).length;
    return c.json({ prospects: rows.sort((a, b) => b.prospect!.since.localeCompare(a.prospect!.since)), signup: { open: await signupOpen(k), configured: Boolean(k.cfg.signup), paused: Boolean((await repo.table.get(SIGNUP_SWITCH.PK, SIGNUP_SWITCH.SK))?.paused), pending } });
  });

  // Promote: the next client ID, and every prospect limit lifted. Nothing in the work changes
  app.post("/prospects/:tid/promote", async (c) => {
    const t = await prospect(c);
    if (t.prospect!.deletingAt) fail(409, "deleting", `${t.name} is being deleted, so it can't become a client.`);
    const clientId = formatClientId(await repo.nextClientNumber());
    const next: Tenant = { ...t, clientId, prospect: undefined, version: t.version + 1, updatedAt: now(), updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.promoted", `${t.name} became a client (${t.clientId} → ${clientId})`));
  });

  // Suspend: its people are refused everything until it's resumed; nothing is deleted
  app.post("/prospects/:tid/suspend", async (c) => {
    const t = await prospect(c);
    const next: Tenant = { ...t, prospect: { ...t.prospect!, suspendedAt: now() }, version: t.version + 1, updatedAt: now(), updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.suspended", `${t.name} was suspended`));
  });

  app.post("/prospects/:tid/resume", async (c) => {
    const t = await prospect(c);
    const next: Tenant = { ...t, prospect: { ...t.prospect!, suspendedAt: undefined }, version: t.version + 1, updatedAt: now(), updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.resumed", `${t.name} was resumed`));
  });

  // Keep: neon1 is talking with them elsewhere, so no quiet-prospect emails or deletion until released
  app.post("/prospects/:tid/hold", async (c) => {
    const t = await prospect(c);
    const next: Tenant = { ...t, prospect: { ...t.prospect!, heldAt: now(), notices: undefined, noticeAt: undefined, warnedAt: undefined }, version: t.version + 1, updatedAt: now(), updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.held", `${t.name} is kept: no reminders or deletion`));
  });

  app.post("/prospects/:tid/release", async (c) => {
    const t = await prospect(c);
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
    try {
      await purgeProspect(k, t.id);
    } catch (e) {
      if (e instanceof PurgeIncomplete) fail(502, "delete_incomplete", `Some of ${t.name}'s files or sign-ins couldn't be removed yet. It's shut out and marked for deletion; press Delete again, or the daily pass will finish it.`);
      throw e;
    }
    return c.json({ ok: true });
  });

  // Pause or reopen sign-up. Configuration (SIGNUP=on) still has to allow it
  app.put("/signup", async (c) => {
    check(can(who(c).actor, "manage_orgs", undefined));
    const { paused } = await body(c, z.object({ paused: z.boolean() }));
    await repo.table.write([{ put: { ...SIGNUP_SWITCH, paused, by: who(c).user.id, at: now() }, guard: { always: true } }]);
    return c.json({ open: await signupOpen(k), paused });
  });
}
