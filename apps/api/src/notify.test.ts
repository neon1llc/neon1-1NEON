// apps/api/src/notify.test.ts - neon1's own alerts through the alert service: the chat alert carries a signed reply
// thread and a push that names no one, other mail only neon1 receives goes through it, and an emailed reply posts
// into the chat as neon1 only when an operator sent it.
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatView } from "@1neon/domain";
import { createApp } from "./app.ts";
import { alertNeon1 } from "./lib/alert.ts";
import { chatReplyByEmail } from "./routes/chat.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryNotifier, MemoryPusher, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OP = "pradeep@neon1.tech";
const RAJ = "raj@acmedental.example";
let repo: Repo;
let mailer: MemoryMailer;
let pusher: MemoryPusher;
let notifier: MemoryNotifier;
let s: Awaited<ReturnType<typeof seed>>;
let app: ReturnType<typeof createApp>;
const cfg = { env: "local" as const, publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true };

beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  mailer = new MemoryMailer();
  pusher = new MemoryPusher();
  notifier = new MemoryNotifier();
  s = await seed(repo, OP);
  app = createApp({ cfg, repo, directory: new MemoryDirectory(), mailer, pusher, notifier, storage: new MemoryStorage() });
});

const as = (email: string, path: string, method = "GET", b?: unknown) =>
  app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": email }, body: b === undefined ? undefined : JSON.stringify(b) });


describe("chat alerts through the service", () => {
  it("sends one notice with the email, a signed reply thread and a push that names no one", async () => {
    await as(RAJ, `/t/${s.acme.id}/chat`, "POST", { text: "Can you look at the restore results?" });
    expect(notifier.sent).toHaveLength(1);
    const n = notifier.sent[0]!;
    expect(n).toMatchObject({ severity: "important", source: "chat", email: { to: [OP], as: "reach", replyThread: { kind: "chat", ref: s.acme.id } } });
    expect(n.email!.text).toContain("restore results");
    expect(n.email!.text).toContain("Reply to this email");
    // What reaches the push provider names no client and quotes no one
    expect(`${n.title} ${n.text}`).not.toMatch(/Acme|Raj|restore/);
    // Nothing is also sent directly
    expect(mailer.sent.filter((m) => m.to === OP)).toHaveLength(0);
    expect(pusher.sent).toHaveLength(0);
  });
});


describe("alertNeon1", () => {
  const alert = { severity: "info" as const, title: "T", text: "x", source: "test", to: ["hello@neon1.tech"], mail: { subject: "S", text: "t", html: "<p>h</p>", as: "bugs" as const, replyTo: "a@b.example", attachments: [{ name: "a.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]), cid: "c1" }] } };

  it("passes attachments as base64 and keeps Reply-To", async () => {
    await alertNeon1({ mailer, pusher, notifier }, alert);
    expect(notifier.sent[0]!.email).toMatchObject({ replyTo: "a@b.example", attachments: [{ name: "a.png", b64: "AQID", cid: "c1" }] });
  });

  it("sends directly without the service, and pushes only when asked", async () => {
    await alertNeon1({ mailer, pusher }, alert);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: "hello@neon1.tech", replyTo: "a@b.example", as: "bugs" });
    expect(pusher.sent).toHaveLength(0);
    await alertNeon1({ mailer, pusher }, { ...alert, directPush: true });
    expect(pusher.sent).toHaveLength(1);
  });

  it("fails when the service could not send the email, so the caller retries", async () => {
    const failing = { notify: async () => ({ delivered: { email: "error", push: "sent", sms: "skipped:not_routed" }, deduped: false }) };
    await expect(alertNeon1({ mailer, notifier: failing }, alert)).rejects.toThrow("alert email not sent");
    const refused = { notify: async () => ({ delivered: { email: "skipped:no_allowed_recipient", push: "sent", sms: "x" }, deduped: false }) };
    await expect(alertNeon1({ mailer, notifier: refused }, alert)).rejects.toThrow("alert email not sent");
  });
});


describe("a reply by email", () => {
  const kit = () => ({ repo, d: { cfg, repo } as never, cfg, drainNow: async () => undefined });

  it("posts as neon1 in that organization's chat, once", async () => {
    await as(RAJ, `/t/${s.acme.id}/chat`, "POST", { text: "Question" });
    expect(await chatReplyByEmail(kit(), s.acme.id, "Looking now.", OP)).toEqual({ posted: true });
    const v = (await (await as(OP, `/t/${s.acme.id}/chat`)).json()) as ChatView;
    expect(v.messages.map((m) => [m.from, m.body])).toEqual([["member", "Question"], ["neon1", "Looking now."]]);
    expect(v.thread).toMatchObject({ lastFrom: "neon1", ownerUnread: 0 });
  });

  it("lets an operator address with no account of its own speak as the first operator who has one", async () => {
    const shared = { ...cfg, operatorEmails: ["shared@neon1.tech", OP] };
    expect(await chatReplyByEmail({ ...kit(), cfg: shared }, s.acme.id, "From the shared mailbox.", "shared@neon1.tech")).toEqual({ posted: true });
    const v = (await (await as(OP, `/t/${s.acme.id}/chat`)).json()) as ChatView;
    expect(v.messages[0]).toMatchObject({ from: "neon1", body: "From the shared mailbox." });
  });

  it("refuses a sender who is not an operator, an unknown chat and empty text", async () => {
    expect(await chatReplyByEmail(kit(), s.acme.id, "hi", RAJ)).toEqual({ posted: false, reason: "not_operator" });
    expect(await chatReplyByEmail(kit(), "nope", "hi", OP)).toEqual({ posted: false, reason: "no_chat" });
    expect(await chatReplyByEmail(kit(), s.acme.id, "", OP)).toMatchObject({ posted: false });
    const v = (await (await as(OP, `/t/${s.acme.id}/chat`)).json()) as ChatView;
    expect(v.messages).toHaveLength(0);
  });
});
