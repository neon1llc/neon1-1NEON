// Adversarial authorization and persistence cases for role changes, invitations, pages, and read state.

import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OP = "pradeep@neon1.tech";
const ADMIN = "priya@harborlineoutfitters.example";
const EDITOR = "tomas@harborlineoutfitters.example";
let app: ReturnType<typeof createApp>;
let repo: Repo;
let table: MemoryTable;
let mailer: MemoryMailer;
let s: Awaited<ReturnType<typeof seed>>;


beforeEach(async () => {
  table = new MemoryTable();
  repo = new Repo(table);
  mailer = new MemoryMailer();
  s = await seed(repo, OP);
  app = createApp({
    cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true },
    repo,
    directory: new MemoryDirectory(),
    mailer,
    storage: new MemoryStorage(),
  });
});


async function call(as: string, method: string, path: string, body?: unknown) {
  const r = await app.request(`/1NEON/api${path}`, {
    method,
    headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": as },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");


describe("adversarial tenant data paths", () => {
  it("uses current membership status and access, even when the caller's session is unchanged", async () => {
    const member = await repo.getMember(s.acme.id, s.dana.id);
    expect(member).toBeDefined();
    await repo.saveMember({ ...member!, access: "viewer", version: member!.version + 1, updatedAt: new Date().toISOString() }, { version: member!.version });

    expect((await call(EDITOR, "POST", `/t/${s.acme.id}/projects`, { name: "Stale editor write" })).status).toBe(403);

    const viewer = await repo.getMember(s.acme.id, s.dana.id);
    await repo.saveMember({ ...viewer!, status: "deactivated", version: viewer!.version + 1, updatedAt: new Date().toISOString() }, { version: viewer!.version });
    expect((await call(EDITOR, "GET", `/t/${s.acme.id}/projects`)).status).toBe(404);
  });

  it("makes replaying an invitation idempotent for an existing person", async () => {
    const path = `/t/${s.harbor.id}/members/invite`;
    const input = { people: [{ email: EDITOR, access: "viewer" }] };
    expect((await call(OP, "POST", path, input)).status).toBe(201);
    const sent = mailer.sent.length;
    expect(sent).toBeGreaterThan(0);
    expect((await call(OP, "POST", path, input)).status).toBe(201);
    expect(mailer.sent).toHaveLength(sent);
    expect((await repo.listMembers(s.harbor.id)).filter((m) => m.email === EDITOR)).toHaveLength(1);
  });

  it("rejects malformed and oversized page updates without changing the stored page", async () => {
    const project = (await repo.listProjects(s.acme.id))[0]!;
    const path = `/t/${s.acme.id}/projects/${project.id}/pages/main`;
    expect((await call(ADMIN, "GET", path)).status).toBe(200);

    expect((await call(EDITOR, "POST", `${path}/sync`, { update: "%%%" })).status).toBe(400);
    expect((await call(EDITOR, "POST", `${path}/sync`, { update: "A".repeat(400_001) })).status).toBe(400);

    const doc = new Y.Doc();
    doc.getText("t").insert(0, "x".repeat(230_000));
    const tooLarge = await call(EDITOR, "POST", `${path}/sync`, { update: b64(Y.encodeStateAsUpdate(doc)) });
    expect(tooLarge.status).toBe(413);
    expect((await call(ADMIN, "GET", path)).json.text).toBe("");
  });

  it("ignores guessed notification IDs and preserves concurrent read marks", async () => {
    const path = `/t/${s.acme.id}/notifications`;
    expect((await call(EDITOR, "POST", `${path}/id_guess/read`)).status).toBe(204);
    expect(await table.get(`T#${s.acme.id}`, `BELL#${s.dana.id}`)).toBeUndefined();

    const ids = (await repo.listAudit(s.acme.id, 60)).slice(0, 2).map((event) => event.id);
    expect(ids).toHaveLength(2);
    const results = await Promise.all(ids.map((id) => call(EDITOR, "POST", `${path}/${id}/read`)));
    expect(results.map((result) => result.status)).toEqual([204, 204]);
    expect(await table.get(`T#${s.acme.id}`, `BELL#${s.dana.id}`)).toMatchObject({ ids: expect.arrayContaining(ids) });
  });
});
