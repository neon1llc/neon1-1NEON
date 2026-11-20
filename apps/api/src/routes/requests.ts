// apps/api/src/routes/requests.ts - Asking neon1 for the next step from inside 1NEON: an assessment of
// the projects outlined here, or a call to talk it through. Any member who can write may ask, a new
// (prospect) account included.
//
// An assessment request is a saved draft, not a one-shot email. Saving it (one to three projects and a
// note in the person's own words) locks it on Home and starts a 30-minute clock; Edit unlocks it, and each
// save starts the clock again. When 30 minutes pass with no change, the scheduled pass (sweepRequests)
// emails neon1 what's there, with the person as Reply-To, never within an hour of the last email. So an
// organization sends at most one email an hour however often it edits, and what it last wrote arrives. Editing after it was sent
// works the same way and sends it again, marked as updated. Withdraw cancels a request not yet sent.
// A call can still be asked once a week, and goes at once.


import { isClosed, isProspect, MIN_ASSESSMENT_NOTE, assessmentNoteProblem, OUTLINE_PARTS, outlineOf, readinessOf, type Outline, type Project, type Tenant } from "@1neon/domain";
import type { Context } from "hono";
import { z } from "zod";
import { actorId, body, fail, need, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { requestEmail } from "../emails.ts";
import { CONTACT_TO } from "./contact.ts";


// What can be asked for, as the email and the activity name it
export const REQUEST_KINDS = { assessment: "an assessment", call: "a call" } as const;
export type RequestKind = keyof typeof REQUEST_KINDS;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** How long an assessment request waits after its last change before it's emailed: long enough to come
 * back and add the thing just remembered. Zero (the in-browser demo) sends on save */
export const SEND_AFTER_MS = 30 * 60 * 1000;
/** The least time between two emails to neon1 from one organization's assessment request */
export const EMAIL_GAP_MS = 60 * 60 * 1000;
// Saves per organization per hour: plenty for real editing, not a way to hammer the table
export const SAVES_HOURLY = 30;
// The most projects one assessment request names
export const REQUEST_PROJECTS = 3;
// Requests waiting for their hour, one row per organization, read by the scheduled pass
const PENDING = "REQUEST#PENDING";

const AssessmentBody = z.object({
  // Their own words: what to keep in mind as neon1 looks
  note: z.string().trim().max(2000),
  // The project keys it's for
  projects: z.array(z.string().max(20)).min(1).max(REQUEST_PROJECTS),
});
// The older one-call shape: an assessment saves the same way; a call goes at once
const RequestBody = z.object({
  kind: z.enum(["assessment", "call"]),
  note: z.string().trim().max(2000).default(""),
  projects: z.array(z.string().max(20)).max(REQUEST_PROJECTS).default([]),
});

/** One project as Next step shows it: its outline, when it was last sent for assessment, and whether it's
 * past assessing (it has options, or a client's project neon1 has moved on) */
export interface RequestProject { key: string; name: string; outline: Outline; sentAt?: string; decided?: boolean }

/** The organization's assessment request as stored: what's written now, whether it's waiting for its hour
 * or sent, and per project when it was last emailed */
interface Assessment {
  note?: string;
  projects?: string[];
  by?: string;
  editedAt?: string;
  state?: "waiting" | "sent";
  dueAt?: string;
  sentAt?: string;
  // When each project was last emailed to neon1
  history?: Record<string, string>;
  version?: number;
}
type Call = { at?: string; by?: string };

// When it goes: half an hour after this change, and never within an hour of the last email
const dueFrom = (edited: Date, lastSent: string | undefined, wait: number) =>
  new Date(Math.max(edited.getTime() + wait, lastSent && wait ? Date.parse(lastSent) + EMAIL_GAP_MS : 0)).toISOString();

// A stored row without the table's keys or anything undefined, ready to write back under new values
const rowOf = (tid: string, a: Assessment) => {
  const clean = Object.fromEntries(Object.entries(a).filter(([key, v]) => v !== undefined && key !== "PK" && key !== "SK"));
  return { PK: `T#${tid}`, SK: "REQUEST#assessment", ...clean };
};


/** Every open project with its outline, newest first, and when each was last sent for assessment */
async function projectsOf(repo: Kit["repo"], t: Tenant, history: Record<string, string>): Promise<{ list: RequestProject[]; byKey: Map<string, Project> }> {
  const first = (t.stages.find((x) => !x.hidden) ?? t.stages[0])?.id;
  const live = (await repo.listProjects(t.id)).filter((p) => !p.archived && !isClosed(t.stages, p.stageId));
  live.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const list = await Promise.all(live.slice(0, 20).map(async (p) => {
    const items = await repo.listItems(t.id, p.id);
    // Past assessing: it has options (or an agreed one), or, for a client, neon1 has already moved it on
    // from the first stage. Next step leaves those out
    const decided = readinessOf(p, items).steps.options || (!isProspect(t) && p.stageId !== first);
    return { key: p.key, name: p.name, outline: outlineOf(p, items), ...(history[p.key] ? { sentAt: history[p.key] } : {}), ...(decided ? { decided } : {}) };
  }));
  return { list, byKey: new Map(live.map((p) => [p.key, p])) };
}

// A project's line in the email: its key, name, how far it's outlined, and what it still lacks
const projectLine = (p: RequestProject) =>
  `${p.key} ${p.name} (${p.outline.level === "complete" ? "fully outlined" : p.outline.level === "outlined" ? "outlined" : "started"}${p.outline.missing.length ? `; not yet: ${p.outline.missing.map((m) => OUTLINE_PARTS.find((x) => x.id === m)!.label.toLowerCase()).join(", ")}` : ""})`;


/** Email one organization's waiting assessment request, as it stands now. Projects deleted or moved on
 * since are left out; with none left, nothing is sent and the request is cancelled */
async function sendAssessment(k: Pick<Kit, "repo" | "d" | "cfg">, tid: string, at: Date): Promise<"sent" | "cancelled" | "skipped"> {
  const { repo, d, cfg } = k;
  const t = await repo.getTenant(tid);
  const row = (await repo.table.get(`T#${tid}`, "REQUEST#assessment")) as Assessment | undefined;
  const done = { delete: { PK: PENDING, SK: tid } };
  if (!t || !row || row.state !== "waiting") {
    await repo.table.write([done]);
    return "skipped";
  }
  const history = { ...(row.history ?? {}) };
  const { list } = await projectsOf(repo, t, history);
  const chosen = (row.projects ?? []).map((key) => list.find((p) => p.key === key && !p.decided)).filter((p): p is RequestProject => Boolean(p));
  const user = row.by ? await repo.getUser(row.by) : undefined;
  if (!chosen.length || !user) {
    await repo.table.write([
      done,
      { put: rowOf(tid, { ...row, state: row.sentAt ? "sent" : undefined, dueAt: undefined }), guard: { always: true as const } },
      repo.auditOp({ tenantId: tid, actorId: "system", action: "request.cancelled", target: tid, summary: "An assessment request wasn't sent: its projects are gone or past assessing" }),
    ]);
    return "cancelled";
  }
  const updated = Boolean(row.sentAt);
  const mail = requestEmail({ kind: "assessment", what: REQUEST_KINDS.assessment, updated, note: row.note ?? "", who: user.name, email: user.email, org: t.name, ref: t.clientId, free: isProspect(t), place: t.place, link: t.link, projects: chosen.map(projectLine).join("\n"), url: `${cfg.publicUrl}/1NEON/o/${t.slug}/workspace`, at: new Date(row.editedAt ?? at) });
  await d.mailer.send(CONTACT_TO, mail.subject, mail.text, mail.html, user.email, undefined, undefined, mail.as);
  const iso = at.toISOString();
  for (const p of chosen) history[p.key] = iso;
  await repo.table.write([
    done,
    { put: rowOf(tid, { ...row, state: "sent", sentAt: iso, dueAt: undefined, history }), guard: { always: true as const } },
    repo.auditOp({ tenantId: tid, actorId: row.by ?? "system", action: "request.assessment", target: tid, summary: `${updated ? "Updated the assessment request" : "Asked neon1 for an assessment"} (${chosen.map((p) => p.key).join(", ")})${row.note ? `: ${row.note.slice(0, 140)}` : ""}` }),
  ]);
  return "sent";
}


/** The scheduled pass: email each assessment request whose quiet half hour has passed */
export async function sweepRequests(k: Pick<Kit, "repo" | "d" | "cfg">, opts: { at?: Date; deadline?: number } = {}): Promise<{ waiting: number; sent: number }> {
  const at = opts.at ?? new Date();
  const rows = await k.repo.table.query(PENDING);
  let sent = 0;
  for (const r of rows) {
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) break;
    if (Date.parse(String(r.dueAt)) > at.getTime()) continue;
    if ((await sendAssessment(k, String(r.SK), at)) === "sent") sent++;
  }
  return { waiting: rows.length, sent };
}


export function requestRoutes(app: App, k: Kit) {
  const { repo, d, cfg } = k;
  const wait = cfg.requestDelayMs ?? SEND_AFTER_MS;
  const assessmentOf = async (tid: string) => ((await repo.table.get(`T#${tid}`, "REQUEST#assessment")) ?? {}) as Assessment;

  // What Next step needs: the assessment request as it stands, when a call was last asked, and every
  // open project with its outline
  app.get("/t/:tid/requests", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const [a, call] = await Promise.all([assessmentOf(t.id), repo.table.get(`T#${t.id}`, "REQUEST#call") as Promise<Call | undefined>]);
    const { list } = await projectsOf(repo, t, a.history ?? {});
    return c.json({
      ...(a.state ? { assessment: { state: a.state, note: a.note ?? "", projects: a.projects ?? [], editedAt: a.editedAt, ...(a.dueAt ? { dueAt: a.dueAt } : {}), ...(a.sentAt ? { sentAt: a.sentAt } : {}) } } : {}),
      ...(call?.at ? { call: { at: call.at, by: call.by ?? "" } } : {}),
      projects: list,
      limit: REQUEST_PROJECTS,
      minNote: MIN_ASSESSMENT_NOTE,
      sendAfterMinutes: Math.round(wait / 60_000),
    });
  });

  // Save the assessment request: lock it and start (or restart) its hour
  const save = async (c: Context, input: z.infer<typeof AssessmentBody>) => {
    const t = c.get("tenant") as Tenant;
    const { user } = who(c as never);
    const at = new Date();
    const problem = assessmentNoteProblem(input.note);
    if (problem) fail(400, "note", problem);
    const keys = [...new Set(input.projects.map((x) => x.trim().toUpperCase()))];
    const prior = await assessmentOf(t.id);
    const { list } = await projectsOf(repo, t, prior.history ?? {});
    for (const key of keys) if (!list.some((p) => p.key === key && !p.decided)) fail(400, "projects", `${key} isn't a project waiting for an assessment here.`);
    const hour = Math.floor(at.getTime() / 3_600_000);
    if ((await repo.table.increment("COUNTER", `REQSAVE#${t.id}#${hour}`, 1, hour * 3600 + 7200)) > SAVES_HOURLY) {
      fail(429, "too_many", "That's a lot of changes this hour. What's saved is kept; try again in a little while.");
    }
    const dueAt = dueFrom(at, prior.sentAt, wait);
    const next: Assessment = { ...prior, note: input.note, projects: keys, by: user.id, editedAt: at.toISOString(), state: "waiting", dueAt, version: (prior.version ?? 0) + 1 };
    await repo.table.write([
      { put: rowOf(t.id, next), guard: { always: true as const } },
      { put: { PK: PENDING, SK: t.id, dueAt }, guard: { always: true as const } },
      repo.auditOp({ tenantId: t.id, actorId: actorId(c as never), action: "request.saved", target: t.id, summary: `Saved an assessment request (${keys.join(", ")}); it goes to neon1 30 minutes after the last change` }),
    ]);
    // The in-browser demo has no scheduled pass: with no wait, it goes now
    if (wait === 0) await sendAssessment(k, t.id, at);
    return { ok: true, state: wait === 0 ? "sent" : "waiting", dueAt, projects: keys };
  };

  app.put("/t/:tid/requests/assessment", async (c) => {
    need(c, "write");
    return c.json(await save(c, await body(c, AssessmentBody)));
  });

  // Withdraw a request still waiting for its hour; one already sent stays sent
  app.delete("/t/:tid/requests/assessment", async (c) => {
    need(c, "write");
    const t = c.get("tenant");
    const prior = await assessmentOf(t.id);
    if (prior.state !== "waiting") fail(409, "not_waiting", "There's no request waiting to go.");
    const next: Assessment = { ...prior, state: prior.sentAt ? "sent" : undefined, dueAt: undefined, version: (prior.version ?? 0) + 1 };
    await repo.table.write([
      { put: rowOf(t.id, next), guard: { always: true as const } },
      { delete: { PK: PENDING, SK: t.id } },
      repo.auditOp({ tenantId: t.id, actorId: actorId(c), action: "request.withdrawn", target: t.id, summary: "Withdrew an assessment request before it went to neon1" }),
    ]);
    return c.json({ ok: true });
  });

  // A call goes at once, once a week; an assessment sent this way saves like the PUT above
  app.post("/t/:tid/requests", async (c) => {
    need(c, "write");
    const input = await body(c, RequestBody);
    if (input.kind === "assessment") {
      if (!input.projects.length) fail(400, "projects", "Choose at least one project to assess.");
      return c.json(await save(c, { note: input.note, projects: input.projects }));
    }
    const t = c.get("tenant");
    const { user } = who(c);
    const at = new Date();
    const prior = (await repo.table.get(`T#${t.id}`, "REQUEST#call")) as Call | undefined;
    if (prior?.at && at.getTime() - Date.parse(prior.at) < WEEK_MS) fail(409, "already_asked", "A call was asked for this week. You'll get a reply by email.");
    const mail = requestEmail({ kind: "call", what: REQUEST_KINDS.call, note: input.note, who: user.name, email: user.email, org: t.name, ref: t.clientId, free: isProspect(t), place: t.place, link: t.link, url: `${cfg.publicUrl}/1NEON/o/${t.slug}/workspace`, at });
    await d.mailer.send(CONTACT_TO, mail.subject, mail.text, mail.html, user.email, undefined, undefined, mail.as);
    const iso = at.toISOString();
    await repo.table.write([
      { put: { PK: `T#${t.id}`, SK: "REQUEST#call", at: iso, by: user.id }, guard: { always: true as const } },
      repo.auditOp({ tenantId: t.id, actorId: actorId(c), action: "request.call", target: t.id, summary: `Asked neon1 for a call${input.note ? `: ${input.note.slice(0, 140)}` : ""}` }),
    ]);
    return c.json({ ok: true, at: iso });
  });
}
