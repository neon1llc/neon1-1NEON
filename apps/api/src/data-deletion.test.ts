// apps/api/src/data-deletion.test.ts - What deleting a free account removes from the global rows, the number it
// holds, and super's deletion of a client on request.

import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { seed } from "./seed.ts";
import { PURGE_DRAIN_MS, finishPurge, startPurge } from "./routes/prospects.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { keys, Repo } from "./store/repo.ts";
import { outboxOp } from "./outbox.ts";


const OP = "pradeep@neon1.tech";
const ADMIN = "priya@harborlineoutfitters.example";
let table: MemoryTable;
let repo: Repo;
let s: Awaited<ReturnType<typeof seed>>;
let copies: { key: string; record: unknown }[];
let broken: boolean;


beforeEach(async () => {
  table = new MemoryTable();
  repo = new Repo(table);
  s = await seed(repo, OP);
  copies = [];
  broken = false;
});


const records = { put: async (key: string, record: unknown) => { if (broken) throw new Error("down"); copies.push({ key, record }); } };
const kit = () => ({ repo, d: { storage: new MemoryStorage(), directory: new MemoryDirectory(), records }, cfg: { env: "local", operatorEmails: [OP] } }) as never;
const later = (at: Date) => new Date(at.getTime() + PURGE_DRAIN_MS + 1);


describe("deleting a free account", () => {
  it("removes sign-in rows and queued notices, and holds the confirmed number for 30 days", async () => {
    const tid = s.calder.id;
    const uid = s.noor.id;
    await repo.linkSubject("sub-noor", uid);
    await repo.saveSession("jti-noor", uid, false);
    const user = (await repo.getUser(uid))!;
    await table.write([repo.userOp({ ...user, smsPhone: "+12125550100", version: user.version + 1 }, user.version)]);
    await table.write([{ put: { ...keys.smsOwner("+12125550100"), type: "sms-owner", userId: uid, version: 1 }, guard: { create: true } }]);
    await table.write([outboxOp("S#test#1", { kind: "sms-confirmed", userId: uid, to: "+12125550100", verifiedAt: new Date().toISOString() })]);
    await table.write([{ put: { PK: "REQUEST#PENDING", SK: tid, dueAt: new Date().toISOString() }, guard: { always: true } }]);
    const at = new Date();
    await startPurge(kit(), tid, { at });
    expect(await finishPurge(kit(), tid, later(at))).toEqual({ deleted: true });
    expect(await repo.userIdForSubject("sub-noor")).toBeUndefined();
    expect(await repo.getSession("jti-noor")).toBeFalsy();
    expect((await table.query("OUTBOX")).filter((r) => (r.payload as { userId?: string }).userId === uid)).toEqual([]);
    expect(await table.get("REQUEST#PENDING", tid)).toBeUndefined();
    const held = await table.get(keys.smsOwner("+12125550100").PK, "OWNER");
    expect(held).toMatchObject({ userId: "deleted" });
    expect(Number(held!.ttl)).toBe(Math.floor(later(at).getTime() / 1000) + 30 * 86_400);
  });
});


describe("deleting a client on request", () => {
  const call = async (as: string, tid: string, body: unknown) => {
    const app = createApp({ cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [OP], devAuth: true }, repo, directory: new MemoryDirectory(), mailer: new MemoryMailer(), storage: new MemoryStorage(), records });
    return (await app.request(`/1NEON/api/orgs/${tid}/delete`, { method: "POST", headers: { "content-type": "application/json", "x-1neon": "1", "x-dev-user": as }, body: JSON.stringify(body) })).status;
  };

  it("is super's alone, needs the exact name and who asked, and never takes neon1", async () => {
    const t = (await repo.getTenant(s.harbor.id))!;
    const body = { confirm: t.name, request: "Priya Raman asked by email on Nov 27" };
    expect(await call(ADMIN, t.id, body)).toBe(403);
    expect(await call(OP, t.id, { ...body, confirm: "wrong" })).toBe(400);
    expect(await call(OP, t.id, { confirm: t.name, request: "" })).toBe(400);
    const own = (await repo.listTenants()).find((x) => x.slug === "neon1")!;
    expect(await call(OP, own.id, { ...body, confirm: own.name })).toBe(409);
    expect((await repo.getTenant(t.id))!.deletingAt).toBeUndefined();
    expect(await call(OP, t.id, body)).toBe(202);
    expect((await repo.getTenant(t.id))!.deletingAt).toBeTruthy();
    expect(await call(OP, t.id, body)).toBe(409);
  });

  it("copies the records to the locked store first, and removes nothing if it can't", async () => {
    const tid = s.harbor.id;
    const at = new Date();
    await startPurge(kit(), tid, { at, request: { note: "asked by email", by: s.pradeep.id } });
    broken = true;
    await expect(finishPurge(kit(), tid, later(at))).rejects.toThrow();
    expect((await repo.listProjects(tid)).length).toBeGreaterThan(0);
    broken = false;
    expect(await finishPurge(kit(), tid, later(at))).toEqual({ deleted: true });
    expect(copies.map((c) => c.key)).toEqual([`deleted/${tid}/records.json`]);
    expect(await repo.getTenant(tid)).toBeUndefined();
    expect(await table.get("DELETED", tid)).toMatchObject({ reason: "request", request: { note: "asked by email" } });
  });

  it("never deletes a client without a request", async () => {
    await expect(startPurge(kit(), s.harbor.id)).rejects.toThrow();
  });
});
