// apps/api/src/routes/pages.ts - Pages: documents people write together, kept with the files. Each
// page is a Yjs document. A browser sends what it typed as a Yjs update with the state it has; the
// server merges it into the stored page and answers with whatever that browser hasn't seen yet. Edits
// made at the same moment merge, so nobody overwrites anyone, and no socket is needed: an open page
// syncs every couple of seconds. Organization pages live at /t/:tid/pages, a project's at
// /t/:tid/projects/:pid/pages.


import { MAIN_PAGE, newId, type Page } from "@1neon/domain";
import type { Context } from "hono";
import * as Y from "yjs";
import { z } from "zod";
import { actorId, body, fail, need, now, who, type Env } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { ConflictError } from "../store/types.ts";


// Encoded state past this is refused (Page.state's limit, under DynamoDB's 400 KB row)
const MAX_STATE = 300_000;
// Someone counts as "here" this long after their last sync; their presence is rewritten at most this often
const HERE_MS = 12_000;
const RENEW_MS = 8_000;
// A merge that loses a version race tries again this many times
const TRIES = 4;

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const enc = (u: Uint8Array) => Buffer.from(u).toString("base64");
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

const Base64 = z.string().max(400_000).regex(/^[A-Za-z0-9+/]*={0,2}$/);
const Title = z.string().trim().min(1).max(120);
const SyncInput = z.object({
  // What this browser changed since its last sync, if anything
  update: Base64.optional(),
  // This browser's state vector, so the reply carries only what it lacks
  vector: Base64.optional(),
  // A plain copy of the page, sent with changes, for previews, search, and download
  text: z.string().max(40_000).optional(),
});


/** A page without its content, for lists */
function meta(x: Page) {
  const { state: _s, text, seen: _p, ...rest } = x;
  return { ...rest, preview: text.slice(0, 240) };
}

/** People who synced in the last few seconds, other than the one asking */
function here(x: Page, me: string) {
  const cut = Date.now() - HERE_MS;
  return Object.entries(x.seen).filter(([id, s]) => id !== me && Date.parse(s.at) > cut).map(([id, s]) => ({ id, name: s.name }));
}


export function pageRoutes(app: App, k: Kit) {
  const { repo, project } = k;

  // Each route is registered for both scopes: the organization's pages and a project's
  const at = (rest = "") => [`/t/:tid/pages${rest}`, `/t/:tid/projects/:pid/pages${rest}`] as const;

  /** The project in the path (checked like any project route), or undefined for the organization */
  async function scopeOf(c: Context<Env>) {
    return c.req.param("pid") ? (await project(c)).id : undefined;
  }

  /** A page in the scope; the project's own page is made the first time it's asked for */
  async function pageOf(c: Context<Env>, pid: string | undefined): Promise<Page> {
    const tid = c.get("tenant").id;
    const pgid = c.req.param("pgid")!;
    const got = await repo.getPage(tid, pid, pgid);
    if (got) return got;
    if (pgid !== MAIN_PAGE || !pid) fail(404, "not_found", "That page doesn't exist or was deleted.");
    const ts = now();
    const fresh: Page = { tenantId: tid, projectId: pid, id: MAIN_PAGE, title: "Project page", state: "", text: "", seen: {}, version: 1, createdAt: ts, updatedAt: ts, updatedBy: actorId(c) };
    try {
      await repo.table.write([repo.pageOp(fresh, { create: true })]);
      return fresh;
    } catch (e) {
      // Two people opened it at once: the other one made it
      if (!(e instanceof ConflictError)) throw e;
      return (await repo.getPage(tid, pid, MAIN_PAGE))!;
    }
  }

  // The scope's pages, newest first, without their content
  for (const path of at()) app.get(path, async (c) => {
    need(c, "read");
    const list = await repo.listPages(c.get("tenant").id, await scopeOf(c));
    return c.json(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(meta));
  });

  // A new page
  for (const path of at()) app.post(path, async (c) => {
    need(c, "write");
    const pid = await scopeOf(c);
    const { title } = await body(c, z.object({ title: Title }));
    const u = who(c).user;
    const ts = now();
    const x: Page = { tenantId: c.get("tenant").id, projectId: pid, id: newId("pg"), title, state: "", text: "", seen: {}, version: 1, createdAt: ts, updatedAt: ts, updatedBy: u.id };
    await repo.table.write([repo.pageOp(x, { create: true }), repo.auditOp({ tenantId: x.tenantId, actorId: u.id, action: "page.created", target: x.id, summary: `${u.name || u.email} started the page "${title}"` })]);
    return c.json(meta(x), 201);
  });

  // One page in full: its content and who else has it open
  for (const path of at("/:pgid")) app.get(path, async (c) => {
    need(c, "read");
    const x = await pageOf(c, await scopeOf(c));
    return c.json({ ...meta(x), state: x.state, text: x.text, here: here(x, actorId(c)) });
  });

  // Merge this browser's changes and return what it hasn't seen. Readers sync too (to see changes and
  // be seen) but can't change anything
  for (const path of at("/:pgid/sync")) app.post(path, async (c) => {
    need(c, "read");
    const pid = await scopeOf(c);
    const input = await body(c, SyncInput);
    if (input.update) need(c, "write");
    const u = who(c).user;
    for (let i = 0; i < TRIES; i++) {
      const x = await pageOf(c, pid);
      const doc = new Y.Doc();
      if (x.state) Y.applyUpdate(doc, b64(x.state));
      const before = Y.encodeStateVector(doc);
      try {
        if (input.update) Y.applyUpdate(doc, b64(input.update));
      } catch {
        fail(400, "invalid", "That change couldn't be read. Reload the page.");
      }
      const changed = !same(before, Y.encodeStateVector(doc));
      const ts = now();
      const mine = x.seen[u.id];
      const renew = !mine || Date.now() - Date.parse(mine.at) > RENEW_MS;
      let next = x;
      if (changed || renew) {
        const state = changed ? enc(Y.encodeStateAsUpdate(doc)) : x.state;
        if (state.length > MAX_STATE) fail(413, "too_large", "This page is full. Start a new page for the rest.");
        // Presence keeps only people seen recently, so the map stays small
        const cut = Date.now() - HERE_MS;
        const seen = Object.fromEntries(Object.entries(x.seen).filter(([, s]) => Date.parse(s.at) > cut));
        seen[u.id] = { name: (u.name || u.email).slice(0, 80), at: ts };
        next = { ...x, state, seen, version: x.version + 1, ...(changed ? { text: input.text ?? x.text, updatedAt: ts, updatedBy: u.id } : {}) };
        try {
          await repo.table.write([repo.pageOp(next, { version: x.version })]);
        } catch (e) {
          if (!(e instanceof ConflictError)) throw e;
          // Someone else saved first: merge again on top of theirs
          if (i < TRIES - 1) continue;
          fail(409, "busy", "Too many changes at once. Yours are kept and will be sent again.");
        }
      }
      const vector = input.vector ? b64(input.vector) : undefined;
      return c.json({ update: enc(Y.encodeStateAsUpdate(doc, vector)), version: next.version, updatedAt: next.updatedAt, here: here(next, u.id) });
    }
    fail(409, "busy", "Too many changes at once. Yours are kept and will be sent again.");
  });

  // Rename
  for (const path of at("/:pgid")) app.patch(path, async (c) => {
    need(c, "write");
    const x = await pageOf(c, await scopeOf(c));
    const { title } = await body(c, z.object({ title: Title }));
    const next = { ...x, title, version: x.version + 1, updatedAt: now(), updatedBy: actorId(c) };
    await repo.table.write([repo.pageOp(next, { version: x.version })]);
    return c.json(meta(next));
  });

  // Delete a page: the last person who wrote in it, or someone who may delete.
  // The project's own page stays with the project
  for (const path of at("/:pgid")) app.delete(path, async (c) => {
    const x = await pageOf(c, await scopeOf(c));
    if (x.id === MAIN_PAGE) fail(409, "kept", "The project's page stays with the project.");
    need(c, x.updatedBy === actorId(c) ? "write" : "delete");
    const u = who(c).user;
    await repo.table.write([
      { delete: { PK: `T#${x.tenantId}#P#${x.projectId ?? "_"}`, SK: `PAGE#${x.id}` }, guard: { version: x.version } },
      repo.auditOp({ tenantId: x.tenantId, actorId: u.id, action: "page.deleted", target: x.id, summary: `${u.name || u.email} deleted the page "${x.title}"` }),
    ]);
    return c.json({ ok: true });
  });
}
