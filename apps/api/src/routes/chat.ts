// apps/api/src/routes/chat.ts - Direct chat between a signed-in person (a free account or a client) and neon1's
// lead. One thread per person, asynchronous: people write any time, neon1 is alerted (email, and a push to its
// phone when configured), and replies come in the reply hours (packages/domain/src/chat.ts). The person is
// emailed a reply unless they are looking at the thread. Neither side can read any thread but their own.
import { ChatText, CHAT_LIMITS, CHAT_PAGE, REPLY_HOURS_TEXT, chatProblem, newId, replyExpectation, type ChatMessage, type ChatThread, type ChatView } from "@1neon/domain";
import { z } from "zod";
import { body, fail, now, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { prospectOnly } from "../lib/guards.ts";
import { outboxOp } from "../outbox.ts";
import { ConflictError, type WriteOp } from "../store/types.ts";


// Counters only need to outlive the day they count
const KEEP_S = 2 * 24 * 60 * 60;
// A person who opened the thread this recently is reading it, so a reply needs no email
const READING_MS = 2 * 60 * 1000;
// A message's start, shown in the inbox list
const PREVIEW = 140;


const gist = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); return t.length <= PREVIEW ? t : `${t.slice(0, PREVIEW - 1)}…`; };

/** What a change to a thread produces: its new state, an optional message, and outbox rows for the same transaction */
interface Change { thread: ChatThread; message?: ChatMessage; outbox?: WriteOp[] }


export function chatRoutes(app: App, k: Kit) {
  const { d, repo } = k;
  const inline = (d.outbox ?? "inline") === "inline";

  /** When replies come in, as the page says it */
  function hours(): ChatView["hours"] {
    const h = replyExpectation();
    return { open: h.open, nextAt: h.next.toISOString(), text: REPLY_HOURS_TEXT };
  }

  /** Save a thread change, trying again when the other side saved at the same moment. `change` sees the thread as just read; returning nothing leaves it alone */
  async function save(uid: string, change: (t: ChatThread | undefined) => Change | undefined) {
    for (let tries = 0; ; tries++) {
      const cur = await repo.getChat(uid);
      const out = change(cur);
      if (!out) return undefined;
      const thread = { ...out.thread, version: (cur?.version ?? 0) + 1 };
      try {
        await repo.table.write([...repo.chatOps(thread, out.message, cur?.version), ...(out.outbox ?? [])]);
        if (out.outbox?.length && inline) await k.drainNow(out.outbox);
        return { thread, message: out.message };
      } catch (e) {
        if (!(e instanceof ConflictError) || tries >= 2) throw e;
      }
    }
  }

  /** A thread's view for either side */
  async function view(uid: string, thread: ChatThread | undefined): Promise<ChatView> {
    return { thread: thread ?? null, messages: thread ? await repo.chatMessages(uid, CHAT_PAGE) : [], hours: hours() };
  }

  const operatorOnly = (c: Parameters<typeof who>[0]) => { if (!who(c).actor.operator) fail(404, "not_found", "That doesn't exist."); };

  // --- The person's own thread --------------------------------------------

  // Open the thread: its messages, and when replies come in. Opening it marks the replies seen
  app.get("/chat", async (c) => {
    const { user, actor } = who(c);
    if (actor.operator) fail(400, "operator", "Your chat is the inbox under All clients.");
    let thread = await repo.getChat(user.id);
    if (thread) {
      // Seen: the unread count and the pending reply email both stop. A lost race here only delays the mark
      const seen = await save(user.id, (t) => t && { thread: { ...t, userUnread: 0, userSeenAt: now(), replyMailedAt: undefined } }).catch(() => undefined);
      thread = seen?.thread ?? thread;
    }
    return c.json(await view(user.id, thread));
  });

  // Send a message to neon1
  app.post("/chat", async (c) => {
    const { user, actor } = who(c);
    if (actor.operator) fail(400, "operator", "Your chat is the inbox under All clients.");
    const { text } = await body(c, z.object({ text: ChatText }));
    const free = await prospectOnly(k, user.id, false);
    const problem = chatProblem(text, free);
    if (problem) fail(400, "invalid", problem);

    // Each person's hourly and daily allowance; a free account's is smaller
    const limit = CHAT_LIMITS[free ? "free" : "client"];
    const hour = new Date().toISOString().slice(0, 13);
    const until = Math.floor(Date.now() / 1000) + KEEP_S;
    const h = await repo.table.increment("COUNTER", `CHAT#${user.id}#${hour}`, 1, until);
    const day = await repo.table.increment("COUNTER", `CHAT#${user.id}#${hour.slice(0, 10)}`, 1, until);
    if (h > limit.hourly || day > limit.daily) fail(429, "too_many_messages", "That's a lot of messages for now. I'll read what's here and answer when I can.");

    // The organization they write from: a client organization over a free one, for the alert's context
    const memberships = (await repo.membershipsOf(user.id)).filter((m) => m.status !== "deactivated");
    const tenants = (await Promise.all(memberships.map((m) => repo.getTenant(m.tenantId)))).filter((t) => t !== undefined);
    const org = tenants.find((t) => !t.prospect) ?? tenants[0];

    const at = now();
    const message: ChatMessage = { id: newId("m"), at, from: "user", body: text };
    const saved = await save(user.id, (t) => {
      // One alert per burst: the next waits until neon1 opens the thread
      const alert = !t || t.ownerUnread === 0;
      const thread: ChatThread = {
        userId: user.id, name: user.name || user.email, email: user.email, orgName: org?.name, orgSlug: org?.slug, free,
        startedAt: t?.startedAt ?? at, lastAt: at, lastFrom: "user", preview: gist(text),
        ownerUnread: (t?.ownerUnread ?? 0) + 1, userUnread: t?.userUnread ?? 0, userSeenAt: at, ownerSeenAt: t?.ownerSeenAt,
        ownerAlertedAt: alert ? at : t?.ownerAlertedAt, replyMailedAt: t?.replyMailedAt, version: 0,
      };
      return { thread, message, outbox: alert ? [outboxOp(`C#${user.id}#O#${at}`, { kind: "chat-owner", userId: user.id, at })] : [] };
    });
    return c.json({ message, thread: saved!.thread, hours: hours() }, 201);
  });

  // --- neon1's inbox (the operator only) ----------------------------------

  // Everyone who wrote, most recent first
  app.get("/chat/inbox", async (c) => {
    operatorOnly(c);
    return c.json({ threads: await repo.chatInbox() });
  });

  // One thread. Opening it marks it seen and ends its alert burst
  app.get("/chat/threads/:uid", async (c) => {
    operatorOnly(c);
    const uid = c.req.param("uid")!;
    let thread = await repo.getChat(uid);
    if (!thread) fail(404, "not_found", "That conversation doesn't exist.");
    const seen = await save(uid, (t) => t && { thread: { ...t, ownerUnread: 0, ownerSeenAt: now(), ownerAlertedAt: undefined } }).catch(() => undefined);
    thread = seen?.thread ?? thread;
    return c.json(await view(uid, thread));
  });

  // Reply. The person is emailed unless they are reading right now, once per burst of replies
  app.post("/chat/threads/:uid", async (c) => {
    operatorOnly(c);
    const uid = c.req.param("uid")!;
    const { text } = await body(c, z.object({ text: ChatText }));
    const at = now();
    const message: ChatMessage = { id: newId("m"), at, from: "neon1", body: text };
    const saved = await save(uid, (t) => {
      if (!t) return undefined;
      const reading = t.userSeenAt !== undefined && Date.parse(at) - Date.parse(t.userSeenAt) < READING_MS;
      const mail = !reading && !t.replyMailedAt;
      return {
        thread: { ...t, lastAt: at, lastFrom: "neon1", preview: gist(text), userUnread: t.userUnread + 1, ownerUnread: 0, ownerSeenAt: at, ownerAlertedAt: undefined, replyMailedAt: mail ? at : t.replyMailedAt },
        message,
        outbox: mail ? [outboxOp(`C#${uid}#U#${at}`, { kind: "chat-user", userId: uid, at })] : [],
      };
    });
    if (!saved) fail(404, "not_found", "That conversation doesn't exist.");
    return c.json({ message, thread: saved.thread, hours: hours() }, 201);
  });
}
