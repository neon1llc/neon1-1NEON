// apps/api/src/chat.test.ts - The shared organization chat: every member and neon1 write in one conversation with
// names, neon1 is alerted once per burst, replies reach members who aren't reading, edits keep the earlier text,
// organizations never see each other's chat, and a free account is limited.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_AUTO_MUTE_HOURS, CHAT_EDIT_HISTORY, CHAT_IP_LIMITS, CHAT_LIMITS, type ChatMessage, type ChatThread, type ChatView } from "@1neon/domain";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryPusher, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OP = "pradeep@neon1.tech";
const PRIYA = "priya@harborlineoutfitters.example";
const TOMAS = "tomas@harborlineoutfitters.example";
const NOOR = "noor@calderbuildingsupply.example";
let app: ReturnType<typeof createApp>;
let repo: Repo;
let mailer: MemoryMailer;
let pusher: MemoryPusher;
let s: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
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
// Each message goes three seconds after the last, clear of the cooldown between one person's messages
const say = (email: string, tid: string, text: string) => { vi.setSystemTime(Date.now() + 3000); return as(email, chat(tid), "POST", { text }); };
const open = async (email: string, tid: string) => (await (await as(email, chat(tid))).json()) as ChatView;
const alerts = () => mailer.sent.filter((m) => m.to === OP);
const mailsTo = (email: string) => mailer.sent.filter((m) => m.to === email);
const fwd = (ms: number) => vi.setSystemTime(Date.now() + ms);


describe("one chat for the whole organization", () => {
  it("shows every member's message to every member, with names", async () => {
    const tid = s.acme.id;
    expect((await say(PRIYA, tid, "Can we move the restore test to Fridays?")).status).toBe(201);
    expect((await say(TOMAS, tid, "Fridays work for me.")).status).toBe(201);
    const v = await open(PRIYA, tid);
    expect(v.messages.map((m) => [m.authorName, m.from, m.body])).toEqual([["Priya Raman", "member", "Can we move the restore test to Fridays?"], ["Tomas Greer", "member", "Fridays work for me."]]);
    expect(v.thread).toMatchObject({ orgName: "Harborline Outfitters", free: false });
    // neon1's counts and previews are for neon1 only
    expect(v.thread).not.toHaveProperty("ownerUnread");
    expect((await open(OP, tid)).thread).toMatchObject({ lastBy: "Tomas Greer", ownerUnread: 2 });
    expect(v.hours.text).toMatch(/weekdays 6 to 9 pm/);
  });

  it("counts what is new to each reader", async () => {
    const tid = s.acme.id;
    await say(PRIYA, tid, "One");
    await say(PRIYA, tid, "Two");
    expect((await open(TOMAS, tid)).unread).toBe(2);
    expect((await open(TOMAS, tid)).unread).toBe(0);
    expect((await open(PRIYA, tid)).unread).toBe(0);
    await say(TOMAS, tid, "Three");
    expect((await open(PRIYA, tid)).unread).toBe(1);
  });

  it("keeps organizations apart, and the inbox for neon1", async () => {
    await say(PRIYA, s.acme.id, "Harborline's private note");
    await say(NOOR, s.calder.id, "Calder's question");
    // Another organization's chat is not found, whoever asks
    expect((await as(NOOR, chat(s.acme.id))).status).toBe(404);
    expect((await say(NOOR, s.acme.id, "hi")).status).toBe(404);
    expect((await as(PRIYA, chat(s.calder.id))).status).toBe(404);
    // Only neon1 has the inbox, and it lists both
    expect((await as(PRIYA, "/chat/inbox")).status).toBe(404);
    const inbox = (await (await as(OP, "/chat/inbox")).json()) as { threads: ChatThread[] };
    expect(inbox.threads.map((t) => t.orgName).sort()).toEqual(["Calder Building Supply", "Harborline Outfitters"]);
    expect(inbox.threads.find((t) => t.orgName === "Calder Building Supply")?.free).toBe(true);
  });
});


describe("the unread count", () => {
  it("is read without marking anything seen", async () => {
    const tid = s.acme.id;
    await say(PRIYA, tid, "One");
    await say(PRIYA, tid, "Two");
    const unread = async (email: string) => ((await (await as(email, `${chat(tid)}/unread`)).json()) as { unread: number }).unread;
    expect(await unread(TOMAS)).toBe(2);
    expect(await unread(TOMAS)).toBe(2);
    expect(await unread(PRIYA)).toBe(0);
    expect(await unread(OP)).toBe(2);
    // Opening is what marks it seen
    await open(TOMAS, tid);
    expect(await unread(TOMAS)).toBe(0);
    expect(await unread(OP)).toBe(2);
    // A private message counts only for the member it is with
    fwd(3000);
    await as(PRIYA, chat(tid), "POST", { text: "just for neon1", private: true });
    expect(await unread(TOMAS)).toBe(0);
    expect(await unread(OP)).toBe(3);
  });
});


describe("alerts to neon1", () => {
  it("emails the message and pushes without it, once per burst, again after neon1 opens the chat", async () => {
    const tid = s.acme.id;
    await say(PRIYA, tid, "Can you look at the restore results?");
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({ as: "reach", subject: expect.stringContaining("Priya Raman") });
    expect(alerts()[0]!.text).toContain("restore results");
    expect(alerts()[0]!.text).toContain("Harborline Outfitters");
    expect(pusher.sent).toHaveLength(1);
    expect(pusher.sent[0]!.message).not.toContain("restore");
    await say(TOMAS, tid, "Second message");
    await say(PRIYA, tid, "Third message");
    expect(alerts()).toHaveLength(1);
    expect(pusher.sent).toHaveLength(1);
    // neon1 opens it: the burst is over
    expect((await open(OP, tid)).unread).toBe(3);
    await say(PRIYA, tid, "Fourth message");
    expect(alerts()).toHaveLength(2);
  });

  it("works with email alone when no push is set up", async () => {
    app = createApp({ cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer, storage: new MemoryStorage() });
    await say(PRIYA, s.acme.id, "Hello");
    expect(alerts()).toHaveLength(1);
  });
});


describe("replies from neon1", () => {
  it("emails each member who isn't reading, once per burst, and again after they look", async () => {
    const tid = s.acme.id;
    await say(PRIYA, tid, "Question");
    await open(TOMAS, tid);
    fwd(3 * 60 * 1000);
    // Priya is on the page, Tomas is not
    await open(PRIYA, tid);
    mailer.sent.length = 0;
    expect((await say(OP, tid, "Happy to help.")).status).toBe(201);
    expect(mailsTo(TOMAS)).toHaveLength(1);
    expect(mailsTo(TOMAS)[0]).toMatchObject({ subject: "Reply from Pradeep at neon1", as: "portal" });
    expect(mailsTo(TOMAS)[0]!.text).toContain("Happy to help.");
    expect(mailsTo(PRIYA)).toHaveLength(0);
    // The operator is not emailed his own reply, and a second reply in the burst adds nothing
    expect(mailsTo(OP)).toHaveLength(0);
    await say(OP, tid, "More on that.");
    expect(mailsTo(TOMAS)).toHaveLength(1);
    // After she looks and leaves, a later reply emails her again
    await open(TOMAS, tid);
    fwd(3 * 60 * 1000);
    await say(OP, tid, "Following up.");
    expect(mailsTo(TOMAS)).toHaveLength(2);
    // The reply is marked as neon1's in the thread
    const v = await open(PRIYA, tid);
    expect(v.messages.at(-1)).toMatchObject({ from: "neon1", authorName: "Pradeep" });
    expect((await open(OP, tid)).thread).toMatchObject({ ownerUnread: 0, lastFrom: "neon1" });
  });
});


describe("private messages", () => {
  const priv = (email: string, tid: string, text: string, extra: Record<string, unknown> = {}) => as(email, chat(tid), "POST", { text, ...extra });

  it("keep a member's private note between them and neon1, in the same chat and storage", async () => {
    const tid = s.acme.id;
    expect((await priv(TOMAS, tid, "Billing question I'd rather Priya not see.", { private: true })).status).toBe(201);
    await say(TOMAS, tid, "A message for everyone.");
    // Priya never sees it: not in the chat, not in his unread count, not in the summary
    const raj = await open(PRIYA, tid);
    expect(raj.messages.map((m) => m.body)).toEqual(["A message for everyone."]);
    expect(raj.unread).toBe(1);
    expect(JSON.stringify(raj)).not.toContain("Billing question");
    expect(raj.thread).not.toHaveProperty("preview");
    expect(raj.thread).not.toHaveProperty("lastBy");
    // Tomas and neon1 both do
    expect((await open(TOMAS, tid)).messages.map((m) => m.body)).toHaveLength(2);
    const op = await open(OP, tid);
    expect(op.messages[0]).toMatchObject({ privateWith: expect.any(String), body: expect.stringContaining("Billing") });
    // neon1's alert says it is private to him
    expect(alerts()[0]!.text).toContain("Billing question");
  });

  it("lets neon1 answer one member privately: only they see it, and only they are emailed", async () => {
    const tid = s.acme.id;
    await open(PRIYA, tid);
    await open(TOMAS, tid);
    fwd(3 * 60 * 1000);
    mailer.sent.length = 0;
    const danaId = (await repo.userIdForEmail(TOMAS))!;
    expect((await priv(OP, tid, "Tomas, about your invoice question.", { to: danaId })).status).toBe(201);
    expect(mailsTo(TOMAS)).toHaveLength(1);
    expect(mailsTo(PRIYA)).toHaveLength(0);
    expect((await open(PRIYA, tid)).messages).toHaveLength(0);
    expect((await open(TOMAS, tid)).messages[0]).toMatchObject({ body: "Tomas, about your invoice question.", from: "neon1" });
    // Only someone in the organization can be chosen
    const noorId = (await repo.userIdForEmail(NOOR))!;
    expect((await priv(OP, tid, "x", { to: noorId })).status).toBe(400);
  });

  it("ignores a member's attempt to address someone else", async () => {
    const tid = s.acme.id;
    const raj = (await repo.userIdForEmail(PRIYA))!;
    await priv(TOMAS, tid, "Public despite the field.", { to: raj });
    expect((await open(PRIYA, tid)).messages.map((m) => m.body)).toEqual(["Public despite the field."]);
  });
});


describe("editing", () => {
  const edit = (email: string, tid: string, mid: string, text: string) => as(email, `${chat(tid)}/${mid}`, "PATCH", { text });
  async function firstId(tid: string) { return (await open(OP, tid)).messages[0]!.id; }

  it("keeps the earlier text for neon1 and shows everyone that it was edited", async () => {
    const tid = s.acme.id;
    await say(TOMAS, tid, "Fridays work for me.");
    const mid = await firstId(tid);
    const r = await edit(TOMAS, tid, mid, "Fridays after 3 work for me.");
    expect(r.status).toBe(200);
    expect(((await r.json()) as ChatMessage).history).toBeUndefined();
    const rajSees = (await open(PRIYA, tid)).messages[0]!;
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
    await say(TOMAS, tid, "v0");
    const mid = await firstId(tid);
    expect((await edit(PRIYA, tid, mid, "Priya's rewrite")).status).toBe(403);
    expect((await edit(OP, tid, mid, "neon1's rewrite")).status).toBe(403);
    expect((await edit(TOMAS, tid, "nope", "x")).status).toBe(404);
    expect((await edit(TOMAS, tid, mid, "  ")).status).toBe(400);
    for (let i = 1; i <= CHAT_EDIT_HISTORY; i++) expect((await edit(TOMAS, tid, mid, `v${i}`)).status).toBe(200);
    const over = await edit(TOMAS, tid, mid, "one too many");
    expect(over.status).toBe(409);
    expect(((await over.json()) as { error: string }).error).toBe("edit_limit");
  });

  it("sends no alert for an edit", async () => {
    const tid = s.acme.id;
    await say(TOMAS, tid, "First");
    await open(OP, tid);
    mailer.sent.length = 0;
    await edit(TOMAS, tid, await firstId(tid), "First, corrected");
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
    expect((await app.request(`/1NEON/api${chat(tid)}`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user": PRIYA }, body: JSON.stringify({ text: "hi" }) })).status).toBe(403);
  });
});



describe("abuse protection", () => {
  const post = (email: string, tid: string, text: string) => as(email, chat(tid), "POST", { text });
  const code = async (r: Response) => ((await r.json()) as { error?: string }).error;
  const flagMails = () => alerts().filter((m) => /Chat flagged/.test(m.subject));

  it("asks for a moment between one person's messages, without counting it against them", async () => {
    const tid = s.acme.id;
    vi.setSystemTime(Date.now() + 3000);
    expect((await post(TOMAS, tid, "First")).status).toBe(201);
    const fast = await post(TOMAS, tid, "Second");
    expect(fast.status).toBe(429);
    expect(await code(fast)).toBe("slow_down");
    fwd(3000);
    expect((await post(TOMAS, tid, "Second")).status).toBe(201);
  });

  it("refuses the same text again within ten minutes", async () => {
    const tid = s.acme.id;
    expect((await say(TOMAS, tid, "Can you check the backup?")).status).toBe(201);
    const again = await say(TOMAS, tid, "can  you check the BACKUP?");
    expect(again.status).toBe(409);
    expect(await code(again)).toBe("duplicate");
    fwd(11 * 60 * 1000);
    expect((await say(TOMAS, tid, "Can you check the backup?")).status).toBe(201);
  });

  it("refuses typing that fills the box, and lets short real messages through", async () => {
    const tid = s.acme.id;
    expect((await say(TOMAS, tid, "!!!! 1234")).status).toBe(400);
    expect((await say(TOMAS, tid, "aaaaaaaaaaaaaa")).status).toBe(400);
    for (const ok of ["hi", "test", "ok thanks"]) expect((await say(TOMAS, tid, ok)).status).toBe(201);
  });

  it("holds a brand new account to a few messages until neon1 has read them", async () => {
    const tid = s.acme.id;
    const id = (await repo.userIdForEmail(TOMAS))!;
    const u = (await repo.getUser(id))!;
    await repo.saveUser({ ...u, createdAt: new Date().toISOString(), version: u.version + 1 }, u.version);
    for (const t of ["One here", "Two here", "Three here"]) expect((await say(TOMAS, tid, t)).status).toBe(201);
    const over = await say(TOMAS, tid, "Four here");
    expect(over.status).toBe(429);
    expect(await code(over)).toBe("new_account");
  });

  it("caps one network address across accounts, so many sign-ups don't multiply the allowance", async () => {
    const tid = s.acme.id;
    let n = 0;
    for (; n < CHAT_IP_LIMITS.hourly; n++) expect((await say(n % 2 ? PRIYA : TOMAS, tid, `Message number ${n} from here`)).status).toBe(201);
    const over = await say(PRIYA, tid, "One more from the same place");
    expect(over.status).toBe(429);
    expect(await code(over)).toBe("busy_network");
  });

  it("mutes a person for a day after five refused messages, tells neon1, and lets them read; the mute ends", async () => {
    const tid = s.acme.id;
    for (let i = 0; i < 5; i++) expect((await say(TOMAS, tid, "!!!!!!!!")).status).toBe(400);
    expect(flagMails().some((m) => /Muted automatically/.test(m.text))).toBe(true);
    const paused = await say(TOMAS, tid, "A real message now");
    expect(paused.status).toBe(403);
    const body = (await paused.json()) as { error: string; message: string };
    expect(body.error).toBe("chat_paused");
    expect(body.message).toMatch(/paused for your account until .+hello@neon1\.tech/);
    // They can still read, and the box can say why
    const view = await open(TOMAS, tid);
    expect(view.block).toMatchObject({ state: "muted", by: "auto" });
    // Edits and reports are paused too
    expect((await as(TOMAS, `${chat(tid)}/nope`, "PATCH", { text: "x" })).status).toBe(403);
    fwd((CHAT_AUTO_MUTE_HOURS + 1) * 3600_000);
    expect((await say(TOMAS, tid, "A real message now")).status).toBe(201);
  });

  it("lets neon1 mute, ban, and lift, and nobody else", async () => {
    const tid = s.acme.id;
    const dana = (await repo.userIdForEmail(TOMAS))!;
    expect((await as(PRIYA, `${chat(tid)}/block/${dana}`, "POST", { state: "muted" })).status).toBe(404);
    const muted = await as(OP, `${chat(tid)}/block/${dana}`, "POST", { state: "muted", hours: 2, reason: "Too many pings" });
    expect(muted.status).toBe(201);
    expect(await code(await say(TOMAS, tid, "Hello again"))).toBe("chat_paused");
    expect((await open(OP, tid)).blocks?.[0]).toMatchObject({ userId: dana, state: "muted", by: "neon1", reason: "Too many pings" });
    // A mute runs out; lifting it early works too
    fwd(3 * 3600_000);
    expect((await say(TOMAS, tid, "Back after two hours")).status).toBe(201);
    await as(OP, `${chat(tid)}/block/${dana}`, "POST", { state: "banned" });
    fwd(400 * 24 * 3600_000);
    expect(await code(await say(TOMAS, tid, "A year later"))).toBe("chat_paused");
    expect(((await (await say(TOMAS, tid, "Still?")).json()) as { message: string }).message).toMatch(/isn't available/);
    expect((await as(OP, `${chat(tid)}/block/${dana}`, "DELETE")).status).toBe(200);
    expect((await say(TOMAS, tid, "Welcome back")).status).toBe(201);
    // Someone not in the organization can't be paused here
    const noor = (await repo.userIdForEmail(NOOR))!;
    expect((await as(OP, `${chat(tid)}/block/${noor}`, "POST", { state: "muted" })).status).toBe(404);
  });

  it("takes a report on another member's message and tells neon1 with the message", async () => {
    const tid = s.acme.id;
    await say(TOMAS, tid, "Something out of line");
    const mid = (await open(OP, tid)).messages[0]!.id;
    await say(OP, tid, "A reply from neon1");
    const reply = (await open(OP, tid)).messages.at(-1)!.id;
    const report = (id: string, who = PRIYA) => as(who, `${chat(tid)}/${id}/report`, "POST", {});
    expect((await report(mid)).status).toBe(200);
    expect(flagMails().some((m) => /Reported by Priya Raman/.test(m.text) && /Something out of line/.test(m.text))).toBe(true);
    expect((await open(OP, tid)).messages[0]).toMatchObject({ flags: ["reported"], reports: [expect.any(String)] });
    // Once each, never your own, never neon1's
    const before = flagMails().length;
    expect((await report(mid)).status).toBe(200);
    expect(flagMails().length).toBe(before);
    expect((await report(mid, TOMAS)).status).toBe(400);
    expect((await report(reply)).status).toBe(400);
    expect((await report("nope")).status).toBe(404);
  });

  it("flags an obscenity and a free account's link for neon1, alerts at once, and mutes a repeat", async () => {
    const tid = s.acme.id;
    await say(TOMAS, tid, "Hello, a normal first message");
    expect(alerts().filter((m) => /Chat:/.test(m.subject))).toHaveLength(1);
    const rude = await say(TOMAS, tid, "this is bullshit");
    expect(rude.status).toBe(201);
    expect(((await rude.json()) as { message: ChatMessage }).message.flags).toEqual(["offensive"]);
    // The burst's first alert already went, but the flag is told on its own
    expect(flagMails().some((m) => /Flagged: offensive/.test(m.text))).toBe(true);
    expect((await open(OP, tid)).thread).toMatchObject({ ownerFlagged: 1 });
    // A repeat reaches the limit (an obscenity counts twice) and mutes
    await say(TOMAS, tid, "what a load of crap, bullshit again");
    await say(TOMAS, tid, "more bullshit from me");
    expect(await code(await say(TOMAS, tid, "and a polite one"))).toBe("chat_paused");
  });

  it("flags a free account's one link and refuses a second", async () => {
    const tid = s.calder.id;
    const one = await say(NOOR, tid, "My site is https://calder.example if that helps");
    expect(one.status).toBe(201);
    expect(((await one.json()) as { message: ChatMessage }).message.flags).toEqual(["links"]);
    const two = await say(NOOR, tid, "See https://a.example and https://b.example please");
    expect(two.status).toBe(400);
  });

  it("holds neon1's own replies to none of it", async () => {
    const tid = s.acme.id;
    for (let i = 0; i < 25; i++) expect((await post(OP, tid, "Same reply")).status).toBe(201);
  });
});
