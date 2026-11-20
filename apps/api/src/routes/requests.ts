// apps/api/src/routes/requests.ts - Asking neon1 for the next step from inside 1NEON: an assessment of
// the projects outlined here, or a call to talk it through. Any member who can write may ask, a new
// (prospect) account included. An assessment names the projects (one to three) and carries a note in the
// person's own words. Each request emails neon1's inbox with the person as Reply-To, lands in the
// organization's activity, and is remembered per project so the page can say what was sent and when.
// A project already sent can't be sent again for two weeks, a call can be asked once a week, and a small
// cap per organization per week keeps either from becoming a way to flood the inbox.


import { isClosed, isProspect, messageProblem, OUTLINE_PARTS, outlineOf, readinessOf, type Outline, type Project } from "@1neon/domain";
import { z } from "zod";
import { actorId, body, fail, need, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { requestEmail } from "../emails.ts";
import { CONTACT_TO } from "./contact.ts";


// What can be asked for, as the email and the activity name it
export const REQUEST_KINDS = { assessment: "an assessment", call: "a call" } as const;
export type RequestKind = keyof typeof REQUEST_KINDS;
// Requests per organization in a seven-day window, both kinds together. A window, not a calendar day,
// so the limit doesn't reset at midnight UTC (evening in the US)
export const REQUESTS_WEEKLY = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// A project sent for assessment waits this long before it can be sent again; a call, a week
export const RESEND_MS = 2 * WEEK_MS;
// The most projects one assessment request names
export const REQUEST_PROJECTS = 3;

const RequestBody = z.object({
  kind: z.enum(["assessment", "call"]),
  // Their own words: what to keep in mind for an assessment (required), or good times to talk
  note: z.string().trim().max(2000).default(""),
  // The project keys an assessment is for
  projects: z.array(z.string().max(20)).max(REQUEST_PROJECTS).default([]),
});

/** One project as Next step shows it: its outline, and when it was last sent for assessment */
export interface RequestProject { key: string; name: string; outline: Outline; sentAt?: string; decided?: boolean }

// When a stored request row was made, and per project when each was sent
type Stored = { at?: string; by?: string; projects?: Record<string, string>; times?: string[] };


export function requestRoutes(app: App, k: Kit) {
  const { repo, d, cfg } = k;

  // Every open project with its outline, newest first, and when it was last sent for assessment
  const projectsOf = async (tid: string, sent: Record<string, string>, stages: { id: string; hidden?: boolean }[]): Promise<{ list: RequestProject[]; byKey: Map<string, Project> }> => {
    const t = (await repo.getTenant(tid))!;
    const first = (stages.find((x) => !x.hidden) ?? stages[0])?.id;
    const live = (await repo.listProjects(tid)).filter((p) => !p.archived && !isClosed(stages, p.stageId));
    live.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const list = await Promise.all(live.slice(0, 20).map(async (p) => {
      const items = await repo.listItems(tid, p.id);
      // Past assessing: it has options (or an agreed one), or, for a client, neon1 has already moved it on
      // from the first stage. Next step leaves those out
      const decided = readinessOf(p, items).steps.options || (!isProspect(t) && p.stageId !== first);
      return { key: p.key, name: p.name, outline: outlineOf(p, items), ...(sent[p.key] ? { sentAt: sent[p.key] } : {}), ...(decided ? { decided } : {}) };
    }));
    return { list, byKey: new Map(live.map((p) => [p.key, p])) };
  };
  const stored = async (tid: string, kind: RequestKind) => ((await repo.table.get(`T#${tid}`, `REQUEST#${kind}`)) ?? {}) as Stored;

  // What Next step needs: when each kind was last asked for, and every open project with its outline
  app.get("/t/:tid/requests", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const [a, call] = await Promise.all([stored(t.id, "assessment"), stored(t.id, "call")]);
    const { list } = await projectsOf(t.id, a.projects ?? {}, t.stages);
    return c.json({
      ...(a.at ? { assessment: { at: a.at, by: a.by ?? "" } } : {}),
      ...(call.at ? { call: { at: call.at, by: call.by ?? "" } } : {}),
      projects: list,
      limit: REQUEST_PROJECTS,
    });
  });

  app.post("/t/:tid/requests", async (c) => {
    need(c, "write");
    const input = await body(c, RequestBody);
    const t = c.get("tenant");
    const { user } = who(c);
    const at = new Date();
    const prior = await stored(t.id, input.kind);
    const sent = { ...(prior.projects ?? {}) };
    const fresh = (iso: string | undefined, ms: number) => Boolean(iso) && at.getTime() - Date.parse(iso!) < ms;
    // The assessment's projects: real, open, this organization's, and at least one not already sent
    let chosen: RequestProject[] = [];
    if (input.kind === "assessment") {
      const problem = messageProblem(input.note);
      if (problem) fail(400, "note", problem);
      const keys = [...new Set(input.projects.map((x) => x.trim().toUpperCase()))];
      if (!keys.length) fail(400, "projects", "Choose at least one project to assess.");
      const { list } = await projectsOf(t.id, sent, t.stages);
      chosen = keys.map((key) => list.find((p) => p.key === key && !p.decided) ?? fail(400, "projects", `${key} isn't a project waiting for an assessment here.`));
      const waiting = chosen.filter((p) => fresh(p.sentAt, RESEND_MS));
      if (waiting.length === chosen.length) {
        fail(409, "already_sent", `${waiting.map((p) => p.key).join(", ")} ${waiting.length === 1 ? "is" : "are"} already with neon1. You'll get a reply by email.`);
      }
      chosen = chosen.filter((p) => !fresh(p.sentAt, RESEND_MS));
    } else if (fresh(prior.at, WEEK_MS)) {
      fail(409, "already_asked", "A call was asked for this week. You'll get a reply by email.");
    }
    // Both kinds together, over the last seven days (kept on the assessment row, the one asked most)
    const window = await stored(t.id, "assessment");
    const recent = (window.times ?? []).filter((x) => fresh(x, WEEK_MS));
    if (recent.length >= REQUESTS_WEEKLY) fail(429, "too_many", "That's a few requests this week already. They've arrived; you'll get a reply by email.");
    const what = REQUEST_KINDS[input.kind];
    const free = isProspect(t);
    const projects = chosen.length
      ? chosen.map((p) => `${p.key} ${p.name} (${p.outline.level === "complete" ? "fully outlined" : p.outline.level === "outlined" ? "outlined" : "started"}${p.outline.missing.length ? `; not yet: ${p.outline.missing.map((m) => OUTLINE_PARTS.find((x) => x.id === m)!.label.toLowerCase()).join(", ")}` : ""})`).join("\n")
      : undefined;
    const mail = requestEmail({ kind: input.kind, what, note: input.note, who: user.name, email: user.email, org: t.name, ref: t.clientId, free, place: t.place, link: t.link, projects, url: `${cfg.publicUrl}/1NEON/o/${t.slug}/workspace`, at });
    // From "1NEON Reach" (a free account's request) or "neon1 Alerts" (a client's)
    await d.mailer.send(CONTACT_TO, mail.subject, mail.text, mail.html, user.email, undefined, undefined, mail.as);
    const iso = at.toISOString();
    for (const p of chosen) sent[p.key] = iso;
    const times = [...recent, iso];
    const forWhat = chosen.length ? ` (${chosen.map((p) => p.key).join(", ")})` : "";
    await repo.table.write([
      input.kind === "assessment"
        ? { put: { PK: `T#${t.id}`, SK: "REQUEST#assessment", at: iso, by: user.id, projects: sent, times }, guard: { always: true as const } }
        : { put: { PK: `T#${t.id}`, SK: "REQUEST#call", at: iso, by: user.id }, guard: { always: true as const } },
      ...(input.kind === "call" ? [{ put: { PK: `T#${t.id}`, SK: "REQUEST#assessment", ...window, times }, guard: { always: true as const } }] : []),
      repo.auditOp({ tenantId: t.id, actorId: actorId(c), action: `request.${input.kind}`, target: t.id, summary: `Asked neon1 for ${what}${forWhat}${input.note ? `: ${input.note.slice(0, 140)}` : ""}` }),
    ]);
    return c.json({ ok: true, at: iso, projects: chosen.map((p) => p.key) });
  });
}

