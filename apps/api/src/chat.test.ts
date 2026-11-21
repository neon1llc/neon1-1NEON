// apps/api/src/chat.test.ts - The shared organization chat: every member and neon1 write in one conversation with
// names, neon1 is alerted once per burst, replies reach members who aren't reading, edits keep the earlier text,
// organizations never see each other's chat, and a free account is limited.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_EDIT_HISTORY, CHAT_LIMITS, type ChatMessage, type ChatThread, type ChatView } from "@1neon/domain";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryPusher, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OP = "pradeep@neon1.tech";
const RAJ = "raj@acmedental.example";
const DANA = "dana@acmedental.example";
const NOOR = "noor@calderbuildingsupply.example";
let app: ReturnType<typeof createApp>;
let repo: Repo;
let mailer: MemoryMailer;
let pusher: MemoryPusher;
let s: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  mailer = new MemoryMailer();
  pusher = new MemoryPusher();
  s = await seed(repo, OP);
  app = createApp({ cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer, pusher, storage: new MemoryStorage() });
});
afterEach(() => vi.useRealTimers());

const as = (email: string, path: string, method = "GET", b?: unknown) =>
  app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": email }, body: b === undefined ? undefined : JSON.stringify(b) });
const chat = (tid: string) => `/t/${tid}/chat`;
const say = (email: string, tid: string, text: string) => as(email, chat(tid), "POST", { text });
const open = async (email: string, tid: string) => (await (await as(email, chat(tid))).json()) as ChatView;
const alerts = () => mailer.sent.filter((m) => m.to === OP);
const mailsTo = (email: string) => mailer.sent.filter((m) => m.to === email);
const fwd = (ms: number) => vi.setSystemTime(Date.now() + ms);


describe("one chat for the whole organization", () => {
  it("shows every member's message to every member, with names", async () => {
    const tid = s.acme.id;
    expect((await say(RAJ, tid, "Can we move the restore test to Fridays?")).status).toBe(201);
    expect((await say(DANA, tid, "Fridays work for me.")).status).toBe(201);
    const v = await open(RAJ, tid);
    expect(v.messages.map((m) => [m.authorName, m.from, m.body])).toEqual([["Raj Patel", "member", "Can we move the restore test to Fridays?"], ["Dana Kim", "member", "Fridays work for me."]]);
    expect(v.thread).toMatchObject({ orgName: "Acme Dental", free: false });
    // neon1's counts and previews are for neon1 only
    expect(v.thread).not.toHaveProperty("ownerUnread");
    expect((await open(OP, tid)).thread).toMatchObject({ lastBy: "Dana Kim", ownerUnread: 2 });
    expect(v.hours.text).toMatch(/weekdays 6 to 9 pm/);
  });

  it("counts what is new to each reader", async () => {
    const tid = s.acme.id;
    await say(RAJ, tid, "One");
    await say(RAJ, tid, "Two");
    expect((await open(DANA, tid)).unread).toBe(2);
    expect((await open(DANA, tid)).unread).toBe(0);
    expect((await open(RAJ, tid)).unread).toBe(0);
    await say(DANA, tid, "Three");
    expect((await open(RAJ, tid)).unread).toBe(1);
  });

  it("keeps organizations apart, and the inbox for neon1", async () => {
    await say(RAJ, s.acme.id, "Acme's private note");
    await say(NOOR, s.calder.id, "Calder's question");
    // Another organization's chat is not found, whoever asks
    expect((await as(NOOR, chat(s.acme.id))).status).toBe(404);
    expect((await say(NOOR, s.acme.id, "hi")).status).toBe(404);
    expect((await as(RAJ, chat(s.calder.id))).status).toBe(404);
    // Only neon1 has the inbox, and it lists both
    expect((await as(RAJ, "/chat/inbox")).status).toBe(404);
    const inbox = (await (await as(OP, "/chat/inbox")).json()) as { threads: ChatThread[] };
    expect(inbox.threads.map((t) => t.orgName).sort()).toEqual(["Acme Dental", "Calder Building Supply"]);
    expect(inbox.threads.find((t) => t.orgName === "Calder Building Supply")?.free).toBe(true);
  });
});


describe("the unread count", () => {
  it("is read without marking anything seen", async () => {
    const tid = s.acme.id;
    await say(RAJ, tid, "One");
    await say(RAJ, tid, "Two");
    const unread = async (email: string) => ((await (await as(email, `${chat(tid)}/unread`)).json()) as { unread: number }).unread;
    expect(await unread(DANA)).toBe(2);
    expect(await unread(DANA)).toBe(2);
    expect(await unread(RAJ)).toBe(0);
    expect(await unread(OP)).toBe(2);
    // Opening is what marks it seen
    await open(DANA, tid);
    expect(await unread(DANA)).toBe(0);
    expect(await unread(OP)).toBe(2);
    // A private message counts only for the member it is with
    await as(RAJ, chat(tid), "POST", { text: "just for neon1", private: true });
    expect(await unread(DANA)).toBe(0);
    expect(await unread(OP)).toBe(3);
  });
});


describe("alerts to neon1", () => {
  it("emails the message and pushes without it, once per burst, again after neon1 opens the chat", async () => {
    const tid = s.acme.id;
    await say(RAJ, tid, "Can you look at the restore results?");
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({ as: "reach", subject: expect.stringContaining("Raj Patel") });
    expect(alerts()[0]!.text).toContain("restore results");
    expect(alerts()[0]!.text).toContain("Acme Dental");
    expect(pusher.sent).toHaveLength(1);
    expect(pusher.sent[0]!.message).not.toContain("restore");
    await say(DANA, tid, "Second message");
    await say(RAJ, tid, "Third message");
    expect(alerts()).toHaveLength(1);
    expect(pusher.sent).toHaveLength(1);
    // neon1 opens it: the burst is over
    expect((await open(OP, tid)).unread).toBe(3);
    await say(RAJ, tid, "Fourth message");
    expect(alerts()).toHaveLength(2);
  });

  it("works with email alone when no push is set up", async () => {
    app = createApp({ cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer, storage: new MemoryStorage() });
    await say(RAJ, s.acme.id, "Hello");
    expect(alerts()).toHaveLength(1);
  });
});


describe("replies from neon1", () => {
  it("emails each member who isn't reading, once per burst, and again after they look", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tid = s.acme.id;
    await say(RAJ, tid, "Question");
    await open(DANA, tid);
    fwd(3 * 60 * 1000);
    // Raj is on the page, Dana is not
    await open(RAJ, tid);
    mailer.sent.length = 0;
    expect((await say(OP, tid, "Happy to help.")).status).toBe(201);
    expect(mailsTo(DANA)).toHaveLength(1);
    expect(mailsTo(DANA)[0]).toMatchObject({ subject: "Reply from Pradeep at neon1", as: "portal" });
    expect(mailsTo(DANA)[0]!.text).toContain("Happy to help.");
    expect(mailsTo(RAJ)).toHaveLength(0);
    // The operator is not emailed his own reply, and a second reply in the burst adds nothing
    expect(mailsTo(OP)).toHaveLength(0);
    await say(OP, tid, "More on that.");
    expect(mailsTo(DANA)).toHaveLength(1);
    // After she looks and leaves, a later reply emails her again
    await open(DANA, tid);
    fwd(3 * 60 * 1000);
    await say(OP, tid, "Following up.");
    expect(mailsTo(DANA)).toHaveLength(2);
    // The reply is marked as neon1's in the thread
    const v = await open(RAJ, tid);
    expect(v.messages.at(-1)).toMatchObject({ from: "neon1", authorName: "Pradeep" });
    expect((await open(OP, tid)).thread).toMatchObject({ ownerUnread: 0, lastFrom: "neon1" });
  });
});


describe("private messages", () => {
  const priv = (email: string, tid: string, text: string, extra: Record<string, unknown> = {}) => as(email, chat(tid), "POST", { text, ...extra });

  it("keep a member's private note between them and neon1, in the same chat and storage", async () => {
    const tid = s.acme.id;
    expect((await priv(DANA, tid, "Billing question I'd rather Raj not see.", { private: true })).status).toBe(201);
    await say(DANA, tid, "A message for everyone.");
    // Raj never sees it: not in the chat, not in his unread count, not in the summary
    const raj = await open(RAJ, tid);
    expect(raj.messages.map((m) => m.body)).toEqual(["A message for everyone."]);
    expect(raj.unread).toBe(1);
    expect(JSON.stringify(raj)).not.toContain("Billing question");
    expect(raj.thread).not.toHaveProperty("preview");
    expect(raj.thread).not.toHaveProperty("lastBy");
    // Dana and neon1 both do
    expect((await open(DANA, tid)).messages.map((m) => m.body)).toHaveLength(2);
    const op = await open(OP, tid);
    expect(op.messages[0]).toMatchObject({ privateWith: expect.any(String), body: expect.stringContaining("Billing") });
    // neon1's alert says it is private to him
    expect(alerts()[0]!.text).toContain("Billing question");
  });

  it("lets neon1 answer one member privately: only they see it, and only they are emailed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tid = s.acme.id;
    await open(RAJ, tid);
    await open(DANA, tid);
    fwd(3 * 60 * 1000);
    mailer.sent.length = 0;
    const danaId = (await repo.userIdForEmail(DANA))!;
    expect((await priv(OP, tid, "Dana, about your invoice question.", { to: danaId })).status).toBe(201);
    expect(mailsTo(DANA)).toHaveLength(1);
    expect(mailsTo(RAJ)).toHaveLength(0);
    expect((await open(RAJ, tid)).messages).toHaveLength(0);
    expect((await open(DANA, tid)).messages[0]).toMatchObject({ body: "Dana, about your invoice question.", from: "neon1" });
    // Only someone in the organization can be chosen
    const noorId = (await repo.userIdForEmail(NOOR))!;
    expect((await priv(OP, tid, "x", { to: noorId })).status).toBe(400);
  });

  it("ignores a member's attempt to address someone else", async () => {
    const tid = s.acme.id;
    const raj = (await repo.userIdForEmail(RAJ))!;
    await priv(DANA, tid, "Public despite the field.", { to: raj });
    expect((await open(RAJ, tid)).messages.map((m) => m.body)).toEqual(["Public despite the field."]);
  });
});


describe("editing", () => {
  const edit = (email: string, tid: string, mid: string, text: string) => as(email, `${chat(tid)}/${mid}`, "PATCH", { text });
  async function firstId(tid: string) { return (await open(OP, tid)).messages[0]!.id; }

  it("keeps the earlier text for neon1 and shows everyone that it was edited", async () => {
    const tid = s.acme.id;
    await say(DANA, tid, "Fridays work for me.");
    const mid = await firstId(tid);
    const r = await edit(DANA, tid, mid, "Fridays after 3 work for me.");
    expect(r.status).toBe(200);
    expect(((await r.json()) as ChatMessage).history).toBeUndefined();
    const rajSees = (await open(RAJ, tid)).messages[0]!;
    expect(rajSees).toMatchObject({ body: "Fridays after 3 work for me.", editedAt: expect.any(String) });
    expect(rajSees.history).toBeUndefined();
    const opSees = (await open(OP, tid)).messages[0]!;
    expect(opSees.history?.map((h) => h.body)).toEqual(["Fridays work for me."]);
    // The inbox preview follows an edit of the latest message
    const inbox = (await (await as(OP, "/chat/inbox")).json()) as { threads: ChatThread[] };
    expect(inbox.threads[0]!.preview).toBe("Fridays after 3 work for me.");
  });

  it("lets only the author edit, and stops at the history limit", async () => {
    const tid = s.acme.id;
    await say(DANA, tid, "v0");
    const mid = await firstId(tid);
    expect((await edit(RAJ, tid, mid, "Raj's rewrite")).status).toBe(403);
    expect((await edit(OP, tid, mid, "neon1's rewrite")).status).toBe(403);
    expect((await edit(DANA, tid, "nope", "x")).status).toBe(404);
    expect((await edit(DANA, tid, mid, "  ")).status).toBe(400);
    for (let i = 1; i <= CHAT_EDIT_HISTORY; i++) expect((await edit(DANA, tid, mid, `v${i}`)).status).toBe(200);
    const over = await edit(DANA, tid, mid, "one too many");
    expect(over.status).toBe(409);
    expect(((await over.json()) as { error: string }).error).toBe("edit_limit");
  });

  it("sends no alert for an edit", async () => {
    const tid = s.acme.id;
    await say(DANA, tid, "First");
    await open(OP, tid);
    mailer.sent.length = 0;
    await edit(DANA, tid, await firstId(tid), "First, corrected");
    expect(alerts()).toHaveLength(0);
  });
});


describe("a free account", () => {
  it("chats with neon1 as an organization of one, within its limits", async () => {
    const tid = s.calder.id;
    expect((await say(NOOR, tid, "   ")).status).toBe(400);
    expect((await say(NOOR, tid, "x".repeat(2001))).status).toBe(400);
    expect((await say(NOOR, tid, "see a.com https://a.com https://b.com https://c.com")).status).toBe(400);
    for (let i = 0; i < CHAT_LIMITS.free.hourly; i++) expect((await say(NOOR, tid, `Message ${i}`)).status).toBe(201);
    const over = await say(NOOR, tid, "One more");
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: string }).error).toBe("too_many_messages");
    expect((await open(NOOR, tid)).thread).toMatchObject({ free: true, orgName: "Calder Building Supply" });
    expect(alerts()).toHaveLength(1);
  });

  it("does not hold neon1's replies to a member's allowance or link cap", async () => {
    const tid = s.calder.id;
    for (let i = 0; i < CHAT_LIMITS.free.hourly + 2; i++) expect((await say(OP, tid, `Reply ${i}`)).status).toBe(201);
    expect((await say(OP, tid, "see a.com https://a.com https://b.com https://c.com")).status).toBe(201);
  });

  it("needs a sign-in and the CSRF header", async () => {
    const tid = s.acme.id;
    expect((await app.request(`/1NEON/api${chat(tid)}`, { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1" }, body: JSON.stringify({ text: "hi" }) })).status).toBe(401);
    expect((await app.request(`/1NEON/api${chat(tid)}`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user": RAJ }, body: JSON.stringify({ text: "hi" }) })).status).toBe(403);
  });
});
