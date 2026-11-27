// apps/api/src/lib/chatguard.ts - Protection against abuse for the chat with neon1, all counted in the table so it costs
// nothing: a pause (mute or ban) neon1 or the strikes set, a cooldown, a duplicate check, a stricter start for a brand
// new account, per-person and per-network-address allowances, and flags on what gets through. neon1's own lead is never held to any of it.
import { countAbuse } from "../routes/suspensions.ts";
import { CHAT_AUTO_MUTE_HOURS, CHAT_COOLDOWN_MS, CHAT_DUPLICATE_MS, CHAT_IP_LIMITS, CHAT_LIMITS, CHAT_NEW_ACCOUNT, CHAT_OFFENSIVE_STRIKES, CHAT_STRIKES_TO_MUTE, blockActive, blockMessage, chatJunk, chatProblem, linkCount, offensive, type ChatBlock, type ChatFlag, type Tenant, type User } from "@1neon/domain";
import type { Context } from "hono";
import { fail, now, type Env } from "./http.ts";
import { viewerIp } from "./edge.ts";
import type { Kit } from "./kit.ts";
import { outboxOp } from "../outbox.ts";


// Counters only need to outlive the day they count
const KEEP_S = 2 * 24 * 60 * 60;
const day = () => new Date().toISOString().slice(0, 10);
const hour = () => new Date().toISOString().slice(0, 13);
const until = () => Math.floor(Date.now() / 1000) + KEEP_S;


/** The address's hash, so no address is stored (Web Crypto, so the browser demo can run the same API) */
async function ipKey(c: Context<Env>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(viewerIp(c))));
  return [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}


/** The person's pause in force now, if any */
export async function activeBlock(k: Pick<Kit, "repo">, tid: string, uid: string): Promise<ChatBlock | undefined> {
  const b = await k.repo.getChatBlock(tid, uid);
  return blockActive(b) ? b : undefined;
}


/** Refuse a person whose chat is paused. They can still read; they can't write, edit, or report */
export async function refuseIfBlocked(k: Pick<Kit, "repo">, tid: string, uid: string) {
  const b = await activeBlock(k, tid, uid);
  if (b) fail(403, "chat_paused", blockMessage(b));
}


/** Pause a person's chat, and tell neon1 when the pause is automatic */
export async function pause(k: Pick<Kit, "repo" | "d" | "drainNow">, tenant: Pick<Tenant, "id">, user: Pick<User, "id" | "name" | "email">, b: Omit<ChatBlock, "userId" | "at">) {
  const at = now();
  const block: ChatBlock = { userId: user.id, at, ...b };
  const ops = [k.repo.chatBlockOp(tenant.id, block)];
  if (b.by === "auto") {
    const row = outboxOp(`C#${tenant.id}#F#${user.id}#${at}`, { kind: "chat-flag", tenantId: tenant.id, at, name: user.name || user.email, reason: `Muted automatically for ${CHAT_AUTO_MUTE_HOURS} hours: ${b.reason}` });
    ops.push(row);
    await k.repo.table.write(ops);
    if ((k.d.outbox ?? "inline") === "inline") await k.drainNow([row]);
  } else {
    await k.repo.table.write(ops);
  }
  return block;
}


/**
 * A refused message counts against the person. Five in an hour mute them for a day, and neon1 is told. `weight`
 * counts an obscenity (sent through, but flagged) as more than one
 */
export async function strike(k: Pick<Kit, "repo" | "d" | "drainNow">, tenant: Pick<Tenant, "id">, user: Pick<User, "id" | "name" | "email">, weight: number, reason: string) {
  const n = await k.repo.table.increment("COUNTER", `CHATSTRIKE#${user.id}#${hour()}`, weight, until());
  if (n >= CHAT_STRIKES_TO_MUTE && n - weight < CHAT_STRIKES_TO_MUTE) {
    await pause(k, tenant, user, { state: "muted", until: new Date(Date.now() + CHAT_AUTO_MUTE_HOURS * 3600_000).toISOString(), reason, by: "auto" });
    // Repeated automatic mutes suspend the account for abuse (routes/suspensions.ts)
    await countAbuse(k, tenant, user).catch(() => undefined);
  }
}


/**
 * Every rule a member's message must pass before it is written, in the order a person meets them. A refusal throws the
 * plain reason and counts a strike (the cooldown doesn't: it only asks for a moment). Returns the flags to put on the
 * message when it passes. neon1's lead isn't held to any of this, so the route doesn't call it for them
 */
export async function guardChat(k: Pick<Kit, "repo" | "d" | "drainNow">, c: Context<Env>, a: { tenant: Tenant; user: User; text: string; free: boolean }): Promise<ChatFlag[]> {
  const { repo } = k;
  const { tenant, user, text, free } = a;
  const refuse = async (status: 400 | 409 | 429, error: string, message: string, weight = 1): Promise<never> => {
    await strike(k, tenant, user, weight, message);
    return fail(status, error, message);
  };

  await refuseIfBlocked(k, tenant.id, user.id);

  // What it says
  if (chatJunk(text)) await refuse(400, "invalid", "Say what you need in a few words.");
  const problem = chatProblem(text, free);
  if (problem) await refuse(400, "invalid", problem);

  // The same thing again
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const mine = (await repo.chatMessages(tenant.id, 30)).filter((m) => m.authorId === user.id).at(-1);
  if (mine && norm(mine.body) === norm(text) && Date.now() - Date.parse(mine.at) < CHAT_DUPLICATE_MS) await refuse(409, "duplicate", "You already sent that.");

  // Too fast: only asks for a moment
  const last = await repo.chatLastSent(tenant.id, user.id);
  if (last && Date.now() - last < CHAT_COOLDOWN_MS) fail(429, "slow_down", "Give it a moment before sending another.");

  // An account minutes old gets a few messages until neon1 has read them
  const born = Date.parse(user.createdAt);
  if (Number.isFinite(born) && Date.now() - born < CHAT_NEW_ACCOUNT.ageMs) {
    const n = await repo.table.increment("COUNTER", `CHATNEW#${user.id}`, 1, until());
    if (n > CHAT_NEW_ACCOUNT.max) await refuse(429, "new_account", "Give me a little time to read these before you send more.");
  }

  // This person's hourly and daily allowance; a free account's is smaller
  const limit = CHAT_LIMITS[free ? "free" : "client"];
  const h = await repo.table.increment("COUNTER", `CHAT#${user.id}#${hour()}`, 1, until());
  const d = await repo.table.increment("COUNTER", `CHAT#${user.id}#${day()}`, 1, until());
  if (h > limit.hourly || d > limit.daily) await refuse(429, "too_many_messages", "That's a lot of messages for now. I'll read what's here and answer when I can.");

  // This network address's allowance across every account, so many sign-ups don't multiply a person's allowance
  const ip = await ipKey(c);
  const ih = await repo.table.increment("COUNTER", `CHATIP#${ip}#${hour()}`, 1, until());
  const id = await repo.table.increment("COUNTER", `CHATIP#${ip}#${day()}`, 1, until());
  if (ih > CHAT_IP_LIMITS.hourly || id > CHAT_IP_LIMITS.daily) await refuse(429, "busy_network", "Chat is busy from your network. Try again in a while, or email hello@neon1.tech.");

  await repo.table.write([repo.chatLastOp(tenant.id, user.id, Date.now())]);

  // What passes but neon1 should look at
  const flags: ChatFlag[] = [];
  if (offensive(text)) {
    flags.push("offensive");
    await strike(k, tenant, user, CHAT_OFFENSIVE_STRIKES, "Offensive messages");
  }
  if (free && linkCount(text) > 0) flags.push("links");
  return flags;
}
