// apps/web/src/lib/export-disk.test.ts - Each export works in its own subfolder of the browser's
// private storage, which only lives while it's needed: removed after the hand-off (not before), on a
// failed write, and as a stale leftover, but never while an export is being built, in this tab or in
// another. Two tabs exporting at once never touch each other's files. A fake folder, and fake Web Locks
// shared by fake tabs (each tab is its own copy of the module, with its own state).


import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Disk from "./export-disk.ts";


// --- A folder handle in memory ------------------------------------------------------------------

class FakeFile {
  data = new Uint8Array();
  constructor(readonly name: string) {}
  async createWritable() {
    const parts: Uint8Array[] = [];
    // Like the real one, the file only takes its content on close
    return new WritableStream<Uint8Array>({ write: (c) => void parts.push(c), close: () => void (this.data = new Uint8Array(parts.flatMap((p) => [...p]))) });
  }
  async getFile() {
    return new File([this.data], this.name);
  }
}

class FakeDir {
  entries = new Map<string, FakeDir | FakeFile>();
  constructor(readonly name = "") {}
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    if (!this.entries.has(name) && o?.create) this.entries.set(name, new FakeDir(name));
    const d = this.entries.get(name);
    if (!(d instanceof FakeDir)) throw new DOMException("missing", "NotFoundError");
    return d;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    if (!this.entries.has(name) && o?.create) this.entries.set(name, new FakeFile(name));
    return this.entries.get(name) as FakeFile;
  }
  async removeEntry(name: string) {
    if (!this.entries.delete(name)) throw new DOMException("missing", "NotFoundError");
  }
  async *keys() {
    yield* [...this.entries.keys()];
  }
}

/** Web Locks shared by every fake tab: a name is held until its holder lets go or its tab closes */
const held = new Map<string, { tab: string; end: () => void }>();
let tab = "A";
// Like the real ones, a lock lasts as long as its callback's promise
const locks = {
  request(name: string, a: unknown, b?: unknown) {
    const ifAvailable = typeof a !== "function" && (a as { ifAvailable?: boolean }).ifAvailable;
    const cb = (typeof a === "function" ? a : b) as (lock: object | null) => unknown;
    if (held.has(name)) return Promise.resolve(ifAvailable ? cb(null) : undefined);
    let free!: () => void;
    const entry = { tab, end: () => free() };
    held.set(name, entry);
    const result = Promise.resolve(cb({}));
    const done = new Promise<void>((r) => (free = r));
    // Released when the callback's promise settles, or when the tab closes
    void Promise.race([result.then(() => undefined, () => undefined), done]).then(() => held.get(name) === entry && held.delete(name));
    return result;
  },
};
/** The tab closing: every lock it held goes */
const closeTab = (t: string) => {
  for (const [n, h] of [...held]) if (h.tab === t) (held.delete(n), h.end());
};

const bytes = (...chunks: number[][]) => new ReadableStream<Uint8Array>({
  start(c) {
    for (const x of chunks) c.enqueue(new Uint8Array(x));
    c.close();
  },
});

const asFolder = (d: FakeDir) => d as unknown as Disk.Folder;
const dir = (d: FakeDir) => d as unknown as FakeDir;

let disk: typeof Disk;
let root: FakeDir;
/** The export folder's subfolders, as names */
const runs = () => [...(root.entries.get("1neon-export") as FakeDir | undefined)?.entries.keys() ?? []];
/** A new tab: its own copy of the module (own state), sharing the root and the locks */
async function openTab(name: string) {
  tab = name;
  vi.resetModules();
  return await import("./export-disk.ts");
}

// Fresh module state (this tab's exports) and no locks held, for each test
beforeEach(async () => {
  held.clear();
  vi.stubGlobal("navigator", { locks });
  disk = await openTab("A");
  root = new FakeDir();
});
afterEach(() => vi.unstubAllGlobals());


describe("export folder", () => {
  it("clears a leftover before an export and writes the zip to disk", async () => {
    // A leftover from a tab that closed: nobody holds its lock
    const top = await root.getDirectoryHandle(disk.EXPORT_FOLDER, { create: true });
    await (await top.getDirectoryHandle("old-run", { create: true })).getFileHandle("export-1.zip", { create: true });
    await top.getFileHandle("export-0.zip", { create: true });
    const folder = (await disk.exportFolder(asFolder(root)))!;
    expect(runs()).toEqual([folder.name]);
    expect(dir(folder as never).entries.size).toBe(0);
    const file = await disk.writeZip(asFolder(root), folder, bytes([1, 2], [3]));
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("removes the folder after the hand-off, not before", async () => {
    const folder = (await disk.exportFolder(asFolder(root)))!;
    await disk.writeZip(asFolder(root), folder, bytes([1]));
    let later: (() => void) | undefined, ms = 0;
    disk.clearAfterHandOff(asFolder(root), folder, (run, wait) => ((later = run), (ms = wait)));
    expect(ms).toBe(disk.KEEP_MS);
    expect(runs()).toEqual([folder.name]);
    later!();
    await new Promise((r) => setTimeout(r));
    expect(runs()).toEqual([]);
  });

  it("removes the folder when the write fails, and passes the error on", async () => {
    const folder = (await disk.exportFolder(asFolder(root)))!;
    const broken = new ReadableStream<Uint8Array>({ pull: (c) => c.error(new Error("disk full")) });
    await expect(disk.writeZip(asFolder(root), folder, broken)).rejects.toThrow("disk full");
    expect(runs()).toEqual([]);
  });

  it("removes it on release (cancelled, or built in memory instead), and releasing again is fine", async () => {
    const folder = (await disk.exportFolder(asFolder(root)))!;
    await disk.release(asFolder(root), folder);
    expect(runs()).toEqual([]);
    await expect(disk.release(asFolder(root), folder)).resolves.toBeUndefined();
    // No folder was ever made: nothing to release
    await expect(disk.release(asFolder(root))).resolves.toBeUndefined();
  });

  it("never lets an earlier export's timer remove a later export's zip", async () => {
    const first = (await disk.exportFolder(asFolder(root)))!;
    await disk.writeZip(asFolder(root), first, bytes([1]));
    let timer: (() => void) | undefined;
    disk.clearAfterHandOff(asFolder(root), first, (run) => (timer = run));
    const second = (await disk.exportFolder(asFolder(root)))!;
    timer!();
    await new Promise((r) => setTimeout(r));
    expect(runs()).toEqual([second.name]);
  });
});


describe("stale leftovers", () => {
  it("are removed when Settings opens", async () => {
    const top = await root.getDirectoryHandle(disk.EXPORT_FOLDER, { create: true });
    await top.getDirectoryHandle("old-run", { create: true });
    await disk.clearStaleExports(asFolder(root));
    expect(runs()).toEqual([]);
    // No export folder at all is fine too
    await expect(disk.clearStaleExports(asFolder(new FakeDir()))).resolves.toBeUndefined();
  });

  it("are left alone while this tab is building an export", async () => {
    const folder = (await disk.exportFolder(asFolder(root)))!;
    await disk.clearStaleExports(asFolder(root));
    expect(runs()).toEqual([folder.name]);
  });

  it("leave a handed-off zip to its own timer, which removes it", async () => {
    const folder = (await disk.exportFolder(asFolder(root)))!;
    await disk.writeZip(asFolder(root), folder, bytes([1]));
    let timer: (() => void) | undefined;
    disk.clearAfterHandOff(asFolder(root), folder, (run) => (timer = run));
    await disk.clearStaleExports(asFolder(root));
    expect(runs()).toEqual([folder.name]);
    timer!();
    await new Promise((r) => setTimeout(r));
    expect(runs()).toEqual([]);
  });
});


describe("two tabs at once", () => {
  it("each build in their own folder, and both zips come out whole", async () => {
    const a = (await disk.exportFolder(asFolder(root)))!;
    const diskB = await openTab("B");
    const b = (await diskB.exportFolder(asFolder(root)))!;
    // B starting did not clear A's folder, and the names differ
    expect(runs().sort()).toEqual([a.name, b.name].sort());
    expect(a.name).not.toBe(b.name);
    // Written at the same moment, even in the same millisecond
    const [fa, fb] = await Promise.all([disk.writeZip(asFolder(root), a, bytes([1, 1], [1])), diskB.writeZip(asFolder(root), b, bytes([2, 2], [2]))]);
    expect([...new Uint8Array(await fa.arrayBuffer())]).toEqual([1, 1, 1]);
    expect([...new Uint8Array(await fb.arrayBuffer())]).toEqual([2, 2, 2]);
    // One finishing (or failing) removes only its own
    await diskB.release(asFolder(root), b);
    expect(runs()).toEqual([a.name]);
  });

  it("another tab's Settings opening does not remove an export running here, or a zip waiting to be saved", async () => {
    const a = (await disk.exportFolder(asFolder(root)))!;
    const handed = (await disk.exportFolder(asFolder(root)))!;
    await disk.writeZip(asFolder(root), handed, bytes([9]));
    const diskB = await openTab("B");
    await diskB.clearStaleExports(asFolder(root));
    await (await diskB.exportFolder(asFolder(root)))!;
    expect(runs()).toEqual(expect.arrayContaining([a.name, handed.name]));
    expect(runs()).toHaveLength(3);
  });

  it("a tab that died mid-export leaves a folder the next export (here, in another tab) removes", async () => {
    const dead = (await disk.exportFolder(asFolder(root)))!;
    const live = (await disk.exportFolder(asFolder(root)))!;
    await (await dead.getFileHandle("export-1.zip", { create: true })).createWritable(); // half-written
    // Tab A closes: the page is gone, its locks go with it, nothing ran its cleanup
    closeTab("A");
    const diskB = await openTab("B");
    const mineB = (await diskB.exportFolder(asFolder(root)))!;
    expect(runs()).toEqual([mineB.name]);
    void live;
  });

  it("a crashed tab's leftover is removed when Settings opens, while a running tab's export stays", async () => {
    const dead = (await disk.exportFolder(asFolder(root)))!;
    const diskB = await openTab("B");
    const running = (await diskB.exportFolder(asFolder(root)))!;
    closeTab("A");
    const diskC = await openTab("C");
    await diskC.clearStaleExports(asFolder(root));
    expect(runs()).toEqual([running.name]);
    expect(runs()).not.toContain(dead.name);
  });

  it("without Web Locks, a recent folder is kept (it may be running) and one over a day old is removed", async () => {
    vi.stubGlobal("navigator", {});
    const diskB = await openTab("B");
    const top = await root.getDirectoryHandle(diskB.EXPORT_FOLDER, { create: true });
    const recent = `${Date.now().toString(36)}-x`;
    const old = `${(Date.now() - diskB.STALE_MS - 1000).toString(36)}-y`;
    await top.getDirectoryHandle(recent, { create: true });
    await top.getDirectoryHandle(old, { create: true });
    await diskB.clearStaleExports(asFolder(root));
    expect(runs()).toEqual([recent]);
  });
});
