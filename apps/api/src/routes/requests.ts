// apps/api/src/routes/requests.ts - Asking neon1 for the next step from inside 1NEON: an assessment of
// what's written down, or a call to talk it through. Any member who can write may ask, a new (prospect)
// account included. Each request emails neon1's inbox with the person as Reply-To, lands in the
// organization's activity, and is remembered so the page can say when it was asked.
//
// The limit is one open request of each kind per organization: after one goes out, the same kind can be
// sent again REQUEST_COOLDOWN_DAYS later (packages/domain/src/requests.ts), a rolling window from that
// moment, so it can't be beaten by a midnight or a second browser. The claim is one create-only row with
// a ttl (REQLOCK), so two presses at once can't both pass; the same key sent twice (a retry after a lost
// reply) gets the first answer back and no second email.


import { isProspect, outlineOf, outlineSummary, REQUEST_COOLDOWN_DAYS, REQUEST_PROJECTS_MAX, requestAgainAt, type Outline, type RequestKind } from "@1neon/domain";
import { z } from "zod";
import { actorId, body, fail, need, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { gist, factMail, type Fact } from "../lib/factmail.ts";
import { sentAt } from "../mail.ts";
import { ConflictError } from "../store/types.ts";
import { CONTACT_TO } from "./contact.ts";


// What can be asked for, as the email and the activity name it
export const REQUEST_KINDS = { assessment: "an assessment", call: "a call" } as const satisfies Record<RequestKind, string>;
const KINDS = Object.keys(REQUEST_KINDS) as RequestKind[];
// The page's word for each kind in the "already asked" answer
const NOUN = { assessment: "an assessment", call: "a call" } as const;

const RequestBody = z.object({
  kind: z.enum(["assessment", "call"]),
  // Their own words: what to keep in mind for an assessment (required), or good times to talk (optional)
  note: z.string().trim().max(1000).default(""),
  // The projects an assessment is for, by ID: at least one, all of them in this organization
  projects: z.array(z.string().min(1).max(64)).max(REQUEST_PROJECTS_MAX).default([]),
  // One per press of the button: the same key again is the same request (a retry after a lost reply)
  key: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
});

const lockSk = (kind: RequestKind) => `REQLOCK#${kind}`;
const lastSk = (kind: RequestKind) => `REQUEST#${kind}`;

/** A date in the person's own zone, for the words of an answer ("Nov 26") */
function dayIn(iso: string, zone?: string) {
  const f = (timeZone?: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  try { return f(zone || "America/New_York"); } catch { return f("America/New_York"); }
}


export function requestRoutes(app: App, k: Kit) {
  const { repo, d, cfg } = k;

  // Each kind's latest request: while it's open (`again` is when the same kind can go out again), or just
  // when it was last asked and for which projects
  app.get("/t/:tid/requests", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const rows = await Promise.all(KINDS.flatMap((kind) => [repo.table.get(`T#${t.id}`, lockSk(kind)), repo.table.get(`T#${t.id}`, lastSk(kind))]));
    const out: Record<string, { at: string; by: string; open: boolean; again?: string; projects?: string[] }> = {};
    KINDS.forEach((kind, n) => {
      const lock = rows[n * 2];
      const last = rows[n * 2 + 1];
      const r = lock?.at ? lock : last;
      if (!r?.at) return;
      out[kind] = { at: String(r.at), by: String(r.by ?? ""), open: Boolean(lock?.at), ...(lock?.at ? { again: String(lock.again) } : {}), ...(Array.isArray(r.projects) ? { projects: r.projects.map(String) } : {}) };
    });
    return c.json({ ...out, cooldownDays: REQUEST_COOLDOWN_DAYS });
  });

  app.post("/t/:tid/requests", async (c) => {
    need(c, "write");
    const input = await body(c, RequestBody);
    const t = c.get("tenant");
    const { user } = who(c);
    // What an assessment is for is checked before anything is claimed, so a refusal costs nothing
    if (input.kind === "assessment" && !input.note) fail(400, "note_required", "Add a few words for me to keep in mind, then send it.");
    if (input.kind === "assessment" && input.projects.length === 0) fail(400, "projects_required", "Choose at least one project for the assessment.");
    const live = (await repo.listProjects(t.id)).filter((p) => !p.deletedAt && !p.archived);
    const named = [...new Set(input.projects)].map((id) => live.find((p) => p.id === id) ?? fail(400, "unknown_project", "One of those projects is gone or archived. Reload and choose again."));
    const at = new Date();
    const again = requestAgainAt(at.toISOString());
    // The claim: a create-only row that expires when the same kind can be sent again. A second press, or a
    // second browser, finds it. A press carrying the same key is the first request again, answered the same
    try {
      await repo.table.write([{ put: { PK: `T#${t.id}`, SK: lockSk(input.kind), at: at.toISOString(), again, by: user.id, projects: named.map((p) => p.id), ...(input.key ? { key: input.key } : {}), ttl: Math.ceil(Date.parse(again) / 1000) }, guard: { create: true } }]);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      const was = e.current;
      if (input.key && was?.key === input.key) return c.json({ ok: true, at: String(was.at), again: String(was.again), repeated: true });
      const when = was?.at ? String(was.at) : at.toISOString();
      fail(409, "request_open", `You asked for ${NOUN[input.kind]} on ${dayIn(when, user.timeZone)}, and I'll reply by email. You can ask again from ${dayIn(was?.again ? String(was.again) : requestAgainAt(when), user.timeZone)}.`);
    }
    const what = REQUEST_KINDS[input.kind];
    const who2 = user.name ? `${user.name} <${user.email}>` : user.email;
    const portal = `${cfg.publicUrl}/1NEON/o/${t.slug}/workspace`;
    const ref = t.clientId ? ` (${t.clientId}${isProspect(t) ? ", free account" : ""})` : "";
    // Where each project stands, from the same rule the page's tips use
    const outlines: Outline[] = await Promise.all(named.map(async (p) => outlineOf(p, await repo.listItems(t.id, p.id))));
    const rows: [string, string][] = [
      ["From", who2], ["Organization", `${t.name}${ref}`],
      ...(t.place ? [["Where", t.place] as [string, string]] : []), ...(t.link ? [["Link", t.link] as [string, string]] : []),
      ["Asked for", what],
      ...(named.length ? [["Projects", named.map((p) => `${p.key} ${p.name}`).join(", ")] as [string, string]] : []),
      ...(input.note ? [["Note", input.note] as [string, string]] : []),
    ];
    // The title says what was asked for, so that row is dropped; their note reads best in its own block; a link is a link
    const title = input.kind === "assessment" ? "Assessment requested" : "Call requested";
    const { text, html } = factMail({
      kicker: "free account alert",
      title,
      sub: t.name,
      preheader: `${user.name || user.email} asked for ${what}${input.note ? `: ${gist(input.note, 80)}` : ""}`,
      facts: [
        ...rows.filter(([k]) => k !== "Asked for" && k !== "Note").map(([k, v]): Fact => (k === "From" ? { k: "Who", v: `${who2} (reply to this email)` } : k === "Link" ? { k, v, href: /^https?:\/\//i.test(v) ? v : undefined } : { k, v })),
        { k: "Sent", v: sentAt(at).replace(/^Sent /, "") },
      ],
      blocks: [
        ...rows.filter(([k]) => k === "Note").map(([, v]): [string, string] => ["Their note", v]),
        ...(outlines.length ? [["How far along", outlines.map(outlineSummary).join("\n")] as [string, string]] : []),
      ],
      action: { label: "Open the account", url: portal },
      footer: ["Reply to this email to answer them directly."],
    });
    // From "1NEON Reach": the portal telling neon1 about a free account's request. A send that fails gives
    // the claim back, so the person can try again instead of waiting out a window for a request that never left
    try {
      await d.mailer.send(CONTACT_TO, `${title} · ${t.name}`, text, html, user.email, undefined, undefined, "reach");
    } catch (e) {
      await repo.table.write([{ delete: { PK: `T#${t.id}`, SK: lockSk(input.kind) } }]);
      throw e;
    }
    await repo.table.write([
      { put: { PK: `T#${t.id}`, SK: lastSk(input.kind), at: at.toISOString(), by: user.id, projects: named.map((p) => p.id) }, guard: { always: true } },
      repo.auditOp({ tenantId: t.id, actorId: actorId(c), action: `request.${input.kind}`, target: t.id, summary: `Asked neon1 for ${what}${named.length ? ` (${named.map((p) => p.key).join(", ")})` : ""}${input.note ? `: ${input.note.slice(0, 140)}` : ""}` }),
    ]);
    return c.json({ ok: true, at: at.toISOString(), again });
  });
}
