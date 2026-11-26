// apps/web/src/pages/Workspace.tsx - Home inside an organization: the greeting with the View menu, and
// the cards on an arrangeable grid. Cards: what needs you, overdue and blocked work, the calendar, every
// project at a glance, projects by layer, the headline numbers, shortcuts, who's away this week, project
// updates, recent activity, and the setup and suggestion cards until they're done or put away. Each card
// has its own preset sizes and shows more as it grows (components/HomeGrid.tsx).


import { GuideCard, KeepCard, NextStep, ProspectNote } from "../components/Prospect.tsx";
import { KIND_LAYER, Layer, type ItemKind } from "@1neon/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleCheck, FilePlus2, FileUp, FolderPlus, ListTodo, MessageSquare, PenLine, Receipt, UserPlus } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";
import { LinksCard, wantsLinks } from "../components/LinksCard.tsx";
import { ComingUp } from "../components/ComingUp.tsx";
import { Problem, Stale } from "../components/Reads.tsx";
import { useHelp } from "../components/Help.tsx";
import { useOrg, useSession, useTopBar } from "../components/Shell.tsx";
import { ago, Changes, dateLabel, Health, LayerBadge, layerName, layerSlug, useToast } from "../components/ui.tsx";
import type { Project } from "@1neon/domain";
type HealthT = Project["health"];
import { api } from "../lib/api.ts";
import { problem, qk } from "../lib/hooks.ts";
import { noun } from "../lib/plural.ts";
import { failureOf, hidesData, read } from "../lib/reads.ts";
import type { Me, Workspace } from "../lib/types.ts";
import { FaceForm, faceAskDismissed, setFaceAsk } from "../components/OrgFace.tsx";
import { HomeGrid, type Tile } from "../components/HomeGrid.tsx";
import { HomeViews, type Group, type ViewRow } from "../components/HomeViews.tsx";
import { useHomeLayout } from "../lib/homeLayout.ts";
import { reconcile, sizeAt, COLS, type Breakpoint, type Size } from "../lib/homeGrid.ts";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";


// The words and icon for each kind of thing waiting on someone
const ACTION = {
  pay: { label: "See and pay", icon: Receipt },
  issue: { label: "Check it", icon: Receipt },
  choose: { label: "Compare options", icon: CircleCheck },
  accept: { label: "Review and accept", icon: PenLine },
  upload: { label: "Upload file", icon: FileUp },
  do: { label: "Open", icon: ListTodo },
} as const;

// Preset sizes on the wide grid (12 columns, rows of 24px). Heights are written in steps of 40px rows and
// scaled to the 24px grid: S small, M medium, T tall,
// L large, W wide, B a bar across the page. The first is the card's default
const sz = (key: string, w: number, h: number): Size => ({ key, w, h: Math.round(h * 1.4) });
type Keep = { free: boolean; held?: boolean; deleteOn?: string };

/** One card Home can show: what it is, where it groups in the View menu, what a hidden one holds */
interface Card extends Tile {
  group: Group;
  when: boolean;
  critical?: number;
  suggested?: number;
  // A card put away somewhere of its own (the profile, or this browser) says whether it shows and how to toggle
  shown?: boolean;
  toggle?: (show: boolean) => void;
}


// The organization's home
export function WorkspacePage() {
  const { org, summary, canWrite, canAdmin: admin, prospect } = useOrg();
  // Inviting and admin steps wait until neon1 and a new account are working together
  const canAdmin = admin && !prospect;
  const me = useSession();
  const help = useHelp();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/o/${summary.slug}`;
  // ?needs=all is the View all list: every waiting action (bounded by the API), not just the preview
  const [params] = useSearchParams();
  const showAll = params.get("needs") === "all";
  // Counts, waiting items, and activity in one call, refreshed every 30 seconds
  const ws = useQuery({ queryKey: [...qk.workspace(org.id), showAll ? "all" : "preview"], queryFn: () => read<Workspace>(`/t/${org.id}/workspace${showAll ? "?waiting=all" : ""}`, { counts: "object", waiting: "array", activity: "array" }), refetchInterval: 30_000 });
  // The same reads Next step and the account card make (shared cache), so Home knows whether they have anything to show
  const asked = useQuery({ queryKey: ["requests", org.id], queryFn: () => read<{ projects: { decided?: boolean }[]; assessment?: { sentAt?: string } }>(`/t/${org.id}/requests`, { projects: "array" }), enabled: canWrite && !me.operator });
  const keep = useQuery({ queryKey: ["keep", org.id], queryFn: () => read<Keep>(`/t/${org.id}/keep`, {}), enabled: prospect && !me.operator });
  useTopBar(<span>{org.name}</span>, [org.name]);
  const c = ws.data?.counts;
  const first = (me.user.name || "").split(" ")[0];
  // Home's "Where can I see your business?" ask, until it's answered or put away
  const [faceSkipped, setFaceSkipped] = useState(() => faceAskDismissed(org.id));
  const { layout, change } = useHomeLayout(me, org.id);
  const [arranging, setArranging] = useState(false);
  // The grid's width decides its columns: 12 with room, 4 on a phone or a narrow window
  const wrap = useRef<HTMLDivElement>(null);
  const [bp, setBp] = useState<Breakpoint>("wide");
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBp((e?.contentRect.width ?? 0) >= 720 ? "wide" : "narrow"));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Setup steps, each ticked off by the real state; the card goes once all are done
  const steps = [
    { done: me.user.tour === "done", label: "Take the 1-minute tour", act: <button className="link" onClick={help.welcomeTour}>Start</button> },
    ...(canWrite ? [{ done: (c?.projects ?? 0) > 0, label: "Start your first project", act: <Link to={`${base}/projects/new`}>Start</Link> }] : []),
    ...(canAdmin ? [{ done: (c?.people ?? 0) > 1, label: "Invite your team", act: <Link to={`${base}/people`}>Invite</Link> }] : []),
    ...(canAdmin ? [{ done: Boolean(me.factors?.any), label: "Add a second step for admin actions", act: <Link to="/me#security">Add</Link> }] : []),
  ];
  const setupLeft = steps.filter((s) => !s.done).length;
  // The true count of waiting actions; the list may be a preview of it (older APIs sent no total)
  const n = ws.data?.waitingTotal ?? ws.data?.waiting.length ?? 0;
  const shown = ws.data?.waiting.length ?? 0;
  const glance = ws.data?.glance ?? [];
  const late = glance.filter((g) => g.overdue > 0 || g.blocked > 0);
  const lateCount = late.reduce((t, g) => t + g.overdue + g.blocked, 0);
  // A failure with nothing to show (or one that hides what was shown) replaces the cards, so no card
  // claims "all caught up" or "no activity" for data that never arrived
  const blocked = ws.isError && (!ws.data || hidesData(failureOf(ws.error)));
  const nextList = (asked.data?.projects ?? []).filter((p) => !p.decided);
  const k = keep.data;
  const daysLeft = k?.deleteOn ? Math.ceil((Date.parse(k.deleteOn) - Date.now()) / 86_400_000) : undefined;

  // A profile flag the View menu flips (the guide and the links card are put away on the profile)
  const flag = (field: "guide" | "linksCard") => async (show: boolean) => {
    try {
      const cur = qc.getQueryData<Me>(["me"]) ?? me;
      const user = await api<Me["user"]>("/me", { method: "PATCH", body: { version: cur.user.version, [field]: show ? "shown" : "hidden" } });
      if (user) qc.setQueryData<Me>(["me"], (m) => (m ? { ...m, user } : m));
    } catch (e) {
      toast(problem(e));
    }
  };

  // Every card this person could have here, in default reading order
  const cards: Card[] = [
    { id: "next", title: "Next step", group: "attention", when: canWrite && !me.operator && (prospect || nextList.length > 0 || Boolean(asked.data?.assessment)), suggested: asked.data?.assessment ? 0 : 1,
      sizes: [sz("L", 6, 11), sz("M", 6, 8), sz("W", 12, 8)], body: () => <NextStep orgId={org.id} slug={summary.slug} prospect={prospect} /> },
    { id: "keep", title: "Your account", group: "attention", when: prospect && !me.operator && Boolean(k?.free && !k.held && k.deleteOn), critical: daysLeft !== undefined && daysLeft <= 7 ? 1 : 0, suggested: daysLeft !== undefined && daysLeft > 7 ? 1 : 0,
      sizes: [sz("M", 6, 5), sz("T", 4, 7)], body: () => <KeepCard orgId={org.id} slug={summary.slug} canKeep={canWrite} /> },
    { id: "needs", title: "Needs you", group: "attention", when: true, critical: n,
      sizes: [sz("M", 6, 7), sz("S", 3, 4), sz("L", 6, 11), sz("W", 12, 7)], body: (size) => needsYou(size) },
    { id: "late", title: "Overdue and blocked", group: "attention", when: !prospect && glance.length > 0, critical: lateCount,
      sizes: [sz("S", 3, 4), sz("M", 6, 5)], body: (size) => overdue(size) },
    { id: "face", title: "Where can I see your business?", group: "suggested", when: admin && !me.operator && !org.place && !org.link, suggested: 1,
      shown: !faceSkipped, toggle: (show) => { setFaceAsk(org.id, show); setFaceSkipped(!show); },
      sizes: [sz("M", 6, 8), sz("W", 12, 6)], body: () => <FaceForm ask onDone={() => setFaceSkipped(true)} /> },
    { id: "links", title: "Add your links", group: "suggested", when: !me.user.linkedin && !me.user.website, suggested: 1,
      shown: wantsLinks(me), toggle: flag("linksCard"),
      sizes: [sz("S", 3, 4), sz("M", 6, 3)], body: () => <LinksCard me={me} /> },
    { id: "setup", title: "Get started", group: "suggested", when: setupLeft > 0, suggested: setupLeft,
      sizes: [sz("M", 6, 5), sz("T", 4, 6)], body: () => getStarted() },
    { id: "guide", title: "Get to know 1NEON", group: "suggested", when: !me.operator,
      shown: me.user.guide !== "hidden", toggle: flag("guide"),
      sizes: [sz("M", 6, 8), sz("T", 4, 10)], body: () => <GuideCard me={me} prospect={prospect} /> },
    { id: "coming", title: "Coming up", group: "overview", when: true,
      sizes: [sz("L", 6, 13), sz("W", 12, 13)], body: () => <ComingUp tid={org.id} base={base} /> },
    { id: "glance", title: "Projects at a glance", group: "overview", when: glance.length > 0 && !prospect,
      sizes: [sz("M", 6, 7), sz("L", 6, 11), sz("W", 12, 7)], body: () => atGlance() },
    { id: "layers", title: "Projects by layer", group: "overview", when: glance.length > 0,
      sizes: [sz("S", 3, 4), sz("M", 6, 4), sz("B", 12, 3)], body: (size) => byLayer(size) },
    { id: "stats", title: "Numbers", group: "overview", when: true,
      sizes: [sz("B", 12, 2), sz("M", 6, 4), sz("S", 3, 6)], body: () => numbers() },
    { id: "quick", title: "Shortcuts", group: "overview", when: canWrite || canAdmin,
      sizes: [sz("S", 3, 5), sz("B", 12, 2)], body: (size) => shortcuts(size) },
    { id: "away", title: "Away this week", group: "overview", when: (ws.data?.away?.length ?? 0) > 0,
      sizes: [sz("S", 3, 4), sz("M", 6, 4)], body: () => awayWeek() },
    { id: "updates", title: "Project updates", group: "overview", when: (ws.data?.updates?.length ?? 0) > 0,
      sizes: [sz("M", 6, 7), sz("L", 6, 11)], body: () => projectUpdates() },
    { id: "activity", title: "Recent activity", group: "overview", when: true,
      sizes: [sz("M", 6, 8), sz("L", 6, 12), sz("T", 4, 12)], body: () => recent() },
  ];
  const offered = cards.filter((x) => x.when);
  const isShown = (x: Card) => x.shown ?? !layout.hidden.includes(x.id);
  const visible = offered.filter(isShown);
  // Until the person places a card, it takes its first preset's width and the height its content needs
  const [fitH, setFitH] = useState<Record<string, number>>({});
  const placed = new Set((layout[bp] ?? []).map((c) => c.id));
  const fitIds = new Set(visible.filter((x) => !placed.has(x.id)).map((x) => x.id));
  const cells = reconcile(layout[bp], visible.map((x) => {
    const s = sizeAt(x.sizes[0]!, bp);
    return { id: x.id, w: s.w, h: fitH[`${bp}.${x.id}`] ?? s.h };
  }), COLS[bp]);

  const setShown = (id: string, show: boolean) => {
    const x = offered.find((y) => y.id === id);
    if (x?.toggle) x.toggle(show);
    else change((l) => ({ ...l, hidden: show ? l.hidden.filter((h) => h !== id) : [...new Set([...l.hidden, id])] }));
  };
  // A link to a hidden card (#next-step from a notification) shows it again
  const { hash } = useLocation();
  useEffect(() => {
    const id = ({ "#next-step": "next", "#coming-up": "coming", "#activity": "activity" } as Record<string, string>)[hash];
    const x = id ? offered.find((y) => y.id === id) : undefined;
    if (x && !isShown(x)) setShown(x.id, true);
  }, [hash]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: ViewRow[] = offered.map((x) => ({ id: x.id, title: x.title, group: x.group, shown: isShown(x), critical: x.critical ?? 0, suggested: x.suggested ?? 0 }));

  function needsYou(size: string | undefined): ReactNode {
    // Small shows the count and the most pressing item; larger sizes list them
    const small = size === "S";
    return (
      <section className="card needs" data-tour="needs-you" aria-busy={ws.isPending}>
        <h2 className="section-h">Needs you{ws.data && n > 0 && !small && <small>· {n} {n === 1 ? "item" : "items"}{shown < n ? `, showing ${shown}` : ""}</small>}</h2>
        {ws.data && n === 0 && <p className="empty-line"><Check size={18} aria-hidden="true" /> You're all caught up.</p>}
        {small && n > 0 ? (
          <p className="big-count"><b>{n}</b> {n === 1 ? "item waits" : "items wait"} on you{ws.data?.waiting[0] && <small>{ws.data.waiting[0].title}</small>}</p>
        ) : (
          <ul className="todo">
            {ws.data?.waiting.map((w) => {
              const a = ACTION[w.action] ?? ACTION.do;
              const layer = KIND_LAYER[w.kind as ItemKind] ?? "needs";
              // A choice opens the options side by side; anything else opens the item itself
              const to = w.action === "choose" ? `${base}/projects/${w.projectKey}/needs#options`
                : w.action === "pay" ? `${base}/projects/${w.projectKey}/invoices/${w.itemId}`
                : w.action === "issue" ? `${base}/projects/${w.projectKey}/execute#billing`
                : w.action === "accept" ? `${base}/projects/${w.projectKey}/normalize`
                : `${base}/projects/${w.projectKey}/${layerSlug(layer)}#item-${w.itemId}`;
              return (
                <li key={w.itemId}>
                  <a.icon size={18} aria-hidden="true" className="todo-ico" />
                  <span className="todo-t">{w.action === "choose" ? `Choose one of ${w.count} options` : w.title}{w.action === "pay" && w.dueDate && !w.overdue ? `, due ${dateLabel(w.dueDate)}` : ""}<small><span className="mono">{w.projectKey}</span> {w.projectName}</small></span>
                  <Link className="btn btn-ghost btn-sm" to={to}>{a.label}</Link>
                </li>
              );
            })}
          </ul>
        )}
        {/* A preview says so and leads to the rest; the full list leads back */}
        {shown < n && !showAll && <p className="small"><Link to="?needs=all">View all {n}</Link></p>}
        {showAll && <p className="small">{shown < n ? `The first ${shown} of ${n}, most pressing first. ` : ""}<Link to=".">Back to the preview</Link></p>}
      </section>
    );
  }

  // Projects with overdue or blocked work: the totals when small, each project when larger
  function overdue(size: string | undefined) {
    const od = late.reduce((t, g) => t + g.overdue, 0), bl = late.reduce((t, g) => t + g.blocked, 0);
    return (
      <section className="card late">
        <h2 className="section-h">Overdue and blocked</h2>
        {late.length === 0 ? <p className="empty-line"><Check size={18} aria-hidden="true" /> Nothing overdue or blocked.</p>
          : size === "S" ? <p className="big-count"><b>{od}</b> overdue{bl > 0 && <> · <b>{bl}</b> blocked</>}</p>
          : <ul className="updates">{late.map((g) => (
              <li key={g.key}><Link to={`${base}/projects/${g.key}`}><span className="s">{g.key}</span> {g.name}</Link> {g.overdue > 0 && <span className="tag warn">{g.overdue} overdue</span>} {g.blocked > 0 && <span className="tag warn">{g.blocked} blocked</span>}</li>
            ))}</ul>}
      </section>
    );
  }

  // How many live projects sit in each layer, as one bar; larger sizes name each layer
  function byLayer(size: string | undefined) {
    const live = glance.filter((g) => !g.closed);
    const per = Layer.options.map((l) => ({ l, n: live.filter((g) => g.layer === l).length }));
    return (
      <section className="card layers">
        <h2 className="section-h">Projects by layer</h2>
        <span className="layer-bar" role="img" aria-label={per.map((p) => `${p.n} in ${layerName(p.l)}`).join(", ")}>
          {per.map((p) => p.n > 0 && <i key={p.l} className={`lb-${p.l}`} style={{ flexGrow: p.n }} />)}
        </span>
        <ul className={`layer-keys${size === "S" ? " tight" : ""}`}>
          {per.map((p) => <li key={p.l}><Link to={`${base}/layer/${layerSlug(p.l)}`} aria-label={`${layerName(p.l)}: ${p.n}`}><LayerBadge layer={p.l} />{size !== "S" && <span>{layerName(p.l)}</span>}<b>{p.n}</b></Link></li>)}
        </ul>
      </section>
    );
  }

  function atGlance() {
    return (
      <section className="card glance" data-tour="glance">
        <h2 className="section-h">Projects at a glance <small><Link to={`${base}/projects`}>All projects</Link></small></h2>
        <ul>
          {glance.map((g) => {
            const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
            return (
              <li key={g.key}>
                <Link to={`${base}/projects/${g.key}`} className="g-name"><span className="s">{g.key}</span> {g.name}</Link>
                <span className="g-stage"><LayerBadge layer={g.layer} /> {g.stage}</span>
                <Health value={g.health} />
                <span className="g-bar" role="img" aria-label={g.total ? `${g.done} of ${g.total} done` : "No work yet"}><i style={{ width: `${pct}%` }} /></span>
                <span className="g-meta">
                  {g.total ? `${g.done} of ${g.total} done` : "No work yet"}
                  {g.overdue > 0 && <span className="tag warn">{g.overdue} overdue</span>}
                  {g.blocked > 0 && <span className="tag warn">{g.blocked} blocked</span>}
                  {g.next ? <> · next: <Link to={`${base}/projects/${g.key}/${layerSlug(KIND_LAYER[g.next.kind as ItemKind] ?? "needs")}#item-${g.next.itemId}`}>{g.next.title}</Link> {dateLabel(g.next.date)}</> : g.targetDate && !g.closed ? <> · target {dateLabel(g.targetDate)}</> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  function getStarted() {
    return (
      <section className="card" data-tour="get-started">
        <h2 className="section-h">Get started <small>{steps.length - setupLeft} of {steps.length}</small></h2>
        <ul className="checklist">
          {steps.map((s) => (
            <li key={s.label} className={s.done ? "done" : ""}>
              <span className="tick" aria-hidden="true">{s.done ? <Check size={14} /> : null}</span>
              <span>{s.label}</span>
              {!s.done && s.act}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // The headline numbers, each a way in. They reflow to the card's width (app.css)
  function numbers() {
    return (
      <nav className="stats" aria-label="At a glance">
        <Link to={`${base}/projects`}><b>{c?.projects ?? "–"}</b> {noun(c?.projects ?? 0, "project")}</Link>
        {/* Deciding opens Needs at its Decide stage; building opens the Execute layer, each listing just those projects */}
        <Link to={`${base}/layer/needs#stage-decide`} title="Projects waiting on a decision"><b>{c?.deciding ?? "–"}</b> deciding</Link>
        <Link to={`${base}/layer/execute`} title="Projects in the Execute layer"><b>{c?.building ?? "–"}</b> building</Link>
        <Link to={`${base}/people`}><b>{c?.people ?? "–"}</b> people{c?.invited ? <small>{c.invited} invited</small> : null}</Link>
        <Link to={`${base}/documents`}><b>{c?.documents ?? "–"}</b> {noun(c?.documents ?? 0, "file")}</Link>
      </nav>
    );
  }

  // What people start most from Home, one press each
  function shortcuts(size: string | undefined) {
    return (
      <nav className={`card quick${size === "B" ? " row" : ""}`} aria-label="Shortcuts">
        {canWrite && <Link to={`${base}/projects/new`}><FolderPlus size={17} aria-hidden="true" /> New project</Link>}
        {canWrite && <Link to={`${base}/documents`}><FilePlus2 size={17} aria-hidden="true" /> Add a file</Link>}
        {canAdmin && <Link to={`${base}/people`}><UserPlus size={17} aria-hidden="true" /> Invite someone</Link>}
        {!me.operator && <button type="button" onClick={() => dispatchEvent(new Event("1neon:chat"))}><MessageSquare size={17} aria-hidden="true" /> Message me</button>}
      </nav>
    );
  }

  function awayWeek() {
    return (
      <section className="card away">
        <h2 className="section-h">Away this week</h2>
        <ul className="updates">
          {ws.data!.away!.map((a, i) => (
            <li key={i}><b>{a.name}</b> <span className="muted small">{dateLabel(a.date)}{a.endDate ? ` to ${dateLabel(a.endDate)}` : ""}{a.title && a.title !== a.name ? ` · ${a.title}` : ""}</span></li>
          ))}
        </ul>
      </section>
    );
  }

  function projectUpdates() {
    return (
      <section className="card">
        <h2 className="section-h">Project updates</h2>
        <ul className="updates">
          {ws.data!.updates!.map((u) => (
            <li key={u.projectKey}>
              <Link to={`${base}/projects/${u.projectKey}`}><span className="s">{u.projectKey}</span> {u.projectName}</Link>
              <span className="u-line"><Health value={u.health as HealthT} /> <time>{ago(u.at)}</time></span>
              <p>{u.title}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function recent() {
    return (
      <section className="card" id="activity" data-tour="activity">
        <h2 className="section-h">Recent activity</h2>
        {ws.data && ws.data.activity.length === 0 && <p className="muted small">No activity yet.</p>}
        <ul className="feed">
          {ws.data?.activity.slice(0, 12).map((a) => (
            <li key={a.id}><span>{a.summary}{a.by && !a.summary.includes(a.by) && <small className="by">{a.by}</small>}<Changes e={a} /></span><time dateTime={a.at}>{ago(a.at)}</time></li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <>
      {/* The greeting wraps in its own column; the View menu holds the end of the row, level with the greeting's last line */}
      <div className="home-head">
        <h1 className="page-title">{first ? `Hi, ${first}` : "Home"}</h1>
        <HomeViews rows={rows} arranging={arranging} onToggle={(id) => { const r = rows.find((x) => x.id === id); if (r) setShown(id, !r.shown); }}
          onArrange={() => setArranging(!arranging)} onReset={() => change(() => ({ hidden: [] }))} />
      </div>
      {prospect && <ProspectNote />}
      <Stale reads={[ws]} />
      {arranging && (
        <div className="hg-bar" role="status">
          <span>Arranging Home</span>
          <button type="button" className="btn btn-sm" onClick={() => setArranging(false)}>Done</button>
        </div>
      )}
      <div ref={wrap} className="home">
        {blocked ? <Problem error={ws.error} reads={[ws]} /> : (
          <HomeGrid tiles={visible} cells={cells} bp={bp} arranging={arranging} fitIds={fitIds}
            onFit={(rows) => setFitH((f) => ({ ...f, ...Object.fromEntries(Object.entries(rows).map(([id, h]) => [`${bp}.${id}`, h])) }))}
            onChange={(next) => change((l) => ({ ...l, [bp]: next }))} onHide={(id) => setShown(id, false)} />
        )}
      </div>
    </>
  );
}
