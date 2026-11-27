// Router-derived guard matrix: every registered endpoint has an explicit public/protected policy,
// and protected routes are exercised signed out and across a tenant boundary.

import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OP = "pradeep@neon1.tech";
const EDITOR = "tomas@harborlineoutfitters.example";
const PUBLIC = new Set([
  "GET /health",
  "GET /auth/login", "GET /auth/callback", "POST /auth/step", "POST /auth/logout",
  "GET /auth/signup", "POST /auth/signup",
  "POST /contact", "POST /bug", "POST /bug/:ref/:token/image", "POST /feedback",
  "GET /form-gate/:form",
  "POST /billing/stripe",
  "GET /dev-files/:key", "PUT /dev-files/:key",
]);

let app: ReturnType<typeof createApp>;
let repo: Repo;
let s: Awaited<ReturnType<typeof seed>>;


beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  s = await seed(repo, OP);
  app = createApp({
    cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true },
    repo,
    directory: new MemoryDirectory(),
    mailer: new MemoryMailer(),
    storage: new MemoryStorage(),
  });
});


function endpoints() {
  return [...new Set(app.routes
    .filter((r) => r.method !== "ALL")
    .map((r) => `${r.method} ${r.path.replace(/^\/1NEON\/api/, "")}`))].sort();
}

function policy(endpoint: string): "public" | "protected" {
  return PUBLIC.has(endpoint) ? "public" : "protected";
}

function samplePath(endpoint: string, tid = s.harbor.id, project = "p_guess") {
  return endpoint.split(" ")[1]!
    .replaceAll(":tid", tid)
    .replaceAll(":pid", project)
    .replaceAll(":uid", "u_guess")
    .replaceAll(":eid", "e_guess")
    .replaceAll(":iid", "i_guess")
    .replaceAll(":did", "d_guess")
    .replaceAll(":pgid", "pg_guess")
    .replaceAll(":mid", "m_guess")
    .replaceAll(":cid", "c_guess")
    .replaceAll(":id", "id_guess")
    .replaceAll(":rid", "r_guess")
    .replaceAll(":ref", "BUG-ABC123")
    .replaceAll(":token", "token_guess")
    .replaceAll(":key", "guess");
}

async function call(endpoint: string, as?: string) {
  const [method] = endpoint.split(" ");
  const path = samplePath(endpoint);
  const r = await app.request(`/1NEON/api${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-1neon": "1",
      ...(as ? { "x-dev-user": as } : {}),
    },
    body: ["GET", "HEAD", "OPTIONS"].includes(method!) ? undefined : "{}",
  });
  return r.status;
}


describe("authorization coverage from the registered router", () => {
  it("classifies every registered method and path", () => {
    const routes = endpoints();
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.filter((route) => policy(route) === "protected").length).toBeGreaterThan(70);
    expect(routes.filter((route) => policy(route) === "public")).toEqual([...PUBLIC].sort());
  });

  it("refuses signed-out access on every protected route", async () => {
    const protectedRoutes = endpoints().filter((route) => policy(route) === "protected");
    const results = await Promise.all(protectedRoutes.map(async (route) => ({ route, status: await call(route) })));
    expect(results.filter((x) => x.status !== 401)).toEqual([]);
  });

  it("hides every tenant route from a signed-in person in another organization", async () => {
    const tenantRoutes = endpoints().filter((route) => policy(route) === "protected" && route.includes("/t/:tid"));
    const results = await Promise.all(tenantRoutes.map(async (route) => ({ route, status: await call(route, EDITOR) })));
    expect(results.filter((x) => x.status !== 404)).toEqual([]);
  });

  it("runs each tenant route through every account and organization role", async () => {
    const lee = await repo.getMember(s.harbor.id, s.lee.id);
    expect(lee).toBeDefined();
    await repo.saveMember({ ...lee!, status: "deactivated", version: lee!.version + 1 }, { version: lee!.version });

    const makePerson = async (id: string, email: string) => {
      const source = await repo.getUser(s.lee.id);
      const user = { ...source!, id, email, version: 1, updatedAt: new Date().toISOString() };
      await repo.createUser(user);
      return user;
    };
    const viewerUser = await makePerson("u_matrix_viewer", "matrix-viewer@example.com");
    const suspendedUser = await makePerson("u_matrix_suspended", "matrix-suspended@example.com");
    const viewer: any = { ...lee!, tenantId: s.acme.id, userId: viewerUser.id, email: viewerUser.email, status: "joined", access: "viewer", suspended: undefined, version: 1 };
    await repo.saveMember(viewer, { create: true });
    const suspended: any = { ...viewer, tenantId: s.harbor.id, userId: suspendedUser.id, email: suspendedUser.email, suspended: { at: new Date().toISOString(), why: "super", by: s.pradeep.id } };
    await repo.saveMember(suspended, { create: true });

    const personas = [
      { role: "free", as: s.noor.email, tid: s.calder.id },
      { role: "viewer", as: viewerUser.email, tid: s.acme.id },
      { role: "editor", as: EDITOR, tid: s.acme.id },
      { role: "client admin", as: "priya@harborlineoutfitters.example", tid: s.acme.id },
      { role: "deactivated", as: s.lee.email, tid: s.harbor.id },
      { role: "suspended", as: suspendedUser.email, tid: s.harbor.id },
      { role: "operator", as: OP, tid: s.acme.id },
      { role: "super", as: OP, tid: s.acme.id },
    ];
    const tenantRoutes = endpoints().filter((route) => policy(route) === "protected" && route.includes("/t/:tid"));
    const results = await Promise.all(tenantRoutes.flatMap((route) => personas.map(async (persona) => {
      const pid = (await repo.listProjects(persona.tid))[0]?.id ?? "p_guess";
      const path = samplePath(route, persona.tid, pid);
      const [method] = route.split(" ");
      const response = await app.request(`/1NEON/api${path}`, {
        method,
        headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": persona.as },
        body: ["GET", "HEAD", "OPTIONS"].includes(method!) ? undefined : "{}",
      });
      return { route, role: persona.role, status: response.status };
    })));
    // Trin is intentionally unavailable in this offline fixture; its 503 is the configured no-model response.
    expect(results.filter((x) => x.status === 401 || (x.status >= 500 && x.route !== "POST /t/:tid/trin"))).toEqual([]);

    // A deactivated person gets nothing. Suspended people only read. Viewers and free accounts change nothing but these
    const allowed = results.filter((x) => x.status < 300);
    expect(allowed.filter((x) => x.role === "deactivated")).toEqual([]);
    const writes = (roles: string[]) => [...new Set(allowed.filter((x) => roles.includes(x.role) && !x.route.startsWith("GET ")).map((x) => x.route))].sort();
    const READ_MARKS = ["POST /t/:tid/notifications/:id/read", "POST /t/:tid/notifications/read-all"];
    expect(writes(["suspended"])).toEqual(READ_MARKS);
    // Clearing an "editing now" mark succeeds for anyone who can read the project
    expect(writes(["viewer"])).toEqual(["DELETE /t/:tid/projects/:pid/edits/:recordId", ...READ_MARKS]);
    expect(writes(["free"])).toEqual(["DELETE /t/:tid/projects/:pid/edits/:recordId", "POST /t/:tid/keep", ...READ_MARKS]);
  });
});
