// apps/web/src/lib/pagesync.ts - Keeps one page's Yjs document in step with the API. Local edits queue
// as Yjs updates and go out a moment after typing stops; every couple of seconds (while the tab is
// visible) the page asks for what others wrote. A failed send keeps its updates for the next try, so
// nothing typed is lost to a dropped connection. The server merges (routes/pages.ts).


import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { api, HttpError } from "./api.ts";
import { problem } from "./hooks.ts";


// How often an open page asks for others' changes, and how long after a keystroke it sends
const POLL_MS = 2_000;
const SEND_MS = 500;
// Updates this page applied from the server, so they aren't sent back
const REMOTE = Symbol("remote");

const enc = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const dec = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));


/** Someone else with the page open */
export interface Here {
  id: string;
  name: string;
}

/** A page as the API lists it */
export interface PageMeta {
  id: string;
  projectId?: string;
  title: string;
  preview: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}


/**
 * One page's live document. `path` is the page's API path; `text` gives the plain copy sent with
 * changes. Returns the Y.Doc (for the editor), whether it loaded, who else is here, and a problem
 * worth showing (a failed send keeps retrying underneath)
 */
export function usePageSync(path: string, text: () => string) {
  const doc = useMemo(() => new Y.Doc(), [path]);
  const [ready, setReady] = useState(false);
  const [here, setHere] = useState<Here[]>([]);
  const [trouble, setTrouble] = useState<string>();
  const [meta, setMeta] = useState<PageMeta>();
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    let alive = true;
    let pending: Uint8Array[] = [];
    let busy = false;
    let again = false;
    let sendTimer: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    setTrouble(undefined);

    // The plain copy; a page that can't give one still sends its changes
    const plain = () => { try { return textRef.current().slice(0, 40_000); } catch { return undefined; } };

    // One round trip: send what's queued with this copy's state, apply what comes back
    async function sync() {
      if (busy) { again = true; return; }
      busy = true;
      const out = pending;
      pending = [];
      try {
        const r = await api<{ update: string; here: Here[] }>(`${path}/sync`, {
          method: "POST",
          body: { update: out.length ? enc(Y.mergeUpdates(out)) : undefined, vector: enc(Y.encodeStateVector(doc)), text: out.length ? plain() : undefined },
        });
        Y.applyUpdate(doc, dec(r.update), REMOTE);
        if (alive) { setHere(r.here); setTrouble(undefined); }
      } catch (e) {
        // Keep the unsent changes in front of anything typed meanwhile
        pending = [...out, ...pending];
        if (alive) setTrouble(e instanceof HttpError ? problem(e) : "Can't reach 1NEON. Your changes are kept and will be sent.");
      } finally {
        busy = false;
        if (again && alive) { again = false; void sync(); }
      }
    }

    // Local edits queue and go out shortly after typing stops
    const onUpdate = (u: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      pending.push(u);
      clearTimeout(sendTimer);
      sendTimer = setTimeout(() => void sync(), SEND_MS);
    };

    // Load, then start listening and polling
    void (async () => {
      try {
        const x = await api<PageMeta & { state: string; here: Here[] }>(path);
        if (!alive) return;
        if (x.state) Y.applyUpdate(doc, dec(x.state), REMOTE);
        setMeta(x);
        setHere(x.here);
        doc.on("update", onUpdate);
        setReady(true);
      } catch (e) {
        if (alive) setTrouble(e instanceof HttpError ? problem(e) : "Can't reach 1NEON.");
      }
    })();
    const poll = setInterval(() => { if (!document.hidden && alive) void sync(); }, POLL_MS);
    const back = () => { if (!document.hidden && alive) void sync(); };
    document.addEventListener("visibilitychange", back);
    // Leaving with changes still queued: send them now
    const flush = () => { if (pending.length) void sync(); };
    window.addEventListener("pagehide", flush);

    return () => {
      alive = false;
      flush();
      clearInterval(poll);
      clearTimeout(sendTimer);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pagehide", flush);
      doc.off("update", onUpdate);
    };
  }, [doc, path]);

  return { doc, ready, here, trouble, meta };
}
