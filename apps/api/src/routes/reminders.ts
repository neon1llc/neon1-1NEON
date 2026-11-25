// apps/api/src/routes/reminders.ts - Email while a client's decision holds up the work: one when it's
// ready (unless a notice already said so), then on business days 3 and 7, all of a person's pending
// decisions in one message, at most one an hour. neon1 is told with the second reminder, to follow up.

import {
  REMIND_BUSINESS_DAYS, askedToDecide, businessDaysBetween, dateIn, isOwnOrg, isProspect, projectDecisions, signatureDecision, todayIn, wants,
  type ClientDecision, type ProposalFields, type Tenant,
} from "@1neon/domain";
import type { Kit } from "../lib/kit.ts";
import { alertNeon1 } from "../lib/alert.ts";
import { factMail, subjectOf } from "../lib/factmail.ts";
import type { SenderKind } from "../mail.ts";

const ROW = "REMIND#decisions";
// A decision already older than this when first seen starts its clock now, with no first email
const FRESH_MS = 24 * 60 * 60 * 1000;
// Reminders arrive on weekdays from 9am to 5pm in the organization's time zone
const HOURS = { from: 9, to: 17 };

// `told` holds who has heard that it's waiting, so someone named later hears too
interface State { since: string; told: string[]; sent: number; alerted?: boolean }
interface Waiting extends ClientDecision { people?: { userId: string; role: string }[] }

/** Is it a weekday within sending hours where the organization is? */
export function inSendingHours(at: Date, timeZone: string | undefined) {
  const day = new Date(`${todayIn(timeZone, at)}T00:00:00Z`).getUTCDay();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "America/New_York", hour: "numeric", hourCycle: "h23" }).format(at));
  return day !== 0 && day !== 6 && hour >= HOURS.from && hour < HOURS.to;
}

async function waitingIn(repo: Kit["repo"], t: Tenant, today: string): Promise<Waiting[]> {
  const out: Waiting[] = [];
  for (const p of await repo.listProjects(t.id)) {
    if (p.archived) continue;
    for (const d of projectDecisions(p, await repo.listItems(t.id, p.id), today)) out.push({ ...d, people: p.people });
  }
  const sign = signatureDecision(t, out);
  return sign ? [sign, ...out] : out;
}

/** Asked of the first admin while a project has no decision maker */
export const NAME_ONE = "No decision maker is named yet. Name one on the project, or decide yourself.";

type Option = ProposalFields["snapshot"]["options"][number];

/** What an issued revision changed in the options, against the one before it */
export function optionChanges(before: Option[] | undefined, after: Option[]) {
  const was = new Map((before ?? []).map((o) => [o.id, o.version]));
  return {
    added: after.filter((o) => !was.has(o.id)),
    edited: after.filter((o) => was.has(o.id) && was.get(o.id) !== o.version),
    removed: (before ?? []).filter((o) => !after.some((x) => x.id === o.id)),
  };
}

/** The email to whoever decides when a proposal is issued: what changed, and what to do */
export function optionsEmail(o: { org: string; projectKey: string; proposal: string; before?: Option[]; after: Option[]; named: boolean; quick: boolean; url: string; settingsUrl: string }) {
  const { added, edited, removed } = optionChanges(o.before, o.after);
  const count = (n: number, what: string) => `${n} ${n === 1 ? "option" : "options"} ${what}`;
  const changed = [added.length ? count(added.length, "added") : "", edited.length ? count(edited.length, "edited") : "", removed.length ? count(removed.length, "removed") : ""].filter(Boolean).join(", ");
  const summary = o.quick ? "A quote is ready" : changed || "The proposal was issued again with the same options";
  const title = o.quick ? "Quote to review" : "Options to review";
  const rows = (k: string, list: Option[]) => list.map((x) => ({ k, v: x.title }));
  const mail = factMail({
    kicker: "decision",
    title,
    sub: o.org,
    preheader: `${o.projectKey}: ${summary}.`,
    intro: [`${summary}.`, ...(o.named ? [] : [NAME_ONE])],
    facts: [{ k: "Project", v: o.projectKey, mono: true }, { k: o.quick ? "Quote" : "Proposal", v: o.proposal }, ...(o.quick ? rows("For", o.after) : [...rows("Added", added), ...rows("Edited", edited), ...rows("Removed", removed)])],
    action: { label: o.quick ? "Review the quote" : "Review the options", url: o.url },
    why: o.named ? `You're a decision maker for ${o.projectKey} on 1NEON.` : `You're an admin of ${o.org} on 1NEON.`,
    settings: { text: "Choose your emails in your 1NEON profile, under Notifications.", url: o.settingsUrl, label: "Notification settings" },
    reply: "Reply to this email to reach me.",
  });
  return { subject: subjectOf(title, `${o.projectKey}, ${summary}`, 90), ...mail, as: "portal" as SenderKind, replyTo: "hello@neon1.tech" };
}

/** The one email a person gets: every decision waiting on them */
export function decisionEmail(t: Tenant, list: ClientDecision[], reminder: boolean, portal: string, unnamed = false) {
  const one = list.length === 1 ? list[0]! : undefined;
  const home = `${portal}o/${t.slug}`;
  const url = (d: ClientDecision) => (d.projectKey ? `${home}/projects/${d.projectKey}` : `${home}/agreement`);
  const title = reminder ? "Still waiting on you" : "Your decision is needed";
  const mail = factMail({
    kicker: reminder ? "reminder" : "decision",
    title,
    sub: t.name,
    preheader: one ? `${one.title}${one.projectKey ? `, ${one.projectKey}` : ""}.` : `${list.length} decisions are waiting.`,
    intro: [one ? "The work waits for this." : "The work waits for these.", ...(unnamed ? [NAME_ONE] : [])],
    facts: list.map((d) => ({ k: d.projectKey ?? "Agreement", v: d.title, href: url(d) })),
    action: { label: one ? "Open it in 1NEON" : "See what needs you", url: one ? url(one) : `${home}/workspace` },
    why: unnamed ? `You're an admin of ${t.name} on 1NEON.` : `You decide for ${t.name} on 1NEON.`,
    settings: { text: "Choose your emails in your 1NEON profile, under Notifications.", url: `${portal}me#notifications` },
    reply: "Reply to this email to reach me.",
  });
  return { subject: subjectOf(title, one ? `${one.projectKey ? `${one.projectKey} ` : ""}${one.title}` : t.name), ...mail, as: "portal" as SenderKind, replyTo: "hello@neon1.tech" };
}

/** The reminder pass, at most once an hour */
export async function sweepDecisionReminders(k: Pick<Kit, "repo" | "d" | "cfg">, at = new Date()) {
  const { repo, d, cfg } = k;
  try {
    await repo.table.write([{ put: { PK: "CONFIG", SK: `REMIND#${at.toISOString().slice(0, 13)}`, ttl: Math.floor(at.getTime() / 1000) + 2 * 86_400 }, guard: { create: true } }]);
  } catch {
    return { sent: 0, alerted: 0, skipped: true };
  }
  let sent = 0, alerted = 0;
  const portal = `${cfg.publicUrl}/1NEON/`;
  const one = async (t: Tenant) => {
    const today = todayIn(t.timeZone, at);
    const list = await waitingIn(repo, t, today);
    const row = await repo.table.get(`T#${t.id}`, ROW);
    if (!list.length) {
      // Everything is answered: the reminders stop, and a later decision starts its own clock
      if (row) await repo.table.write([{ delete: { PK: `T#${t.id}`, SK: ROW } }]);
      return;
    }
    const members = (await repo.listMembers(t.id)).filter((m) => !cfg.operatorEmails.includes(m.email.toLowerCase()));
    // Who is asked about each decision. The signature goes to a named decision maker who is an admin, else the first admin
    const admins = members.filter((m) => m.access === "admin");
    const asked = new Map(list.map((x) => {
      if (x.kind !== "sign") return [x.key, askedToDecide(members, x.people ?? [])] as const;
      const who = askedToDecide(admins, list.flatMap((y) => y.people ?? []));
      return [x.key, { named: true, ids: who.ids.length ? who.ids : askedToDecide(admins, []).ids }] as const;
    }));
    const before = (row?.items ?? {}) as Record<string, State>;
    const next: Record<string, State> = {};
    for (const x of list) {
      const fresh = at.getTime() - Date.parse(x.since) < FRESH_MS;
      // A proposal's own notice tells whoever is asked when it's issued
      const kept = before[x.key];
      // A record without `told` counts as told, so nobody hears the same news twice
      next[x.key] = kept ? { ...kept, told: kept.told ?? asked.get(x.key)!.ids } : { since: fresh ? x.since : at.toISOString(), told: x.kind === "choose" || !fresh ? asked.get(x.key)!.ids : [], sent: 0 };
    }
    const open = inSendingHours(at, t.timeZone);
    // The reminder each decision is due now, if any; a late pass sends one, never two together
    const due = new Map<string, number>();
    for (const x of list) {
      const s = next[x.key]!;
      const age = businessDaysBetween(dateIn(s.since, t.timeZone), today);
      const step = REMIND_BUSINESS_DAYS.filter((n) => age >= n).length;
      if (open && step > s.sent) due.set(x.key, step);
    }
    const tried = new Set<string>(), reached = new Set<string>();
    for (const m of members) {
      const mine = list.filter((x) => asked.get(x.key)!.ids.includes(m.userId));
      const now = mine.filter((x) => due.has(x.key) || !next[x.key]!.told.includes(m.userId));
      if (!now.length) continue;
      const u = await repo.getUser(m.userId);
      const told = () => { for (const x of now) next[x.key] = { ...next[x.key]!, told: [...new Set([...next[x.key]!.told, m.userId])] }; };
      // Someone who turned these emails off isn't asked again; neon1 still hears if it stays open
      if (!u || !wants(u.notify, "decision.approved", "email")) { told(); continue; }
      for (const x of now) tried.add(x.key);
      const mail = decisionEmail(t, mine, now.some((x) => due.has(x.key)), portal, mine.some((x) => !asked.get(x.key)!.named));
      try {
        await d.mailer.send(m.email, mail.subject, mail.text, mail.html, mail.replyTo, undefined, undefined, mail.as);
        sent++;
        told();
        for (const x of now) reached.add(x.key);
      } catch (e) {
        console.error(JSON.stringify({ level: "error", message: "decision email refused", tenant: t.id, error: String(e).slice(0, 200) }));
      }
    }
    const stuck: ClientDecision[] = [];
    for (const x of list) {
      const s = next[x.key]!;
      // The mail service took none of them: the same email is tried on the next pass
      if (tried.has(x.key) && !reached.has(x.key)) continue;
      // Counted even when nobody wanted the email, so neon1 still hears about a decision that stays open
      const step = due.get(x.key);
      if (step !== undefined) next[x.key] = { ...s, sent: step };
      if (next[x.key]!.sent >= REMIND_BUSINESS_DAYS.length && !s.alerted) stuck.push(x);
    }
    if (stuck.length && !t.test) {
      const mail = factMail({
        kicker: "follow up", title: "A client decision is still waiting", sub: t.name,
        preheader: `${stuck.length} waiting ${REMIND_BUSINESS_DAYS.at(-1)} business days or more.`,
        intro: [`Both reminders are done. Follow up personally.`],
        facts: stuck.map((x) => ({ k: x.projectKey ?? "Agreement", v: x.title, href: `${portal}o/${t.slug}${x.projectKey ? `/projects/${x.projectKey}` : "/agreement"}` })),
        action: { label: "Open the organization", url: `${portal}o/${t.slug}/workspace` },
        why: "You run 1NEON.",
      });
      try {
        await alertNeon1(d, {
          severity: "important", title: "A client decision is waiting", text: "Both reminders are done. Follow up personally.", source: "decision-reminders",
          url: `${portal}o/${t.slug}/workspace`, to: cfg.operatorEmails, mail: { subject: subjectOf("Follow up", t.name), text: mail.text, html: mail.html, as: "portal" },
        });
        for (const x of stuck) next[x.key] = { ...next[x.key]!, alerted: true };
        alerted++;
      } catch (e) {
        console.error(JSON.stringify({ level: "error", message: "decision follow-up alert failed", tenant: t.id, error: String(e).slice(0, 200) }));
      }
    }
    await repo.table.write([{ put: { PK: `T#${t.id}`, SK: ROW, items: next, at: at.toISOString() }, guard: { always: true as const } }]);
  };
  for (const t of await repo.listTenants()) {
    // neon1 is its own client, and a free account has nothing to approve
    if (isOwnOrg(t.slug) || isProspect(t) || t.status === "archived") continue;
    // One organization's failure never holds up the others
    await one(t).catch((e) => console.error(JSON.stringify({ level: "error", message: "decision reminders failed", tenant: t.id, error: String(e).slice(0, 200) })));
  }
  return { sent, alerted };
}
