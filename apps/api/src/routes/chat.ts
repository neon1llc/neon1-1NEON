// apps/api/src/routes/chat.ts - One shared chat per organization: every member and neon1's lead write in the same
// conversation, with their names, so it is also the record of what was said. A free account is an organization of
// one. Messages are one stored row each, saved the moment they are sent. A member can edit their own message; the
// earlier text stays on it for the record. neon1 is alerted (email, and a push to its phone when configured) when a
// member writes, and members are emailed when neon1 replies, unless they are reading. Replies come in the reply
// hours (packages/domain/src/chat.ts).
import { CHAT_AUTO_MUTE_HOURS, CHAT_EDIT_HISTORY, CHAT_PAGE, CHAT_READING_MS, ChatText, blockActive, chatJunk, chatVisibleTo, REPLY_HOURS_TEXT, chatProblem, isProspect, newId, replyExpectation, suspensionOf, type ChatBlock, type ChatFlag, type ChatMessage, type ChatThread, type ChatThreadPublic, type ChatView, type Tenant, type User } from "@1neon/domain";
import { z } from "zod";
import { body, fail, need, now, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { outboxOp } from "../outbox.ts";
import { activeBlock, guardChat, pause, refuseIfBlocked } from "../lib/chatguard.ts";
import { ConflictError, type WriteOp } from "../store/types.ts";


// Counters only need to outlive the day they count
const KEEP_S = 2 * 24 * 60 * 60;
// A message's start, shown in the inbox list
const PREVIEW = 140;


const gist = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); return t.length <= PREVIEW ? t : `${t.slice(0, PREVIEW - 1)}…`; };

/** What a change produces: the chat's new summary, an optional new message, and other writes for the same transaction */
interface Change { thread: ChatThread; message?: ChatMessage; extra?: WriteOp[] }


/** Save a chat change, trying again when someone saved at the same moment. `change` sees the summary as just read; returning nothing leaves it alone */
async function saveChat(k: Pick<Kit, "repo" | "d" | "drainNow">, tid: string, change: (t: ChatThread | undefined) => Change | undefined) {
  const { repo } = k;
  const inline = (k.d.outbox ?? "inline") === "inline";
  for (let tries = 0; ; tries++) {
    const cur = await repo.getChat(tid);
    const out = change(cur);
    if (!out) return undefined;
    const thread = { ...out.thread, version: (cur?.version ?? 0) + 1 };
    try {
      await repo.table.write([...repo.chatOps(thread, out.message, cur?.version), ...(out.extra ?? [])]);
      const queued = (out.extra ?? []).filter((o) => "put" in o && o.put.PK === "OUTBOX");
      if (queued.length && inline) await k.drainNow(queued);
      return { thread, message: out.message };
    } catch (e) {
      if (!(e instanceof ConflictError) || tries >= 2) throw e;
    }
  }
}


/**
 * Write one message into an organization's chat: the summary, the row, and the alert or the members' email it
 * implies. The route calls this with the signed-in person; a reply by email calls it for neon1 (below)
 */
export async function writeChat(k: Pick<Kit, "repo" | "d" | "drainNow">, a: { tenant: Tenant; user: User; operator: boolean; text: string; priv?: boolean; to?: string; flags?: ChatFlag[] }) {
  const { tenant, user, operator, text, priv, to, flags } = a;
  const { repo } = k;
  const free = isProspect(tenant);
  const at = now();
  const from = operator ? "neon1" : "member";
  // Who a private message is with: the member who wrote it, or the member neon1 chose (who must be in the organization)
  let privateWith: string | undefined;
  if (from === "member" && priv) privateWith = user.id;
  if (from === "neon1" && to) {
    const m = await repo.getMember(tenant.id, to);
    if (!m || m.status !== "joined") fail(400, "not_member", "Choose someone who is in this organization.");
    privateWith = to;
  }
  const message: ChatMessage = { id: newId("m"), at, authorId: user.id, authorName: user.name || user.email, from, body: text, ...(privateWith ? { privateWith } : {}), ...(flags?.length ? { flags } : {}), version: 1 };

  // A reply from neon1 emails each member who isn't reading and wasn't already emailed since they last looked
  const recipients: string[] = [];
  const seenOps: WriteOp[] = [];
  if (from === "neon1") {
    const [members, seen] = await Promise.all([repo.listMembers(tenant.id), repo.chatSeen(tenant.id)]);
    const mark = new Map(seen.map((s) => [s.userId, s]));
    for (const m of members) {
      // A private reply goes to the one member it is with
      if (m.status !== "joined" || m.userId === user.id || (privateWith && m.userId !== privateWith)) continue;
      const s = mark.get(m.userId);
      const reading = s !== undefined && Date.parse(at) - Date.parse(s.at) < CHAT_READING_MS;
      if (reading || s?.mailedAt) continue;
      recipients.push(m.userId);
      seenOps.push(repo.chatSeenOp(tenant.id, { userId: m.userId, at: s?.at ?? "", mailedAt: at }));
    }
  }

  const saved = await saveChat(k, tenant.id, (t) => {
    const base = { tenantId: tenant.id, orgName: tenant.name, orgSlug: tenant.slug, free, startedAt: t?.startedAt ?? at, lastAt: at, lastId: message.id, lastBy: message.authorName, lastFrom: from, preview: gist(text), version: 0 } as const;
    if (from === "member") {
      // One alert per burst: the next waits until neon1 opens the chat
      const alert = !t || t.ownerUnread === 0;
      return {
        thread: { ...base, ownerUnread: (t?.ownerUnread ?? 0) + 1, ownerSeenAt: t?.ownerSeenAt, ownerAlertedAt: alert ? at : t?.ownerAlertedAt, ownerFlagged: (t?.ownerFlagged ?? 0) + (flags?.length ? 1 : 0) },
        message,
        extra: [
          ...(alert ? [outboxOp(`C#${tenant.id}#O#${at}`, { kind: "chat-owner", tenantId: tenant.id, at })] : []),
          // A flagged message is told to neon1 on its own, even inside a burst that already alerted
          ...(flags?.length ? [outboxOp(`C#${tenant.id}#F#${message.id}`, { kind: "chat-flag", tenantId: tenant.id, at, name: message.authorName, messageId: message.id, reason: `Flagged: ${flags.join(", ")}` })] : []),
        ],
      };
    }
    return {
      thread: { ...base, ownerUnread: 0, ownerSeenAt: at, ownerAlertedAt: undefined, ownerFlagged: 0 },
      message,
      extra: recipients.length ? [...seenOps, outboxOp(`C#${tenant.id}#M#${at}`, { kind: "chat-members", tenantId: tenant.id, at, userIds: recipients })] : [],
    };
  });
  return { thread: saved!.thread, message };
}


/** A reply sent from neon1's own mailbox, accepted by the alert service: posted as neon1's lead in that organization's chat */
export async function chatReplyByEmail(k: Pick<Kit, "repo" | "d" | "cfg" | "drainNow">, tenantId: string, text: string, from: string) {
  const { repo, cfg } = k;
  // Only an operator's address may speak as neon1. An operator address with no account of its own (the shared
  // mailbox) speaks as the first operator who has one
  let userId: string | undefined;
  if (cfg.operatorEmails.includes(from.toLowerCase())) {
    for (const email of [from.toLowerCase(), ...cfg.operatorEmails]) {
      userId = await repo.userIdForEmail(email);
      if (userId) break;
    }
  }
  const user = userId ? await repo.getUser(userId) : undefined;
  const tenant = await repo.getTenant(tenantId);
  if (!user || !tenant) return { posted: false as const, reason: !user ? "not_operator" : "no_chat" };
  const body = ChatText.safeParse(text);
  if (!body.success) return { posted: false as const, reason: "invalid" };
  await writeChat(k, { tenant, user, operator: true, text: body.data });
  return { posted: true as const };
}


/** super's inbox: every organization's chat, most recent first, and every organization, so super can write to
 * one that hasn't written yet (Pradeep, 2026-11-27). It sits outside any organization */
export function chatInboxRoutes(app: App, k: Kit) {
  app.get("/chat/inbox", async (c) => {
    if (!who(c).actor.operator) fail(404, "not_found", "That doesn't exist.");
    const [threads, tenants] = await Promise.all([k.repo.chatInbox(), k.repo.listTenants()]);
    const orgs = tenants.filter((t) => t.status === "active" && !t.prospect?.deletingAt).map((t) => ({ id: t.id, name: t.name, slug: t.slug, potential: isProspect(t), suspended: Boolean(suspensionOf(t)), test: Boolean(t.test) })).sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ threads, orgs });
  });
}


/** One organization's chat, under /t/:tid (so the usual membership, free-account and write-limit rules apply first) */
export function chatRoutes(app: App, k: Kit) {
  const { d, repo } = k;
  const inline = (d.outbox ?? "inline") === "inline";

  /** When replies come in, as the page says it */
  function hours(): ChatView["hours"] {
    const h = replyExpectation();
    return { open: h.open, nextAt: h.next.toISOString(), text: REPLY_HOURS_TEXT };
  }

  /** The summary as a reader may see it: neon1 gets everything; a member gets none of what could come from a message they can't see */
  const summary = (t: ChatThread, operator: boolean): ChatThread | ChatThreadPublic =>
    operator ? t : { tenantId: t.tenantId, orgName: t.orgName, orgSlug: t.orgSlug, free: t.free, startedAt: t.startedAt, lastAt: t.lastAt, lastFrom: t.lastFrom };

  /** What each reader may see of a message: earlier versions are for neon1 only; everyone sees that it was edited */
  const shown = (m: ChatMessage, operator: boolean): ChatMessage => (operator ? m : { ...m, history: undefined });

  // Open the chat: the conversation, how many messages are new to you, and when replies come in. Opening it marks
  // it seen, which stops the reply email and neon1's alert burst
  app.get("/t/:tid/chat", async (c) => {
    need(c, "read");
    const tid = c.get("tenant").id;
    const { user, actor } = who(c);
    const thread = await repo.getChat(tid);
    const messages = (thread ? await repo.chatMessages(tid, CHAT_PAGE) : []).filter((m) => chatVisibleTo(m, user.id, actor.operator));
    let unread = 0;
    if (actor.operator) {
      unread = thread?.ownerUnread ?? 0;
      if (thread && (thread.ownerUnread > 0 || thread.ownerAlertedAt || thread.ownerFlagged)) await saveChat(k, tid, (t) => t && { thread: { ...t, ownerUnread: 0, ownerSeenAt: now(), ownerAlertedAt: undefined, ownerFlagged: 0 } }).catch(() => undefined);
    } else {
      const mine = (await repo.chatSeen(tid)).find((s) => s.userId === user.id);
      unread = messages.filter((m) => m.authorId !== user.id && m.at > (mine?.at ?? "")).length;
      // A lost write only delays the mark; reading is never refused for it
      await repo.table.write([repo.chatSeenOp(tid, { userId: user.id, at: now() })]).catch(() => undefined);
    }
    // Your own pause (so the box can say so), and for neon1 everyone's in this organization
    const block = actor.operator ? null : (await activeBlock(k, tid, user.id)) ?? null;
    const blocks = actor.operator ? (await repo.listChatBlocks(tid)).filter((b) => blockActive(b)) : undefined;
    const view: ChatView = { thread: thread ? summary(thread, actor.operator) : null, messages: messages.map((m) => shown(m, actor.operator)), block, ...(blocks ? { blocks } : {}), unread, hours: hours() };
    return c.json(view);
  });

  // How many messages are new to you, without opening the chat: the launcher's badge asks this, so it never marks anything seen
  app.get("/t/:tid/chat/unread", async (c) => {
    need(c, "read");
    const tid = c.get("tenant").id;
    const { user, actor } = who(c);
    const thread = await repo.getChat(tid);
    if (!thread) return c.json({ unread: 0 });
    if (actor.operator) return c.json({ unread: thread.ownerUnread });
    const mine = (await repo.chatSeen(tid)).find((x) => x.userId === user.id);
    const recent = await repo.chatMessages(tid, CHAT_PAGE);
    return c.json({ unread: recent.filter((m) => chatVisibleTo(m, user.id, false) && m.authorId !== user.id && m.at > (mine?.at ?? "")).length });
  });

  // Write in the chat
  app.post("/t/:tid/chat", async (c) => {
    need(c, "comment");
    const tenant = c.get("tenant");
    const { user, actor } = who(c);
    // `private` (a member) keeps the message between them and neon1; `to` (neon1) answers one member privately
    const { text, private: priv, to } = await body(c, z.object({ text: ChatText, private: z.boolean().optional(), to: z.string().max(40).optional() }));
    // neon1's own replies aren't held to any of the protections, whichever organization they go to; everyone else's pass them
    // all (a pause, what it says, a repeat, too fast, a new account, the allowances) before anything is written
    const flags = actor.operator ? [] : await guardChat(k, c, { tenant, user, text, free: isProspect(tenant) });

    const saved = await writeChat(k, { tenant, user, operator: actor.operator, text, priv, to, flags });
    const message = saved.message;
    return c.json({ message: shown(message, actor.operator), thread: summary(saved.thread, actor.operator), hours: hours() }, 201);
  });

  // Edit your own message. The earlier text stays on it for the record; nobody else's message can be edited, and
  // an edit sends no alert
  app.patch("/t/:tid/chat/:mid", async (c) => {
    need(c, "comment");
    const tid = c.get("tenant").id;
    const { user, actor } = who(c);
    // A paused person can read but not write, edit, or report, so this comes before anything else
    if (!actor.operator) await refuseIfBlocked(k, tid, user.id);
    const { text } = await body(c, z.object({ text: ChatText }));
    const m = await repo.getChatMessage(tid, c.req.param("mid")!);
    if (!m) fail(404, "not_found", "That message doesn't exist.");
    if (m.authorId !== user.id) fail(403, "forbidden", "You can edit your own messages.");
    const problem = actor.operator ? undefined : chatJunk(text) ? "Say what you need in a few words." : chatProblem(text, isProspect(c.get("tenant")));
    if (problem) fail(400, "invalid", problem);
    if (text === m.body) return c.json(shown(m, actor.operator));
    const history = [...(m.history ?? []), { at: m.editedAt ?? m.at, body: m.body }];
    if (history.length > CHAT_EDIT_HISTORY) fail(409, "edit_limit", `A message can be edited ${CHAT_EDIT_HISTORY} times. Write a new one instead.`);
    const edited: ChatMessage = { ...m, body: text, editedAt: now(), history, version: (m.version ?? 1) + 1 };
    // The summary's preview follows when this is the latest message
    await saveChat(k, tid, (t) => t && { thread: { ...t, preview: t.lastId === m.id ? gist(text) : t.preview }, extra: [repo.chatEditOp(tid, edited, m.version ?? 1)] });
    return c.json(shown(edited, actor.operator));
  });


  // Report a message from someone else: neon1 is told, with the message. Each person can report one message once
  app.post("/t/:tid/chat/:mid/report", async (c) => {
    need(c, "comment");
    const tenant = c.get("tenant");
    const { user, actor } = who(c);
    await refuseIfBlocked(k, tenant.id, user.id);
    const m = await repo.getChatMessage(tenant.id, c.req.param("mid")!);
    if (!m || !chatVisibleTo(m, user.id, actor.operator)) fail(404, "not_found", "That message doesn't exist.");
    if (m.authorId === user.id || m.from === "neon1") fail(400, "invalid", "Only another member's message can be reported.");
    if ((m.reports ?? []).includes(user.id)) return c.json({ ok: true });
    const reported: ChatMessage = { ...m, flags: [...new Set<ChatFlag>([...(m.flags ?? []), "reported"])], reports: [...(m.reports ?? []), user.id], version: (m.version ?? 1) + 1 };
    await saveChat(k, tenant.id, (t) => t && { thread: { ...t, ownerFlagged: (t.ownerFlagged ?? 0) + 1 }, extra: [repo.chatEditOp(tenant.id, reported, m.version ?? 1), outboxOp(`C#${tenant.id}#F#${m.id}#R${user.id}`, { kind: "chat-flag", tenantId: tenant.id, at: now(), name: m.authorName, messageId: m.id, reason: `Reported by ${user.name || user.email}` })] });
    return c.json({ ok: true });
  });

  // neon1 only: pause a member's chat (mute for a time, or ban), and lift it. They can still read
  app.post("/t/:tid/chat/block/:uid", async (c) => {
    if (!who(c).actor.operator) fail(404, "not_found", "That doesn't exist.");
    const tenant = c.get("tenant");
    const uid = c.req.param("uid")!;
    const m = await repo.getMember(tenant.id, uid);
    const target = m ? await repo.getUser(uid) : undefined;
    if (!m || !target) fail(404, "not_found", "That person isn't in this organization.");
    const { state, hours: h, reason } = await body(c, z.object({ state: z.enum(["muted", "banned"]), hours: z.number().int().min(1).max(24 * 365).optional(), reason: z.string().trim().max(200).optional() }));
    const block: ChatBlock = await pause(k, tenant, target, { state, ...(state === "muted" ? { until: new Date(Date.now() + (h ?? CHAT_AUTO_MUTE_HOURS) * 3600_000).toISOString() } : {}), reason: reason || (state === "banned" ? "Banned by neon1" : "Muted by neon1"), by: "neon1" });
    return c.json(block, 201);
  });

  app.delete("/t/:tid/chat/block/:uid", async (c) => {
    if (!who(c).actor.operator) fail(404, "not_found", "That doesn't exist.");
    await repo.deleteChatBlock(c.get("tenant").id, c.req.param("uid")!);
    return c.json({ ok: true });
  });

}
