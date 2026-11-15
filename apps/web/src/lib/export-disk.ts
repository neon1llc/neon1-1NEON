// apps/web/src/lib/export-disk.ts - Where a large export is built: the browser's private file storage
// for this site (OPFS), in one folder, "1neon-export", listed in the cookie notice. Each export works
// in its own subfolder there, so two tabs exporting at once never touch each other's files. A subfolder
// only lives while it's needed: it's removed after the hand-off to Downloads (30 minutes at most, while
// the tab is open), when an export fails or is cancelled, and, as a stale leftover from a closed tab or
// a crash, when the next export starts or Settings opens. An export in any tab holds a Web Lock on its
// subfolder's name, which is how a leftover is told from one still in use. No api.ts import, so tests
// drive it with a fake folder.


/** The one folder the export writes in, as the cookie notice names it */
export const EXPORT_FOLDER = "1neon-export";

/** How long a finished zip stays after the hand-off: long enough for the browser to copy a large file
 * to Downloads. The cookie notice states this limit */
export const KEEP_MS = 30 * 60_000;

/** The parts of a folder handle the export uses (a real FileSystemDirectoryHandle, or a test's fake) */
export type Folder = Pick<FileSystemDirectoryHandle, "getDirectoryHandle" | "removeEntry" | "getFileHandle"> & { readonly name?: string; keys?: () => AsyncIterable<string> };

/** Where a leftover is judged by age alone: in a browser without Web Locks nothing says an old export
 * is still running, so only one this old counts as dead */
export const STALE_MS = 24 * 60 * 60_000;

const LOCK = "1neon-export:";


// --- Opening and clearing ---------------------------------------------------------------------

/** This site's private file storage, or undefined where the browser can't write there as a stream
 * (older Safari and iOS, some private windows), which sends the export to memory instead */
export async function privateRoot(): Promise<Folder | undefined> {
  try {
    if (!navigator.storage?.getDirectory || typeof FileSystemFileHandle === "undefined" || !("createWritable" in FileSystemFileHandle.prototype)) return undefined;
    return await navigator.storage.getDirectory();
  } catch {
    return undefined;
  }
}

/** Exports this tab owns, by subfolder name: "building" until the zip is written, "handed" after the
 * hand-off until its timer removes it. A stale clear leaves both alone */
const mine = new Map<string, "building" | "handed">();
/** Ends the Web Lock held on a subfolder's name */
const unlock = new Map<string, () => void>();

/** Take a lock on an export's name for as long as it lives (none where Web Locks aren't there) */
async function lockName(name: string): Promise<void> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return;
  await new Promise<void>((held) => {
    void locks.request(LOCK + name, () => new Promise<void>((end) => (unlock.set(name, end), held()))).catch(held);
  });
}

/** True when an export in some tab still holds this name (or, with no Web Locks, started recently) */
async function inUse(name: string): Promise<boolean> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks) return !(await locks.request(LOCK + name, { ifAvailable: true }, (l) => l !== null));
  const started = parseInt(name, 36);
  return !Number.isFinite(started) || Date.now() - started < STALE_MS;
}

/** Remove one export's subfolder and release its name; gone already is fine */
async function remove(root: Folder, name: string): Promise<void> {
  mine.delete(name);
  try {
    const top = await root.getDirectoryHandle(EXPORT_FOLDER);
    await top.removeEntry(name, { recursive: true });
  } catch {
    // Already gone, or the browser refused: either way there's nothing more to do
  }
  unlock.get(name)?.();
  unlock.delete(name);
}

/** Remove every subfolder (or loose file) nobody is using: what a closed tab or a crash left behind.
 * Another tab's running export holds its lock, and this tab's own are in `mine`, so neither is touched */
export async function clearStaleExports(root?: Folder): Promise<void> {
  try {
    const r = root ?? (await privateRoot());
    if (!r) return;
    const top = await r.getDirectoryHandle(EXPORT_FOLDER);
    // keys() is on every real handle; the lib's types just don't list it
    const names: string[] = [];
    for await (const n of (top as Folder).keys?.() ?? []) names.push(n);
    for (const n of names) if (!mine.has(n) && !(await inUse(n))) await top.removeEntry(n, { recursive: true }).catch(() => undefined);
  } catch {
    // No export folder yet, or the browser refused: nothing to clear
  }
}

/** A fresh, empty subfolder for this export (leftovers cleared first), or undefined if the browser refuses */
export async function exportFolder(root: Folder): Promise<Folder | undefined> {
  await clearStaleExports(root);
  // Unique per export, and time first so a leftover's age can be read off its name; the name is locked
  // before the folder exists, so no other tab can find it unlocked
  const name = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  await lockName(name);
  try {
    const folder = await (await root.getDirectoryHandle(EXPORT_FOLDER, { create: true })).getDirectoryHandle(name, { create: true });
    mine.set(name, "building");
    return folder;
  } catch {
    unlock.get(name)?.();
    unlock.delete(name);
    return undefined;
  }
}

/** Done with the folder without a hand-off (failed, cancelled, or built in memory): remove it now */
export async function release(root: Folder, folder?: Folder): Promise<void> {
  if (folder?.name) await remove(root, folder.name);
}


// --- Writing and the hand-off -----------------------------------------------------------------

/**
 * Write the zip as it's built, and return it as a file backed by disk (not memory). On any failure the
 * folder is removed before the error goes on, so nothing half-written stays behind
 */
export async function writeZip(root: Folder, folder: Folder, zip: ReadableStream<Uint8Array>): Promise<File> {
  try {
    const handle = await folder.getFileHandle(`export-${Date.now()}.zip`, { create: true });
    // The file only takes its content when the last byte is in and the stream closes
    await zip.pipeTo(await handle.createWritable());
    const file = await handle.getFile();
    if (folder.name) mine.set(folder.name, "handed");
    return file;
  } catch (e) {
    await release(root, folder);
    throw e;
  }
}

/** After the hand-off: remove this export's folder once the browser has had time to copy the file */
export function clearAfterHandOff(root: Folder, folder: Folder, wait: (run: () => void, ms: number) => unknown = setTimeout): void {
  const name = folder.name;
  if (name) wait(() => void remove(root, name), KEEP_MS);
}
