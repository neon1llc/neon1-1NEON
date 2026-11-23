// apps/web/src/lib/export-build.test.ts - The export end to end against a fake API: the real zip
// writer (client-zip) builds the file, JSZip reads it back, and manifest.json must match what's in it,
// byte counts and checksums included. Covers retries, files left out, Trash, comments and the activity
// history, an older API without the export's routes, an empty organization, and 2,000 files past the
// in-memory limit.


import type { DocumentRecord, Item, Project, Tenant } from "@1neon/domain";
import { makeZip } from "client-zip";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { changedSince, entries, gather, type Source } from "./export-build.ts";
import { MEMORY_LIMIT_BYTES, memoryWarning, sha256, zipName, type Manifest } from "./export-plan.ts";


// --- A fake organization behind a fake API -------------------------------------------------------

const org = { id: "t1", slug: "acme", clientId: "N1-0002", name: "Harborline Outfitters", stages: [{ id: "s1", name: "Decide" }] } as unknown as Tenant;
const at = "2026-10-01T00:00:00.000Z";
const project = (key: string, deletedAt?: string) => ({ id: `p-${key}`, key, name: `Project ${key}`, stageId: "s1", health: "on_track", createdAt: at, updatedAt: at, deletedAt }) as unknown as Project;
const item = (pid: string, kind: string, extra: Partial<Item> = {}) => ({ id: `i-${pid}-${kind}`, projectId: pid, kind, title: kind, body: "", status: "open", fields: {}, createdAt: at, updatedAt: at, ...extra }) as unknown as Item;
let seq = 0;
const doc = (name: string, projectId?: string, extra: Partial<DocumentRecord> = {}) => ({ id: `d${++seq}`, name, projectId, size: 4, uploaded: true, state: "ready", createdAt: at, updatedAt: at, ...extra }) as DocumentRecord;

type Org = { live: { project: Project; items: Item[]; docs: DocumentRecord[] }[]; trash?: { project: Project; items: Item[]; docs: DocumentRecord[] }[]; history?: { comments: unknown[]; audit: unknown[] }; orgDocs: DocumentRecord[]; members?: number };
/** How a file's download goes: bytes, or failures in order (then bytes) */
type Plan = { bytes?: Uint8Array; fail?: unknown[] };

/** A Source over the fake organization; `plans` decides each file's download by doc id (by default
 * bytes as long as the record says), and `onFile` runs as each download starts, so a test can change
 * the organization part way through, as another person would. Routes are worked out per read */
function fake(o: Org, plans: Record<string, Plan> = {}, onFile?: (id: string) => void) {
  const calls: Record<string, number> = {};
  const routes = (): Record<string, unknown> => {
    const r: Record<string, unknown> = {
      [`/t/${org.id}/projects`]: o.live.map((d) => d.project),
      [`/t/${org.id}/members`]: Array.from({ length: o.members ?? 2 }, (_, i) => ({ userId: `u${i}`, name: `M${i}`, email: `m${i}@x.example`, access: "admin", status: "joined", invitedAt: at })),
      [`/t/${org.id}/docs`]: { docs: [...o.orgDocs, ...o.live.flatMap((d) => d.docs.filter((x) => x.state !== "receiving"))] },
      ...Object.fromEntries(o.live.map((d) => [`/t/${org.id}/projects/${d.project.id}`, d])),
    };
    // An API with the export's routes answers both; an older one (no trash given) answers neither
    if (o.trash) r[`/t/${org.id}/export/trash`] = { projects: o.trash };
    if (o.trash) r[`/t/${org.id}/export/history`] = o.history ?? { comments: [], audit: [] };
    return r;
  };
  const records = () => [...o.orgDocs, ...o.live.flatMap((d) => d.docs), ...(o.trash ?? []).flatMap((d) => d.docs)];
  const src: Source = {
    async get<T>(path: string) {
      const r = routes();
      if (!(path in r)) throw { status: 404, body: { error: "http", message: "Not Found" } };
      return structuredClone(r[path]) as T;
    },
    async file(path: string) {
      const id = /\/docs\/([^/?]+)\/download/.exec(path)![1]!;
      calls[id] = (calls[id] ?? 0) + 1;
      onFile?.(id);
      const p = plans[id] ?? {};
      const failure = p.fail?.[calls[id]! - 1];
      if (failure) throw failure;
      const b = p.bytes ?? new Uint8Array(records().find((d) => d.id === id)?.size ?? 0).fill(id.charCodeAt(1));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  };
  return { src, calls };
}

/** Run the whole export into a real zip; returns the manifest and the zip read back */
async function run(o: Org, plans?: Record<string, Plan>, onFile?: (id: string) => void) {
  const { src, calls } = fake(o, plans, onFile);
  const said: string[] = [];
  const g = await gather(org, src, (s) => said.push(s));
  let m: Manifest | undefined;
  const bytes = new Uint8Array(await new Response(makeZip(entries(org, g, src, (s) => said.push(s), (x) => (m = x)))).arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  return { g, m: m!, zip, calls, said };
}

/** Every file path in the zip, folders left out */
const paths = (zip: JSZip) => Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).sort();

/** The manifest agrees with the zip: every included file is there with its size and checksum, no
 * omitted one is, the records are listed, and the counts add up */
async function agrees(m: Manifest, zip: JSZip) {
  const inZip = paths(zip);
  for (const f of m.files) {
    if (f.status === "omitted") {
      expect(inZip).not.toContain(f.path);
      expect(f.reason).toBeTruthy();
      continue;
    }
    const b = await zip.file(f.path)!.async("uint8array");
    expect(b.byteLength).toBe(f.bytes);
    expect(await sha256(b)).toBe(f.sha256);
  }
  for (const r of m.records) expect(await sha256(await zip.file(r.path)!.async("uint8array"))).toBe(r.sha256);
  const listed = [...m.records.map((r) => r.path), ...m.files.filter((f) => f.status === "included").map((f) => f.path), "manifest.json", "README.txt"].sort();
  expect(inZip).toEqual(listed);
  expect(m.counts.files.included + m.counts.files.omitted).toBe(m.counts.files.expected);
  expect(m.counts.files.expected).toBe(m.files.length);
  expect(JSON.parse(await zip.file("manifest.json")!.async("string"))).toEqual(m);
}


// --- The cases ------------------------------------------------------------------------------------

describe("export end to end", () => {
  it("is complete when every file arrives, and the manifest matches the zip", async () => {
    const a = project("FLOW-1");
    const { m, zip } = await run({ live: [{ project: a, items: [item(a.id, "task")], docs: [doc("plan.pdf", a.id)] }], trash: [], orgDocs: [doc("logo.png")] });
    expect(m.complete).toBe(true);
    expect(m.counts).toMatchObject({ projects: 1, trashedProjects: 0, members: 2, files: { expected: 2, included: 2, omitted: 0 } });
    expect(m.records.map((r) => r.path)).toContain("FLOW-1/project.json");
    expect((await zip.file("README.txt")!.async("string")).split("\n")[0]).toBe("This export is complete.");
    await agrees(m, zip);
  });

  it("retries a failed download once, and leaves out one that fails twice, with the reason", async () => {
    const a = project("FLOW-1");
    const flaky = doc("flaky.pdf", a.id), lost = doc("lost.pdf", a.id), bad = doc("bad.exe", a.id);
    const { m, zip, calls } = await run({ live: [{ project: a, items: [], docs: [flaky, lost, bad] }], trash: [], orgDocs: [] }, {
      [flaky.id]: { fail: [new TypeError("Failed to fetch")] },
      [lost.id]: { fail: [{ status: 403 }, { status: 403 }] },
      [bad.id]: { fail: [{ status: 410, body: { error: "infected" } }] },
    });
    expect(calls).toMatchObject({ [flaky.id]: 2, [lost.id]: 2, [bad.id]: 1 });
    expect(m.complete).toBe(false);
    expect(m.files.find((f) => f.id === flaky.id)?.status).toBe("included");
    expect(m.files.find((f) => f.id === lost.id)).toMatchObject({ status: "omitted", reason: "download failed: 403" });
    expect(m.files.find((f) => f.id === bad.id)).toMatchObject({ status: "omitted", reason: "flagged by the malware scan, so it can't be downloaded" });
    expect((await zip.file("README.txt")!.async("string")).split("\n")[0]).toBe("This export is partial: 2 files are not included (listed below and in manifest.json).");
    expect(zipName(org.slug, m.exportedAt, m.complete)).toMatch(/-partial\.zip$/);
    await agrees(m, zip);
  });

  it("lists a file whose upload never finished as omitted, not silently skipped", async () => {
    const a = project("FLOW-1");
    const half = doc("half.pdf", a.id, { state: "receiving", uploaded: false });
    const { m, zip } = await run({ live: [{ project: a, items: [], docs: [half] }], trash: [], orgDocs: [] }, { [half.id]: { fail: [{ status: 409, body: { error: "scanning" } }, { status: 409, body: { error: "scanning" } }] } });
    expect(m.files).toEqual([expect.objectContaining({ path: "FLOW-1/files/half.pdf", status: "omitted", reason: "the upload never finished" })]);
    await agrees(m, zip);
  });

  it("includes a trashed project under trash/, flagged in projects.csv, with its files", async () => {
    const a = project("FLOW-1"), gone = project("FLOW-2", "2026-10-20T09:00:00.000Z");
    const old = doc("old.pdf", gone.id);
    const { m, zip } = await run({ live: [{ project: a, items: [], docs: [] }], trash: [{ project: gone, items: [item(gone.id, "decision", { title: "Approved: A" })], docs: [old] }], orgDocs: [] });
    expect(m.complete).toBe(true);
    expect(m.counts).toMatchObject({ projects: 1, trashedProjects: 1, decisions: 1 });
    expect(m.files[0]).toMatchObject({ path: "trash/FLOW-2/files/old.pdf", trashed: true, status: "included" });
    expect(JSON.parse(await zip.file("trash/FLOW-2/project.json")!.async("string")).trashedAt).toBe("2026-10-20T09:00:00.000Z");
    const rows = (await zip.file("projects.csv")!.async("string")).trim().split("\r\n");
    expect(rows[0]).toContain(",trashed,");
    expect(rows.find((r) => r.startsWith("FLOW-2"))).toContain("2026-10-20T09:00:00.000Z");
    expect(rows.find((r) => r.startsWith("FLOW-1"))).not.toContain("2026-10-20");
    await agrees(m, zip);
  });

  it("says plainly when an older API can't read Trash, comments, or the history", async () => {
    const { m, zip } = await run({ live: [], orgDocs: [] });
    expect(m).toMatchObject({ trash: "unavailable", history: "unavailable", complete: false });
    const text = await zip.file("README.txt")!.async("string");
    expect(text.split("\n")[0]).toBe("This export is partial: projects in Trash are not included (this version of 1NEON can't export them); comments and the activity history are not included (this version of 1NEON can't export them).");
    expect(text).toContain("- Projects in Trash: this version of 1NEON can't export them; ask neon1 for them.");
    expect(paths(zip)).not.toContain("comments.csv");
    await agrees(m, zip);
  });

  it("includes every comment (in its project and comments.csv) and the activity history", async () => {
    const a = project("FLOW-1"), gone = project("FLOW-2", "2026-10-20T09:00:00.000Z");
    const t = item(a.id, "task", { title: "Send the form" }), old = item(gone.id, "task", { title: "Old task" });
    const comments = [
      { projectId: a.id, itemId: t.id, id: "c1", at, authorId: "u0", authorName: "M0", body: "Sent, see the file" },
      { projectId: gone.id, itemId: old.id, id: "c2", at, authorId: "u1", authorName: "M1", body: "=not a formula" },
    ];
    const audit = [{ tenantId: org.id, at, id: "e1", actorId: "u0", action: "project.trashed", target: gone.id, summary: "Moved FLOW-2 to Trash" }];
    const { m, zip } = await run({ live: [{ project: a, items: [t], docs: [] }], trash: [{ project: gone, items: [old], docs: [] }], history: { comments, audit }, orgDocs: [] });
    expect(m.complete).toBe(true);
    expect(m.counts).toMatchObject({ comments: 2, activity: 1 });
    expect(JSON.parse(await zip.file("FLOW-1/project.json")!.async("string")).comments.map((c: { id: string }) => c.id)).toEqual(["c1"]);
    expect(JSON.parse(await zip.file("trash/FLOW-2/project.json")!.async("string")).comments.map((c: { id: string }) => c.id)).toEqual(["c2"]);
    const rows = (await zip.file("comments.csv")!.async("string")).trim().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain("FLOW-1,Send the form");
    expect(rows[2]).toContain("'=not a formula");
    expect(await zip.file("activity.csv")!.async("string")).toContain(`${at},M0,project.trashed,Moved FLOW-2 to Trash`);
    expect(JSON.parse(await zip.file("activity.json")!.async("string")).activity).toEqual(audit);
    await agrees(m, zip);
  });

  it("exports an empty organization as complete, records only", async () => {
    const { m, zip } = await run({ live: [], trash: [], orgDocs: [], members: 0 });
    expect(m.complete).toBe(true);
    expect(m.files).toEqual([]);
    expect(paths(zip)).toEqual(["README.txt", "activity.csv", "activity.json", "comments.csv", "decisions.csv", "invoices.csv", "items.csv", "manifest.json", "members.csv", "organization.json", "payments.csv", "projects.csv"]);
    await agrees(m, zip);
  });

  it("keeps duplicate names apart in the zip and the manifest", async () => {
    const a = project("FLOW-1");
    const { m, zip } = await run({ live: [{ project: a, items: [], docs: [doc("x.pdf", a.id), doc("x.pdf", a.id), doc("X.pdf", a.id)] }], trash: [], orgDocs: [doc("x.pdf")] });
    expect(m.files.map((f) => f.path)).toEqual(["files/x.pdf", "FLOW-1/files/x.pdf", "FLOW-1/files/x (2).pdf", "FLOW-1/files/X (3).pdf"]);
    await agrees(m, zip);
  });

  it("warns before 2,000 files past the in-memory limit, and the counts still add up", async () => {
    // Records claim 1 MB each (2,000 MB in all): enough to warn, read without downloading anything
    const a = project("FLOW-1");
    const big = Array.from({ length: 2000 }, (_, i) => doc(`scan-${i % 500}.pdf`, a.id, { size: 1024 ** 2 }));
    const g = await gather(org, fake({ live: [{ project: a, items: [], docs: big }], trash: [], orgDocs: [] }).src, () => undefined);
    expect(g.expected).toBe(2000 * 1024 ** 2);
    expect(g.expected).toBeGreaterThan(MEMORY_LIMIT_BYTES);
    expect(memoryWarning(g.expected)).toMatch(/^This export is about 2\.0 GB\./);
    // The same 2,000 files at a size the test can build; three fail twice
    const docs = Array.from({ length: 2000 }, (_, i) => doc(`scan-${i % 500}.pdf`, a.id, { size: 4 }));
    const failing = Object.fromEntries(docs.slice(0, 3).map((d) => [d.id, { fail: [{ status: 500 }, { status: 500 }] }]));
    const { m, zip } = await run({ live: [{ project: a, items: [], docs }], trash: [], orgDocs: [] }, failing);
    expect(m.counts.files).toEqual({ expected: 2000, included: 1997, omitted: 3 });
    expect(new Set(m.files.map((f) => f.path.toLowerCase())).size).toBe(2000);
    await agrees(m, zip);
  }, 60_000);
});


// --- Edge cases: a snapshot that holds still, and checksums that mean it -------------------------

const readmeTop = async (zip: JSZip) => (await zip.file("README.txt")!.async("string")).split("\n")[0];

describe("export while the data changes", () => {
  it("is complete, with no note, when nothing changes during the export", async () => {
    const a = project("FLOW-1");
    const { m } = await run({ live: [{ project: a, items: [], docs: [doc("a.pdf", a.id)] }], trash: [], orgDocs: [] });
    expect(m.complete).toBe(true);
    expect(m.notInExport.some((n) => n.changed)).toBe(false);
  });

  it("names a project added during the export, and is partial", async () => {
    const a = project("FLOW-1");
    const o: Org = { live: [{ project: a, items: [], docs: [doc("a.pdf", a.id)] }], trash: [], orgDocs: [] };
    const { m, zip } = await run(o, {}, () => o.live.push({ project: project("FLOW-9"), items: [], docs: [] }));
    expect(m.complete).toBe(false);
    expect(m.notInExport[0]).toMatchObject({ partial: true, changed: true });
    expect(m.notInExport[0]!.what).toContain("FLOW-9");
    expect(await readmeTop(zip)).toBe("This export is partial: Projects changed while the export ran: FLOW-9 (they may differ from what 1NEON holds now; export again for a consistent copy).");
    // The zip still matches its own manifest: FLOW-9 is in neither
    expect(paths(zip)).not.toContain("FLOW-9/project.json");
    await agrees(m, zip);
  });

  it("names a project edited, and one moved to Trash, during the export", async () => {
    const a = project("FLOW-1"), b = project("FLOW-2");
    const o: Org = { live: [{ project: a, items: [], docs: [doc("a.pdf", a.id)] }, { project: b, items: [], docs: [] }], trash: [], orgDocs: [] };
    const { m, zip } = await run(o, {}, () => {
      a.updatedAt = "2026-10-02T00:00:00.000Z";
      const gone = o.live.pop()!;
      gone.project.deletedAt = "2026-10-02T00:00:00.000Z";
      o.trash!.push(gone);
    });
    expect(m.complete).toBe(false);
    expect(m.notInExport[0]!.what).toContain("FLOW-1");
    expect(m.notInExport[0]!.what).toContain("FLOW-2");
    expect(zipName(org.slug, m.exportedAt, m.complete)).toMatch(/-partial\.zip$/);
    await agrees(m, zip);
  });

  it("catches a project trashed after the Trash read but before the project list, which neither read holds", async () => {
    const a = project("FLOW-1"), b = project("FLOW-2");
    const o: Org = { live: [{ project: a, items: [], docs: [] }, { project: b, items: [], docs: [] }], trash: [], orgDocs: [] };
    const { src } = fake(o);
    // The first read of the project list (after Trash) finds FLOW-2 already trashed
    let listed = 0;
    const racing: Source = {
      ...src,
      async get<T>(path: string) {
        if (path === `/t/${org.id}/projects` && listed++ === 0) {
          const gone = o.live.pop()!;
          gone.project.deletedAt = "2026-10-02T00:00:00.000Z";
          o.trash!.push(gone);
        }
        return src.get<T>(path);
      },
    };
    const g = await gather(org, racing, () => undefined);
    expect(g.held.map((h) => h.project.key)).toEqual(["FLOW-1"]);
    expect(await changedSince(org, g, racing)).toEqual(["FLOW-2"]);
  });

  it("lists a file deleted during the export as missing, not silently dropped", async () => {
    const a = project("FLOW-1");
    const f = doc("a.pdf", a.id);
    const { m, zip } = await run({ live: [{ project: a, items: [], docs: [f] }], trash: [], orgDocs: [] }, { [f.id]: { fail: [{ status: 404, body: { error: "not_found" } }, { status: 404, body: { error: "not_found" } }] } });
    expect(m.files[0]).toMatchObject({ status: "omitted", reason: "it was deleted while the export ran" });
    expect(m.complete).toBe(false);
    await agrees(m, zip);
  });

  it("leaves a file uploaded during the export out of both the zip and every record", async () => {
    const a = project("FLOW-1");
    const o: Org = { live: [{ project: a, items: [], docs: [doc("a.pdf", a.id)] }], trash: [], orgDocs: [] };
    const { m, zip } = await run(o, {}, () => o.orgDocs.push(doc("late.pdf")));
    expect(m.files.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(paths(zip).some((p) => p.includes("late"))).toBe(false);
    const rec = JSON.parse(await zip.file("FLOW-1/project.json")!.async("string")).files as { id: string }[];
    // Every file a record mentions is in the manifest
    expect(rec.every((r) => m.files.some((f) => f.id === r.id))).toBe(true);
    await agrees(m, zip);
  });
});


describe("complete means present and matching", () => {
  it("is partial, with the reason, when a file arrives shorter than its record", async () => {
    const a = project("FLOW-1");
    const cut = doc("cut.pdf", a.id, { size: 10 }), fine = doc("fine.pdf", a.id, { size: 3 });
    const { m, zip } = await run({ live: [{ project: a, items: [], docs: [cut, fine] }], trash: [], orgDocs: [] }, { [cut.id]: { bytes: new Uint8Array(6) } });
    expect(m.complete).toBe(false);
    expect(m.files.find((f) => f.id === cut.id)).toMatchObject({ status: "omitted", bytes: 10 });
    expect(m.files.find((f) => f.id === cut.id)!.reason).toBe("it arrived as 6 bytes but 1NEON records 10 bytes (cut short, or changed while the export ran)");
    expect(m.files.find((f) => f.id === fine.id)?.status).toBe("included");
    expect(await readmeTop(zip)).toBe("This export is partial: 1 file is not included (listed below and in manifest.json).");
    expect(zipName(org.slug, m.exportedAt, m.complete)).toMatch(/-partial\.zip$/);
    await agrees(m, zip);
  });

  it("is partial when a file arrives longer than its record", async () => {
    const a = project("FLOW-1");
    const grown = doc("grown.pdf", a.id, { size: 3 });
    const { m, zip } = await run({ live: [{ project: a, items: [], docs: [grown] }], trash: [], orgDocs: [] }, { [grown.id]: { bytes: new Uint8Array(8) } });
    expect(m.complete).toBe(false);
    expect(m.counts.files).toMatchObject({ included: 0, omitted: 1 });
    await agrees(m, zip);
  });

  it("takes an empty file recorded as empty as complete", async () => {
    const a = project("FLOW-1");
    const { m, zip } = await run({ live: [{ project: a, items: [], docs: [doc("empty.txt", a.id, { size: 0 })] }], trash: [], orgDocs: [] });
    expect(m.complete).toBe(true);
    await agrees(m, zip);
  });

  it("hashes the bytes written into the zip: every included file's checksum and size match its zip entry", async () => {
    const a = project("FLOW-1");
    const odd = doc("odd.bin", a.id, { size: 5 });
    const { m, zip } = await run({ live: [{ project: a, items: [], docs: [odd] }], trash: [], orgDocs: [] }, { [odd.id]: { bytes: Uint8Array.of(0, 255, 1, 254, 2) } });
    const f = m.files[0]!;
    const inZip = await zip.file(f.path)!.async("uint8array");
    expect([...inZip]).toEqual([0, 255, 1, 254, 2]);
    expect(f.sha256).toBe(await sha256(inZip));
    expect(f.bytes).toBe(inZip.byteLength);
    expect(m.counts.bytes.included).toBe(5);
  });
});
