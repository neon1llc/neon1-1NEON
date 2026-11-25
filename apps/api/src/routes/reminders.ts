// apps/api/src/routes/reminders.ts - Email while a client's decision holds up the work: one when it's
// ready (unless a notice already said so), then on business days 3 and 7, all of a person's pending
// decisions in one message, at most one an hour. neon1 is told with the second reminder, to follow up.

import {
  REMIND_BUSINESS_DAYS, businessDaysBetween, canApprove, dateIn, isOwnOrg, isProspect, projectDecisions, signatureDecision, todayIn, wants,
  type ClientDecision, type Tenant,
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

interface State { since: string; announced: boolean; sent: number; alerted?: boolean }
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

/** The one email a person gets: every decision waiting on them */
export function decisionEmail(t: Tenant, list: ClientDecision[], reminder: boolean, portal: string) {
  const one = list.length === 1 ? list[0]! : undefined;
  const home = `${portal}o/${t.slug}`;
  const url = (d: ClientDecision) => (d.projectKey ? `${home}/projects/${d.projectKey}` : `${home}/agreement`);
  const title = reminder ? "Still waiting on you" : "Your decision is needed";
  const mail = factMail({
    kicker: reminder ? "reminder" : "decision",
    title,
    sub: t.name,
    preheader: one ? `${one.title}${one.projectKey ? `, ${one.projectKey}` : ""}.` : `${list.length} decisions are waiting.`,
    intro: [one ? "The work waits for this." : "The work waits for these."],
    facts: list.map((d) => ({ k: d.projectKey ?? "Agreement", v: d.title, href: url(d) })),
    action: { label: one ? "Open it in 1NEON" : "See what needs you", url: one ? url(one) : `${home}/workspace` },
    why: `You decide for ${t.name} on 1NEON.`,
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
  for (const t of await repo.listTenants()) {
    // neon1 is its own client, and a free account has nothing to approve
    if (isOwnOrg(t.slug) || isProspect(t) || t.status === "archived") continue;
    const today = todayIn(t.timeZone, at);
    const list = await waitingIn(repo, t, today);
    const row = await repo.table.get(`T#${t.id}`, ROW);
    if (!list.length) {
      // Everything is answered: the reminders stop, and a later decision starts its own clock
      if (row) await repo.table.write([{ delete: { PK: `T#${t.id}`, SK: ROW } }]);
      continue;
    }
    const before = (row?.items ?? {}) as Record<string, State>;
    const next: Record<string, State> = {};
    for (const x of list) {
      const fresh = at.getTime() - Date.parse(x.since) < FRESH_MS;
      // A proposal's own notice announces its choice
      next[x.key] = before[x.key] ?? { since: fresh ? x.since : at.toISOString(), announced: x.kind === "choose" || !fresh, sent: 0 };
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
    const fresh = new Set(list.filter((x) => !next[x.key]!.announced).map((x) => x.key));
    const tried = new Set<string>(), reached = new Set<string>();
    if (due.size || fresh.size) {
      for (const m of await repo.listMembers(t.id)) {
        if (m.status !== "joined" || cfg.operatorEmails.includes(m.email.toLowerCase())) continue;
        const u = await repo.getUser(m.userId);
        if (!u || !wants(u.notify, "decision.approved", "email")) continue;
        const mine = list.filter((x) => x.kind === "sign" ? m.access === "admin" : canApprove({ userId: m.userId, operator: false, strongSession: false }, m.access, x.people ?? []).ok);
        const now = mine.filter((x) => due.has(x.key) || fresh.has(x.key));
        if (!now.length) continue;
        for (const x of now) tried.add(x.key);
        const mail = decisionEmail(t, mine, now.some((x) => due.has(x.key)), portal);
        try {
          await d.mailer.send(m.email, mail.subject, mail.text, mail.html, mail.replyTo, undefined, undefined, mail.as);
          sent++;
          for (const x of now) reached.add(x.key);
        } catch (e) {
          console.error(JSON.stringify({ level: "error", message: "decision email refused", tenant: t.id, error: String(e).slice(0, 200) }));
        }
      }
    }
    const stuck: ClientDecision[] = [];
    for (const x of list) {
      const s = next[x.key]!;
      // The mail service took none of them: the same email is tried on the next pass
      if (tried.has(x.key) && !reached.has(x.key)) continue;
      // Counted even when nobody wanted the email, so neon1 still hears about a decision that stays open
      if (fresh.has(x.key)) next[x.key] = { ...s, announced: true };
      const step = due.get(x.key);
      if (step !== undefined) next[x.key] = { ...next[x.key]!, sent: step };
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
  }
  return { sent, alerted };
}
