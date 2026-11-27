// Role boundary matrix for the tenant API: a prospect, client admin/editor, and neon1 operator.


import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OP = "pradeep@neon1.tech";
const ADMIN = "priya@harborlineoutfitters.example";
const EDITOR = "tomas@harborlineoutfitters.example";
const FREE = "noor@calderbuildingsupply.example";
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


async function call(as: string, method: string, path: string, body?: unknown) {
  const r = await app.request(`/1NEON/api${path}`, {
    method,
    headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": as },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}


describe("role boundaries across tenant APIs", () => {
  it("allows project creation to a prospect admin, client admin/editor, and operator", async () => {
    const path = `/t/${s.calder.id}/projects`;
    const prospect = await call(FREE, "POST", path, { name: "Free account project" });
    expect(prospect.status).toBe(201);

    const acme = `/t/${s.acme.id}/projects`;
    expect((await call(EDITOR, "POST", acme, { name: "Editor project" })).status).toBe(201);
    expect((await call(ADMIN, "POST", acme, { name: "Admin project" })).status).toBe(201);
    expect((await call(OP, "POST", acme, { name: "Operator project" })).status).toBe(201);
  });

  it("lets prospect, client admin/editor, and operator upload files, while prospect cannot manage people", async () => {
    const upload = async (as: string, tid: string, name: string) => call(as, "POST", `/t/${tid}/docs`, {
      name,
      contentType: "application/pdf",
      size: 16,
    });

    expect((await upload(FREE, s.calder.id, "prospect.pdf")).status).toBe(201);
    expect((await upload(ADMIN, s.acme.id, "admin.pdf")).status).toBe(201);
    expect((await upload(EDITOR, s.acme.id, "editor.pdf")).status).toBe(201);
    expect((await upload(OP, s.acme.id, "operator.pdf")).status).toBe(201);

    const invite = `/t/${s.calder.id}/members/invite`;
    expect((await call(FREE, "POST", invite, { people: [{ email: "new@calderbuildingsupply.example" }] })).status).toBe(403);
  });

  it("permits prospect and client chat, gates people management to admins, and reserves invoices for neon1", async () => {
    expect((await call(FREE, "POST", `/t/${s.calder.id}/chat`, { text: "Could you help with the form?" })).status).toBe(201);
    expect((await call(EDITOR, "POST", `/t/${s.acme.id}/chat`, { text: "I have a question." })).status).toBe(201);
    expect((await call(ADMIN, "POST", `/t/${s.acme.id}/chat`, { text: "I can approve this." })).status).toBe(201);
    expect((await call(OP, "POST", `/t/${s.acme.id}/chat`, { text: "We can help." })).status).toBe(201);

    const members = `/t/${s.acme.id}/members/invite`;
    expect((await call(EDITOR, "POST", members, { people: [{ email: "editor-invite@example.com" }] })).status).toBe(403);
    expect((await call(ADMIN, "POST", members, { people: [{ email: "admin-invite@example.com" }] })).status).toBe(201);
    expect((await call(OP, "POST", members, { people: [{ email: "operator-invite@example.com" }] })).status).toBe(201);

    const invoice = `/t/${s.acme.id}/projects/${(await repo.listProjects(s.acme.id))[0]!.id}/invoices`;
    const request = { type: "progress", lines: [{ text: "Work", qty: 1, unitCents: 10000 }] };
    expect((await call(ADMIN, "POST", invoice, request)).status).toBe(403);
    expect((await call(EDITOR, "POST", invoice, request)).status).toBe(403);
    expect((await call(FREE, "POST", `/t/${s.calder.id}/projects/${(await repo.listProjects(s.calder.id))[0]!.id}/invoices`, request)).status).toBe(403);
    expect((await call(OP, "POST", invoice, request)).status).toBe(201);

    const agreement = `/t/${s.acme.id}/agreement`;
    for (const as of [ADMIN, EDITOR, OP]) expect((await call(as, "GET", agreement)).status).toBe(200);
    expect((await call(FREE, "GET", `/t/${s.calder.id}/agreement`)).status).toBe(200);
    const current = (await call(ADMIN, "GET", agreement)).json;
    const signature = {
      edition: current.edition,
      hash: current.hash,
      typedName: "Priya Raman",
      consent: true,
      choices: { caseStudies: "later", naming: "ask" },
      legalName: "Harborline Outfitters LLC",
      address: "12 Harbor Road, Portland, ME 04101",
      authority: true,
    };
    expect((await call(ADMIN, "POST", `${agreement}/sign`, signature)).status).toBe(200);
    expect((await call(EDITOR, "POST", `${agreement}/sign`, signature)).status).toBe(403);
    expect((await call(OP, "POST", `${agreement}/sign`, signature)).status).toBe(403);
    expect((await call(FREE, "POST", `/t/${s.calder.id}/agreement/sign`, signature)).status).toBe(403);
  });

  it("returns 404 across tenant boundaries for projects, files, chat, people, and billing", async () => {
    const harborProject = (await repo.listProjects(s.harbor.id))[0]!;
    const paths = [
      `/t/${s.harbor.id}/projects`,
      `/t/${s.harbor.id}/projects/${harborProject.id}`,
      `/t/${s.harbor.id}/docs`,
      `/t/${s.harbor.id}/chat`,
      `/t/${s.harbor.id}/members`,
      `/t/${s.harbor.id}/agreement`,
    ];
    for (const as of [ADMIN, EDITOR, FREE]) {
      for (const path of paths) expect((await call(as, "GET", path)).status, `${as} -> ${path}`).toBe(404);
    }
  });
});
