// apps/api/src/stream.test.ts - A project's Updates: messages, status updates, comments, and changes in one
// stream; a message emails everyone else with a Reply-To of their own; an emailed reply posts back only as the
// person it was sent to, from their address, while they may still comment.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { readToken, sign, tokenFor } from "./lib/reply.ts";
import { projectReplyByEmail, sameMailbox, type StreamEntry } from "./routes/stream.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OP = "pradeep@neon1.tech";
const PRIYA = "priya@harborlineoutfitters.example";
const TOMAS = "tomas@harborlineoutfitters.example";
const replies = { domain: "reply.neon1.test", secret: "test-secret" };
let repo: Repo;
let mailer: MemoryMailer;
let s: Awaited<ReturnType<typeof seed>>;
let app: ReturnType<typeof createApp>;
const cfg = { env: "local" as const, publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true };

beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  mailer = new MemoryMailer();
  s = await seed(repo, OP);
  app = createApp({ cfg, repo, directory: new MemoryDirectory(), mailer, storage: new MemoryStorage(), replies });
});

const as = (email: string, path: string, method = "GET", b?: unknown) =>
  app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": email }, body: b === undefined ? undefined : JSON.stringify(b) });
const firstProject = async () => (await repo.listProjects(s.acme.id))[0]!;
const stream = async (pid: string) => ((await (await as(PRIYA, `/t/${s.acme.id}/projects/${pid}/stream`)).json()) as { entries: StreamEntry[] }).entries;


describe("project updates", () => {
  it("posts a message and shows it first, with comments and changes around it", async () => {
    const p = await firstProject();
    const r = await as(PRIYA, `/t/${s.acme.id}/projects/${p.id}/stream`, "POST", { body: "The VPN account is ready." });
    expect(r.status).toBe(201);
    const list = await stream(p.id);
    expect(list[0]).toMatchObject({ type: "message", by: "Priya Raman", body: "The VPN account is ready." });
    // Newest first throughout
    expect(list.map((e) => e.at)).toEqual([...list.map((e) => e.at)].sort().reverse());
    // The message's own audit event doesn't repeat it as a change
    expect(list.filter((e) => e.type === "event" && e.action === "message.created")).toHaveLength(0);
  });

  it("refuses an empty message and a stranger", async () => {
    const p = await firstProject();
    expect((await as(PRIYA, `/t/${s.acme.id}/projects/${p.id}/stream`, "POST", { body: "   " })).status).toBe(400);
    expect((await as("lee@ridgeviewauto.example", `/t/${s.acme.id}/projects/${p.id}/stream`, "POST", { body: "Hi" })).status).toBe(404);
  });

  it("emails everyone else on the project with the words and a Reply-To of their own", async () => {
    const p = await firstProject();
    mailer.sent.length = 0;
    await as(PRIYA, `/t/${s.acme.id}/projects/${p.id}/stream`, "POST", { body: "Pilot date holds." });
    const mails = mailer.sent.filter((m) => /wrote/.test(m.subject));
    // Not the author; the editor and neon1 hear of it
    expect(mails.map((m) => m.to).sort()).toEqual([OP, TOMAS].sort());
    const tomas = mails.find((m) => m.to === TOMAS)!;
    expect(tomas.text).toContain("Pilot date holds.");
    expect(tomas.replyTo).toMatch(/^p\.[a-z2-7]{10}\.[0-9a-f]{16}@reply\.neon1\.test$/);
    // Each person's address is their own, and names them
    expect(mails.find((m) => m.to === OP)!.replyTo).not.toBe(tomas.replyTo);
    const token = tomas.replyTo!.split(".")[1]!;
    expect(tomas.replyTo!.split(".")[2]!.split("@")[0]).toBe(await sign(replies.secret, "p", token));
    expect(await readToken(repo, token)).toEqual({ tenantId: s.acme.id, projectId: p.id, userId: s.dana.id });
  });
});


describe("replies by email", () => {
  const tokenOf = async () => {
    const p = await firstProject();
    await as(PRIYA, `/t/${s.acme.id}/projects/${p.id}/stream`, "POST", { body: "Question for Tomas" });
    return { p, token: await tokenFor(replies.secret, s.acme.id, p.id, s.dana.id) };
  };

  it("posts as the person the address was made for, marked as by email", async () => {
    const { p, token } = await tokenOf();
    expect(await projectReplyByEmail({ repo }, token, "Answered.", TOMAS.toUpperCase())).toEqual({ posted: true });
    expect((await stream(p.id))[0]).toMatchObject({ type: "message", by: "Tomas Greer", body: "Answered.", via: "email" });
  });

  it("takes a reply from the plain mailbox behind a tagged address, and nothing looser", () => {
    expect(sameMailbox("ops+felicity@example.com", "OPS@example.com")).toBe(true);
    expect(sameMailbox("ops@example.com", "ops@example.com")).toBe(true);
    expect(sameMailbox("ops@example.com", "ops+x@example.com")).toBe(false);
    expect(sameMailbox("ops+felicity@example.com", "other@example.com")).toBe(false);
    expect(sameMailbox("ops+felicity@example.com", "ops@example.org")).toBe(false);
  });

  it("refuses another sender, an unknown token, and someone no longer in the organization", async () => {
    const { token } = await tokenOf();
    expect(await projectReplyByEmail({ repo }, token, "Hi", PRIYA)).toEqual({ posted: false, reason: "not_sender" });
    expect(await projectReplyByEmail({ repo }, "aaaaaaaaaa", "Hi", TOMAS)).toEqual({ posted: false, reason: "unknown_token" });
    const m = (await repo.listMembers(s.acme.id)).find((x) => x.userId === s.dana.id)!;
    await repo.saveMember({ ...m, status: "deactivated", version: m.version + 1 }, { version: m.version });
    expect(await projectReplyByEmail({ repo }, token, "Hi", TOMAS)).toEqual({ posted: false, reason: "not_allowed" });
  });
});
