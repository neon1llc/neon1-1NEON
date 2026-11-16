// apps/api/src/routes/requests.ts - Asking neon1 for the next step from inside 1NEON: an assessment of
// what's written down, or a call to talk it through. Any member who can write may ask, a new (prospect)
// account included. Each request emails neon1's inbox with the person as Reply-To, lands in the
// organization's activity, and is remembered so the page can say when it was asked. A small daily cap per
// organization keeps it from becoming a way to flood the inbox.


import { isProspect } from "@1neon/domain";
import { z } from "zod";
import { actorId, body, fail, need, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { branded, esc, link } from "../mail.ts";
import { CONTACT_TO } from "./contact.ts";


// What can be asked for, as the email and the activity name it
export const REQUEST_KINDS = { assessment: "an assessment", call: "a call" } as const;
export type RequestKind = keyof typeof REQUEST_KINDS;
// Requests per organization in a UTC day, both kinds together
export const REQUESTS_DAILY = 4;
const KEEP_S = 2 * 24 * 60 * 60;

const RequestBody = z.object({
  kind: z.enum(["assessment", "call"]),
  // Their own words: what to look at, or good times to talk
  note: z.string().trim().max(1000).default(""),
});


export function requestRoutes(app: App, k: Kit) {
  const { repo, d, cfg } = k;

  // When each kind was last asked for, so the page can say so
  app.get("/t/:tid/requests", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const rows = await Promise.all((Object.keys(REQUEST_KINDS) as RequestKind[]).map((kind) => repo.table.get(`T#${t.id}`, `REQUEST#${kind}`)));
    return c.json(Object.fromEntries(rows.flatMap((r, i) => (r?.at ? [[Object.keys(REQUEST_KINDS)[i], { at: String(r.at), by: String(r.by ?? "") }]] : []))));
  });

  app.post("/t/:tid/requests", async (c) => {
    need(c, "write");
    const input = await body(c, RequestBody);
    const t = c.get("tenant");
    const { user } = who(c);
    const at = new Date();
    const day = at.toISOString().slice(0, 10);
    if ((await repo.table.increment("COUNTER", `REQUEST#${t.id}#${day}`, 1, Math.floor(at.getTime() / 1000) + KEEP_S)) > REQUESTS_DAILY) {
      fail(429, "too_many", "That's a few requests today already. They've arrived; you'll get a reply by email.");
    }
    const what = REQUEST_KINDS[input.kind];
    const who2 = user.name ? `${user.name} <${user.email}>` : user.email;
    const portal = `${cfg.publicUrl}/1NEON/o/${t.slug}/workspace`;
    const ref = t.clientId ? ` (${t.clientId}${isProspect(t) ? ", free account" : ""})` : "";
    const rows: [string, string][] = [
      ["From", who2], ["Organization", `${t.name}${ref}`],
      ...(t.place ? [["Where", t.place] as [string, string]] : []), ...(t.link ? [["Link", t.link] as [string, string]] : []),
      ["Asked for", what], ...(input.note ? [["Note", input.note] as [string, string]] : []),
    ];
    const text = `${rows.map(([a, b]) => `${a}: ${b}`).join("\n\n")}\n\nOpen in 1NEON: ${portal}`;
    const html = branded({
      label: `request for ${what}`,
      preheader: `${t.name} asked for ${what}`,
      heading: `${t.name} asked for ${what}`,
      body: rows.map(([a, b]) => `<p style="margin:0 0 14px"><b>${esc(a)}</b><br>${esc(b).replace(/\n/g, "<br>")}</p>`).join("") + `<p style="margin:0">${link("Open in 1NEON", portal)}</p>`,
      note: "Reply to this email to answer them directly.",
      at,
    });
    // From 1NEON, since it is the portal telling neon1 about a client's request
    await d.mailer.send(CONTACT_TO, `${t.name} asked for ${what}`, text, html, user.email);
    await repo.table.write([
      { put: { PK: `T#${t.id}`, SK: `REQUEST#${input.kind}`, at: at.toISOString(), by: user.id }, guard: { always: true } },
      repo.auditOp({ tenantId: t.id, actorId: actorId(c), action: `request.${input.kind}`, target: t.id, summary: `Asked neon1 for ${what}${input.note ? `: ${input.note.slice(0, 140)}` : ""}` }),
    ]);
    return c.json({ ok: true, at: at.toISOString() });
  });
}

