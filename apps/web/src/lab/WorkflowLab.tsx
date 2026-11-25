// apps/web/src/lab/WorkflowLab.tsx - /1NEON/lab/workflows: clickable prototype of project workflows.
// Dev builds only. Made-up data, nothing saved, nothing sent


import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ThemeSwitch } from "../components/PublicBar.tsx";
import { Rings } from "../components/ui.tsx";
import { useDocumentScroll } from "../lib/edge.ts";
import { useSiteTheme } from "../lib/sitetheme.ts";
import { isDarkLook, isSentinel, lookFor } from "../lib/style.ts";
import { SEED, stateName, stepOf, type Project, type Side } from "./model.ts";
import { Bench } from "./Bench.tsx";
import { BoardView } from "./BoardView.tsx";
import { CustomEditor } from "./CustomEditor.tsx";
import { Path } from "./Path.tsx";
import { ProposalBuilder } from "./ProposalBuilder.tsx";
import { Start } from "./Start.tsx";
import "./lab.css";


const SCREENS = [
  { id: "start", name: "Start" },
  { id: "neon", name: "NEON" },
  { id: "bench", name: "Workbench" },
  { id: "proposal", name: "Proposal" },
  { id: "custom", name: "Custom" },
  { id: "board", name: "Board" },
] as const;
export type ScreenId = (typeof SCREENS)[number]["id"];


// What every screen shares: the projects, who is looking, and the way to another screen
export interface LabProps {
  projects: Project[];
  save: (p: Project) => void;
  as: Side;
  open: (screen: ScreenId, key?: string) => void;
  selected?: string;
}


export function WorkflowLab() {
  useDocumentScroll();
  const [look, setLook] = useSiteTheme();
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState(SEED);
  const [as, setAs] = useState<Side>("client");
  // The screen lives in the address, so Back works and each one can be linked
  const screen = SCREENS.find((s) => s.id === params.get("s"))?.id ?? "start";
  const selected = params.get("p") ?? undefined;
  const open = (s: ScreenId, key?: string) => setParams(key ? { s, p: key } : { s });
  // A new screen starts at its top
  useEffect(() => { window.scrollTo(0, 0); document.body.scrollTo(0, 0); }, [screen]);
  // The last move or archive, so it can be taken back
  const [moved, setMoved] = useState<{ said: string; before: Project }>();
  const put = (p: Project) => setProjects((list) => (list.some((x) => x.key === p.key) ? list.map((x) => (x.key === p.key ? p : x)) : [p, ...list]));
  const save = (p: Project) => {
    const before = projects.find((x) => x.key === p.key);
    if (before && p.archived && !before.archived) setMoved({ before, said: `${p.key} archived: ${p.archived}` });
    else if (before && (before.stepId !== p.stepId || before.workflow.id !== p.workflow.id)) setMoved({ before, said: `${p.key} moved to ${stateName(stepOf(p).state)} · ${stepOf(p).name}` });
    put(p);
  };
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(undefined), 8000);
    return () => clearTimeout(t);
  }, [moved]);
  const props: LabProps = { projects, save, as, open, selected };
  const sentinel = isSentinel(look);
  return (
    <div className="shell example lab">
      <header className="top">
        <a className="top-brand" href="/1NEON/" title="1NEON" aria-label="1NEON, entry page"><span className="mark-box" aria-hidden="true"><Rings /></span><span className="lbl">1NEON</span></a>
        <div className="crumb"><span className="crumb-tail">Workflow prototype</span></div>
        <span className="top-acts">
          <button type="button" className="chip" onClick={() => setLook(lookFor(sentinel ? "matrix" : "sentinel", isDarkLook(look)))}>{sentinel ? "Sentinel" : "Matrix"}</button>
          <ThemeSwitch theme={look} onChange={setLook} />
        </span>
      </header>
      <main className="content lab-body" id="main">
        <nav className="tabs lab-tabs" aria-label="Prototype screens">
          {SCREENS.map((s) => (
            <button key={s.id} type="button" className={screen === s.id ? "active" : ""} aria-current={screen === s.id ? "page" : undefined} onClick={() => open(s.id)}>{s.name}</button>
          ))}
        </nav>
        <div className="lab-bar">
          <span className="eyebrow">Made-up data</span>
          <span className="lab-as" role="group" aria-label="View as">
            {(["client", "neon1"] as const).map((x) => (
              <button key={x} type="button" className={`chip${as === x ? " on" : ""}`} aria-pressed={as === x} onClick={() => setAs(x)}>{x === "client" ? "Client" : "neon1"}</button>
            ))}
          </span>
        </div>
        {screen === "start" && <Start {...props} />}
        {screen === "neon" && <Path {...props} />}
        {screen === "bench" && <Bench {...props} />}
        {screen === "proposal" && <ProposalBuilder {...props} />}
        {screen === "custom" && <CustomEditor {...props} />}
        {screen === "board" && <BoardView {...props} />}
      </main>
      <div role="status" aria-live="polite">
        {moved && (
          <div className="moved">
            <span>{moved.said}</span>
            {/* Undo moves the card back. A signature or issued revision stays on record */}
            <button type="button" className="linkish" onClick={() => { put({ ...moved.before, ticked: projects.find((x) => x.key === moved.before.key)?.ticked, approved: projects.find((x) => x.key === moved.before.key)?.approved ?? moved.before.approved }); setMoved(undefined); }}>Undo</button>
          </div>
        )}
      </div>
    </div>
  );
}
