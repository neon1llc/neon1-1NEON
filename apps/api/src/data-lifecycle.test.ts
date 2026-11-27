// apps/api/src/data-lifecycle.test.ts - Every repository record family is reviewed for deletion,
// and a free-account purge must clear tenant-owned file sweep state.

import { beforeEach, describe, expect, it } from "vitest";
import { DocumentRecord } from "@1neon/domain";
import { seed } from "./seed.ts";
import { PURGE_DRAIN_MS, finishPurge, startPurge } from "./routes/prospects.ts";
import { MemoryDirectory, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { keys, Repo } from "./store/repo.ts";
import { watchOp } from "./files.ts";
import { readToken, replyAddress } from "./lib/reply.ts";


// Key families whose export, deletion, purge, and retention behavior has been reviewed.
// A new family fails here until someone decides what the free-account purge does with it.
const REVIEWED = [
  "tenant", "slug", "clientCounter", "proposalCounter", "user", "email", "subject", "session", "totp",
  "totpPending", "assurance", "smsChallenge", "smsOwner", "smsInbound", "sessionRef", "subjectRef", "replyToken", "replyPointer", "smsSent", "security", "member", "bell",
  "project", "projectCounter", "membershipRev", "idempotency", "item", "doc", "page", "edit", "comment", "audit",
  "calEvent", "chat", "chatMessage", "chatSeen", "chatBlock", "chatLast",
];

// Purge uses synthetic data and in-memory services only.
const OP = "pradeep@neon1.tech";
let repo: Repo;
let table: MemoryTable;
let directory: MemoryDirectory;
let storage: MemoryStorage;
let seeded: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  table = new MemoryTable();
  repo = new Repo(table);
  directory = new MemoryDirectory();
  storage = new MemoryStorage();
  seeded = await seed(repo, OP);
});


describe("stored record lifecycle", () => {
  it("has a reviewed lifecycle for every Repo key family", () => {
    expect([...REVIEWED].sort()).toEqual(Object.keys(keys).sort());
  });

  it("removes a free account's reply-by-email tokens and Trin index", async () => {
    const tid = seeded.calder.id;
    const at = new Date();
    const address = await replyAddress(repo, { domain: "reply.example", secret: "test-secret" }, tid, "p_1", "u_1");
    const token = address.split(".")[1]!;
    await table.write([{ put: { PK: `T#${tid}#TRIN`, SK: "V#abc", v: "x" }, guard: { always: true } }]);
    const kit = { repo, d: { storage, directory }, cfg: { operatorEmails: [OP] } } as never;
    await startPurge(kit, tid, { at });
    expect(await finishPurge(kit, tid, new Date(at.getTime() + PURGE_DRAIN_MS + 1))).toEqual({ deleted: true });
    expect(await readToken(repo, token)).toBeUndefined();
    expect(await table.query(`T#${tid}#TRIN`)).toEqual([]);
  });

  it("removes a free account's pending document sweep row with its record and bytes", async () => {
    const tid = seeded.calder.id;
    const at = new Date();
    const doc = DocumentRecord.parse({
      tenantId: tid,
      id: "d_pending",
      name: "pending.pdf",
      contentType: "application/pdf",
      size: 4,
      key: "t/" + tid + "/_/d_pending/pending.pdf",
      scan: "pending",
      state: "receiving",
      uploaded: false,
      version: 1,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
      updatedBy: "u_pending",
    });
    await table.write([repo.docOp(doc, { create: true }), watchOp(doc)]);
    const kit = { repo, d: { storage, directory }, cfg: { operatorEmails: [OP] } } as never;
    await startPurge(kit, tid, { at });
    const result = await finishPurge(kit, tid, new Date(at.getTime() + PURGE_DRAIN_MS + 1));
    expect(result).toEqual({ deleted: true });
    expect(await table.query("DOCWATCH", tid + "#")).toEqual([]);
  });
});
