// apps/web/src/pages/Example.tsx - /1NEON/example: one made-up project, start to finish, in the
// portal's own frame. Three engagements from different families of work (lib/scenarios.ts), each with
// its setbacks and a few small pieces of the work itself. Public, no sign-in; it links to the working
// demo and the live playback.


import { useSearchParams } from "react-router";
import type { Layer } from "@1neon/domain";
import { OutLink } from "../components/OutLink.tsx";
import { LayerBadge, LAYERS, layerHint, layerName } from "../components/ui.tsx";
import { VLANS, type Table } from "../lib/artifacts.ts";
import { CARE, moneyOf, SCENARIO_IDS, SCENARIOS, scenarioOf, summaryOf, type Piece, type Scenario } from "../lib/scenarios.ts";


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
      lead: "What the client wants, what neon1 learned by listening, the ways to get there, and the choice.",
      cards: [
        { title: "Request", lines: [["Currently", s.project.today], ["Goal", s.project.outcome], ["Example", s.project.example]] },
        { title: "What neon1 learned", lines: ["After a twenty-minute call and a look at real records, written into the project where the client can correct it."], list: [
          ...s.learned.map(([q, a]) => ({ text: `${q} ${a}` })),
          ...s.constraints.slice(0, 2).map(([title, body]) => ({ text: `A limit, said before any option was written: ${lower(title)}. ${body}` })),
        ] },
        { title: "Options", lines: [`Proposal 0039-r1 offers ${s.options.length === 1 ? "one recommendation" : `${["", "", "two", "three"][s.options.length]} choices`}, because that is how many there were to offer. Each says what's in and out, how the price was worked out, anything to buy, and the result to check.${M.fixed ? " Each price here is fixed and illustrative." : ` Each price here is an estimate at ${M.rate} an hour, billed for the hours worked and never above its high end unless the client approves a change first. The figures are illustrative.`}`], list: s.options.map((o, n) => ({
          text: `${o.title.replace(/^[A-C]\. /, "")}: ${price(n)}${sums[n]!.hours ? `, ${sums[n]!.hours}` : ""}. ${String(o.fields.result ?? "")}`,
          state: n === s.chosen ? "picked" as const : s.declined.includes(n) ? "set-aside" as const : undefined,
          tag: n === s.chosen ? "chosen" : s.declined.includes(n) ? "set aside" : undefined,
        })) },
        { title: "Decision", lines: [
          `${first} read the proposal, signed neon1's service agreement once for ${s.org.name}, then approved 0039-r1-${"ABC"[s.chosen]}, ${chosen.title.replace(/^[A-C]\. /, "")}, with a typed signature and one condition: ${lower(s.condition)} The approval restated the terms first, including when ${first} pays: ${M.deposit} at approval, and the rest at handover. The decision, who made it, and those exact terms stay with the project.`,
          `Why this one: ${String(chosen.fields.why ?? "")}`,
          ...(declinedNames.length ? [`Set aside: ${declinedNames.join(", ")}. neon1 wrote it up, and the client chose not to go that way, so it is kept in the record as declined and never issued.`] : []),
        ] },
        ...pieces("needs"),
      ],
    },
    execution: {
      lead: "The work as it happens, with short updates, every hour listed, and what went wrong.",
      cards: [
        { title: "Work", lines: [], list: [
          ...s.tasks.map((text) => ({ text, state: "done" as const })),
          { text: s.milestone, state: "now" as const },
        ] },
        { title: "Hours", lines: [M.fixed ? `${M.logged} logged for the record; the price is fixed, so the hours don't change the invoice. The client sees the list grow as the work is done.` : `${M.logged} logged against an estimate of ${M.hours}, each with its date and what it was for. The client sees the list grow as the work is done.`], list: logged.slice(0, 3).map((h) => ({ text: `${h.work}: ${h.hours} ${h.hours === 1 ? "hour" : "hours"}`, state: "done" as const })).concat([{ text: `…and ${s.hours.length - 3} more entries, ${M.logged} in all`, state: "done" as const }]) },
        { title: "Updates", lines: [], list: [
          { text: `${s.updates.plan.title}. ${s.updates.plan.body}`, state: "done" },
          { text: `At risk: ${s.updates.fail.title}. ${s.updates.fail.body}`, state: "done" },
          { text: `On track: ${s.updates.pass.title}. ${s.updates.pass.body}`, state: "done" },
        ] },
        ...(s.revision ? [{ title: "Revised terms", lines: [`${s.revision.title}: ${s.revision.why}`, ["What changed", s.revision.change], `${s.revision.sign.split(" ")[0]} approved the revision as Proposal 0039-r2 before more hours were worked. What didn't change stays as signed.`] as Line[] }] : []),
        ...pieces("execution"),
        ...(s.purchase ? [{ title: "Purchases", lines: ["From the approved option, bought by the client in its own name."], list: [{ text: `${s.purchase.name}: paid ${s.purchase.paid}, receipt attached`, state: "done" as const }] }] : []),
        { title: "Invoices", lines: ["Each invoice says what it's for and how it was worked out, and is paid by bank transfer or card from the project."], list: [
          { text: `INV-0039-01, deposit: ${M.deposit}, ${M.fixed ? "half of the fixed price" : `half of the estimate's low end (${M.firstLow})`}. Paid`, state: "done" },
          { text: `INV-0039-02, final: ${M.fixed ? `the fixed price, ${M.earned}` : `${M.logged} at ${M.rate} is ${M.earned}`}, less the deposit, ${M.final}. It lists ${M.fixed ? "what it bills" : "every hour it bills"}. Paid`, state: "done" },
          { text: `Total for the work: ${M.earned}${M.fixed ? "" : `, inside the ${M.range} approved`}` },
        ] },
      ],
    },
    observation: {
      lead: "The same measures, before and after, so the result is a number, and the evidence behind it.",
      cards: [
        { title: "Measures", lines: ["Measured the same way before and after. Illustrative numbers."], list: [
          ...s.measures.map((m) => ({ text: `${m.title}: ${m.baseline} → ${m.readings[2]} (target ${m.direction === "down" ? "under" : "over"} ${m.target})`, state: "done" as const })),
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
        { title: "Care", lines: [`Optional: ${lower(CARE[s.id])}, plus small changes as the client grows. The client can also run it without neon1.`] },
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
    <svg className="piece-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Five network segments behind one firewall: staff, servers, devices, security, and guest. Guest reaches the internet only; security reaches nothing but two update hosts.">
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


/** The example project in the portal's frame: its top bar, a picker, a contents row, then each layer */
export function Example() {
  const [params] = useSearchParams();
  const s = scenarioOf(params.get("scenario"));
  const STORY = storyOf(s);
  const q = (id: string) => `?scenario=${id}`;
  return (
    <div className="shell example">
      {/* The signed-in portal's top bar, with the way into the demo where search would be */}
      <header className="top">
        <div className="crumb"><a href="/1NEON/">1NEON</a> / Sample project</div>
        <span className="top-acts">
          <a className="btn btn-ghost btn-sm" href="/">neon1.tech</a>
          {/* Short in the bar so it holds one line on a phone; the end card says the length */}
          <a className="btn btn-primary btn-sm" href={`/1NEON/live${q(s.id)}`}>Watch it</a>
          <a className="btn btn-ghost btn-sm" href="/1NEON/demo/">Interactive demo</a>
        </span>
      </header>
      <main className="content example-body" id="main">
        <p className="eyebrow">Sample project · {s.family} · every name, number, and file is made up</p>
        <h1 className="page-title">{s.org.name}: {s.project.name}</h1>
        <p className="lead">{s.blurb} Follow it through the four layers, including what went wrong along the way.</p>
        {/* Which engagement: three, from three kinds of work */}
        <nav className="example-picker" aria-label="Sample projects">
          {SCENARIO_IDS.map((id) => (
            <a key={id} href={q(id)} aria-current={id === s.id ? "page" : undefined}>
              <b>{SCENARIOS[id].org.name}</b>
              <span>{SCENARIOS[id].family}</span>
            </a>
          ))}
        </nav>
        {/* Contents: jump to a layer */}
        <nav className="tabs" aria-label="Layers">
          {LAYERS.map((l) => <a key={l} href={`#${l}`}><LayerBadge layer={l} /><span className="tab-name">{layerName(l)}<small className="sub"><span className="sr">, </span>{layerHint(l)}</small></span></a>)}
        </nav>
        {LAYERS.map((l, i) => (
          <section key={l} id={l} className="example-layer" aria-labelledby={`${l}-h`}>
            <p className="eyebrow">Step {i + 1}</p>
            <h2 id={`${l}-h`} className="example-h"><LayerBadge layer={l} />{layerName(l)}</h2>
            <p className="muted">{STORY[l].lead}</p>
            <div className="example-cards">
              {STORY[l].cards.map((c) => (
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
          <p>That's the whole loop. A real project follows the same steps, with its own need, its own setbacks, and its own numbers.</p>
          <div className="actions">
            <a className="btn btn-primary" href={`/1NEON/live${q(s.id)}`}>Watch it (about 3 minutes)</a>
            <OutLink className="btn btn-ghost" href="https://calendly.com/1isgladtobeofservice/neon1-consultation">Book a free call</OutLink>
          </div>
          <p className="small muted">Would rather click around yourself? <a href="/1NEON/demo/">Try the interactive demo</a>.</p>
        </section>
      </main>
    </div>
  );
}
