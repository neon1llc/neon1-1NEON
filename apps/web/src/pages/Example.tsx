// apps/web/src/pages/Example.tsx - /1NEON/example: one made-up project, start to finish, in the
// portal's own frame. Three engagements from different families of work (lib/scenarios.ts), each with
// its setbacks and a few small pieces of the work itself. Public, no sign-in; it links to the working
// demo and the live playback.


import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router";
import { EXAMPLE_TITLE, OUTLINE_CARRIES, OUTLINE_PARTS, readinessOf, type Layer, type OutlinePart } from "@1neon/domain";
import { OutLink } from "../components/OutLink.tsx";
import { PublicFooter } from "../components/PublicFooter.tsx";
import { ThemeSwitch } from "../components/PublicBar.tsx";
import { LayerBadge, LAYERS, layerHint, layerName, Rings } from "../components/ui.tsx";
import { VLANS, type Table } from "../lib/artifacts.ts";
import { useDocumentScroll } from "../lib/edge.ts";
import { fade } from "../lib/motion.ts";
import { CARE, moneyOf, SCENARIO_IDS, SCENARIOS, scenarioOf, summaryOf, targetText, type Piece, type Scenario, type ScenarioId } from "../lib/scenarios.ts";
import { useSiteTheme } from "../lib/sitetheme.ts";
import { Check } from "lucide-react";


// One card: a title, its lines, an optional list, and an optional piece of work
type Line = string | [string, string];
type Item = { text: string; state?: "done" | "now" | "picked" | "set-aside"; tag?: string };
type Card = { title: string; lines: Line[]; list?: Item[]; piece?: Piece };

const lower = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;


/** Every card of one engagement, by layer. The facts and figures are the walkthrough's own (lib/scenarios.ts), so the two never disagree */
function storyOf(s: Scenario): Record<Layer, { lead: string; cards: Card[] }> {
  const M = moneyOf(s);
  const sums = summaryOf(s);
  const chosen = s.options[s.chosen]!;
  const first = s.owner.first;
  const pieces = (layer: Layer) => s.pieces.filter((p) => p.layer === layer).map((piece): Card => ({ title: piece.title, lines: [], piece }));
  const price = (i: number) => sums[i]!.price;
  const declinedNames = s.declined.map((n) => s.options[n]!.title.replace(/^[A-C]\. /, ""));
  const logged = s.hours.slice().sort((a, b) => b.when - a.when);
  return {
    needs: {
      lead: "What the client wants, what I learned, the options, and the choice.",
      cards: [
        { title: "Request", lines: [["Currently", s.project.today], ["Goal", s.project.outcome], ["Example", s.project.example]] },
        { title: "What neon1 learned", lines: ["From the first call and a look at real records. The client can correct it."], list: [
          ...s.learned.map(([q, a]) => ({ text: `${q} ${a}` })),
          ...s.constraints.slice(0, 2).map(([title, body]) => ({ text: `A limit, said before any option was written: ${lower(title)}. ${body}` })),
        ] },
        { title: "Options", lines: [`Proposal 0039-r1 offers ${s.options.length === 1 ? "one recommendation" : `${["", "", "two", "three"][s.options.length]} choices`}. Each says what's in and out, how the price was worked out, anything to buy, and the result to check.${M.fixed ? " Each price is fixed." : ` Each price is an estimate in hours, billed for hours worked and never above its high end unless the client approves a change first.`}`], list: s.options.map((o, n) => ({
          text: `${o.title.replace(/^[A-C]\. /, "")}: ${price(n)}${sums[n]!.hours ? `, ${sums[n]!.hours}` : ""}. ${String(o.fields.result ?? "")}`,
          state: n === s.chosen ? "picked" as const : s.declined.includes(n) ? "set-aside" as const : undefined,
          tag: n === s.chosen ? "chosen" : s.declined.includes(n) ? "set aside" : undefined,
        })) },
        { title: "Decision", lines: [
          `${first} read the proposal, signed the service agreement once for ${s.org.name}, then approved 0039-r1-${"ABC"[s.chosen]}, ${chosen.title.replace(/^[A-C]\. /, "")}, with a typed signature and one condition: ${lower(s.condition)} The approval restated the terms first, including payment: ${M.deposit} at approval, the rest at handover. The decision, who made it, and those terms stay with the project.`,
          `Why this one: ${String(chosen.fields.why ?? "")}`,
          ...(declinedNames.length ? [`Set aside: ${declinedNames.join(", ")}. Kept in the record as declined, never issued.`] : []),
        ] },
        ...pieces("needs"),
      ],
    },
    execution: {
      lead: "The work as it happens: short updates, every hour listed, and what went wrong.",
      cards: [
        { title: "Work", lines: [], list: [
          ...s.tasks.map((text) => ({ text, state: "done" as const })),
          { text: s.milestone, state: "now" as const },
        ] },
        { title: "Hours", lines: [M.fixed ? `${M.logged} logged for the record. The price is fixed, so the hours don't change the invoice.` : `${M.logged} logged against an estimate of ${M.hours}, each with its date and purpose.`], list: logged.slice(0, 3).map((h) => ({ text: `${h.work}: ${h.hours} ${h.hours === 1 ? "hour" : "hours"}`, state: "done" as const })).concat([{ text: `…and ${s.hours.length - 3} more entries, ${M.logged} in all`, state: "done" as const }]) },
        { title: "Updates", lines: [], list: [
          { text: `${s.updates.plan.title}. ${s.updates.plan.body}`, state: "done" },
          { text: `At risk: ${s.updates.fail.title}. ${s.updates.fail.body}`, state: "done" },
          { text: `On track: ${s.updates.pass.title}. ${s.updates.pass.body}`, state: "done" },
        ] },
        ...(s.revision ? [{ title: "Revised terms", lines: [`${s.revision.title}: ${s.revision.why}`, ["What changed", s.revision.change], `${s.revision.sign.split(" ")[0]} approved the revision as Proposal 0039-r2 before more hours were worked. What didn't change stays as signed.`] as Line[] }] : []),
        ...pieces("execution"),
        ...(s.purchase ? [{ title: "Purchases", lines: ["From the approved option, bought in the client's own name."], list: [{ text: `${s.purchase.name}: paid ${s.purchase.paid}, receipt attached`, state: "done" as const }] }] : []),
        { title: "Invoices", lines: ["Each invoice says what it's for and how it was worked out. Pay by bank transfer or card from the project."], list: [
          { text: `INV-0039-01, deposit: ${M.deposit}, ${M.fixed ? "half of the fixed price" : `half of the estimate's low end (${M.firstLow})`}. Paid`, state: "done" },
          { text: `INV-0039-02, final: ${M.fixed ? `the fixed price, ${M.earned}` : `${M.logged} worked is ${M.earned}`}, less the deposit, ${M.final}. It lists ${M.fixed ? "what it bills" : "every hour it bills"}. Paid`, state: "done" },
          { text: `Total for the work: ${M.earned}${M.fixed ? "" : `, inside the ${M.range} approved`}` },
        ] },
      ],
    },
    observation: {
      lead: "The same measures before and after, so the result is a number with evidence.",
      cards: [
        { title: "Measures", lines: ["Measured the same way before and after."], list: [
          ...s.measures.map((m) => ({ text: `${m.title}: ${m.baseline} → ${m.readings[2]} (target ${targetText(m)})`, state: "done" as const })),
          { text: s.measures.every((m) => m.direction === "down" ? m.readings[2] <= m.target : m.readings[2] >= m.target) ? "Every target met" : "A target not met yet, and the care plan says so" },
        ] },
        ...pieces("observation"),
      ],
    },
    next: {
      lead: "Making it the normal way of working, owned by the client.",
      cards: [
        { title: "Handover", lines: [], list: [
          { text: "A one-page runbook: what happens, what to do when something looks wrong, how to roll back or restore, and what isn't built yet", state: "done" },
          { text: `${s.training}`, state: "done" },
          { text: "Every account in the client's own name, a sign-in for each person in place of any shared password, and neon1's access removed", state: "done" },
          { text: `The last step checked and accepted by ${first}, with a signature. ${s.voice.acceptNote}`, state: "done" },
        ] },
        { title: "Care", lines: [`Optional: ${lower(CARE[s.id])}, plus small changes as the client grows. The client can run it alone.`] },
        ...pieces("next"),
      ],
    },
  };
}


/** A table the work produced, drawn in the portal's own table style */
function PieceTable({ t }: { t: Table }) {
  return (
    <div className="piece-scroll">
      <table className="piece-table">
        <thead><tr>{t.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "num" : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
      {t.foot && <p className="small muted">{t.foot}</p>}
    </div>
  );
}

/** The new floor's five segments as a diagram: an illustration, drawn by hand from the same list as the table */
function NetworkDiagram() {
  const W = 760, H = 250, box = 128, gap = 20;
  const x = (i: number) => 12 + i * (box + gap);
  return (
    <svg className="piece-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Five network segments behind one firewall: staff, servers, devices, security, and guest. Guest reaches the internet only. Security reaches nothing but two update hosts.">
      <rect x={12} y={12} width={W - 24} height={42} rx={8} className="pd-fw" />
      <text x={W / 2} y={38} textAnchor="middle" className="pd-t">Firewall, with the rule table between every segment</text>
      {VLANS.map((v, i) => (
        <g key={v.id}>
          <line x1={x(i) + box / 2} y1={54} x2={x(i) + box / 2} y2={92} className="pd-l" />
          <rect x={x(i)} y={92} width={box} height={96} rx={8} className={`pd-box pd-${v.name.toLowerCase()}`} />
          <text x={x(i) + box / 2} y={116} textAnchor="middle" className="pd-t pd-b">{v.name}</text>
          <text x={x(i) + box / 2} y={134} textAnchor="middle" className="pd-s">VLAN {v.id}</text>
          <text x={x(i) + box / 2} y={152} textAnchor="middle" className="pd-s">{v.subnet}</text>
          <text x={x(i) + box / 2} y={206} textAnchor="middle" className="pd-s">{v.name === "Guest" ? "internet only" : v.name === "Security" ? "two update hosts" : v.name === "Servers" ? "replies, backup" : v.name === "Devices" ? "updates only" : "servers, printers"}</text>
        </g>
      ))}
    </svg>
  );
}

/** A piece of the work: what it is, whether it runs or is drawn, and the thing itself */
function PieceView({ p }: { p: Piece }) {
  return (
    <>
      <p className="piece-kind"><span className={`tag ${p.kind === "working" ? "rec" : "warn"}`}>{p.kind === "working" ? "Working example" : "Illustration"}</span></p>
      <p className="small muted">{p.note}</p>
      {p.diagram === "network" && <NetworkDiagram />}
      {p.table && <PieceTable t={p.table} />}
    </>
  );
}


/** The six outline parts as this engagement wrote them, and where each one went once the work was agreed. The words are the
 * scenario's own; what each part is called and where it goes are the portal's (packages/domain/src/outline.ts) */
function outlineOfScenario(s: Scenario): { id: OutlinePart; wrote: string; went: string; layer: Layer }[] {
  const chosen = s.options[s.chosen]!;
  const m = s.measures[0]!;
  const title = chosen.title.replace(/^[A-C]\. /, "");
  return [
    { id: "what", wrote: s.blurb, went: `The scope of the approved option, ${lower(title)}.`, layer: "needs" },
    { id: "today", wrote: s.project.example, went: `The starting point Observe measures against: ${lower(m.title)} began at ${m.baseline}.`, layer: "observation" },
    { id: "done", wrote: s.project.outcome, went: `The check in Verify: ${lower(String(chosen.fields.result ?? ""))}`, layer: "execution" },
    { id: "who", wrote: s.needs.answer, went: `The handover in Normalize: ${lower(s.training)}`, layer: "next" },
    { id: "measure", wrote: `${m.title}: ${m.baseline} now, target ${targetText(m)}.`, went: `Read again in Observe: it reached ${m.readings[2]}.`, layer: "observation" },
    { id: "limits", wrote: `${s.constraints[0]![0]}. Due in about ${Math.round(s.project.dueDays / 7)} weeks.`, went: `The proposal's timeline, ${String(chosen.fields.timeline ?? "").replace(/\.$/, "")}, and what it leaves out.`, layer: "execution" },
  ];
}

/** The outline parts that went into one layer, as a card at its top. Needs has none: the outline is what its Ready section shows */
function carriedCards(s: Scenario, layer: Layer): Card[] {
  const here = outlineOfScenario(s).filter((x) => x.layer === layer);
  if (layer === "needs" || !here.length) return [];
  const label = (id: OutlinePart) => OUTLINE_PARTS.find((x) => x.id === id)!.label;
  return [{ title: "From the outline", lines: [`What ${s.owner.first} wrote before the work started, so I don't ask again.`], list: here.map((x) => ({ text: `${label(x.id)}: ${x.went}`, state: "done" as const })) }];
}

/** This engagement's readiness at each step, from the same function the portal uses, so the percents are the portal's own */
function readyPath(s: Scenario) {
  const m = s.measures[0]!;
  const project = { summary: s.blurb, outcome: s.project.outcome, targetDate: "2027-01-15" };
  const written = [
    { kind: "discovery", title: EXAMPLE_TITLE, body: s.project.example },
    { kind: "discovery", title: "Who does this work today?", body: s.needs.answer },
    { kind: "metric", title: m.title, fields: { baseline: m.baseline } },
    { kind: "constraint", title: s.constraints[0]![0], body: s.constraints[0]![1] },
  ];
  const option = (status: string) => ({ kind: "option", title: s.options[s.chosen]!.title, status });
  const asked = "2026-11-01";
  return [
    { step: "Outline", note: "All six parts written", r: readinessOf(project, written) },
    { step: "Assessment", note: "Sent, and answered by email, with a call after", r: readinessOf(project, written, asked) },
    { step: "Options", note: `${s.options.length === 1 ? "One option" : `${["", "", "Two options", "Three options"][s.options.length]}`} written up under Needs`, r: readinessOf(project, [...written, option("proposed")], asked) },
    { step: "Decision", note: `${s.owner.first} approved one with a signature`, r: readinessOf(project, [...written, option("approved")], asked) },
  ];
}

/** Where the work stood before it started: the readiness meter, then each outline part and where it went */
function ReadySection({ s }: { s: Scenario }) {
  const parts = outlineOfScenario(s);
  const path = readyPath(s);
  const label = (id: OutlinePart) => OUTLINE_PARTS.find((x) => x.id === id)!.label;
  return (
    <section id="ready" className="example-layer" aria-labelledby="ready-h">
      <p className="eyebrow">Before step 1</p>
      <h2 id="ready-h" className="example-h">Ready for Execute <small className="ready-pct">{path[3]!.r.percent}%</small></h2>
      <p className="muted">Every project gets ready first: an outline, an assessment, options, and one signed decision. In a real project this meter sits on the Overview.</p>
      <div className="card ready-example">
        <ol className="ready-path">
          {path.map((x) => (
            <li key={x.step}>
              <span className="tick on" aria-hidden="true"><Check size={12} /></span>
              <span><b>{x.step}</b> <span className="muted small">{x.note}</span></span>
              <span className="ready-pct">{x.r.percent}%</span>
            </li>
          ))}
        </ol>
        <span className="ready-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100} aria-label="Ready for Execute"><i style={{ width: "100%" }} /></span>
        <p className="small muted">Ten points per outline part, ten for the assessment, ten for options, twenty for the decision. Only a decision reaches 100%.</p>
      </div>
      <div className="example-cards">
        <article className="card">
          <h3>The outline, as {s.owner.first} wrote it</h3>
          <p className="small muted">Six parts in plain words. None had to be perfect.</p>
          <ul className="outline-example">
            {parts.map((x) => (
              <li key={x.id}>
                <b>{label(x.id)}</b>
                <span>{x.wrote}</span>
                <span className="small muted">{OUTLINE_CARRIES[x.id]} <a href={`#${x.layer}`}>See it in {layerName(x.layer)}</a>.</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}


/** The example project in the portal's frame: its top bar, a picker, a contents row, then each layer */
export function Example() {
  // The page scrolls as the document here, so the status-bar tap returns to the top
  useDocumentScroll();
  // The site's family and mode: applied here (Neo's window reads it too) and following the switch in other tabs
  const [look, setLook] = useSiteTheme();
  const [params, setParams] = useSearchParams();
  // The engagement on screen. A pick swaps it in place (a cross-fade in Matrix, at once in Sentinel), with no page load
  const [id, setId] = useState<ScenarioId>(() => scenarioOf(params.get("scenario")).id);
  const fromAddress = scenarioOf(params.get("scenario")).id;
  // Back and forward change the address; the page follows it
  useEffect(() => { setId(fromAddress); }, [fromAddress]);
  const picker = useRef<HTMLElement>(null);
  // The contents bar is the Knowledge Center's "On this page" bar: it names the layer in view and opens the list of layers
  const [tocOpen, setTocOpen] = useState(false);
  const tocBar = useRef<HTMLDivElement>(null);
  // Escape or a press outside closes the list
  useEffect(() => {
    if (!tocOpen) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setTocOpen(false); };
    const away = (e: Event) => { if (tocBar.current && !tocBar.current.contains(e.target as Node)) setTocOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", away); };
  }, [tocOpen]);
  // The layer and the card on screen. Each card's heading is a subtopic of its layer, found on the page itself (so the list always
  // matches what is drawn) and given an address so the contents can jump to it
  const [here, setHere] = useState("ready");
  const [sub, setSub] = useState("");
  const [subs, setSubs] = useState<Record<string, { id: string; text: string }[]>>({});
  useEffect(() => {
    const found: Record<string, { id: string; text: string }[]> = {};
    for (const x of ["ready", ...LAYERS]) {
      const heads = [...document.querySelectorAll<HTMLElement>(`#${x} article.card > h3`)];
      found[x] = heads.map((h, i) => { if (!h.id) h.id = `${x}-card-${i}`; h.style.scrollMarginTop = "calc(var(--top-h) + var(--demo-h, 0px) + 60px)"; return { id: h.id, text: h.textContent ?? "" }; });
    }
    setSubs(found);
  }, [id]);
  useEffect(() => {
    const ids = ["ready", ...LAYERS];
    const look = () => {
      const line = (tocBar.current && tocBar.current.getClientRects().length ? tocBar.current.getBoundingClientRect().bottom : 64) + 32;
      let current = ids[0]!;
      for (const x of ids) { const el = document.getElementById(x); if (el && el.getBoundingClientRect().top <= line) current = x; }
      setHere(current);
      let now = "";
      for (const h of document.querySelectorAll<HTMLElement>(`#${current} article.card > h3`)) { if (h.getBoundingClientRect().top <= line) now = h.id; }
      setSub(now);
    };
    look();
    // The page scrolls inside the body on some phones, not the window, so scrolls are heard in the capture phase
    addEventListener("scroll", look, { passive: true, capture: true });
    addEventListener("resize", look);
    return () => { removeEventListener("scroll", look, { capture: true }); removeEventListener("resize", look); };
  }, [id]);
  // Where the picker sat before a pick; once the new engagement is drawn, the page scrolls by any difference
  const pickerTop = useRef<number | null>(null);
  useLayoutEffect(() => {
    const before = pickerTop.current;
    pickerTop.current = null;
    const after = picker.current?.getBoundingClientRect().top;
    if (before !== null && after !== undefined && Math.abs(after - before) > 0.5) scrollBy({ top: after - before, behavior: "instant" });
  }, [id]);
  const pickScenario = (e: MouseEvent<HTMLAnchorElement>, next: ScenarioId) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // a new tab or window loads it as usual
    e.preventDefault();
    if (next === id) return;
    // The picker stays where it was under the pointer, even if the title above it takes another line
    pickerTop.current = picker.current?.getBoundingClientRect().top ?? null;
    // The address changes inside the same change, so the old engagement is what the fade starts from
    fade(() => { setId(next); setParams({ scenario: next }, { preventScrollReset: true }); });
  };
  const s = SCENARIOS[id];
  const subName = (subs[here] ?? []).find((x) => x.id === sub)?.text;
  const TOC: { id: string; name: string; hint: string; layer?: Layer }[] = [{ id: "ready", name: "Ready", hint: "outline to decision" }, ...LAYERS.map((l) => ({ id: l, name: layerName(l), hint: layerHint(l), layer: l }))];
  const STORY = storyOf(s);
  const q = (id: string) => `?scenario=${id}`;
  // The layers, each with its cards beneath it: in the bar's list on a narrow screen and open in the side on a wide one
  const tocList = (open: boolean) => (
    <ul>
      {TOC.map((t) => (
        <li key={t.id}>
          <a href={`#${t.id}`} aria-current={here === t.id ? "location" : undefined} tabIndex={open ? undefined : -1} onClick={() => setTocOpen(false)}>
            {t.layer ? <LayerBadge layer={t.layer} /> : null}<span>{t.name}</span><small>{t.hint}</small>
          </a>
          {(subs[t.id] ?? []).length > 0 && (
            <ol>
              {(subs[t.id] ?? []).map((c) => (
                <li key={c.id}><a href={`#${c.id}`} aria-current={sub === c.id ? "location" : undefined} tabIndex={open ? undefined : -1} onClick={() => setTocOpen(false)}>{c.text}</a></li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="shell example">
      {/* The signed-in portal's top bar, with the way into the demo where search would be */}
      <header className="top">
        {/* The portal's own mark and name, as Home shows them, leading to the 1NEON entry page */}
        <a className="top-brand" href="/1NEON/" title="1NEON" aria-label="1NEON, entry page"><span className="mark-box" aria-hidden="true"><Rings /></span><span className="lbl">1NEON</span></a>
        <div className="crumb"><span className="crumb-tail">Sample project</span></div>
        <span className="top-acts">
          <a className="btn btn-ghost btn-sm" href="/">neon1.tech</a>
          {/* Short in the bar so it holds one line on a phone; the end card says the length */}
          <a className="btn btn-primary btn-sm" href={`/1NEON/live${q(s.id)}`}>Watch it</a>
          <a className="btn btn-ghost btn-sm" href="/1NEON/demo/"><span className="wide-only">Interactive demo</span><span className="narrow-only">Demo</span></a>
          {/* The site's light or dark switch, as on the other public pages */}
          <ThemeSwitch theme={look} onChange={setLook} />
        </span>
      </header>
      <main className="content example-body" id="main">
        <p className="eyebrow">Sample project · {s.family} · every name, number, and file is made up</p>
        <h1 className="page-title">{s.org.name}: {s.project.name}</h1>
        <p className="lead">{s.blurb} See how it got ready, then follow it through the four layers, setbacks included.</p>
        {/* Which engagement: three, from three kinds of work */}
        <nav className="example-picker" aria-label="Sample projects" ref={picker}>
          {SCENARIO_IDS.map((k) => (
            <a key={k} href={q(k)} aria-current={k === s.id ? "page" : undefined} onClick={(e) => pickScenario(e, k)}>
              <b>{SCENARIOS[k].org.name}</b>
              <span>{SCENARIOS[k].family}</span>
            </a>
          ))}
        </nav>
        {/* Contents: jump to a layer */}
        {/* Contents: stays under the top bar, names the layer in view, and opens the list of layers */}
        <div className="toc-bar" ref={tocBar} data-open={tocOpen || undefined}>
          <nav className="toc-in" aria-label="Layers">
            <button type="button" className="toc-head" aria-expanded={tocOpen} aria-controls="toc-list" onClick={() => setTocOpen((o) => !o)}>
              <b>On this page</b>
              <span>{TOC.findIndex((t) => t.id === here) + 1} of {TOC.length} · <b>{TOC.find((t) => t.id === here)?.name}</b>{subName ? <> / {subName}</> : null}</span>
              <i className="arr" aria-hidden="true" />
            </button>
            <div className="toc-body" id="toc-list">
              {tocList(tocOpen)}
            </div>
          </nav>
        </div>
        {/* On a wide screen the contents stay open at the side, as a Knowledge Center document's do */}
        <nav className="toc-side" aria-label="Layers and cards">
          <p className="toc-side-title">On this page</p>
          {tocList(true)}
        </nav>
        <ReadySection s={s} />
        {LAYERS.map((l, i) => (
          <section key={l} id={l} className="example-layer" aria-labelledby={`${l}-h`}>
            <p className="eyebrow">Step {i + 1}</p>
            <h2 id={`${l}-h`} className="example-h"><LayerBadge layer={l} />{layerName(l)}</h2>
            <p className="muted">{STORY[l].lead}</p>
            <div className="example-cards">
              {[...carriedCards(s, l), ...STORY[l].cards].map((c) => (
                <article key={c.title} className="card">
                  <h3>{c.title}</h3>
                  {c.lines.map((x, j) => (typeof x === "string" ? <p key={j} className="small muted">{x}</p> : <p key={j}><b>{x[0]}:</b> {x[1]}</p>))}
                  {c.list && (
                    <ul className="example-list">
                      {c.list.map((x) => <li key={x.text} className={x.state}>{x.text}{x.tag && <span className={`tag ${x.state === "picked" ? "rec" : "warn"}`}>{x.tag}</span>}</li>)}
                    </ul>
                  )}
                  {c.piece && <PieceView p={c.piece} />}
                </article>
              ))}
            </div>
          </section>
        ))}
        {/* The end: one primary way on (watch it), the demo as quiet text beneath, then a real project */}
        <section className="example-end card">
          <p>That's the whole loop. A real project follows the same steps with its own need, setbacks, and numbers.</p>
          <div className="actions">
            <a className="btn btn-primary" href={`/1NEON/live${q(s.id)}`}>Watch it (about 3 minutes)</a>
            <OutLink className="btn btn-ghost" href="https://calendly.com/1isgladtobeofservice/neon1-consultation">Book a call</OutLink>
          </div>
          <p className="small muted">Prefer to click around? <a href="/1NEON/demo/">Try the interactive demo</a>.</p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
