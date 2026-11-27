// apps/api/src/pages.test.ts - Pages written together: two people typing at once both keep their words,
// the project's page appears on first open, readers stay current, and a deleted page is gone.
// Memory store, synthetic text.


import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage, MemoryTexter } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


const OP = "pradeep@neon1.tech";
const DANA = "tomas@harborlineoutfitters.example";
let repo: Repo;
let app: ReturnType<typeof createApp>;
let s: Awaited<ReturnType<typeof seed>>;
let base: string;


// Fresh store per test; pages on FLOW-1
beforeEach(async () => {
  repo = new Repo(new MemoryTable());
  s = await seed(repo, OP);
  app = createApp({ cfg: { env: "local", publicUrl: "https://example.invalid", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer: new MemoryMailer(), texter: new MemoryTexter(), storage: new MemoryStorage() });
  const p = (await repo.listProjects(s.acme.id)).find((x) => x.key === "FLOW-1")!;
  base = `/t/${s.acme.id}/projects/${p.id}/pages`;
});


/** Call the API as someone */
async function call(method: string, path: string, body?: unknown, as = OP) {
  const r = await app.request(`/1NEON/api${path}`, { method, headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": as }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const un64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

/** A browser's copy of a page: type into it, then sync what changed */
function browser(path: string, as = OP) {
  const doc = new Y.Doc();
  const text = doc.getText("t");
  let sent = Y.encodeStateVector(doc);
  return {
    text,
    type: (s: string, at = text.length) => text.insert(at, s),
    async sync() {
      const update = Y.encodeStateAsUpdate(doc, sent);
      const r = await call("POST", `${path}/sync`, { update: update.length > 2 ? b64(update) : undefined, vector: b64(Y.encodeStateVector(doc)), text: text.toString() }, as);
      if (r.status === 200) Y.applyUpdate(doc, un64(r.json.update));
      sent = Y.encodeStateVector(doc);
      return r;
    },
  };
}


describe("pages", () => {
  it("makes the project's page on first open, once", async () => {
    const [a, b] = await Promise.all([call("GET", `${base}/main`), call("GET", `${base}/main`, undefined, DANA)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect((await call("GET", base)).json.map((x: { id: string }) => x.id)).toEqual(["main"]);
  });

  it("merges two people typing at the same time", async () => {
    const me = browser(`${base}/main`);
    const dana = browser(`${base}/main`, DANA);
    me.type("Roof quote. ");
    dana.type("Need it by May. ");
    // Both send before either has seen the other's words
    const [r1, r2] = await Promise.all([me.sync(), dana.sync()]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    await me.sync();
    await dana.sync();
    expect(me.text.toString()).toBe(dana.text.toString());
    expect(me.text.toString()).toContain("Roof quote.");
    expect(me.text.toString()).toContain("Need it by May.");
  });

  it("shows who else has the page open", async () => {
    const me = browser(`${base}/main`);
    await browser(`${base}/main`, DANA).sync();
    const r = await me.sync();
    expect(r.json.here.map((h: { name: string }) => h.name)).toEqual(["Tomas Greer"]);
  });

  it("keeps a plain copy for previews", async () => {
    const me = browser(`${base}/main`);
    me.type("Scope: two offices");
    await me.sync();
    expect((await call("GET", base)).json[0].preview).toBe("Scope: two offices");
  });

  it("creates, renames, and deletes an organization page; the project page stays", async () => {
    const made = await call("POST", `/t/${s.acme.id}/pages`, { title: "Ideas" });
    expect(made.status).toBe(201);
    const path = `/t/${s.acme.id}/pages/${made.json.id}`;
    expect((await call("PATCH", path, { title: "Ideas, sorted" })).json.title).toBe("Ideas, sorted");
    expect((await call("DELETE", path)).status).toBe(200);
    expect((await call("GET", path)).status).toBe(404);
    await call("GET", `${base}/main`);
    expect((await call("DELETE", `${base}/main`)).status).toBe(409);
  });

  it("refuses unreadable changes", async () => {
    expect((await call("POST", `${base}/main/sync`, { update: b64(new Uint8Array([9, 9, 9, 9])) })).status).toBe(400);
  });
});
