// apps/api/src/routes/requests.ts - Asking neon1 for the next step from inside 1NEON: an assessment of
// the projects outlined here, or a call to talk it through. Any member who can write may ask, a new
// (prospect) account included. An assessment names the projects (one to three) and carries a note in the
// person's own words. Each request emails neon1's inbox with the person as Reply-To, lands in the
// organization's activity, and is remembered per project so the page can say what was sent and when.
// A project already sent can't be sent again for two weeks, a call can be asked once a week, and a small
// cap per organization per week keeps either from becoming a way to flood the inbox.
//
// The limits hold under concurrency: a request first claims its windows with create-only rows (one per
// project, one for a call) that expire when the window ends, so two presses, two tabs, or six at once
// can't all pass; only the one that claims sends the email. A request carrying the same key as one
// already claimed gets the first answer back (a retry after a lost reply). A send that fails releases
// everything it claimed, so a request that never left doesn't cost the person its window.


import { ASSESSMENT_RESEND_DAYS, CALL_RESEND_DAYS, isClosed, isProspect, messageProblem, OUTLINE_PARTS, outlineOf, readinessOf, REQUEST_PROJECTS_MAX, REQUESTS_PER_WEEK, requestAgainAt, type Outline, type Project } from "@1neon/domain";
import { z } from "zod";
import { actorId, body, fail, need, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { ConflictError, type WriteOp } from "../store/types.ts";
import { requestEmail } from "../emails.ts";
import { CONTACT_TO } from "./contact.ts";


// What can be asked for, as the email and the activity name it
export const REQUEST_KINDS = { assessment: "an assessment", call: "a call" } as const;
export type RequestKind = keyof typeof REQUEST_KINDS;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// The most projects one assessment request names
export const REQUEST_PROJECTS = REQUEST_PROJECTS_MAX;
export const REQUESTS_WEEKLY = REQUESTS_PER_WEEK;

const RequestBody = z.object({
  kind: z.enum(["assessment", "call"]),
  // Their own words: what to keep in mind for an assessment (required), or good times to talk
  note: z.string().trim().max(2000).default(""),
  // One per press of the button: the same key again is the same request (a retry after a lost reply)
  key: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  // The project keys an assessment is for
  projects: z.array(z.string().max(20)).max(REQUEST_PROJECTS).default([]),
});

/** One project as Next step shows it: its outline, and when it was last sent for assessment */
export interface RequestProject { key: string; name: string; outline: Outline; sentAt?: string; again?: string; decided?: boolean }

// When a stored request row was made, and per project when each was sent
type Stored = { at?: string; by?: string; projects?: Record<string, string> };

// The claims: a window per project sent, one for a call, and the answer to a key already used
const lockSk = (kind: RequestKind, key?: string) => `REQLOCK#${kind}${key ? `#${key}` : ""}`;
const keySk = (key: string) => `REQKEY#${key}`;
const CAP_SK = "REQCAP";

/** A date in the person's own zone, for the words of an answer ("Nov 26") */
function dayIn(iso: string, zone?: string) {
  const f = (timeZone?: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  try { return f(zone || "America/New_York"); } catch { return f("America/New_York"); }
}


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

  // What Next step needs: when each kind was last asked for, and every open project with its outline.
  // A project's sent date is the live claim when there is one, so it is right even if two requests for
  // different projects saved their history at the same moment
  app.get("/t/:tid/requests", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const [a, call, locks] = await Promise.all([stored(t.id, "assessment"), stored(t.id, "call"), repo.table.query(`T#${t.id}`, "REQLOCK#assessment#")]);
    const sent = { ...(a.projects ?? {}) };
    for (const l of locks) if (l.project && l.at) sent[String(l.project)] = String(l.at);
    const { list } = await projectsOf(t.id, sent, t.stages);
    return c.json({
      ...(a.at ? { assessment: { at: a.at, by: a.by ?? "" } } : {}),
      ...(call.at ? { call: { at: call.at, by: call.by ?? "", again: requestAgainAt(call.at, "call") } } : {}),
      projects: list.map((p) => (p.sentAt ? { ...p, again: requestAgainAt(p.sentAt) } : p)),
      limit: REQUEST_PROJECTS,
      resendDays: ASSESSMENT_RESEND_DAYS,
      callDays: CALL_RESEND_DAYS,
    });
  });

  app.post("/t/:tid/requests", async (c) => {
    need(c, "write");
    const input = await body(c, RequestBody);
    const t = c.get("tenant");
    const { user } = who(c);
    // A press carrying a key already used is that request again: the first answer, and no second email
    const replay = async () => {
      const was = input.key ? await repo.table.get(`T#${t.id}`, keySk(input.key)) : undefined;
      return was ? c.json({ ok: true, at: String(was.at), again: String(was.again), projects: (was.projects as string[] | undefined) ?? [], repeated: true }) : undefined;
    };
    const first = await replay();
    if (first) return first;
    const at = new Date();
    const iso = at.toISOString();
    const prior = await stored(t.id, input.kind);
    const sent = { ...(prior.projects ?? {}) };
    const fresh = (when: string | undefined, ms: number) => Boolean(when) && at.getTime() - Date.parse(when!) < ms;
    const dated = (when: string, kind: RequestKind) => `on ${dayIn(when, user.timeZone)}, and I'll reply by email. You can ask again from ${dayIn(requestAgainAt(when, kind), user.timeZone)}.`;
    // The assessment's projects: real, open, this organization's, and at least one not already sent
    let chosen: RequestProject[] = [];
    if (input.kind === "assessment") {
      const problem = messageProblem(input.note);
      if (problem) fail(400, "note", problem);
      const keys = [...new Set(input.projects.map((x) => x.trim().toUpperCase()))];
      if (!keys.length) fail(400, "projects", "Choose at least one project to assess.");
      const { list } = await projectsOf(t.id, sent, t.stages);
      chosen = keys.map((key) => list.find((p) => p.key === key && !p.decided) ?? fail(400, "projects", `${key} isn't a project waiting for an assessment here.`));
      const waiting = chosen.filter((p) => fresh(p.sentAt, ASSESSMENT_RESEND_DAYS * 86_400_000));
      if (waiting.length === chosen.length) {
        const w = waiting[0]!;
        fail(409, "already_sent", `${waiting.map((p) => p.key).join(", ")} ${waiting.length === 1 ? "was" : "were"} sent ${dated(w.sentAt!, "assessment")}`);
      }
      chosen = chosen.filter((p) => !fresh(p.sentAt, ASSESSMENT_RESEND_DAYS * 86_400_000));
    } else if (fresh(prior.at, CALL_RESEND_DAYS * 86_400_000)) {
      fail(409, "already_asked", `You asked for a call ${dated(prior.at!, "call")}`);
    }
    const again = requestAgainAt(iso, input.kind);
    const ttl = Math.ceil(Date.parse(again) / 1000);
    // The claims, all or nothing: whoever creates them is the one request that goes out. A second press
    // finds them (or its own key's answer) and sends nothing
    const claims: WriteOp[] = input.kind === "assessment"
      ? chosen.map((p) => ({ put: { PK: `T#${t.id}`, SK: lockSk("assessment", p.key), project: p.key, at: iso, again, by: user.id, ttl }, guard: { create: true as const } }))
      : [{ put: { PK: `T#${t.id}`, SK: lockSk("call"), at: iso, again, by: user.id, ttl }, guard: { create: true as const } }];
    if (input.key) claims.push({ put: { PK: `T#${t.id}`, SK: keySk(input.key), at: iso, again, projects: chosen.map((p) => p.key), ttl: Math.ceil(at.getTime() / 1000) + 86_400 }, guard: { create: true as const } });
    const release = () => repo.table.write(claims.map((op) => ({ delete: { PK: "put" in op ? op.put.PK : "", SK: "put" in op ? op.put.SK : "" } })));
    try {
      await repo.table.write(claims);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      const again1 = await replay();
      if (again1) return again1;
      const was = e.current;
      const when = was?.at ? String(was.at) : iso;
      if (input.kind === "assessment") fail(409, "already_sent", `${was?.project ? String(was.project) : "That project"} was sent ${dated(when, "assessment")}`);
      fail(409, "already_asked", `You asked for a call ${dated(when, "call")}`);
    }
    // Both kinds together, in a window that starts at the first of them: counted atomically, so six at
    // once can't each see room. Over the cap gives the claim back
    const count = await repo.table.increment(`T#${t.id}`, CAP_SK, 1, Math.ceil((at.getTime() + WEEK_MS) / 1000));
    if (count > REQUESTS_WEEKLY) {
      await repo.table.increment(`T#${t.id}`, CAP_SK, -1);
      await release();
      fail(429, "too_many", "That's a few requests this week already. They've arrived; you'll get a reply by email.");
    }
    const what = REQUEST_KINDS[input.kind];
    const free = isProspect(t);
    const projects = chosen.length
      ? chosen.map((p) => `${p.key} ${p.name} (${p.outline.level === "complete" ? "fully outlined" : p.outline.level === "outlined" ? "outlined" : "started"}${p.outline.missing.length ? `; not yet: ${p.outline.missing.map((m) => OUTLINE_PARTS.find((x) => x.id === m)!.label.toLowerCase()).join(", ")}` : ""})`).join("\n")
      : undefined;
    const mail = requestEmail({ kind: input.kind, what, note: input.note, who: user.name, email: user.email, org: t.name, ref: t.clientId, free, place: t.place, link: t.link, projects, url: `${cfg.publicUrl}/1NEON/o/${t.slug}/workspace`, at });
    // From "1NEON Reach" (a free account's request) or "neon1 Alerts" (a client's). A send that fails gives
    // the claims and the count back, so a request that never left doesn't cost the person its window
    try {
      await d.mailer.send(CONTACT_TO, mail.subject, mail.text, mail.html, user.email, undefined, undefined, mail.as);
    } catch (e) {
      await repo.table.increment(`T#${t.id}`, CAP_SK, -1);
      await release();
      throw e;
    }
    for (const p of chosen) sent[p.key] = iso;
    const forWhat = chosen.length ? ` (${chosen.map((p) => p.key).join(", ")})` : "";
    await repo.table.write([
      input.kind === "assessment"
        ? { put: { PK: `T#${t.id}`, SK: "REQUEST#assessment", at: iso, by: user.id, projects: sent }, guard: { always: true as const } }
        : { put: { PK: `T#${t.id}`, SK: "REQUEST#call", at: iso, by: user.id }, guard: { always: true as const } },
      repo.auditOp({ tenantId: t.id, actorId: actorId(c), action: `request.${input.kind}`, target: t.id, summary: `Asked neon1 for ${what}${forWhat}${input.note ? `: ${input.note.slice(0, 140)}` : ""}` }),
    ]);
    return c.json({ ok: true, at: iso, again, projects: chosen.map((p) => p.key) });
  });
}
