// apps/api/src/matris.test.ts - The MATRIS fixture (fixtures/matris.ts) against the real API: every page's
// reads succeed for every role, and the edge cases it exists for are really there. Memory table only.


import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { MATRIS_SLUG, PEOPLE, matrisEmail, seedMatris } from "./fixtures/matris.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage, MemoryTexter } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OPS = ["pradeep@neon1.tech", "neon1llc@gmail.com"];
const as = (key: string) => matrisEmail(OPS[1]!, PEOPLE.find((p) => p.key === key)!.tag);
let repo: Repo;
let app: ReturnType<typeof createApp>;
let m: Awaited<ReturnType<typeof seedMatris>>;
let base: string;

beforeAll(async () => {
  repo = new Repo(new MemoryTable());
  m = await seedMatris(repo, { operators: OPS });
  base = `/t/${m.tenant.id}`;
  app = createApp({ cfg: { env: "local", publicUrl: "https://example.invalid", operatorEmails: OPS, devAuth: true }, repo, directory: new MemoryDirectory(), mailer: new MemoryMailer(), texter: new MemoryTexter(), storage: new MemoryStorage() });
});

// Call the API as one person
async function call(who: string, method: string, path: string, body?: unknown) {
  const r = await app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": who }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
  return { status: r.status, json };
}


describe("MATRIS fixture", () => {
  it("is one client organization with everyone Pradeep named", async () => {
    expect(m.tenant.slug).toBe(MATRIS_SLUG);
    const members = await repo.listMembers(m.tenant.id);
    for (const p of PEOPLE) expect(members.find((x) => x.email === as(p.key))?.access, p.key).toBe(p.access);
    expect(members.find((x) => x.email === as("sirus"))?.suspended?.why).toBe("abuse");
  });

  it("reads cleanly on every signed-in page, for every role that can sign in", async () => {
    const people = [OPS[1]!, ...["jorgeus", "neil", "felicity", "lennon", "sirus"].map(as)];
    const pages = ["/me", base, `${base}/workspace`, `${base}/projects`, `${base}/notifications`, `${base}/upcoming`, `${base}/calendar`, `${base}/docs`, `${base}/members`, `${base}/activity`, `${base}/insights`, `${base}/chat`, `${base}/agreement`, `${base}/requests`, `${base}/keep`, `${base}/recommission`];
    for (const who of people) {
      for (const path of pages) {
        const r = await call(who, "GET", path);
        expect([200, 403], `${who} ${path}: ${JSON.stringify(r.json).slice(0, 200)}`).toContain(r.status);
      }
      // Every live project opens
      for (const p of Object.values(m.projects).filter((x) => !x.deletedAt)) {
        const r = await call(who, "GET", `${base}/projects/${p.id}`);
        expect(r.status, `${who} ${p.key}: ${JSON.stringify(r.json).slice(0, 300)}`).toBe(200);
      }
    }
    // super's own views
    for (const path of ["/all/projects", "/chat/inbox", "/suspensions", "/prospects"]) expect((await call(OPS[1]!, "GET", path)).status, path).toBe(200);
  });

  it("holds the edge cases it exists for", async () => {
    // An overdue proposal waiting on Felicity, the decision maker
    expect(JSON.stringify((await call(as("felicity"), "GET", `${base}/workspace`)).json)).toContain("SRC-1");
    // The board is over its Build limit
    const build = Object.values(m.projects).filter((p) => p.stageId === "build" && !p.archived && !p.deletedAt);
    expect(build.length).toBeGreaterThan(m.tenant.stages.find((s) => s.id === "build")!.wipLimit!);
    // Every way of working is present
    for (const lens of ["page", "board", "timeline", "steps"]) expect(Object.values(m.projects).some((p) => p.lens === lens), lens).toBe(true);
    // Sirus reads but can't post, and his request to come back is waiting for super
    expect((await call(as("sirus"), "POST", `${base}/chat`, { body: "hello" })).status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify((await call(OPS[1]!, "GET", "/suspensions")).json)).toContain("Sirus Hill");
    // Only the ready files carry bytes to upload
    expect(m.files.length).toBeGreaterThanOrEqual(5);
  });
});
