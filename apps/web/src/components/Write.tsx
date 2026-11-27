// apps/web/src/components/Write.tsx - Pages, from anywhere: the pen in the top bar opens a sheet with
// the pages of the project in view (its own page first) and the organization's, and a new one is a
// name away. A page opens in the same sheet, wide on a desktop and full screen on a phone. Pages also
// list in Files, can be downloaded as Markdown, and can be saved into Files as a copy. Placement
// follows the item panel (Linear, Plane): the work stays behind, one tap away.


import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FilePlus2, FileUp, Maximize2, Minimize2, PenLine, Trash2, X } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { api } from "../lib/api.ts";
import { problem, useProjects } from "../lib/hooks.ts";
import type { PageMeta } from "../lib/pagesync.ts";
import { read } from "../lib/reads.ts";
import { uploadFiles } from "./Files.tsx";
import { PageEditor, toMarkdown } from "./PageEditor.tsx";
import { gate } from "./Reads.tsx";
import { ago, Dialog, useAsk, useToast } from "./ui.tsx";


/** Which page is open: a project's (or the organization's, without one) */
interface Open {
  pid?: string;
  id: string;
}

const WriteCtx = createContext<{ open: (x?: Open) => void }>({ open: () => {} });
/** Open the Pages sheet, on a page or on the list */
export const useWrite = () => useContext(WriteCtx);

/** API path for a scope's pages */
export const pagesPath = (tid: string, pid?: string) => (pid ? `/t/${tid}/projects/${pid}/pages` : `/t/${tid}/pages`);

/** A file-safe name for a page */
const fileName = (title: string) => `${title.replace(/[^\w .-]+/g, "").trim() || "Page"}.md`;


/** One scope's pages as rows; the project's own page always shows, even before anyone writes in it */
function Rows({ tid, pid, onOpen, mainFirst }: { tid: string; pid?: string; onOpen: (x: Open) => void; mainFirst?: boolean }) {
  const q = useQuery({ queryKey: ["pages", tid, pid ?? "_"], queryFn: () => read<PageMeta[]>(pagesPath(tid, pid), "array") });
  const wait = gate([q]);
  if (wait) return wait;
  const list = q.data ?? [];
  const main = list.find((x) => x.id === "main");
  const rest = list.filter((x) => x.id !== "main");
  const row = (x: Pick<PageMeta, "id" | "title" | "preview"> & { updatedAt?: string }) => (
    <li key={x.id}>
      <button type="button" className="page-row" onClick={() => onOpen({ pid, id: x.id })}>
        <b>{x.title}</b>
        <span className="helper">{x.preview || "Empty"}{x.updatedAt ? ` · ${ago(x.updatedAt)}` : ""}</span>
      </button>
    </li>
  );
  return (
    <ul className="page-rows">
      {mainFirst && row(main ?? { id: "main", title: "Project page", preview: "" })}
      {rest.map(row)}
      {!mainFirst && !rest.length && <li className="helper">No pages yet.</li>}
    </ul>
  );
}


/** A new page in a scope, named first */
function NewPage({ tid, pid, onMade }: { tid: string; pid?: string; onMade: (x: Open) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  async function make() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const x = await api<PageMeta>(pagesPath(tid, pid), { method: "POST", body: { title: name.trim() } });
      void qc.invalidateQueries({ queryKey: ["pages", tid] });
      setName("");
      onMade({ pid, id: x.id });
    } catch (e) {
      toast(problem(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="page-new" onSubmit={(e) => { e.preventDefault(); void make(); }}>
      <input aria-label="New page name" placeholder="New page name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn-ghost" disabled={!name.trim() || busy}><FilePlus2 size={16} aria-hidden="true" /> Start</button>
    </form>
  );
}


/** The open page: its name (editable), who's here, and download, save to Files, delete */
function OpenPage({ tid, at, canWrite, onBack }: { tid: string; at: Open; canWrite: boolean; onBack: () => void }) {
  const path = `${pagesPath(tid, at.pid)}/${at.id}`;
  const qc = useQueryClient();
  const toast = useToast();
  const ask = useAsk();
  const [title, setTitle] = useState<string>();
  async function rename(next: string, was: string) {
    if (!next.trim() || next.trim() === was) return setTitle(undefined);
    try {
      await api(path, { method: "PATCH", body: { title: next.trim() } });
      void qc.invalidateQueries({ queryKey: ["pages", tid] });
    } catch (e) {
      toast(problem(e));
      setTitle(undefined);
    }
  }
  async function remove(name: string) {
    if (!(await ask({ title: `Delete "${name}"?`, body: "It's removed for everyone in the organization.", yes: "Delete", danger: true }))) return;
    try {
      await api(path, { method: "DELETE" });
      void qc.invalidateQueries({ queryKey: ["pages", tid] });
      onBack();
    } catch (e) {
      toast(problem(e));
    }
  }
  return (
    <PageEditor
      key={path}
      path={path}
      canEdit={canWrite}
      head={({ editor, meta, here }) => {
        const name = meta?.title ?? "";
        const md = () => (editor ? toMarkdown(editor.getJSON()) : "");
        const download = () => {
          const url = URL.createObjectURL(new Blob([md()], { type: "text/markdown" }));
          const a = Object.assign(document.createElement("a"), { href: url, download: fileName(name) });
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        // A copy into Files, filed with the page's project; the page itself keeps changing
        const save = async () => {
          const [job] = await uploadFiles(tid, [{ file: new File([md()], fileName(name), { type: "text/markdown" }) }], { projectId: at.pid });
          toast(job?.error ? `Not saved to Files: ${job.error}` : `Saved "${fileName(name)}" to Files`);
          void qc.invalidateQueries({ queryKey: ["project", tid] });
        };
        return (
          <div className="page-head">
            <button type="button" className="icon-act" onClick={onBack} aria-label="All pages" title="All pages"><ArrowLeft size={18} aria-hidden="true" /></button>
            {canWrite && at.id !== "main"
              ? <input className="page-title" aria-label="Page name" value={title ?? name} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={(e) => void rename(e.target.value, name)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              : <h2 className="page-title">{name || "Page"}</h2>}
            {here}
            <button type="button" className="icon-act" onClick={download} disabled={!editor} aria-label="Download as Markdown" title="Download as Markdown"><Download size={16} aria-hidden="true" /></button>
            {canWrite && <button type="button" className="icon-act" onClick={() => void save()} disabled={!editor} aria-label="Save a copy to Files" title="Save a copy to Files"><FileUp size={16} aria-hidden="true" /></button>}
            {canWrite && at.id !== "main" && <button type="button" className="icon-act del" onClick={() => void remove(name)} aria-label="Delete page" title="Delete page"><Trash2 size={16} aria-hidden="true" /></button>}
          </div>
        );
      }}
    />
  );
}


/** The organization's slug and ID, and whether the caller writes; the sheet needs no more */
export interface WriteOrg {
  id: string;
  name: string;
  canWrite: boolean;
}


/** Provides `useWrite()` and renders the top bar's pen and the sheet */
export function WriteProvider({ org, children }: { org?: WriteOrg; children: (pen: ReactNode) => ReactNode }) {
  const [shown, setShown] = useState(false);
  const [at, setAt] = useState<Open>();
  const [wide, setWide] = useState(false);
  const loc = useLocation();
  const projects = useProjects(org?.id ?? "");
  // The project in view, from the address (/o/:slug/projects/:key/...)
  const key = /\/projects\/([^/]+)/.exec(loc.pathname)?.[1];
  const project = key ? projects.data?.find((p) => p.key === key) : undefined;
  const qc = useQueryClient();
  // Lists read fresh each time they show, so previews carry what was just written
  const list = () => { setAt(undefined); void qc.invalidateQueries({ queryKey: ["pages", org?.id] }); };
  const open = (x?: Open) => { setAt(x); setShown(true); };
  const pen = org ? <button className="icon-btn" onClick={() => open()} aria-label="Pages" title="Pages"><PenLine size={18} aria-hidden="true" /></button> : null;
  return (
    <WriteCtx.Provider value={{ open }}>
      {children(pen)}
      {org && (
        <Dialog open={shown} onClose={() => { setShown(false); list(); }} label="Pages" className={`sheet write-sheet${wide || at ? " wide" : ""}${wide ? " full" : ""}`}>
          <div className="panel-head">
            <p className="eyebrow">Pages</p>
            <span>
              {at && <button className="icon-act hide-sm" onClick={() => setWide(!wide)} aria-label={wide ? "Narrower" : "Full width"} title={wide ? "Narrower" : "Full width"}>{wide ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}</button>}
              <button className="icon-act" onClick={() => setShown(false)} aria-label="Close"><X size={18} aria-hidden="true" /></button>
            </span>
          </div>
          {at ? (
            <OpenPage tid={org.id} at={at} canWrite={org.canWrite} onBack={list} />
          ) : (
            <>
              {project && (
                <section aria-labelledby="pages-project">
                  <h3 className="section-h" id="pages-project">{project.key} · {project.name}</h3>
                  <Rows tid={org.id} pid={project.id} onOpen={setAt} mainFirst />
                  {org.canWrite && <NewPage tid={org.id} pid={project.id} onMade={setAt} />}
                </section>
              )}
              <section aria-labelledby="pages-org">
                <h3 className="section-h" id="pages-org">{org.name}</h3>
                <Rows tid={org.id} onOpen={setAt} />
                {org.canWrite && <NewPage tid={org.id} onMade={setAt} />}
              </section>
            </>
          )}
        </Dialog>
      )}
    </WriteCtx.Provider>
  );
}
