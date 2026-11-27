// apps/api/src/data-lifecycle.test.ts - Repository record families must have lifecycle decisions,
// and a free-account purge must clear tenant-owned file sweep state.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentRecord } from "@1neon/domain";
import { seed } from "./seed.ts";
import { PURGE_DRAIN_MS, finishPurge, startPurge } from "./routes/prospects.ts";
import { MemoryDirectory, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { keys, Repo } from "./store/repo.ts";
import { watchOp } from "./files.ts";


type Lifecycle = { export: string; accountDeletion: string; organizationDeletion: string; freePurge: string; retention: string };

// Every Repo key family has one row here, so a new key cannot arrive without lifecycle decisions.
const repoLifecycle: Record<string, Lifecycle> = {
  tenant: { export: "organization profile only", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "30 days for free accounts; client duration unspecified" },
  slug: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "unspecified" },
  clientCounter: { export: "omitted", accountDeletion: "not applicable", organizationDeletion: "not applicable", freePurge: "retained", retention: "unspecified" },
  proposalCounter: { export: "omitted", accountDeletion: "not applicable", organizationDeletion: "not applicable", freePurge: "retained", retention: "unspecified" },
  user: { export: "member fields only", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed when person has no other membership", retention: "free account everything at 30 days; client duration unspecified" },
  email: { export: "member email", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed for orphaned person", retention: "unspecified" },
  subject: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "not inventoried", retention: "no TTL" },
  session: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "not inventoried; 30-day TTL", retention: "30-day session TTL" },
  totp: { export: "omitted", accountDeletion: "factor route only", organizationDeletion: "request not implemented in repo", freePurge: "removed with orphaned USER partition", retention: "setup 10 minutes; active factor unspecified" },
  totpPending: { export: "omitted", accountDeletion: "factor route deletes pending setup", organizationDeletion: "request not implemented in repo", freePurge: "removed with orphaned USER partition", retention: "10 minutes" },
  assurance: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed with orphaned USER partition", retention: "unspecified" },
  smsChallenge: { export: "omitted", accountDeletion: "factor route only", organizationDeletion: "request not implemented in repo", freePurge: "removed with orphaned USER partition", retention: "verification code 10 minutes" },
  smsOwner: { export: "omitted", accountDeletion: "released on number change or factor removal", organizationDeletion: "request not implemented in repo", freePurge: "not inventoried", retention: "no TTL" },
  smsInbound: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "not inventoried", retention: "unspecified" },
  smsSent: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed with orphaned USER partition", retention: "one-hour send window" },
  security: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed with orphaned USER partition", retention: "up to three years promised" },
  member: { export: "members.csv", accountDeletion: "deactivation is not deletion", organizationDeletion: "request not implemented in repo", freePurge: "tenant row removed", retention: "client access duration unspecified" },
  bell: { export: "excluded by design", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "tenant row removed", retention: "unspecified" },
  project: { export: "projects.csv and project.json, including Trash", accountDeletion: "no route", organizationDeletion: "Trash is reversible, hard delete absent", freePurge: "removed", retention: "clients until requested; free accounts at 30 days" },
  projectCounter: { export: "implicit numbering only", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "tenant row removed", retention: "unspecified" },
  membershipRev: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "tenant row removed", retention: "unspecified" },
  idempotency: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "tenant row removed", retention: "one day" },
  item: { export: "project records and CSV", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "clients until requested; legal records seven years" },
  doc: { export: "file record and bytes when available", accountDeletion: "single-file route", organizationDeletion: "request not implemented in repo", freePurge: "record and bytes removed", retention: "delete now; prior copies 90 days; backups 35 days" },
  page: { export: "page text", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "free everything at 30 days; client policy does not name pages" },
  edit: { export: "excluded as temporary", accountDeletion: "expires", organizationDeletion: "request not implemented in repo", freePurge: "removed with project partition", retention: "minutes" },
  comment: { export: "comments CSV and project JSON", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "clients until requested; free accounts at 30 days" },
  audit: { export: "activity CSV and JSON", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "up to three years promised" },
  calEvent: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed with tenant partition", retention: "unspecified" },
  chat: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "not named in policy" },
  chatMessage: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "not named in policy" },
  chatSeen: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "not named in policy" },
  chatBlock: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "not named in policy" },
  chatLast: { export: "omitted", accountDeletion: "no route", organizationDeletion: "request not implemented in repo", freePurge: "removed", retention: "one-hour cooldown" },
};

// The type labels written by Repo are checked too, apart from their physical key families.
const repoTypes = ["tenant", "user", "member", "bell", "project", "item", "doc", "page", "comment", "calevent", "audit", "security", "chat", "chat-message", "chat-seen", "chat-block", "chat-last"];

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
  it("assigns every Repo key family and row type a lifecycle disposition", () => {
    const source = readFileSync(new URL("./store/repo.ts", import.meta.url), "utf8");
    const types = [...new Set([...source.matchAll(/\btype:\s*"([a-z-]+)"/g)].map((match) => match[1]))].sort();
    expect(Object.keys(repoLifecycle).sort()).toEqual(Object.keys(keys).sort());
    expect(types).toEqual([...repoTypes].sort());
    for (const lifecycle of Object.values(repoLifecycle)) {
      expect(Object.values(lifecycle).every((value) => value.trim().length > 0)).toBe(true);
    }
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
