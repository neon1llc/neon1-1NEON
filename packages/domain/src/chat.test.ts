// packages/domain/src/chat.test.ts - Chat text rules and the reply hours, including daylight saving.
import { describe, expect, it } from "vitest";
import { blockActive, blockMessage, chatJunk, ChatText, CHAT_MAX, chatProblem, chatVisibleTo, linkCount, nextReplyAt, replyExpectation, replyOpen } from "./chat.ts";

// 2026-11-20 is a Friday; New York is on standard time (UTC-5)
const ny = (iso: string) => new Date(`${iso}-05:00`);

describe("reply hours", () => {
  it("opens weekday evenings, Fridays to 8, and weekends 8 to 8", () => {
    expect(replyOpen(ny("2026-11-19T17:59:00"))).toBe(false); // Thu
    expect(replyOpen(ny("2026-11-19T18:00:00"))).toBe(true);
    expect(replyOpen(ny("2026-11-19T20:59:00"))).toBe(true);
    expect(replyOpen(ny("2026-11-19T21:00:00"))).toBe(false);
    expect(replyOpen(ny("2026-11-20T19:59:00"))).toBe(true); // Fri
    expect(replyOpen(ny("2026-11-20T20:00:00"))).toBe(false);
    expect(replyOpen(ny("2026-11-21T08:00:00"))).toBe(true); // Sat
    expect(replyOpen(ny("2026-11-22T19:59:00"))).toBe(true); // Sun
    expect(replyOpen(ny("2026-11-22T20:00:00"))).toBe(false);
  });
  it("names the next window from a closed hour", () => {
    // Friday 9 pm: next is Saturday 8 am
    expect(nextReplyAt(ny("2026-11-20T21:00:00")).toISOString()).toBe(ny("2026-11-21T08:00:00").toISOString());
    // Sunday 8:30 pm: next is Monday 6 pm
    expect(nextReplyAt(ny("2026-11-22T20:30:00")).toISOString()).toBe(ny("2026-11-23T18:00:00").toISOString());
    // Monday 10 am: same day, 6 pm
    expect(nextReplyAt(ny("2026-11-23T10:00:00")).toISOString()).toBe(ny("2026-11-23T18:00:00").toISOString());
  });
  it("says open now while inside a window", () => {
    expect(replyExpectation(ny("2026-11-21T09:15:30")).open).toBe(true);
    expect(replyExpectation(ny("2026-11-21T07:00:00")).open).toBe(false);
  });
  it("follows daylight saving, not a fixed offset", () => {
    // 2026-07-18 is a Saturday in daylight time (UTC-4): 8 am is 12:00 UTC
    expect(replyOpen(new Date("2026-07-18T12:00:00Z"))).toBe(true);
    expect(replyOpen(new Date("2026-07-18T11:59:00Z"))).toBe(false);
  });
});

describe("message text", () => {
  it("trims, and refuses empty or too long", () => {
    expect(ChatText.parse("  hello  ")).toBe("hello");
    expect(ChatText.safeParse("   ").success).toBe(false);
    expect(ChatText.safeParse("x".repeat(CHAT_MAX + 1)).success).toBe(false);
  });
  it("limits a free account's links", () => {
    expect(linkCount("see https://a.com and www.b.com")).toBe(2);
    expect(chatProblem("a https://a.com b https://b.com c www.c.com", true)).toMatch(/link/);
    expect(chatProblem("one link https://a.com", true)).toBeUndefined();
    expect(chatProblem("a https://a.com b https://b.com c www.c.com", false)).toBeUndefined();
    expect(chatProblem("no links here", true)).toBeUndefined();
  });
});


describe("private messages", () => {
  it("are visible to neon1 and the one member they are with, and to no one else", () => {
    const everyone = {};
    const withDana = { privateWith: "u_dana" };
    expect(chatVisibleTo(everyone, "u_raj", false)).toBe(true);
    expect(chatVisibleTo(withDana, "u_dana", false)).toBe(true);
    expect(chatVisibleTo(withDana, "u_raj", false)).toBe(false);
    expect(chatVisibleTo(withDana, "u_op", true)).toBe(true);
  });
});


describe("abuse protection rules", () => {
  it("calls typing to fill the box junk, but lets a short real message through", () => {
    expect(chatJunk("12345 !!!")).toBe(true);
    expect(chatJunk("aaaaaaaaaaaa")).toBe(true);
    for (const ok of ["hi", "test", "ok thanks", "Can you look at this?"]) expect(chatJunk(ok)).toBe(false);
  });
  it("ends a mute at its time and never ends a ban", () => {
    const base = { userId: "u", reason: "r", by: "neon1" as const, at: "2026-11-22T00:00:00.000Z" };
    const now = new Date("2026-11-22T12:00:00Z");
    expect(blockActive({ ...base, state: "muted", until: "2026-11-23T00:00:00.000Z" }, now)).toBe(true);
    expect(blockActive({ ...base, state: "muted", until: "2026-11-22T06:00:00.000Z" }, now)).toBe(false);
    expect(blockActive({ ...base, state: "banned" }, now)).toBe(true);
    expect(blockActive(undefined, now)).toBe(false);
  });
  it("tells a paused person how long and the way out", () => {
    expect(blockMessage({ userId: "u", reason: "r", by: "auto", at: "x", state: "muted", until: "2026-11-23T12:00:00.000Z" })).toMatch(/paused for your account until Nov 23\. Email hello@neon1\.tech/);
    expect(blockMessage({ userId: "u", reason: "r", by: "neon1", at: "x", state: "banned" })).toMatch(/isn't available.*hello@neon1\.tech/);
  });
});
