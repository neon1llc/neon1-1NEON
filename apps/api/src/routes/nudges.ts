// apps/api/src/routes/nudges.ts - Outline tips by email: when a project's outline is unfinished and nothing
// is waiting to go to neon1, its people get that project's top tips about 3 days after the last change, and
// once more about 7 days after it, then nothing until something changes again. On by default in a free
// account and off in a client's, under Outline tips in the profile's Notifications (notify.ts).


import { isClosed, isProspect, outlineOf, outlineTip, OUTLINE_PARTS, readinessOf, wantsOutlineTips, type Project, type Tenant } from "@1neon/domain";
import type { Kit } from "../lib/kit.ts";
import { factMail, subjectOf } from "../lib/factmail.ts";
import type { SenderKind } from "../mail.ts";


const DAY_MS = 24 * 60 * 60 * 1000;

/** Days after the last change that each tip email goes, in order; none after the last */
export const NUDGE_DAYS = [3, 7] as const;

// A free account's own check-in (routes/prospects.ts) that went within this long holds the tips a day
const QUIET_GAP_MS = 36 * 60 * 60 * 1000;

// The most projects one email names
const NUDGE_PROJECTS = 3;

/** Where an organization stands: how many tip emails went since its last change, and when that change was */
interface NudgeRow { count?: number; since?: string; at?: string }

type Unfinished = { p: Project; have: number; missing: ReturnType<typeof outlineOf>["missing"]; last: string };


/** The projects that could use tips: open, not past assessing, never sent to neon1, and not fully outlined */
async function unfinished(repo: Kit["repo"], t: Tenant, sent: Record<string, string>): Promise<Unfinished[]> {
  const first = (t.stages.find((x) => !x.hidden) ?? t.stages[0])?.id;
  const live = (await repo.listProjects(t.id)).filter((p) => !p.archived && !isClosed(t.stages, p.stageId) && !sent[p.key]);
  const out: Unfinished[] = [];
  for (const p of live) {
    if (!isProspect(t) && p.stageId !== first) continue;
    const items = await repo.listItems(t.id, p.id);
    if (readinessOf(p, items).steps.options) continue;
    const o = outlineOf(p, items);
    if (o.level === "complete") continue;
    const last = [p.updatedAt, p.createdAt, ...items.map((i) => i.updatedAt)].filter(Boolean).map(String).sort().at(-1)!;
    out.push({ p, have: o.have.length, missing: o.missing, last });
  }
  // The most recently worked on first
  return out.sort((a, b) => b.last.localeCompare(a.last));
}


/** The tip email for one organization */
export function outlineEmail(t: Tenant, list: Unfinished[], step: number, portal: string) {
  const free = isProspect(t);
  const shown = list.slice(0, NUDGE_PROJECTS);
  const one = shown.length === 1 ? shown[0]! : undefined;
  const base = `${portal}o/${t.slug}/projects`;
  const last = step === NUDGE_DAYS.length - 1;
  const intro = [
    one
      ? `${one.p.key} ${one.p.name} has ${one.have} of ${OUTLINE_PARTS.length} outline parts written. A few words on what's missing make the assessment and our call sharper.`
      : `${shown.length} projects in ${t.name} have outlines still to finish. A few words on what's missing make the assessment and our call sharper.`,
    `When it reads right to you, ask for an assessment from Next step on Home.${last ? " This is the last reminder." : ""}`,
  ];
  const mail = factMail({
    kicker: free ? "free account tip" : "outline tip",
    title: "Outline tips",
    sub: t.name,
    preheader: one ? `${one.p.key}: ${outlineTip(one.missing)}.` : `${shown.length} outlines to finish in ${t.name}.`,
    intro,
    facts: shown.map((x) => ({ k: x.p.key, v: `${x.p.name} · ${x.have} of ${OUTLINE_PARTS.length}`, href: `${base}/${x.p.key}` })),
    blocks: shown.map((x): [string, string] => [`${x.p.key} tips`, `${outlineTip(x.missing)[0]!.toUpperCase()}${outlineTip(x.missing).slice(1)}.`]),
    action: { label: one ? `Open ${one.p.key}` : "Open your projects", url: one ? `${base}/${one.p.key}` : base },
    why: `You're a member of ${t.name}${free ? "'s free account" : ""} on 1NEON, and an outline there isn't finished yet.`,
    settings: { text: "Turn outline tips off in your 1NEON profile, under Notifications.", url: `${portal}me#notifications` },
    reply: "Reply to this email to reach me.",
  });
  return { subject: subjectOf("Outline tips", one ? `${one.p.key} ${one.p.name}` : t.name), ...mail, as: (free ? "trial" : "portal") as SenderKind, replyTo: "hello@neon1.tech" };
}


/** The outline-tips pass, at most once a day */
export async function sweepOutlineNudges(k: Pick<Kit, "repo" | "d" | "cfg">, at = new Date()) {
  const { repo, d, cfg } = k;
  try {
    await repo.table.write([{ put: { PK: "CONFIG", SK: `NUDGE#${at.toISOString().slice(0, 10)}`, ttl: Math.floor(at.getTime() / 1000) + 3 * 86_400 }, guard: { create: true } }]);
  } catch {
    return { sent: 0, skipped: true };
  }
  let sent = 0;
  const portal = `${cfg.publicUrl}/1NEON/`;
  for (const t of await repo.listTenants()) {
    const q = t.prospect;
    if (t.test) continue;
    if (q && (q.deletingAt || q.heldAt || q.suspendedAt)) continue;
    // Something waiting to go to neon1 already: no tips. Projects already sent are left out below
    const req = await repo.table.get(`T#${t.id}`, "REQUEST#assessment");
    if (req?.state === "waiting") continue;
    const list = await unfinished(repo, t, (req?.history as Record<string, string> | undefined) ?? {});
    if (!list.length) continue;
    // The last change: in a free account any change counts (guards.ts), in a client's the projects' own
    const active = q ? await repo.table.get(`T#${t.id}`, "ACTIVE") : undefined;
    const last = [list[0]!.last, active?.at ? String(active.at) : ""].sort().at(-1)!;
    const row = ((await repo.table.get(`T#${t.id}`, "NUDGE#outline")) ?? {}) as NudgeRow;
    // A change since the last tip email starts the count again
    const count = row.since && last > row.since ? 0 : row.count ?? 0;
    const step = NUDGE_DAYS[count];
    if (step === undefined || at.getTime() - Date.parse(last) < step * DAY_MS) continue;
    if (q?.noticeAt && at.getTime() - Date.parse(q.noticeAt) < QUIET_GAP_MS) continue;
    const mail = outlineEmail(t, list, count, portal);
    const free = isProspect(t);
    let to = 0, tried = 0;
    for (const m of await repo.listMembers(t.id)) {
      if (m.status !== "joined" || cfg.operatorEmails.includes(m.email.toLowerCase())) continue;
      const u = await repo.getUser(m.userId);
      if (!wantsOutlineTips(u?.notify, free)) continue;
      tried++;
      try {
        await d.mailer.send(m.email, mail.subject, mail.text, mail.html, mail.replyTo, undefined, undefined, mail.as);
        to++;
      } catch (e) {
        console.error(JSON.stringify({ level: "error", message: "outline tips email refused", tenant: t.id, error: String(e).slice(0, 200) }));
      }
    }
    // The mail service took none: the same email is tried on the next pass
    if (tried && !to) continue;
    // Counted whether or not anyone wanted it, so a person who turns tips back on isn't sent an old one
    await repo.table.write([{ put: { PK: `T#${t.id}`, SK: "NUDGE#outline", count: count + 1, since: last, at: at.toISOString() }, guard: { always: true as const } }]);
    if (to) sent++;
  }
  return { sent };
}
