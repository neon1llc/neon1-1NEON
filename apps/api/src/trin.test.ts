// apps/api/src/trin.test.ts - Trin answers from the organization's own work: the pieces it sends the model
// come from that organization only, links back are kept as sources, embeddings are made once, and the caps
// hold. A fake model stands in for Bedrock.


import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage, MemoryTexter } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";
import type { TrinModel } from "./trin/trin.ts";


const OP = "pradeep@neon1.tech";
let repo: Repo;
let s: Awaited<ReturnType<typeof seed>>;
let seen: { system: string; text: string }[];
let embedded: number;
let app: ReturnType<typeof createApp>;


// A model that records what it was sent and answers with a link to the first piece it got
const fake: TrinModel = {
  async embed(texts) { embedded += texts.length; return texts.map((t) => Array.from({ length: 8 }, (_, i) => (t.charCodeAt(i % t.length) % 7) + 1)); },
  async answer(system, messages) {
    const text = messages.at(-1)!.text;
    seen.push({ system, text });
    const first = /title="([^"]+)" address="([^"]+)"/.exec(text);
    return { text: first ? `See [${first[1]}](${first[2]}).` : "Nothing yet.", inputTokens: 2000, outputTokens: 100 };
  },
};

beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  s = await seed(repo, OP);
  seen = [];
  embedded = 0;
  app = createApp({ cfg: { env: "local", publicUrl: "https://example.invalid", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer: new MemoryMailer(), texter: new MemoryTexter(), storage: new MemoryStorage(), trin: { model: fake, monthlyUsd: 5 } });
});

/** Call the API as someone */
async function call(method: string, path: string, body?: unknown, as = OP) {
  const r = await app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": as }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}


describe("trin", () => {
  it("answers from this organization only, with sources", async () => {
    const r = await call("POST", `/t/${s.acme.id}/trin`, { question: "What's waiting on the stock exports?" });
    expect(r.status).toBe(200);
    expect(r.json.sources.length).toBe(1);
    expect(r.json.sources[0].href).toMatch(/^\/1NEON\/o\/harborline-outfitters\//);
    const other = (await repo.listProjects(s.harbor.id)).map((p) => p.key);
    for (const key of other) expect(seen[0]!.text).not.toContain(`address="/1NEON/o/ridgeview-auto/projects/${key}`);
    expect(seen[0]!.system).toContain("You are Trin");
  });

  it("embeds each piece once", async () => {
    await call("POST", `/t/${s.acme.id}/trin`, { question: "first" });
    const first = embedded;
    await call("POST", `/t/${s.acme.id}/trin`, { question: "second" });
    expect(embedded - first).toBe(1);
  });

  it("finds what was written on a project's page", async () => {
    const p = (await repo.listProjects(s.acme.id)).find((x) => x.key === "FLOW-1")!;
    await repo.table.write([repo.pageOp({ tenantId: s.acme.id, projectId: p.id, id: "main", title: "Project page", state: "", text: "The loading dock closes at noon on Fridays", seen: {}, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: "u" }, { create: true })]);
    await call("POST", `/t/${s.acme.id}/trin`, { question: "When does the loading dock close?" });
    expect(seen[0]!.text).toContain("loading dock closes at noon");
  });

  it("stops at the month's limit", async () => {
    await repo.table.increment("COUNTER", `TRIN#${new Date().toISOString().slice(0, 7)}`, 5_000_000);
    expect((await call("POST", `/t/${s.acme.id}/trin`, { question: "anything" })).status).toBe(429);
  });

  it("is off without a model", async () => {
    app = createApp({ cfg: { env: "local", publicUrl: "https://example.invalid", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer: new MemoryMailer(), texter: new MemoryTexter(), storage: new MemoryStorage() });
    expect((await call("POST", `/t/${s.acme.id}/trin`, { question: "anything" })).status).toBe(503);
  });

  it("refuses people outside the organization", async () => {
    expect((await call("POST", `/t/${s.harbor.id}/trin`, { question: "anything" }, "tomas@harborlineoutfitters.example")).status).toBeGreaterThanOrEqual(403);
  });
});
