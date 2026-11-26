// apps/api/src/workflows.test.ts - How a project runs: NEON's stages, a Workbench, or a start at the proposal.
// Harness as in quickfix.test.ts.


import { type Item } from "@1neon/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage, MemoryTexter } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


// Priya signs as himself; he's an admin of Harborline, which has no decision maker named on new projects
const SIGN = { typedName: "Priya Raman", consent: true };
const OP = "pradeep@neon1.tech";
let repo: Repo;
let mailer: MemoryMailer;
let app: ReturnType<typeof createApp>;
let s: Awaited<ReturnType<typeof seed>>;

// Fresh store and app per test
beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  s = await seed(repo, OP);
  mailer = new MemoryMailer();
  app = createApp({ cfg: { env: "local", publicUrl: "https://example.invalid", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer: new MemoryMailer(), texter: new MemoryTexter(), storage: new MemoryStorage() });
});

/** Call the API as a seeded person */
async function call(as: string, method: string, path: string, body?: unknown) {
  const r = await app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": as }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}

/** A new project in Harborline from a template, with its path and starter items */
async function create(template: string, name = "Printer won't print from the front desk") {
  const r = await call(OP, "POST", `/t/${s.acme.id}/projects`, { name, template });
  expect(r.status).toBe(201);
  const path = `/t/${s.acme.id}/projects/${r.json.id}`;
  const items = (await call(OP, "GET", path)).json.items as Item[];
  return { p: r.json, path, items };
}


describe("workflows", () => {
  const post = async (body: Record<string, unknown>) => {
    const r = await call(OP, "POST", `/t/${s.acme.id}/projects`, { name: "Front desk tidy-up", ...body });
    expect(r.status).toBe(201);
    return r.json;
  };

  it("starts a Workbench in the first stage of agreed work, blank, with no starter items", async () => {
    const p = await post({ workflow: "bench" });
    expect(p.workflow).toBe("bench");
    expect(p.stageId).toBe("build");
    expect(p.key).toMatch(/^PRJ-/);
    const items = (await call(OP, "GET", `/t/${s.acme.id}/projects/${p.id}`)).json.items as Item[];
    expect(items).toHaveLength(0);
  });

  it("starts a proposal at Propose with the chosen kind's starter items", async () => {
    const p = await post({ template: "custom_software", start: "proposal" });
    expect(p.workflow).toBe("neon");
    expect(p.stageId).toBe("propose");
    expect(p.key).toMatch(/^APP-/);
  });

  it("keeps a quick fix on its own path even if asked for a Workbench", async () => {
    const p = await post({ template: "quick_fix", workflow: "bench" });
    expect(p.workflow).toBe("neon");
  });

  it("switches to a Workbench (moving early work to Build) and back without moving it", async () => {
    const p = await post({ template: "modernization" });
    expect(p.stageId).toBe("intake");
    const path = `/t/${s.acme.id}/projects/${p.id}`;
    const a = await call(OP, "PATCH", path, { version: p.version, workflow: "bench" });
    expect(a.status).toBe(200);
    expect(a.json.workflow).toBe("bench");
    expect(a.json.stageId).toBe("build");
    const b = await call(OP, "PATCH", path, { version: a.json.version, workflow: "neon" });
    expect(b.json.workflow).toBe("neon");
    expect(b.json.stageId).toBe("build");
  });

  it("marks a Workbench done by moving it to Closed", async () => {
    const p = await post({ workflow: "bench" });
    const r = await call(OP, "POST", `/t/${s.acme.id}/projects/${p.id}/move`, { version: p.version, stageId: "closed" });
    expect(r.status).toBe(200);
  });
});
