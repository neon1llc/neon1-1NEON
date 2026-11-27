// apps/api/src/routes/stream.ts - A project's Updates: one stream, newest first, of what people wrote to
// everyone on it (messages), status updates, comments on its items, and what changed (decisions, files,
// invoices, stages). Messages are comments on the project itself (item id "thread"), so they keep the
// comment store, its audit event, and its export. Writing one emails everyone on the project, and a reply
// to that email posts back here (lib/reply.ts, neon1-notify).
// References: Basecamp's message board (clients answer from email), Linear's project updates, GitHub's
// timeline of comments and events.


import { can, newId, suspensionOf, type AuditEvent, type Project } from "@1neon/domain";
import { z } from "zod";
import { body, fail, need, now, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { readToken, THREAD } from "../lib/reply.ts";
import type { Comment, Repo } from "../store/repo.ts";
import type { WriteOp } from "../store/types.ts";


const Text = z.string().trim().min(1).max(4000);

export type StreamEntry =
  | { type: "message"; id: string; at: string; by: string; authorId: string; body: string; via?: "email" }
  | { type: "update"; id: string; at: string; by: string; title: string; body: string; health?: string }
  | { type: "comment"; id: string; at: string; by: string; body: string; itemId: string; itemTitle: string; itemKind: string }
  | { type: "event"; id: string; at: string; by: string; summary: string; action: string; target: string };

// Changes that already appear as their own entries, or that say nothing about the work
const QUIET = new Set(["comment.created", "message.created", "update.created", "member.signedin"]);


/** Everything said and changed on one project, newest first, at most `limit` entries */
export async function projectStream(repo: Repo, p: Project, limit = 80): Promise<StreamEntry[]> {
  const [items, members, audit, thread] = await Promise.all([
    repo.listItems(p.tenantId, p.id), repo.listMembers(p.tenantId), repo.listAudit(p.tenantId, 600), repo.listComments(p.tenantId, p.id, THREAD),
  ]);
  const name = (id: string) => members.find((m) => m.userId === id)?.name || (id === "stripe" ? "Stripe" : "");
  // Comments on the project's items, read together (a project holds tens of items, not thousands)
  const live = items.slice(0, 120);
  const onItems = (await Promise.all(live.map((i) => repo.listComments(p.tenantId, p.id, i.id)))).flat();
  const byId = new Map(live.map((i) => [i.id, i]));
  const ids = new Set(live.map((i) => i.id));
  const prefix = `${p.key}: `;
  const out: StreamEntry[] = [
    ...thread.map((c): StreamEntry => ({ type: "message", id: c.id, at: c.at, by: c.authorName, authorId: c.authorId, body: c.body, ...(c.via ? { via: c.via } : {}) })),
    ...live.filter((i) => i.kind === "update").map((i): StreamEntry => ({ type: "update", id: i.id, at: i.createdAt, by: name(i.updatedBy) || "Someone", title: i.title, body: i.body, health: i.fields.health ? String(i.fields.health) : undefined })),
    ...onItems.map((c): StreamEntry => ({ type: "comment", id: c.id, at: c.at, by: c.authorName, body: c.body, itemId: c.itemId, itemTitle: byId.get(c.itemId)?.title ?? "", itemKind: byId.get(c.itemId)?.kind ?? "" })),
    ...audit.filter((e: AuditEvent) => !QUIET.has(e.action) && (e.summary.startsWith(prefix) || ids.has(e.target) || e.target === p.id))
      .map((e): StreamEntry => ({ type: "event", id: e.id, at: e.at, by: name(e.actorId), summary: e.summary.startsWith(prefix) ? e.summary.slice(prefix.length) : e.summary, action: e.action, target: e.target })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}


/** The writes for one message: the comment and its audit event, which the outbox turns into emails */
function messageOps(repo: Repo, p: Project, user: { id: string; name: string; email: string }, text: string, via?: "email"): { comment: Comment; ops: WriteOp[] } {
  const comment: Comment = { tenantId: p.tenantId, projectId: p.id, itemId: THREAD, id: newId("c"), at: now(), authorId: user.id, authorName: user.name || user.email, body: text, ...(via ? { via } : {}) };
  // The summary carries the first words, so the bell and the activity feed say what was written
  const gist = text.replace(/\s+/g, " ").slice(0, 160);
  return { comment, ops: [repo.commentOp(comment), repo.auditOp({ tenantId: p.tenantId, actorId: user.id, action: "message.created", target: comment.id, summary: `${p.key}: ${user.name || user.email} wrote: ${gist}${text.length > 160 ? "…" : ""}` })] };
}


export function streamRoutes(app: App, k: Kit) {
  const { repo, project } = k;

  app.get("/t/:tid/projects/:pid/stream", async (c) => {
    need(c, "read");
    const p = await project(c);
    return c.json({ entries: await projectStream(repo, p) });
  });

  // Anyone who can comment may write to everyone on the project
  app.post("/t/:tid/projects/:pid/stream", async (c) => {
    need(c, "comment");
    const p = await project(c);
    const { body: text } = await body(c, z.object({ body: Text }));
    const u = who(c).user;
    const { comment, ops } = messageOps(repo, p, u, text);
    await repo.table.write(ops);
    return c.json({ type: "message", id: comment.id, at: comment.at, by: comment.authorName, authorId: u.id, body: text } satisfies StreamEntry, 201);
  });

  // The author, or anyone who may delete, can take a message back
  app.delete("/t/:tid/projects/:pid/stream/:cid", async (c) => {
    const p = await project(c);
    const cm = (await repo.listComments(p.tenantId, p.id, THREAD)).find((x) => x.id === c.req.param("cid"));
    if (!cm) fail(404, "not_found", "That message no longer exists.");
    if (cm.authorId !== who(c).user.id) need(c, "delete");
    await repo.deleteComment(cm);
    return c.json({ ok: true });
  });
}


/** Whether a reply's sender is the person's own mailbox: their address, or it without a "+tag" (mail to
 * name+tag@ lands in name@, so someone who signed up with a tagged address replies from the plain one) */
export function sameMailbox(account: string, from: string) {
  const a = account.trim().toLowerCase(), f = from.trim().toLowerCase();
  return a === f || a.replace(/\+[^@]*@/, "@") === f;
}


/** A reply to a project message's email, passed on by neon1-notify once its signature and the mail's
 * authentication checked out. It posts only as the person the address was made for, from their own
 * address, while they can still comment there */
export async function projectReplyByEmail(k: Pick<Kit, "repo">, token: string, text: string, from: string) {
  const { repo } = k;
  const t = await readToken(repo, token);
  if (!t) return { posted: false as const, reason: "unknown_token" };
  const [user, tenant, project, members] = await Promise.all([repo.getUser(t.userId), repo.getTenant(t.tenantId), repo.getProject(t.tenantId, t.projectId), repo.listMembers(t.tenantId)]);
  if (!user || !sameMailbox(user.email, from)) return { posted: false as const, reason: "not_sender" };
  const member = members.find((m) => m.userId === user.id && m.status === "joined");
  if (!tenant || !project || project.deletedAt || project.archived) return { posted: false as const, reason: "no_project" };
  if (!member || !can({ operator: false, strongSession: false } as Parameters<typeof can>[0], "comment", member.access).ok) return { posted: false as const, reason: "not_allowed" };
  if (suspensionOf(tenant, member)) return { posted: false as const, reason: "suspended" };
  const body = Text.safeParse(text);
  if (!body.success) return { posted: false as const, reason: "invalid" };
  const { ops } = messageOps(repo, project, { id: user.id, name: user.name, email: user.email }, body.data, "email");
  await repo.table.write(ops);
  return { posted: true as const };
}
