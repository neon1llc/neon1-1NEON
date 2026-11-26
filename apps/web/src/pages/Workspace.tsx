// apps/web/src/pages/Workspace.tsx - Home inside an organization: the greeting with the View menu, and
// the cards on an arrangeable grid. Cards: what needs you, overdue and blocked work, the calendar, every
// project at a glance, projects by layer, the headline numbers, shortcuts, who's away this week, project
// updates, recent activity, and the setup and suggestion cards until they're done or put away. Each card
// has its own preset sizes and shows more as it grows (components/HomeGrid.tsx).


import { GuideCard, KeepCard, NextStep, ProspectNote } from "../components/Prospect.tsx";
import { KIND_LAYER, Layer, type ItemKind } from "@1neon/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartColumn, Check, CircleCheck, CircleHelp, FilePlus2, FileUp, Folder, FolderPlus, Kanban, ListTodo, MessageSquare, PenLine, Receipt, SlidersHorizontal, UserPlus } from "lucide-react";
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
import type { CalendarMonth, Me, Workspace } from "../lib/types.ts";
import { FaceForm, faceAskDismissed, setFaceAsk } from "../components/OrgFace.tsx";
import { HomeGrid, type Counts, type Tile } from "../components/HomeGrid.tsx";
import { HomeViews, type Group, type ViewRow } from "../components/HomeViews.tsx";
import { useHomeLayout } from "../lib/homeLayout.ts";
import { compact, reconcile, tidy, COLS, type Breakpoint, type Size } from "../lib/homeGrid.ts";
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

// Preset sizes, rows of 24px (heights are written in steps of 40px rows and scaled): S small, M medium,
// T tall, L large, W wide, B a bar across the page. Each card has its own set for the wide grid (12
// columns) and for a phone (4 columns), each preset with its own layout: more detail as it grows, the
// vital part as it shrinks. The first is the card's default; the smallest and largest bound a free resize
const sz = (key: string, w: number, h: number): Size => ({ key, w, h: Math.round(h * 1.4) });
const none: Counts = { urgent: 0, suggested: 0, general: 0 };
const cnt = (urgent = 0, suggested = 0, general = 0): Counts => ({ urgent, suggested, general });
const RANK: Record<Group, number> = { urgent: 0, suggested: 1, general: 2 };
type Keep = { free: boolean; held?: boolean; deleteOn?: string };

/** One card Home can show: what it is, where it groups in the View menu, what a hidden one holds */
interface Card extends Omit<Tile, "sizes"> {
  // Presets for the wide grid (12 columns) and for a phone (4 columns), each designed for its width
  sizes: Record<Breakpoint, Size[]>;
  group: Group;
  when: boolean;
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
  const asked = useQuery({ queryKey: ["requests", org.id], queryFn: () => read<{ projects: { decided?: boolean; outline?: { missing: unknown[] } }[]; assessment?: { sentAt?: string } }>(`/t/${org.id}/requests`, { projects: "array" }), enabled: canWrite && !me.operator });
  // The calendar's month in view, shared with Coming up, for what's overdue and due this week
  const cal = useQuery({ queryKey: ["calendar", org.id, "now"], queryFn: () => read<CalendarMonth>(`/t/${org.id}/calendar`, { today: "string", entries: "array" }), refetchInterval: 60_000 });
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
    // Set before the first paint, so a phone never shows the wide layout first
    setBp(el.clientWidth >= 720 || el.clientWidth === 0 ? "wide" : "narrow");
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
  // This week on the calendar: work that's mine and open is a suggestion, events and targets are to know
  const today = cal.data?.today ?? new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.parse(today + "T12:00:00Z") + 7 * 86_400_000).toISOString().slice(0, 10);
  const week = (cal.data?.entries ?? []).filter((e) => !e.done && e.date >= today && e.date <= weekEnd);
  const calOverdue = Math.max(cal.data?.overdue?.length ?? 0, (cal.data?.entries ?? []).filter((e) => e.overdue && !e.done).length);
  const calCounts = cnt(calOverdue, week.filter((e) => e.source === "work" && e.mine).length, week.filter((e) => e.source !== "work").length);
  const waiting = ws.data?.waiting ?? [];
  const pressing = waiting.filter((w) => w.overdue || w.failed).length;
  const outlineTips = nextList.filter((p) => (p.outline?.missing.length ?? 0) > 0).length;
  const health = (h: string) => glance.filter((g) => !g.closed && g.health === h).length;
  const recentActs = (ws.data?.activity ?? []).filter((a) => Date.now() - Date.parse(a.at) < 86_400_000).length;
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
    { id: "next", title: "Next step", group: "suggested", when: canWrite && !me.operator && (prospect || nextList.length > 0 || Boolean(asked.data?.assessment)),
      counts: cnt(0, nextList.length ? outlineTips : 1, asked.data?.assessment ? 1 : 0),
      sizes: { wide: [sz("L", 6, 11), sz("M", 6, 8), sz("W", 12, 8)], narrow: [sz("M", 4, 13), sz("L", 4, 18)] }, body: () => <NextStep orgId={org.id} slug={summary.slug} prospect={prospect} /> },
    { id: "keep", title: "Your account", group: "urgent", when: prospect && !me.operator && Boolean(k?.free && !k.held && k.deleteOn),
      counts: daysLeft !== undefined && daysLeft <= 7 ? cnt(1) : cnt(0, 0, 1),
      sizes: { wide: [sz("M", 6, 5), sz("T", 4, 7), sz("W", 12, 3)], narrow: [sz("M", 4, 6), sz("T", 4, 8)] }, body: () => <KeepCard orgId={org.id} slug={summary.slug} canKeep={canWrite} /> },
    { id: "needs", title: "Needs you", group: "urgent", when: true, counts: cnt(pressing, Math.max(0, n - pressing)),
      sizes: { wide: [sz("M", 6, 7), sz("S", 3, 4), sz("L", 6, 11), sz("W", 12, 7)], narrow: [sz("M", 4, 9), sz("S", 2, 5), sz("L", 4, 14)] }, body: (v) => needsYou(v) },
    { id: "late", title: "Overdue and blocked", group: "urgent", when: !prospect && glance.length > 0,
      counts: cnt(late.reduce((t, g) => t + g.overdue, 0), late.reduce((t, g) => t + g.blocked, 0)),
      sizes: { wide: [sz("S", 3, 4), sz("M", 6, 5), sz("T", 4, 8)], narrow: [sz("S", 2, 5), sz("M", 4, 6), sz("T", 4, 9)] }, body: (v) => overdue(v) },
    { id: "coming", title: "Coming up", group: "general", when: true, counts: calCounts,
      sizes: { wide: [sz("L", 6, 13), sz("W", 12, 13)], narrow: [sz("L", 4, 18)] }, body: () => <ComingUp tid={org.id} base={base} /> },
    { id: "face", title: "Where can I see your business?", group: "suggested", when: admin && !me.operator && !org.place && !org.link, counts: cnt(0, 1),
      shown: !faceSkipped, toggle: (show) => { setFaceAsk(org.id, show); setFaceSkipped(!show); },
      sizes: { wide: [sz("M", 6, 8), sz("W", 12, 6)], narrow: [sz("M", 4, 11)] }, body: () => <FaceForm ask onDone={() => setFaceSkipped(true)} /> },
    { id: "links", title: "Add your links", group: "suggested", when: !me.user.linkedin && !me.user.businessLinkedin && !me.user.website, counts: cnt(0, 1),
      shown: wantsLinks(me), toggle: flag("linksCard"),
      sizes: { wide: [sz("S", 3, 4), sz("M", 6, 3)], narrow: [sz("S", 2, 6), sz("M", 4, 4)] }, body: () => <LinksCard me={me} /> },
    { id: "setup", title: "Get started", group: "suggested", when: setupLeft > 0, counts: cnt(0, setupLeft),
      sizes: { wide: [sz("M", 6, 5), sz("T", 4, 6), sz("W", 12, 3)], narrow: [sz("M", 4, 7)] }, body: () => getStarted() },
    { id: "guide", title: "Get to know 1NEON", group: "general", when: !me.operator, counts: none,
      shown: me.user.guide !== "hidden", toggle: flag("guide"),
      sizes: { wide: [sz("M", 6, 8), sz("T", 4, 10), sz("W", 12, 5)], narrow: [sz("M", 4, 11)] }, body: () => <GuideCard me={me} prospect={prospect} /> },
    { id: "glance", title: "Projects at a glance", group: "general", when: glance.length > 0 && !prospect, counts: cnt(health("off_track"), health("at_risk")),
      sizes: { wide: [sz("M", 6, 7), sz("T", 4, 8), sz("L", 6, 11), sz("W", 12, 7)], narrow: [sz("T", 4, 9), sz("L", 4, 14)] }, body: (v) => atGlance(v) },
    { id: "layers", title: "Projects by layer", group: "general", when: glance.length > 0, counts: none,
      sizes: { wide: [sz("S", 3, 4), sz("M", 6, 4), sz("B", 12, 3)], narrow: [sz("S", 2, 5), sz("M", 4, 4)] }, body: (v) => byLayer(v) },
    { id: "stats", title: "Numbers", group: "general", when: true, counts: none,
      sizes: { wide: [sz("B", 12, 2), sz("M", 6, 4), sz("S", 3, 6)], narrow: [sz("M", 4, 6), sz("S", 2, 8)] }, body: (v) => numbers(v) },
    { id: "quick", title: "Quick links", group: "general", when: true, counts: none,
      sizes: { wide: [sz("S", 3, 6), sz("M", 6, 5), sz("B", 12, 2), sz("L", 6, 9)], narrow: [sz("S", 2, 8), sz("M", 4, 7), sz("L", 4, 12)] }, body: (v) => quickLinks(v) },
    { id: "away", title: "Away this week", group: "general", when: (ws.data?.away?.length ?? 0) > 0, counts: cnt(0, 0, ws.data?.away?.length ?? 0),
      sizes: { wide: [sz("S", 3, 4), sz("M", 6, 4)], narrow: [sz("S", 2, 5), sz("M", 4, 5)] }, body: () => awayWeek() },
    { id: "updates", title: "Project updates", group: "general", when: (ws.data?.updates?.length ?? 0) > 0, counts: cnt(0, 0, ws.data?.updates?.length ?? 0),
      sizes: { wide: [sz("M", 6, 7), sz("T", 4, 9), sz("L", 6, 11)], narrow: [sz("T", 4, 9), sz("L", 4, 13)] }, body: (v) => projectUpdates(v) },
    { id: "activity", title: "Recent activity", group: "general", when: true, counts: cnt(0, 0, recentActs),
      sizes: { wide: [sz("M", 6, 8), sz("T", 4, 12), sz("L", 6, 12)], narrow: [sz("M", 4, 10), sz("T", 4, 12), sz("L", 4, 15)] }, body: (v) => recent(v) },
  ];
  const offered = cards.filter((x) => x.when);
  const isShown = (x: Card) => x.shown ?? !layout.hidden.includes(x.id);
  const visible = offered.filter(isShown);
  // Each card is at least as tall as its content: a card the person hasn't placed takes exactly that
  // height (at its first preset's width); a placed one keeps its size unless the content outgrows it
  const [fitH, setFitH] = useState<Record<string, number>>({});
  const need = (id: string) => fitH[`${bp}.${id}`];
  const cells = compact(reconcile(layout[bp], visible.map((x) => {
    const s = x.sizes[bp][0]!;
    return { id: x.id, w: s.w, h: need(x.id) ?? s.h };
  }), COLS[bp]).map((c) => ({ ...c, h: Math.max(c.h, need(c.id) ?? 0) })));

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

  // Counts show once every read behind them has answered, so no badge flashes a wrong number first
  const ready = ws.isSuccess && cal.isSuccess && (!(canWrite && !me.operator) || asked.isSuccess) && (!(prospect && !me.operator) || keep.isSuccess);
  const rows: ViewRow[] = offered.map((x) => ({ id: x.id, title: x.title, group: x.group, shown: isShown(x), counts: x.counts ?? none }));
  // Tidy up: urgent cards first, then suggested, then the rest; cards holding urgent items lead their group
  const rank = (id: string) => { const x = offered.find((y) => y.id === id); return x ? RANK[x.group] * 2 - ((x.counts?.urgent ?? 0) > 0 ? 1 : 0) : 9; };

  function needsYou(view: string): ReactNode {
    // Small shows the count and the most pressing item; larger sizes list them, in two columns across the page
    const small = view === "S";
    return (
      <section className={`card needs v-${view}`} data-tour="needs-you" aria-busy={ws.isPending}>
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

  // Projects with overdue or blocked work: the totals when small, each project when larger, and each
  // project's late and blocked counts with its next date when tall
  function overdue(view: string) {
    const od = late.reduce((t, g) => t + g.overdue, 0), bl = late.reduce((t, g) => t + g.blocked, 0);
    return (
      <section className="card late">
        <h2 className="section-h">Overdue and blocked</h2>
        {late.length === 0 ? <p className="empty-line"><Check size={18} aria-hidden="true" /> Nothing overdue or blocked.</p>
          : view === "S" ? <p className="big-count"><b>{od}</b> overdue{bl > 0 && <> · <b>{bl}</b> blocked</>}</p>
          : <ul className="updates">{late.map((g) => (
              <li key={g.key}><Link to={`${base}/projects/${g.key}`}><span className="s">{g.key}</span> {g.name}</Link> {g.overdue > 0 && <span className="tag warn">{g.overdue} overdue</span>} {g.blocked > 0 && <span className="tag warn">{g.blocked} blocked</span>}
                {view === "T" && g.next && <span className="muted small"> · next {dateLabel(g.next.date)}</span>}</li>
            ))}</ul>}
      </section>
    );
  }

  // How many live projects sit in each layer, as one bar: badges and counts when small, named when
  // medium, and in one line beside the bar across the page
  function byLayer(view: string) {
    const live = glance.filter((g) => !g.closed);
    const per = Layer.options.map((l) => ({ l, n: live.filter((g) => g.layer === l).length }));
    return (
      <section className={`card layers v-${view}`}>
        <h2 className="section-h">Projects by layer</h2>
        <div className="layers-body">
          <span className="layer-bar" role="img" aria-label={per.map((p) => `${p.n} in ${layerName(p.l)}`).join(", ")}>
            {per.map((p) => p.n > 0 && <i key={p.l} className={`lb-${p.l}`} style={{ flexGrow: p.n }} />)}
          </span>
          <ul className="layer-keys">
            {per.map((p) => <li key={p.l}><Link to={`${base}/layer/${layerSlug(p.l)}`} aria-label={`${layerName(p.l)}: ${p.n}`}><LayerBadge layer={p.l} />{view !== "S" && <span>{layerName(p.l)}</span>}<b>{p.n}</b></Link></li>)}
          </ul>
        </div>
      </section>
    );
  }

  // Every live project: names and progress when tall and narrow; stage, health, and what's next when
  // larger; two columns across the page
  function atGlance(view: string) {
    const brief = view === "T";
    return (
      <section className={`card glance v-${view}`} data-tour="glance">
        <h2 className="section-h">Projects at a glance <small><Link to={`${base}/projects`}>All projects</Link></small></h2>
        <ul>
          {glance.map((g) => {
            const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
            return (
              <li key={g.key}>
                <Link to={`${base}/projects/${g.key}`} className="g-name"><span className="s">{g.key}</span> {g.name}</Link>
                {!brief && <span className="g-stage"><LayerBadge layer={g.layer} /> {g.stage}</span>}
                <Health value={g.health} />
                <span className="g-bar" role="img" aria-label={g.total ? `${g.done} of ${g.total} done` : "No work yet"}><i style={{ width: `${pct}%` }} /></span>
                {!brief && (
                  <span className="g-meta">
                    {g.total ? `${g.done} of ${g.total} done` : "No work yet"}
                    {g.overdue > 0 && <span className="tag warn">{g.overdue} overdue</span>}
                    {g.blocked > 0 && <span className="tag warn">{g.blocked} blocked</span>}
                    {g.next ? <> · next: <Link to={`${base}/projects/${g.key}/${layerSlug(KIND_LAYER[g.next.kind as ItemKind] ?? "needs")}#item-${g.next.itemId}`}>{g.next.title}</Link> {dateLabel(g.next.date)}</> : g.targetDate && !g.closed ? <> · target {dateLabel(g.targetDate)}</> : null}
                  </span>
                )}
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

  // The headline numbers, each a way in: a strip across the page (its own labels say what it is), or a
  // titled card whose numbers reflow to its width
  function numbers(view: string) {
    const strip = (
      <nav className="stats" aria-label="Numbers">
        <Link to={`${base}/projects`}><b>{c?.projects ?? "–"}</b> {noun(c?.projects ?? 0, "project")}</Link>
        {/* Deciding opens Needs at its Decide stage; building opens the Execute layer, each listing just those projects */}
        <Link to={`${base}/layer/needs#stage-decide`} title="Projects waiting on a decision"><b>{c?.deciding ?? "–"}</b> deciding</Link>
        <Link to={`${base}/layer/execute`} title="Projects in the Execute layer"><b>{c?.building ?? "–"}</b> building</Link>
        <Link to={`${base}/people`}><b>{c?.people ?? "–"}</b> people{c?.invited ? <small>{c.invited} invited</small> : null}</Link>
        <Link to={`${base}/documents`}><b>{c?.documents ?? "–"}</b> {noun(c?.documents ?? 0, "file")}</Link>
      </nav>
    );
    if (view === "B") return strip;
    return <section className="card numbers"><h2 className="section-h">Numbers</h2>{strip}</section>;
  }

  // Where people go and what they start from Home: the four most used when small, each with a line on
  // what it does when medium, a row beside the title across the page, and everything, grouped, when large
  function quickLinks(view: string) {
    type Q = { key: string; icon: typeof FolderPlus; label: string; note: string; to?: string; act?: () => void; when: boolean };
    const all: Q[] = [
      { key: "new", icon: FolderPlus, label: "New project", note: "Outline what you need", to: `${base}/projects/new`, when: canWrite },
      { key: "file", icon: FilePlus2, label: "Add a file", note: "Share documents and exports", to: `${base}/documents`, when: canWrite },
      { key: "invite", icon: UserPlus, label: "Invite someone", note: "Bring in your team", to: `${base}/people`, when: canAdmin },
      { key: "chat", icon: MessageSquare, label: "Message me", note: "Ask anything, right here", act: () => dispatchEvent(new Event("1neon:chat")), when: !me.operator },
      { key: "board", icon: Kanban, label: "Board", note: "Every item by stage", to: `${base}/workflow`, when: true },
      { key: "projects", icon: Folder, label: "All projects", note: "Status and history", to: `${base}/projects`, when: true },
      { key: "insights", icon: ChartColumn, label: "Insights", note: "Progress and spend", to: `${base}/insights`, when: !prospect },
      { key: "settings", icon: SlidersHorizontal, label: "Settings", note: "Your organization", to: `${base}/settings`, when: admin },
      { key: "faqs", icon: CircleHelp, label: "FAQs", note: "Short answers", to: "/faqs", when: true },
    ].filter((q) => q.when);
    const list = view === "S" ? all.slice(0, 4) : view === "M" ? all.slice(0, 6) : view === "B" ? all.slice(0, 5) : all;
    const item = (q: Q) => {
      const inner = <><q.icon size={17} aria-hidden="true" /><span className="q-t">{q.label}{(view === "M" || view === "L") && <small>{q.note}</small>}</span></>;
      return <li key={q.key}>{q.to ? <Link to={q.to}>{inner}</Link> : <button type="button" onClick={q.act}>{inner}</button>}</li>;
    };
    if (view === "L") {
      const start = all.filter((q) => ["new", "file", "invite", "chat"].includes(q.key));
      const go = all.filter((q) => !start.includes(q));
      return (
        <nav className="card quick v-L" aria-labelledby="quick-h">
          <h2 className="section-h" id="quick-h">Quick links</h2>
          <p className="q-g">Start</p><ul>{start.map(item)}</ul>
          <p className="q-g">Go to</p><ul>{go.map(item)}</ul>
        </nav>
      );
    }
    return (
      <nav className={`card quick v-${view}`} aria-labelledby="quick-h">
        <h2 className="section-h" id="quick-h">Quick links</h2>
        <ul>{list.map(item)}</ul>
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

  // Each project's latest update; tall and narrow keeps the headline and health
  function projectUpdates(view: string) {
    return (
      <section className="card">
        <h2 className="section-h">Project updates</h2>
        <ul className="updates">
          {ws.data!.updates!.map((u) => (
            <li key={u.projectKey}>
              <Link to={`${base}/projects/${u.projectKey}`}><span className="s">{u.projectKey}</span> {u.projectName}</Link>
              <span className="u-line"><Health value={u.health as HealthT} /> <time>{ago(u.at)}</time></span>
              <p>{u.title}</p>
              {view === "L" && u.body && <p className="muted small">{u.body.slice(0, 240)}</p>}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // What happened lately: six when medium, twelve when large or tall; tall and narrow drops who and what changed
  function recent(view: string) {
    const brief = view === "T";
    return (
      <section className="card" id="activity" data-tour="activity">
        <h2 className="section-h">Recent activity</h2>
        {ws.data && ws.data.activity.length === 0 && <p className="muted small">No activity yet.</p>}
        <ul className="feed">
          {ws.data?.activity.slice(0, view === "M" ? 6 : 12).map((a) => (
            <li key={a.id}><span>{a.summary}{!brief && a.by && !a.summary.includes(a.by) && <small className="by">{a.by}</small>}{!brief && <Changes e={a} />}</span><time dateTime={a.at}>{ago(a.at)}</time></li>
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
        <HomeViews rows={rows} ready={ready} arranging={arranging} onToggle={(id) => { const r = rows.find((x) => x.id === id); if (r) setShown(id, !r.shown); }}
          onArrange={() => setArranging(!arranging)} onReset={() => change(() => ({ hidden: [] }))}
          onTidy={() => change((l) => ({ ...l, [bp]: tidy(cells, rank, COLS[bp]) }))} />
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
        {/* The grid waits for every read behind its cards, so it appears once, in place, and never reshuffles */}
        {blocked ? <Problem error={ws.error} reads={[ws]} /> : !ready ? <div className="hg-wait" aria-busy="true" /> : (
          <HomeGrid tiles={visible.map((x) => ({ ...x, sizes: x.sizes[bp], counts: ready ? x.counts : undefined }))} cells={cells} bp={bp} arranging={arranging}
            onFit={(rows) => setFitH((f) => ({ ...f, ...Object.fromEntries(Object.entries(rows).map(([id, h]) => [`${bp}.${id}`, h])) }))}
            onChange={(next) => change((l) => ({ ...l, [bp]: next }))} onHide={(id) => setShown(id, false)} />
        )}
      </div>
    </>
  );
}
