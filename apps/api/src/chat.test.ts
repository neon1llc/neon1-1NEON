// apps/api/src/chat.test.ts - Direct chat: a signed-in person writes, neon1 is alerted once per burst, replies
// reach the person (by email unless they are reading), threads stay private, and free accounts are limited.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_LIMITS, type ChatView, type User } from "@1neon/domain";
import { createApp } from "./app.ts";
import { claimSignup } from "./routes/signup.ts";
import { MemoryDirectory, MemoryMailer, MemoryPusher, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";
import type { Config } from "./config.ts";


const OP = "pradeep@neon1.tech";
let app: ReturnType<typeof createApp>;
let repo: Repo;
let mailer: MemoryMailer;
let pusher: MemoryPusher;
let cfg: Config;

beforeEach(async () => {
  mailer = new MemoryMailer();
  pusher = new MemoryPusher();
  repo = new Repo(new MemoryTable());
  cfg = { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true, signup: true };
  app = createApp({ cfg, repo, directory: new MemoryDirectory(), mailer, pusher, storage: new MemoryStorage() });
  const ts = new Date().toISOString();
  const op: User = { id: "u_op", email: OP, name: "Pradeep", title: "", phone: "", operator: false, strongAuth: true, theme: "awake", menu: "default", version: 1, createdAt: ts, updatedAt: ts, updatedBy: "u_op" };
  await repo.createUser(op);
});
afterEach(() => vi.useRealTimers());

const as = (email: string, path: string, method = "GET", b?: unknown) =>
  app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": email }, body: b === undefined ? undefined : JSON.stringify(b) });

/** A free account, signed up for real, and its person's id */
async function person(email: string, name = "Dana Kim") {
  const r = await app.request("/1NEON/api/auth/signup", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-forwarded-for": "203.0.113.7" }, body: JSON.stringify({ email, name, kind: "small", org: "Kim Dental", link: "kimdental.com", terms: true, elapsed: 8000 }) });
  expect(r.status).toBe(200);
  return (await claimSignup({ repo, cfg }, email))!;
}
const say = (email: string, text: string) => as(email, "/chat", "POST", { text });
const open = async (email: string) => (await (await as(email, "/chat")).json()) as ChatView;
const reply = (uid: string, text: string) => as(OP, `/chat/threads/${uid}`, "POST", { text });
const alerts = () => mailer.sent.filter((m) => m.to === OP);


describe("writing to neon1", () => {
  it("starts a thread, alerts neon1 by email with the message and by push without it", async () => {
    const uid = await person("dana@example.com");
    mailer.sent.length = 0;
    const r = await say("dana@example.com", "Can you look at my intake outline?");
    expect(r.status).toBe(201);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({ as: "reach", subject: expect.stringContaining("Dana Kim") });
    expect(alerts()[0]!.text).toContain("Can you look at my intake outline?");
    expect(pusher.sent).toHaveLength(1);
    expect(pusher.sent[0]!.message).not.toContain("intake");
    const v = await open("dana@example.com");
    expect(v.messages.map((m) => [m.from, m.body])).toEqual([["user", "Can you look at my intake outline?"]]);
    expect(v.thread).toMatchObject({ userId: uid, free: true, orgName: "Kim Dental", ownerUnread: 1 });
    expect(v.hours.text).toMatch(/weekdays 6 to 9 pm/);
  });

  it("alerts once per burst, and again after neon1 opens the thread", async () => {
    await person("dana@example.com");
    mailer.sent.length = 0;
    await say("dana@example.com", "One");
    await say("dana@example.com", "Two");
    await say("dana@example.com", "Three");
    expect(alerts()).toHaveLength(1);
    expect(pusher.sent).toHaveLength(1);
    const inbox = (await (await as(OP, "/chat/inbox")).json()) as { threads: { ownerUnread: number; preview: string }[] };
    expect(inbox.threads[0]).toMatchObject({ ownerUnread: 3, preview: "Three" });
    // Opening ends the burst
    const uid = (await repo.userIdForEmail("dana@example.com"))!;
    await as(OP, `/chat/threads/${uid}`);
    expect((await (await as(OP, "/chat/inbox")).json() as { threads: { ownerUnread: number }[] }).threads[0]!.ownerUnread).toBe(0);
    await say("dana@example.com", "Four");
    expect(alerts()).toHaveLength(2);
  });

  it("works with email alone when no push is set up", async () => {
    app = createApp({ cfg, repo, directory: new MemoryDirectory(), mailer, storage: new MemoryStorage() });
    await person("dana@example.com");
    mailer.sent.length = 0;
    expect((await say("dana@example.com", "Hello")).status).toBe(201);
    expect(alerts()).toHaveLength(1);
  });
});


describe("replying", () => {
  it("emails the person a reply when they are not reading, once per burst", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const uid = await person("dana@example.com");
    await say("dana@example.com", "Question");
    // Three minutes later they have gone
    vi.setSystemTime(Date.now() + 3 * 60 * 1000);
    mailer.sent.length = 0;
    expect((await reply(uid, "Happy to help.")).status).toBe(201);
    await reply(uid, "More on that.");
    const mails = mailer.sent.filter((m) => m.to === "dana@example.com");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe("Reply from Pradeep at neon1");
    expect(mails[0]!.text).toContain("Happy to help.");
    // Opening the thread shows both replies and clears the unread count
    const v = await open("dana@example.com");
    expect(v.messages.map((m) => m.from)).toEqual(["user", "neon1", "neon1"]);
    expect(v.thread?.userUnread).toBe(0);
    // A later reply after they read it emails again
    vi.setSystemTime(Date.now() + 3 * 60 * 1000);
    await reply(uid, "Following up.");
    expect(mailer.sent.filter((m) => m.to === "dana@example.com")).toHaveLength(2);
  });

  it("sends no email to a person who is reading right now", async () => {
    const uid = await person("dana@example.com");
    await say("dana@example.com", "Question");
    mailer.sent.length = 0;
    await reply(uid, "Quick answer.");
    expect(mailer.sent.filter((m) => m.to === "dana@example.com")).toHaveLength(0);
    expect((await open("dana@example.com")).thread?.userUnread).toBe(0);
  });
});


describe("privacy and limits", () => {
  it("keeps each thread to its person and the inbox to neon1", async () => {
    const dana = await person("dana@example.com");
    await person("lee@example.com", "Lee Park");
    await say("dana@example.com", "Dana's private note");
    const leeView = await open("lee@example.com");
    expect(leeView.thread).toBeNull();
    expect(JSON.stringify(leeView)).not.toContain("private note");
    // Not an operator: no inbox, no thread, no reply
    expect((await as("lee@example.com", "/chat/inbox")).status).toBe(404);
    expect((await as("lee@example.com", `/chat/threads/${dana}`)).status).toBe(404);
    expect((await as("lee@example.com", `/chat/threads/${dana}`, "POST", { text: "hi" })).status).toBe(404);
    // neon1's own chat is the inbox, not a thread of its own
    expect((await as(OP, "/chat")).status).toBe(400);
    expect((await as(OP, "/chat/threads/nobody")).status).toBe(404);
  });

  it("limits a free account by the hour, and refuses empty, long, and link-heavy messages", async () => {
    await person("dana@example.com");
    expect((await say("dana@example.com", "   ")).status).toBe(400);
    expect((await say("dana@example.com", "x".repeat(2001))).status).toBe(400);
    expect((await say("dana@example.com", "see a.com https://a.com https://b.com https://c.com")).status).toBe(400);
    for (let i = 0; i < CHAT_LIMITS.free.hourly; i++) expect((await say("dana@example.com", `Message ${i}`)).status).toBe(201);
    const over = await say("dana@example.com", "One more");
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: string }).error).toBe("too_many_messages");
  });

  it("needs a sign-in and the CSRF header", async () => {
    expect((await app.request("/1NEON/api/chat", { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1" }, body: JSON.stringify({ text: "hi" }) })).status).toBe(401);
    expect((await app.request("/1NEON/api/chat", { method: "POST", headers: { "content-type": "application/json", "x-dev-user": "dana@example.com" }, body: JSON.stringify({ text: "hi" }) })).status).toBe(403);
  });
});
