// packages/domain/src/chat.ts - Direct chat between a signed-in person and neon1's lead: the message
// rules, the limits, and the hours replies come in, stated once for the API (which enforces them) and
// the web app (which says them). Chat is asynchronous: people write any time, replies come in these hours.


import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "./timing.ts";


/** The longest message, in characters */
export const CHAT_MAX = 2000;
/** The most links one message from a free account may carry */
export const CHAT_FREE_LINKS = 2;

/** Messages one person may send, per hour and per day; a free account's allowance is the smaller */
export const CHAT_LIMITS = {
  free: { hourly: 6, daily: 20 },
  client: { hourly: 20, daily: 100 },
} as const;

/** Messages kept in a thread's reply to the browser (the newest); older ones stay stored */
export const CHAT_PAGE = 100;


/** One message in a thread: from the person, or from neon1 (the lead's own reply) */
export const ChatMessage = z.object({
  id: z.string(),
  at: z.string(),
  from: z.enum(["user", "neon1"]),
  body: z.string().max(CHAT_MAX),
});
export type ChatMessage = z.infer<typeof ChatMessage>;


/** The text of a message to send: trimmed, not empty, not too long */
export const ChatText = z.string().trim().min(1, "Write a message first.").max(CHAT_MAX, `Keep it under ${CHAT_MAX} characters.`);


/** One conversation: who it is with and where it stands. Each person has at most one */
export interface ChatThread {
  userId: string;
  name: string;
  email: string;
  // The organization they last wrote from, and whether it is a free account
  orgName?: string;
  orgSlug?: string;
  free: boolean;
  startedAt: string;
  lastAt: string;
  lastFrom: "user" | "neon1";
  // The start of the latest message, for the inbox list
  preview: string;
  // Messages the other side has not seen yet
  ownerUnread: number;
  userUnread: number;
  // When each side last opened the thread
  userSeenAt?: string;
  ownerSeenAt?: string;
  // When neon1 was last alerted, and when the person was last emailed a reply. Each stays set until the
  // other side opens the thread, so a burst of messages alerts once
  ownerAlertedAt?: string;
  replyMailedAt?: string;
  version: number;
}


/** How many links a text carries */
export function linkCount(text: string): number {
  return (text.match(/\b(?:https?:\/\/|www\.)\S+/gi) ?? []).length;
}


/** What a free account's message may not do; undefined when it is fine */
export function chatProblem(text: string, free: boolean): string | undefined {
  if (free && linkCount(text) > CHAT_FREE_LINKS) return `A message can carry up to ${CHAT_FREE_LINKS} links.`;
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


/** What the browser gets for one thread: the thread (none before the first message), its newest messages,
 * and when replies come in */
export interface ChatView {
  thread: ChatThread | null;
  messages: ChatMessage[];
  hours: { open: boolean; nextAt: string; text: string };
}
