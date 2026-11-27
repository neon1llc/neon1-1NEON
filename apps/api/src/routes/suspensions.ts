// apps/api/src/routes/suspensions.ts - Suspending and recommissioning organizations and single accounts,
// downgrading a client to a potential, recommission requests, and the daily inactivity pass
// (packages/domain/src/suspension.ts). super's changes need a confirmed session (manage_orgs); members ask
// for recommissioning from the banner. A suspension never deletes anything.


import { ABUSE_MUTES_TO_SUSPEND, ABUSE_WINDOW_DAYS, INACTIVE_DAYS, INACTIVE_LAST_NOTICE_DAYS, INACTIVE_NOTICE_DAYS, Recommission, RecommissionAsk, can, canAskRecommission, dormantCovered, dormantStep, isProspect, newId, suspensionOf, type Member, type Suspension, type Tenant } from "@1neon/domain";
import type { Context } from "hono";
import { z } from "zod";
import { body, check, fail, now, who, type Env } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { factMail, subjectOf } from "../lib/factmail.ts";
import type { WriteOp } from "../store/types.ts";
import { isDev, neon1Only } from "../dev-guard.ts";


const DAY_MS = 24 * 60 * 60 * 1000;
// Recommission requests live under one key, so super's list is one read
const REQ_PK = "RECOMMISSION";
const Note = z.object({ note: z.string().trim().max(400).optional() });


/** When anyone but super last opened the portal in this organization (Member.lastSeenAt, kept by GET /me),
 * changed something (T#ACTIVE), or was recommissioned; its creation if never */
export async function lastActive(k: Pick<Kit, "repo" | "cfg">, t: Tenant): Promise<string> {
  const [members, row] = await Promise.all([k.repo.listMembers(t.id), k.repo.table.get(`T#${t.id}`, "ACTIVE")]);
  const seen = members.filter((m) => !k.cfg.operatorEmails.includes(m.email.toLowerCase())).map((m) => m.lastSeenAt ?? m.joinedAt ?? "");
  return [t.createdAt, row?.at ? String(row.at) : "", ...seen].filter(Boolean).sort().at(-1)!;
}


/** Restart the inactivity clock from now, so a recommissioned organization isn't suspended again at once */
const freshClock = (tid: string, at: string): WriteOp => ({ put: { PK: `T#${tid}`, SK: "ACTIVE", at }, guard: { always: true } });


/** The suspension written on an organization: free accounts keep their older mark in step, which their
 * clock and Potentials sort by */
function suspendOrg(t: Tenant, s: Suspension | undefined, by: string, at: string): Tenant {
  const prospect = t.prospect ? { ...t.prospect, suspendedAt: s ? s.at : undefined } : undefined;
  return { ...t, suspended: s, dormant: undefined, ...(prospect ? { prospect } : {}), version: t.version + 1, updatedAt: at, updatedBy: by };
}


/** Suspend one account in an organization, for the abuse rule in chatguard as well as super */
export async function suspendAccount(k: Pick<Kit, "repo">, tid: string, uid: string, s: Suspension, actorId: string, summary: string) {
  const m = await k.repo.getMember(tid, uid);
  if (!m || m.suspended) return false;
  const next: Member = { ...m, suspended: s, version: m.version + 1, updatedAt: s.at, updatedBy: actorId };
  await k.repo.table.write([k.repo.memberOp(next, { version: m.version }), k.repo.auditOp({ tenantId: tid, actorId, action: "account.suspended", target: uid, summary })]);
  return true;
}


/**
 * After an automatic chat mute (chatguard): the third in ABUSE_WINDOW_DAYS suspends the account for abuse.
 * Mutes are counted per person per organization, in a row that expires with the window
 */
export async function countAbuse(k: Pick<Kit, "repo">, tenant: Pick<Tenant, "id">, user: { id: string; name?: string; email: string }) {
  const until = Math.floor(Date.now() / 1000) + ABUSE_WINDOW_DAYS * 86_400;
  const n = await k.repo.table.increment("COUNTER", `ABUSE#${tenant.id}#${user.id}`, 1, until);
  if (n < ABUSE_MUTES_TO_SUSPEND) return false;
  return suspendAccount(k, tenant.id, user.id, { at: now(), why: "abuse" }, "system", `${user.name || user.email} was suspended automatically for repeated rule breaks in chat`);
}


export function suspensionRoutes(app: App, k: Kit) {
  const { repo } = k;

  /** The organization named by :tid, for super in a confirmed session */
  async function org(c: Context<Env>) {
    check(can(who(c).actor, "manage_orgs", undefined));
    const t = await repo.getTenant(c.req.param("tid")!);
    if (!t) fail(404, "not_found", "That organization doesn't exist.");
    if (t.prospect?.deletingAt) fail(409, "deleting", `${t.name} is being deleted.`);
    if (t.slug === "neon1") fail(409, "own_org", "neon1's own organization can't be suspended or downgraded.");
    return t;
  }

  /** Save an organization change with its audit event */
  async function save(c: Context<Env>, t: Tenant, next: Tenant, action: string, summary: string, extra: WriteOp[] = []) {
    await repo.table.write([repo.tenantOp(next, { version: t.version }), repo.auditOp({ tenantId: t.id, actorId: who(c).user.id, action, target: t.id, summary }), ...extra]);
    return next;
  }

  /** Close the open requests this lift answers */
  async function closeRequests(tid: string, scope: "org" | "account", uid: string | undefined, state: "done" | "dismissed", at: string): Promise<WriteOp[]> {
    const open = (await repo.table.query(REQ_PK, `${tid}#`)).map((r) => Recommission.parse(r)).filter((r) => r.state === "open" && (scope === "org" || r.userId === uid));
    return open.map((r) => ({ put: { PK: REQ_PK, SK: `${tid}#${r.id}`, ...r, state, closedAt: at }, guard: { always: true } }));
  }

  // Suspend an organization: everyone but super reads only. The note, if any, is the banner's words
  app.post("/orgs/:tid/suspend", async (c) => {
    const t = await org(c);
    if (suspensionOf(t)) fail(409, "already", `${t.name} is already suspended.`);
    const { note } = await body(c, Note).catch(() => ({ note: undefined }));
    const at = now();
    const next = suspendOrg(t, { at, why: "super", by: who(c).user.id, ...(note ? { note } : {}) }, who(c).user.id, at);
    return c.json(await save(c, t, next, "access.suspended", `${t.name} was suspended`));
  });

  // Recommission an organization, and close the requests that asked for it
  app.post("/orgs/:tid/recommission", async (c) => {
    const t = await org(c);
    if (!suspensionOf(t)) fail(409, "not_suspended", `${t.name} isn't suspended.`);
    const at = now();
    const next = suspendOrg(t, undefined, who(c).user.id, at);
    return c.json(await save(c, t, next, "access.recommissioned", `${t.name} was recommissioned`, [freshClock(t.id, at), ...(await closeRequests(t.id, "org", undefined, "done", at))]));
  });

  // Downgrade a client to a potential: free-account limits, listed in Potentials, its client ID kept for a
  // later promotion. The free-account clock never deletes it (prospect.ts quietDeletionDue)
  app.post("/orgs/:tid/downgrade", async (c) => {
    const t = await org(c);
    if (isProspect(t)) fail(409, "already", `${t.name} is already a potential.`);
    const at = now();
    const next: Tenant = { ...t, prospect: { since: at, terms: "client", fromClient: t.clientId }, keptAt: undefined, version: t.version + 1, updatedAt: at, updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, "prospect.downgraded", `${t.name} became a potential (${t.clientId})`, [freshClock(t.id, at)]));
  });

  // Keep an organization off the inactivity clock, or put it back on
  app.post("/orgs/:tid/keep", async (c) => {
    const t = await org(c);
    const { keep } = await body(c, z.object({ keep: z.boolean() }));
    const at = now();
    const next: Tenant = { ...t, keptAt: keep ? at : undefined, dormant: undefined, version: t.version + 1, updatedAt: at, updatedBy: who(c).user.id };
    return c.json(await save(c, t, next, keep ? "org.kept" : "org.unkept", keep ? `${t.name} is kept: no inactivity suspension` : `${t.name} is back on the inactivity clock`, keep ? [] : [freshClock(t.id, at)]));
  });

  // Suspend or recommission one account in an organization (never super's own)
  app.post("/orgs/:tid/members/:uid/suspend", async (c) => {
    const t = await org(c);
    const m = await repo.getMember(t.id, c.req.param("uid")!);
    if (!m || m.status === "deactivated") fail(404, "not_found", "That person isn't in this organization.");
    if (k.cfg.operatorEmails.includes(m.email.toLowerCase())) fail(409, "super", "super can't be suspended.");
    if (m.suspended) fail(409, "already", `${m.name || m.email} is already suspended.`);
    const { note } = await body(c, Note).catch(() => ({ note: undefined }));
    const s: Suspension = { at: now(), why: "super", by: who(c).user.id, ...(note ? { note } : {}) };
    await suspendAccount(k, t.id, m.userId, s, who(c).user.id, `${m.name || m.email} was suspended`);
    return c.json({ ok: true });
  });

  app.post("/orgs/:tid/members/:uid/recommission", async (c) => {
    const t = await org(c);
    const m = await repo.getMember(t.id, c.req.param("uid")!);
    if (!m?.suspended) fail(409, "not_suspended", "That account isn't suspended.");
    const at = now();
    const next: Member = { ...m, suspended: undefined, version: m.version + 1, updatedAt: at, updatedBy: who(c).user.id };
    // A recommissioned account starts clean: its abuse count goes too
    await repo.table.write([repo.memberOp(next, { version: m.version }), repo.auditOp({ tenantId: t.id, actorId: who(c).user.id, action: "account.recommissioned", target: m.userId, summary: `${m.name || m.email} was recommissioned` }), { delete: { PK: "COUNTER", SK: `ABUSE#${t.id}#${m.userId}` } }, ...(await closeRequests(t.id, "account", m.userId, "done", at))]);
    return c.json({ ok: true });
  });

  // Everything suspended and every request, for Potentials: organizations, single accounts, open requests first
  app.get("/suspensions", async (c) => {
    check(can(who(c).actor, "read", undefined, "all"));
    const tenants = (await repo.listTenants()).filter((t) => !t.test);
    const orgs = tenants.flatMap((t) => { const s = suspensionOf(t); return s ? [{ id: t.id, slug: t.slug, name: t.name, clientId: t.clientId, potential: isProspect(t), suspended: s }] : []; });
    const accounts = (await Promise.all(tenants.map(async (t) => (await repo.listMembers(t.id)).filter((m) => m.suspended && m.status !== "deactivated").map((m) => ({ tenantId: t.id, slug: t.slug, orgName: t.name, userId: m.userId, name: m.name, email: m.email, suspended: m.suspended! }))))).flat();
    const requests = (await repo.table.query(REQ_PK)).map((r) => Recommission.parse(r)).filter((r) => r.state === "open" || (r.closedAt && Date.now() - Date.parse(r.closedAt) < 30 * DAY_MS)).sort((a, b) => (a.state === b.state ? b.at.localeCompare(a.at) : a.state === "open" ? -1 : 1));
    return c.json({ orgs, accounts, requests });
  });

  // Set a request aside without lifting anything
  app.post("/recommissions/:tid/:rid/dismiss", async (c) => {
    check(can(who(c).actor, "manage_orgs", undefined));
    const row = await repo.table.get(REQ_PK, `${c.req.param("tid")}#${c.req.param("rid")}`);
    if (!row) fail(404, "not_found", "That request doesn't exist.");
    const r = Recommission.parse(row);
    await repo.table.write([{ put: { PK: REQ_PK, SK: `${r.tenantId}#${r.id}`, ...r, state: "dismissed", closedAt: now() }, guard: { always: true } }]);
    return c.json({ ok: true });
  });

  // --- Inside the organization: the banner's request and its state ---

  // Open requests here, so the banner can say one is waiting
  app.get("/t/:tid/recommission", async (c) => {
    const tid = c.get("tenant").id;
    const open = (await repo.table.query(REQ_PK, `${tid}#`)).map((r) => Recommission.parse(r)).filter((r) => r.state === "open");
    return c.json({ requests: open.map(({ id, scope, userId, userName, byName, at }) => ({ id, scope, userId, userName, byName, at })) });
  });

  // Ask super to recommission: your own account; an admin also a colleague's or the organization. One open
  // request per thing asked for; super hears by email
  app.post("/t/:tid/recommission", async (c) => {
    const t = c.get("tenant");
    const asker = c.get("member");
    const { user } = who(c);
    if (!asker) fail(403, "forbidden", "Only the organization's own people can ask.");
    const ask = await body(c, RecommissionAsk);
    const uid = ask.scope === "account" ? ask.userId ?? user.id : undefined;
    const target = uid ? await repo.getMember(t.id, uid) : undefined;
    if (!canAskRecommission(asker, { scope: ask.scope, userId: uid }, t, target)) fail(403, "forbidden", ask.scope === "org" ? "An admin can ask for the organization once it's suspended." : "You can ask for your own account; an admin can also ask for a colleague's.");
    const open = (await repo.table.query(REQ_PK, `${t.id}#`)).map((r) => Recommission.parse(r)).filter((r) => r.state === "open");
    if (open.some((r) => r.scope === ask.scope && r.userId === uid)) fail(409, "already_asked", "That's already been asked for. You'll hear back by email.");
    const r: Recommission = { id: newId("rc"), tenantId: t.id, orgName: t.name, scope: ask.scope, ...(uid ? { userId: uid, userName: target!.name || target!.email } : {}), by: user.id, byName: user.name || user.email, reason: ask.reason, at: now(), state: "open" };
    const what = ask.scope === "org" ? t.name : uid === user.id ? "their account" : `${r.userName}'s account`;
    await repo.table.write([{ put: { PK: REQ_PK, SK: `${t.id}#${r.id}`, ...r }, guard: { create: true } }, repo.auditOp({ tenantId: t.id, actorId: user.id, action: "recommission.requested", target: uid ?? t.id, summary: `${r.byName} asked to recommission ${what}: ${ask.reason.slice(0, 200)}` })]);
    return c.json({ request: r }, 201);
  });
}


/** The reminder before an inactivity suspension: to the organization's admins, with the date it happens */
function dormantEmail(t: Tenant, when: string, url: string) {
  const mail = factMail({
    kicker: "account activity",
    title: `Sign in before ${when} to keep ${t.name} active`,
    sub: t.name,
    preheader: "Signing in is enough.",
    intro: [`Nobody has opened ${t.name} in 1NEON for a while. Without a sign-in by ${when}, it's suspended.`, "A suspension deletes nothing, and you can ask to recommission it any time. Reply to this email to talk."],
    facts: [{ k: "Suspended on", v: when }],
    action: { label: "Open 1NEON", url },
    why: `You're an admin of ${t.name} in 1NEON. An organization with no activity for ${INACTIVE_DAYS} days is suspended.`,
    reply: "Reply to this email to reach me.",
  });
  return { subject: subjectOf(`Sign in by ${when}`, t.name), ...mail };
}


/** The inactivity pass, at most once a day: reminders at INACTIVE_NOTICE_DAYS, then suspension (suspension.ts) */
export async function sweepDormant(k: Pick<Kit, "repo" | "d" | "cfg">, at = new Date()) {
  const { repo, d, cfg } = k;
  try {
    await repo.table.write([{ put: { PK: "CONFIG", SK: `DORMANT#${at.toISOString().slice(0, 10)}`, ttl: Math.floor(at.getTime() / 1000) + 3 * 86_400 }, guard: { create: true } }]);
  } catch {
    return { noticed: 0, suspended: 0, skipped: true };
  }
  let noticed = 0, suspended = 0;
  const ts = at.toISOString();
  for (let t of (await repo.listTenants()).filter(dormantCovered)) {
    // dev's made-up sample organizations have nobody who can sign in there, so only organizations with a
    // reachable person (dev-guard.ts) are on the clock in dev
    if (isDev(cfg) && !(await repo.listMembers(t.id)).some((m) => !cfg.operatorEmails.includes(m.email.toLowerCase()) && neon1Only(cfg, m.email))) continue;
    const last = await lastActive(k, t);
    // Activity since the last reminder: the reminders start again
    if (t.dormant && last > t.dormant.noticeAt) {
      const next: Tenant = { ...t, dormant: undefined, version: t.version + 1, updatedAt: ts };
      await repo.saveTenant(next, t.version);
      t = next;
    }
    const step = dormantStep((at.getTime() - Date.parse(last)) / DAY_MS, t.dormant?.notices ?? 0, t.dormant ? (at.getTime() - Date.parse(t.dormant.noticeAt)) / DAY_MS : undefined);
    if (step === "suspend") {
      const next = suspendOrg(t, { at: ts, why: "inactive" }, "system", ts);
      await repo.table.write([repo.tenantOp(next, { version: t.version }), repo.auditOp({ tenantId: t.id, actorId: "system", action: "access.suspended", target: t.id, summary: `${t.name} was suspended automatically: no activity for ${INACTIVE_DAYS} days` })]);
      suspended++;
      continue;
    }
    if (step !== "notice") continue;
    // The day it would be suspended: the limit, or a week after the last reminder if that comes later
    const left = INACTIVE_NOTICE_DAYS.length - (t.dormant?.notices ?? 0);
    const when = new Date(Math.max(Date.parse(last) + INACTIVE_DAYS * DAY_MS, at.getTime() + (left - 1 + INACTIVE_LAST_NOTICE_DAYS) * DAY_MS)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const mail = dormantEmail(t, when, `${cfg.publicUrl}/1NEON/o/${t.slug}`);
    const admins = (await repo.listMembers(t.id)).filter((m) => m.status === "joined" && m.access === "admin" && !m.suspended && !cfg.operatorEmails.includes(m.email.toLowerCase()));
    let accepted = 0;
    for (const m of admins) {
      try {
        await d.mailer.send(m.email, mail.subject, mail.text, mail.html, "hello@neon1.tech", undefined, undefined, "portal");
        accepted++;
      } catch (e) {
        console.error(JSON.stringify({ level: "error", message: "inactivity email refused", tenant: t.id, error: String(e).slice(0, 200) }));
      }
    }
    // The same reminder is tried again next pass if every send failed; nobody to tell still moves the clock on
    if (admins.length && !accepted) continue;
    await repo.saveTenant({ ...t, dormant: { notices: (t.dormant?.notices ?? 0) + 1, noticeAt: ts }, version: t.version + 1, updatedAt: ts }, t.version);
    noticed++;
  }
  return { noticed, suspended };
}
