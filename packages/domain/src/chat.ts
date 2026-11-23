// packages/domain/src/chat.ts - Direct chat between a signed-in person and neon1's lead: the message
// rules, the limits, and the hours replies come in, stated once for the API (which enforces them) and
// the web app (which says them). Chat is asynchronous: people write any time, replies come in these hours.


import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "./timing.ts";


/** The longest message, in characters */
export const CHAT_MAX = 2000;
/** The most links one message from a free account may carry */
export const CHAT_FREE_LINKS = 1;

/** Messages one person may send, per hour and per day; a free account's allowance is the smaller */
export const CHAT_LIMITS = {
  free: { hourly: 6, daily: 20 },
  client: { hourly: 20, daily: 100 },
} as const;

/**
 * Protection against abuse, all counted in the table (no outside service, so no cost). Every rule below holds for
 * everyone but neon1's own lead, and the ones that refuse a message add a strike toward an automatic mute.
 */
// Messages from one network address across every account, so one person can't sign up many accounts to get around the per-person limits
export const CHAT_IP_LIMITS = { hourly: 12, daily: 40 } as const;
// The least time between one person's messages
export const CHAT_COOLDOWN_MS = 2_000;
// An account this new may send only a few messages until neon1 has had time to read them
export const CHAT_NEW_ACCOUNT = { ageMs: 15 * 60 * 1000, max: 3 } as const;
// Sending the same text again within this long is refused
export const CHAT_DUPLICATE_MS = 10 * 60 * 1000;
// Refused messages in an hour that mute a person automatically, and for how long
export const CHAT_STRIKES_TO_MUTE = 5;
export const CHAT_AUTO_MUTE_HOURS = 24;
// What an offensive message counts for, since it is accepted (neon1 sees it flagged) but repeated ones should stop
export const CHAT_OFFENSIVE_STRIKES = 2;

/** Why a message was flagged for neon1: it carries a link from a free account, uses an obscenity or slur, or another member reported it */
export type ChatFlag = "links" | "offensive" | "reported";

/** A person's chat paused by neon1 (or automatically): muted until a time, or banned. They can still read; they can't write */
export interface ChatBlock {
  userId: string;
  state: "muted" | "banned";
  until?: string;
  reason: string;
  by: "auto" | "neon1";
  at: string;
}

/** Is this block in force at `at`? A mute ends when its time does; a ban doesn't */
export const blockActive = (b: ChatBlock | undefined, at: Date = new Date()): b is ChatBlock => Boolean(b) && (b!.state === "banned" || !b!.until || Date.parse(b!.until) > at.getTime());

/** What a paused person is told: how long, and the way out */
export function blockMessage(b: ChatBlock): string {
  if (b.state === "banned") return "Chat isn't available for your account. Email hello@neon1.tech.";
  const until = b.until ? new Date(b.until).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "";
  return `Chat is paused for your account${until ? ` until ${until}` : ""}. Email hello@neon1.tech.`;
}

/** Typing to fill the box rather than to say something: no letters at all, or one character over and over */
export function chatJunk(text: string): boolean {
  const t = text.trim();
  return !/\p{L}/u.test(t) || /(.)\1{7,}/u.test(t.replace(/\s/g, ""));
}

/** Messages kept in a thread's reply to the browser (the newest); older ones stay stored */
export const CHAT_PAGE = 100;
/** Earlier versions kept on one edited message */
export const CHAT_EDIT_HISTORY = 20;
/** A member who opened the chat this recently is reading it, so a reply needs no email to them */
export const CHAT_READING_MS = 2 * 60 * 1000;


/** One message in an organization's chat: from a member of the organization, or from neon1's lead. An edit
 * keeps what the message said before in `history`, so the record shows every version */
export const ChatMessage = z.object({
  id: z.string(),
  at: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  from: z.enum(["member", "neon1"]),
  body: z.string().max(CHAT_MAX),
  // Set on a private message: the one member it is between neon1 and. Everyone else in the organization never sees it
  privateWith: z.string().optional(),
  // Why neon1 should look at this one: set when it was sent (links, offensive) or reported by another member
  flags: z.array(z.enum(["links", "offensive", "reported"])).optional(),
  reports: z.array(z.string()).max(20).optional(),
  editedAt: z.string().optional(),
  history: z.array(z.object({ at: z.string(), body: z.string() })).max(CHAT_EDIT_HISTORY).optional(),
  version: z.number().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;


/** May this reader see this message? Private ones are for neon1 and the member they are with only */
export const chatVisibleTo = (m: Pick<ChatMessage, "privateWith">, userId: string, operator: boolean): boolean => !m.privateWith || operator || m.privateWith === userId;


/** The text of a message to send: trimmed, not empty, not too long */
export const ChatText = z.string().trim().min(1, "Write a message first.").max(CHAT_MAX, `Keep it under ${CHAT_MAX} characters.`);


/**
 * One organization's chat: every member and neon1's lead share it, so the whole conversation is the record.
 * A free account is an organization of one. This row is the summary the inbox lists
 */
export interface ChatThread {
  tenantId: string;
  orgName: string;
  orgSlug: string;
  free: boolean;
  startedAt: string;
  lastAt: string;
  lastId: string;
  lastBy: string;
  lastFrom: "member" | "neon1";
  // The start of the latest message, for the inbox list
  preview: string;
  // Messages from members since neon1 last opened the chat, and when it did
  ownerUnread: number;
  ownerSeenAt?: string;
  // When neon1 was last alerted. It stays set until neon1 opens the chat, so a burst alerts once
  ownerAlertedAt?: string;
  // Flagged or reported messages since neon1 last opened the chat
  ownerFlagged?: number;
  version: number;
}


/** When one member last opened their organization's chat, and when they were last emailed a reply (cleared on opening) */
export interface ChatSeen {
  userId: string;
  at: string;
  mailedAt?: string;
}


/** How many links a text carries */
export function linkCount(text: string): number {
  return (text.match(/\b(?:https?:\/\/|www\.)\S+/gi) ?? []).length;
}


/** What a free account's message may not do; undefined when it is fine */
export function chatProblem(text: string, free: boolean): string | undefined {
  if (free && linkCount(text) > CHAT_FREE_LINKS) return `A message can carry ${CHAT_FREE_LINKS === 1 ? "one link" : `up to ${CHAT_FREE_LINKS} links`}.`;
  return undefined;
}


// --- Reply hours ----------------------------------------------------------

// Hours replies come in, in New York time: [opens, closes) by weekday, 0 = Sunday
const HOURS: Record<number, [number, number]> = {
  0: [8, 20], 1: [18, 21], 2: [18, 21], 3: [18, 21], 4: [18, 21], 5: [18, 20], 6: [8, 20],
};

/** The hours replies come in, as a sentence for the page and the confirmation email */
export const REPLY_HOURS_TEXT = "weekdays 6 to 9 pm (Fridays to 8 pm) and weekends 8 am to 8 pm Eastern";


/** Weekday (0 is Sunday) and minutes since midnight at an instant, in New York */
function clockIn(at: Date, zone = DEFAULT_TIME_ZONE): { day: number; minutes: number } {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at)) p[x.type] = x.value;
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday ?? ""), minutes: Number(p.hour) * 60 + Number(p.minute) };
}


/** Is the lead reading and replying right now? */
export function replyOpen(at: Date = new Date()): boolean {
  const { day, minutes } = clockIn(at);
  const [from, to] = HOURS[day]!;
  return minutes >= from * 60 && minutes < to * 60;
}


/** The next moment replies come in: now when open, otherwise the start of the next window (to the minute) */
export function nextReplyAt(at: Date = new Date()): Date {
  // Step by the minute from the start of the current minute; the longest wait is under a day, so this is bounded
  let t = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 2 * 24 * 60; i++, t = new Date(t.getTime() + 60_000)) if (replyOpen(t)) return t;
  return t;
}


/** When a reply is expected, said the way the page says it: "now" while open, else the next window's start */
export function replyExpectation(at: Date = new Date()): { open: boolean; next: Date } {
  const next = nextReplyAt(at);
  return { open: next.getTime() === Math.floor(at.getTime() / 60_000) * 60_000, next };
}


/** What a member may know of a chat's summary: nothing from a message they can't see, so no preview, author, or neon1's counts */
export type ChatThreadPublic = Pick<ChatThread, "tenantId" | "orgName" | "orgSlug" | "free" | "startedAt" | "lastAt" | "lastFrom">;

/** What the browser gets for one organization's chat: the summary (none before the first message), its newest
 * messages, how many are new to the caller, and when replies come in. Earlier versions of an edited message
 * go to neon1 only */
export interface ChatView {
  thread: ChatThread | ChatThreadPublic | null;
  messages: ChatMessage[];
  // The caller's own pause, when chat is paused for them
  block?: ChatBlock | null;
  // For neon1: everyone in this organization whose chat is paused
  blocks?: ChatBlock[];
  unread: number;
  hours: { open: boolean; nextAt: string; text: string };
}
