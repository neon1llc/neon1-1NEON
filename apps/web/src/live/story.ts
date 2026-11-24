// apps/web/src/live/story.ts - The live playback's story: a client of neon1 (the scenario in play,
// lib/scenarios.ts) and Pradeep at neon1 take one project from a first sign-in to ongoing care. The
// cursor is the client's; Pradeep's side arrives the way it would for her, through the page and the
// notification bell. Three made-up engagements share these chapters, and each brings its own friction.


import { demoPaymentEvent } from "../components/Billing.tsx";
import { liveEngine } from "../lib/api.ts";
import { CARE, fileText, sum } from "../lib/scenarios.ts";
import type { Section, Show, Stage } from "./player.ts";
import { signInWithCode, walkTo } from "./opening.ts";
import { PRADEEP } from "./seed.ts";
import { CHOSEN, COLLEAGUE, MONEY, OWNER, S, SUMMARY } from "./scenario.ts";
import { FULL_LENGTH } from "./where.ts";


// The client's organization, and the project once it exists
export const SLUG = S.org.slug;
export const KEY = S.template.key;
export const base = `/o/${SLUG}`;
/** The chosen option's ID in the first proposal, and the letter after a scope change */
export const LETTER = "ABC"[S.chosen]!;
export const CODE = `0039-r1-${LETTER}`;
export const CODE_R2 = `0039-r2-${LETTER}`;
/** The owner's first name for captions, and the first name of the teammate */
const owner = S.owner.first;
const mate = S.colleague.first;

// Pradeep's calls go through the in-browser API, as if from his own browser
const engine = async () => (await liveEngine())!;
async function as<T>(path: string, method = "GET", body?: unknown) {
  return (await engine()).actAs<T>(PRADEEP, path, method, body);
}
type P = { id: string; key: string; version: number; stageId: string };
type I = { id: string; kind: string; title: string; body?: string; version: number; status: string; fields: Record<string, unknown> };
// The client's organization ID, and its project with every item, fresh each time
export async function tid() {
  const me = await as<{ orgs: { id: string; slug: string }[] }>("/me");
  return me.orgs.find((o) => o.slug === SLUG)!.id;
}
async function project() {
  const t = await tid();
  const p = (await as<P[]>(`/t/${t}/projects`)).find((x) => x.key === KEY)!;
  const d = await as<{ items: I[] }>(`/t/${t}/projects/${p.id}`);
  return { t, p, items: d.items };
}
// Pradeep adds an item, moves the project to a stage, or changes an item
export async function add(kind: string, title: string, extra: Record<string, unknown> = {}) {
  const { t, p } = await project();
  return as<I>(`/t/${t}/projects/${p.id}/items`, "POST", { kind, title, ...extra });
}
export async function moveTo(stageId: string, reason?: string) {
  const { t, p } = await project();
  await as(`/t/${t}/projects/${p.id}/move`, "POST", { version: p.version, stageId, reason });
}
export async function patch(match: (i: I) => boolean, body: Record<string, unknown>) {
  const { t, p, items } = await project();
  const i = items.find(match)!;
  await as(`/t/${t}/projects/${p.id}/items/${i.id}`, "PATCH", { version: i.version, ...body });
}
// Pradeep deletes an item (a template placeholder the project doesn't need)
async function remove(match: (i: I) => boolean) {
  const { t, p, items } = await project();
  for (const i of items.filter(match)) await as(`/t/${t}/projects/${p.id}/items/${i.id}?version=${i.version}`, "DELETE");
}
// A calendar date some days before today, for work the story says happened earlier
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
// Pradeep logs the hours of one part of the work, each with what was done
async function logHours(phase: (typeof S.hours)[number]["phase"]) {
  for (const h of S.hours.filter((x) => x.phase === phase)) await add("time", h.work, { fields: { date: daysAgo(h.when), hours: h.hours } });
}
// A metric's category: money is cost, a network's measures are security, the rest performance
const categoryOf = (unit: string) => (unit === "$" ? "cost" : S.id === "fenwick" ? "security" : "performance");


// --- Pradeep's side, shared with the short preview (preview.ts) ------------------------

/**
 * Listen: what Pradeep writes down after the first call. What he learned, the limits every option has
 * to respect, the client's accounts the work touches, and the measures with their numbers. The
 * template's placeholders that don't fit this project go
 */
export async function listenNotes() {
  for (const [title, body] of S.learned) await add("discovery", title, { body, status: "done" });
  await patch((i) => i.kind === "discovery" && i.title.startsWith("What would 'better'"), { body: S.better, status: "done" });
  for (const [title, body] of S.constraints) await add("constraint", title, { body });
  await remove((i) => i.kind === "asset");
  for (const title of S.assets) await add("asset", title);
  // The measures: the client's own keep their numbers, the template's don't apply, and the rest are added
  await remove((i) => i.kind === "metric" && !S.measures.some((m) => m.title === i.title));
  const { items } = await project();
  for (const m of S.measures) {
    const fields = { category: categoryOf(m.unit), unit: m.unit, direction: m.direction, baseline: m.baseline, target: m.target };
    const have = items.find((i) => i.kind === "metric" && i.title === m.title);
    if (have) await patch((i) => i.id === have.id, { fields: { ...have.fields, ...fields } });
    else await add("metric", m.title, { fields });
  }
}

/**
 * The options, each with what's in and out, the hours or price behind it, what the client pays vendors
 * directly, and the result she can check; shared for approval, and the project moves to Decide. One
 * neon1 set aside (the client's "no") stays declined, and is never issued. Prices are made up and
 * not a quote (lib/scenarios.ts)
 */
export async function proposeOptions() {
  await moveTo("propose");
  for (const [n, { title, body, fields }] of S.options.entries()) {
    const o = await add("option", title, { body, fields });
    const { t, p } = await project();
    await as(`/t/${t}/projects/${p.id}/items/${o.id}`, "PATCH", { version: o.version, status: S.declined.includes(n) ? "declined" : "proposed" });
  }
  // Issuing freezes the numbered revision she approves from (Proposal 0039-r1)
  const { t, p } = await project();
  await as(`/t/${t}/projects/${p.id}/proposals`, "POST", { note: "" });
  await moveTo("decide");
}

/** The client's decision maker signs neon1's service agreement through the API, for the short preview, which skips reading it */
export async function signAgreementAsOwner() {
  const t = await tid();
  const e = await engine();
  const a = await e.actAs<{ edition: string; hash: string; signed?: unknown }>(OWNER, `/t/${t}/agreement`);
  if (!a.signed) await e.actAs(OWNER, `/t/${t}/agreement/sign`, "POST", { edition: a.edition, hash: a.hash, typedName: S.owner.name, consent: true });
}

/** The plan: a milestone, the tasks, the first hours, and a first update */
export async function planWork() {
  await add("milestone", S.milestone, { dueDate: inDays(14) });
  for (const title of S.tasks) await add("task", title);
  await logHours("plan");
  await add("update", S.updates.plan.title, { body: S.updates.plan.body, fields: { health: "on_track" } });
}

/** Pradeep issues the deposit drafted when the client approved */
export async function issueDeposit() {
  await issue("deposit");
}

/** Pradeep checks the final invoice drafted when the client accepted the handover, and issues it */
export async function issueFinal() {
  await issue("final");
}

// Issue the draft invoice of one type, as Pradeep would from Execute
async function issue(type: string) {
  const { t, p, items } = await project();
  const draft = items.find((i) => i.kind === "invoice" && i.status === "draft" && i.fields.type === type);
  if (draft) await as(`/t/${t}/projects/${p.id}/invoices/${draft.id}/issue`, "POST", { version: draft.version });
}

/** Her bank (ACH) payment clears; in the walkthrough it's recorded as Stripe's webhook would */
export async function depositPaid() {
  await paid("deposit");
}

/** The final invoice's bank payment clears the same way */
export async function finalPaid() {
  await paid("final");
}

// The bank clears the transfer she started on an issued invoice of one type, reported as Stripe would;
// if she never started one (a chapter was skipped), the whole of it is recorded as paid by bank transfer
async function paid(type: string) {
  const { t, p, items } = await project();
  const inv = items.find((i) => i.kind === "invoice" && i.status === "issued" && i.fields.type === type);
  if (!inv) return;
  const started = items.find((i) => i.kind === "payment" && i.status === "pending" && i.fields.invoiceId === inv.id);
  if (started) return demoPaymentEvent({ id: (started.fields.stripe as { session: string }).session, amountCents: Number(started.fields.amountCents), invoiceNumber: String(inv.fields.number), metadata: { tenantId: t, projectId: p.id, invoiceId: inv.id } }, "bank_cleared");
  const cents = (inv.fields.lines as { qty: number; unitCents: number }[]).reduce((n, l) => n + Math.round(l.qty * l.unitCents), 0);
  await as(`/t/${t}/projects/${p.id}/invoices/${inv.id}/payments`, "POST", { amountCents: cents, method: "ach", ref: "Stripe bank transfer", receivedAt: new Date().toISOString().slice(0, 10) });
}

/** Everything built, with its hours logged, and the files that show it; the dry run is left */
export async function finishWork() {
  for (const title of S.tasks.slice(0, 4)) await patch((i) => i.title === title, { status: "done" });
  await logHours("build");
  await uploadFiles("build");
}

/** Pradeep uploads the pieces of work that belong to one moment of the story */
export async function uploadFiles(when: "build" | "observe") {
  const { t, p } = await project();
  for (const f of S.files.filter((x) => x.when === when)) await (await engine()).uploadAs(PRADEEP, t, f.name, fileText(f.name), { layer: f.layer, projectId: p.id });
}

/**
 * The dry run and what it found. Where the story has a scope change (Harborline), the failure was
 * posted earlier (failedDryRun) and this is the second run; otherwise the failure, its fix, and the
 * rerun all post here, so the record shows what went wrong and what changed
 */
export async function dryRun() {
  await patch((i) => i.title === S.tasks[4], { status: "done" });
  if (S.revision) await logHours("retest");
  else {
    await logHours("test");
    await add("update", S.updates.fail.title, { body: S.updates.fail.body, fields: { health: "at_risk" } });
  }
  await add("update", S.updates.pass.title, { body: S.updates.pass.body, fields: { health: "on_track" } });
}

/** The first dry run finds the wrong assumption: its hours, and an update that says so plainly */
export async function failedDryRun() {
  await logHours("test");
  await add("update", S.updates.fail.title, { body: S.updates.fail.body, fields: { health: "at_risk" } });
}

/**
 * Revised terms: a copy of the approved option with the extra work and hours, shared and issued as the
 * proposal's next revision, so the client approves exactly what changed (and what didn't)
 */
export async function reviseTerms() {
  const rev = S.revision;
  if (!rev) return;
  const { t, p, items } = await project();
  const chosen = items.find((i) => i.kind === "option" && i.status === "approved")!;
  const basis = [...(CHOSEN.fields.basis ?? []), ...rev.basisAdd];
  const fields = { ...CHOSEN.fields, basis, hoursLow: rev.hoursLow, hoursHigh: rev.hoursHigh, depositPercent: rev.depositPercent, hours: `${rev.hoursLow} to ${rev.hoursHigh} hours`, cost: `$${(rev.hoursLow * 100).toLocaleString("en-US")} to $${(rev.hoursHigh * 100).toLocaleString("en-US")} estimate`, why: rev.why, revises: chosen.id };
  const body = `${chosen.body ?? ""}\n\nRevised terms:\n- ${rev.change}`;
  const copy = await as<I>(`/t/${t}/projects/${p.id}/items`, "POST", { kind: "option", title: rev.title, body, status: "draft", fields });
  await as(`/t/${t}/projects/${p.id}/items/${copy.id}`, "PATCH", { version: copy.version, status: "proposed" });
  await as(`/t/${t}/projects/${p.id}/proposals`, "POST", { note: `Revised terms: ${rev.change}` });
}

/** The walkthrough the teammate takes, which the client marks done at handover */
export const TRAINING = S.training;

/** Handover: the stage, the runbook, the walkthrough, and the last hours */
export async function handOver() {
  await moveTo("handover");
  const { t, p } = await project();
  await (await engine()).uploadAs(PRADEEP, t, `${S.org.slug}-runbook.txt`, S.runbook, { layer: "next", projectId: p.id });
  await add("training", TRAINING);
  await logHours("handover");
}


/** A file waiting on the "desktop" at the bottom left, ready to drag into the page */
function deskFile(name: string) {
  const el = document.createElement("div");
  el.className = "live-desk-file";
  el.textContent = name;
  document.body.append(el);
  return el;
}


/** Drag a file from the desk onto an upload target; the bytes go up as the client */
async function dropFile(s: Stage, target: Parameters<Stage["click"]>[0], name: string, text: string, at: { layer: string; itemId?: (items: I[]) => string | undefined }) {
  const f = deskFile(name);
  try {
    await s.wait(500);
    await s.drag(".live-desk-file", target, async () => {
      const { t, p, items } = await project();
      await (await engine()).uploadAs(OWNER, t, name, text, { layer: at.layer, projectId: p.id, itemId: at.itemId?.(items) });
    });
  } finally {
    f.remove();
  }
}


/** On the stand-in payment page: US bank account, the made-up bank, the business checking account,
 * then Pay, and the receipt once it has processed. `thought` is why she picks the bank */
async function bankCheckout(s: Stage, thought: string) {
  await s.think(thought);
  await s.click({ sel: "dialog[open] .dc-methods button", text: "US bank account" }, 700);
  await s.click({ sel: "dialog[open] .dc-choice", text: "Sample Community Bank" }, 800);
  await s.click({ sel: "dialog[open] .dc-choice", text: "Business checking" }, 700);
  await s.click({ sel: "dialog[open] .dc-submit" }, 600);
  await s.waitFor({ sel: "dialog[open] .dc-done" });
  await s.hover({ sel: "dialog[open] .dc-done h2" }, 1200);
}

// The option's article in the list, by its place (the first, the second); one neon1 set aside isn't drawn
export const article = (n: number) => `.options article:nth-child(${n + 1})`;
// What the deposit is, in the words of the invoice's own line
const depositWhat = MONEY.fixed ? `half of the fixed price, ${MONEY.low}` : `half of the low end, ${MONEY.firstLow}`;
// The count of options she compares, without the one neon1 set aside
const live = S.options.length - S.declined.length;
const care = CARE[S.id];
const countWord = ["no", "one", "two", "three"][live]!;
const optionsWord = live === 1 ? "an option" : `${countWord} options`;

/** The sections, in order. Titles are what the Back and Next buttons say. Captions (say) narrate in
 * the bar; thoughts (think) are the client's own, beside the cursor, at each look and move */
export const STORY: Section[] = [
  {
    id: "signin",
    // She signs in and looks around Home, so the chapter says both
    title: "Sign in to Home",
    run: async (s) => {
      await s.say(S.voice.opens);
      await s.think("Pradeep said our project lives here. Let me sign in.");
      await s.wait(600);
      await signInWithCode(s);
      await s.say("Home shows what needs her and what's new");
      await s.hover({ sel: "h2.section-h", text: "Needs you" }, 900);
      await s.think("Nothing yet. And nothing on the calendar either.");
      await s.hover("[data-tour=coming-up] h2", 900);
      await s.think("The bell must be where news shows up.");
      await s.hover(".bell-btn", 900);
    },
  },
  {
    id: "profile",
    title: "Profile and alerts",
    why: "I keep getting more email than I want. Let me sign in and choose what reaches me.",
    run: async (s) => {
      await s.say(`${owner} opens a profile to choose what reaches ${owner} by email`);
      await s.go("/me");
      await s.waitFor("#notifications");
      await s.hover({ sel: "#notifications .notify-table tbody th", text: "Files" }, 700);
      await s.say(`Important changes already email ${owner}. Comments are added`);
      await s.think("The important ones are on already. I want comments too.");
      await s.click('input[aria-label="Email me: Comments"]', 500);
      // On a phone (either way up) the mini menu is tried, which keeps the menu's icons on screen
      const small = matchMedia("(max-width: 640px), (max-height: 500px)").matches;
      if (small) {
        await s.think("Menu: Default or Mini? Let me try Mini.");
        await s.click({ sel: ".chip", text: "Mini" }, 500);
      }
      // The profile saves by itself; the status line at the top says when
      await s.waitFor({ sel: ".settings-head [role=status]", text: "All changes saved." });
      if (small) {
        await s.say("The mini menu keeps every page one tap away");
        await s.click(".top .menu-btn", 900);
        await s.click(".scrim", 500);
        // Upright phones also have Menu at the end of the tab bar, in reach of a thumb
        if (await s.has(".tabbar .menu-btn")) {
          await s.click(".tabbar .menu-btn", 900);
          await s.click(".scrim", 500);
        }
      }
    },
  },
  {
    id: "team",
    title: "Invite the team",
    why: `${mate} is closest to this work. Let me sign in and get ${mate} onto 1NEON too.`,
    run: async (s) => {
      await s.say(S.voice.teamSay);
      await s.think(S.voice.teamThink);
      await s.go(`${base}/people`, "People");
      await s.click({ sel: "button", text: "Invite people" });
      await s.type("#emails", COLLEAGUE, 300);
      await s.think("Editor, so they can add things but not manage people.");
      await s.choose("#acc", "editor");
      await s.click({ sel: "button", text: "Send invitation" }, 1400);
      await s.hover({ sel: ".card, li, tr", text: COLLEAGUE }, 900);
    },
  },
  {
    id: "start",
    title: "Start a project",
    why: "Time to start the project. Let me sign in and set it up.",
    run: async (s) => {
      await s.say(S.voice.startSay);
      await s.go(`${base}/projects`, "Projects");
      await s.click({ sel: "a, button", text: "New project" }, 700);
      await s.think(S.voice.wrongTemplate);
      await s.hover({ sel: "label.option", text: S.template.wrong }, 400);
      await s.think(`${S.template.label}. That's the closest fit.`);
      await s.click({ sel: "label.option", text: S.template.label }, 500);
      await s.click({ sel: "button", text: /^Next$/ }, 700);
      await s.say("A few short answers, each with an example of what to write");
      await s.type("#n", S.project.name);
      await s.think(S.voice.nowThink);
      await s.type("#s", S.project.today);
      await s.type("#o", S.project.outcome);
      await s.think(S.voice.exampleThink);
      await s.type("#x", S.project.example);
      await s.choose("#d", inDays(S.project.dueDays));
      await s.click({ sel: "button", text: /^Next$/ }, 700);
      await s.say("How they'll know it worked: where things are now, and where they should be");
      const m = S.measures[0]!;
      await s.type("#mt0", m.title);
      await s.type("#mu0", m.unit);
      await s.think(S.voice.baselineThink);
      await s.type("#mb0", String(m.baseline));
      await s.type("#mg0", String(m.target));
      await s.click({ sel: "button", text: /^Next$/ }, 900);
      await s.click({ sel: "button", text: "Create project" }, 1600);
      await s.say("Its Overview says how ready it is for Execute, and what would help next");
      await s.think("Five of six parts are written. It says who and what it touches is still open, and where to write it.");
      await s.hover(".readiness", 1500);
    },
  },
  {
    id: "needs",
    title: "Tell neon1 what's needed",
    why: "I need to tell Pradeep exactly what we need. Let me sign in and write it down.",
    run: async (s) => {
      const n = S.needs;
      await s.say("In Needs, she builds her request from a few taps");
      await s.click({ sel: "nav.tabs a", text: "Needs" }, 900);
      await s.click({ sel: "button", text: "+ Add request" }, 600);
      const one = "form.sentence fieldset:nth-of-type(1)";
      for (const g of n.goals) await s.click({ sel: `${one} button`, text: g }, 280);
      await s.type(`${one} input[aria-label="Who or what it's for"]`, n.who);
      await s.type(`${one} textarea[aria-label="What happens now"]`, n.now);
      await s.click({ sel: `${one} .pick label`, text: n.often }, 300);
      await s.click({ sel: `${one} .pick label`, text: "on a date" }, 400);
      await s.choose(`${one} input[aria-label="Due date, or start of a range"]`, inDays(S.project.dueDays - 15));
      await s.choose(`${one} input[aria-label="End of the range (optional)"]`, inDays(S.project.dueDays - 5));
      await s.say("A second need, with an action of its own");
      await s.click({ sel: "button", text: "+ Define another need" }, 600);
      const two = "form.sentence fieldset:nth-of-type(2)";
      await s.click({ sel: `${two} button`, text: n.second.goal }, 300);
      if (n.second.own) {
        await s.think("None of these say it. I'll write my own.");
        await s.click(`${two} button[aria-label="Add your own action"]`, 300);
        await s.type(`${two} input[aria-label="Your own action"]`, n.second.own);
      }
      await s.click({ sel: `${two} input[aria-label="Who or what it's for"]` }, 200);
      await s.type(`${two} input[aria-label="Who or what it's for"]`, n.second.who);
      await s.click({ sel: `${two} .pick label`, text: n.second.due }, 400);
      await s.click({ sel: "button", text: "Send 2 requests" }, 1200);
      await s.type('textarea[aria-label^="Answer:"]', n.answer);
      await s.click({ sel: "button", text: "Save answer" }, 900);
      await s.think(S.voice.requirementThink);
      await s.click({ sel: "button", text: "+ Add requirement" }, 500);
      await s.click({ sel: ".starters .chip", text: n.requirement }, 300);
      await s.click({ sel: ".pick label", text: "must have" }, 300);
      await s.click({ sel: "form.add-form button", text: /^Add$/ }, 900);
    },
  },
  {
    id: "listen",
    title: "neon1 listens",
    why: "Pradeep asked me for a few things. Let me sign in and see what's new.",
    run: async (s) => {
      await s.say("Pradeep reads it, calls for thirty minutes, and writes down what he heard, limits included");
      await s.others(async () => {
        await moveTo("intake");
        await moveTo("listen");
        await listenNotes();
        await add("file_request", S.fileAsk.title, { body: S.fileAsk.body });
      }, 1200, "Pradeep asked for a file");
      await s.say("The bell breathes: something's new");
      await s.click(".bell-btn", 1400);
      await s.think(S.voice.listenThink);
      // Each notification opens what it's about: this one lands on the file request in Needs
      await s.click({ sel: ".bell-list a.note", text: S.fileAsk.bell }, 1000);
      await s.say("She drags the file in from her desktop");
      await dropFile(s, { sel: ".file-ask .chip, .file-ask button", text: "Upload" }, S.fileAsk.name, S.fileAsk.text, { layer: "needs", itemId: (items) => items.find((i) => i.kind === "file_request")?.id });
      await s.say("What he learned goes into the project, where she can correct it");
      await s.think(S.voice.listenWrote);
      await s.hover({ sel: ".item", text: S.learned[1]![0] }, 1100);
      await s.say("And the limits are said before any option is written");
      await s.think(S.voice.listenLimit);
      await s.hover({ sel: ".item", text: S.constraints[0]![0] }, 1100);
    },
  },
  {
    id: "propose",
    title: "Options arrive",
    why: "Pradeep said the options are ready. Let me sign in and see where it's at.",
    run: async (s) => {
      await s.say(live === 1 ? "Pradeep writes up his recommendation, with its price and what it gets her" : `Pradeep writes ${optionsWord}, each with its price and what it gets her${S.declined.length ? ", and sets one aside" : ""}`);
      await s.others(async () => {
        await proposeOptions();
      }, 1200, `Pradeep proposed ${optionsWord}`);
      await s.click(".bell-btn", 1400);
      await s.click(".bell-btn", 300);
      await s.top();
      await s.hover(".next-step, .card", 900);
      await s.click({ sel: "nav.tabs a", text: "Overview" }, 1000);
      await s.say("Overview shows the project's readiness for Execute: outline, assessment, and options done");
      await s.think("Eighty percent. The only step left is mine: approve one option.");
      await s.hover(".readiness", 1400);
    },
  },
  {
    id: "decide",
    title: "Choose an option",
    why: "I've thought about Pradeep's options. Let me sign in and approve one.",
    run: async (s) => {
      await s.say(`${owner} compares the options side by side`);
      await s.click({ sel: "a, button", text: "Compare options" }, 1200);
      for (const [n, o] of S.options.entries()) {
        if (S.declined.includes(n)) continue;
        const thought = [S.voice.compareA, S.voice.compareB, S.voice.compareC][n];
        if (!thought) continue;
        await s.think(thought);
        await s.hover({ sel: ".options article", text: o.title }, 900);
      }
      await s.say("Each price opens to show how it was worked out and when she pays");
      const inForce = article(S.chosen);
      await s.think(`${MONEY.firstRange} is real money for us. What's in it?`);
      if (await s.has(`${inForce} .basis summary`)) {
        await s.click(`${inForce} .basis summary`, 900);
        await s.think(S.voice.basisThink);
        // A fixed price has no hours table to read, only what it means and when it's paid
        if (await s.has(`${inForce} .basis-table`)) await s.hover(`${inForce} .basis-table`, 1500);
        if (await s.has(`${inForce} .basis-pay`)) {
          await s.think(`${MONEY.deposit} when I approve, the rest at handover.`);
          await s.hover(`${inForce} .basis-pay`, 1300);
        }
      } else {
        await s.hover(inForce, 1300);
      }
      await s.say("The full proposal: what he learned, scope, price, and who does what");
      await s.click({ sel: "a", text: "Read the proposal" }, 1200);
      await s.scroll(700, 1400);
      await s.scroll(900, 1400);
      await s.think(`It's numbered, 0039-r1, and each option has its own ID. Approving in 1NEON counts as choosing.`);
      await s.click({ sel: "a", text: "Back to options" }, 1200);
      await s.say("First, once, she signs neon1's service agreement for the organization");
      await s.think("It says to sign the service agreement first. One agreement covers every project.");
      await s.click({ sel: ".agreement-needed a", text: "Read and sign it" }, 1200);
      await s.scroll(900, 1400);
      await s.think(S.voice.agreementThink);
      await s.scroll(1600, 1200);
      await s.type("#agreement-sign-name", S.owner.name);
      await s.click("#agreement-sign-name ~ .sign-consent input", 400);
      await s.click({ sel: ".sign-card button", text: /^Sign for/ }, 1400);
      await s.click({ sel: "a.agreement-back", text: "Back to your options" }, 1200);
      await s.say("She approves the recommended option with a condition, and signs");
      await s.think(S.voice.approveThink);
      await s.click({ sel: `${inForce} button`, text: "Approve this option" }, 700);
      await s.say("The approval restates exactly what she's accepting");
      await s.think(`${MONEY.firstRange}${CHOSEN.fields.timeline ? `, ${String(CHOSEN.fields.timeline).split(",")[0]!.toLowerCase()}` : ""}. That's what I read.`);
      await s.hover("dialog[open] .terms-list", 1200);
      await s.think(S.voice.conditionThink);
      await s.type("#cond", S.condition);
      await s.type("#approve-sign-name", S.owner.name);
      await s.click("#approve-sign-name ~ .sign-consent input", 400);
      await s.click({ sel: "dialog[open] .actions button", text: /^Sign and approve/ }, 1600);
      await s.top();
      await s.hover(".decision", 1200);
      await s.say("Once she approves, Ready for Execute goes away. Her outline becomes the plan, its measure moves to Observe, and its people and tools shape the handover");
    },
  },
  {
    id: "pay",
    title: "Pay the deposit",
    why: "Pradeep's email says the deposit invoice is ready. Let me sign in and pay it.",
    run: async (s) => {
      await s.say(`The deposit is ${MONEY.fixed ? "half of the price" : "half the low estimate"}, so Pradeep issues that invoice`);
      await s.others(issueDeposit, 900, "Pradeep issued the deposit invoice");
      await walkTo(s, `${base}/projects/${KEY}/execute`);
      await s.top();
      await s.say("Next step says it's ready, and when it's due");
      await s.think(`${MONEY.deposit}, due in 15 days. That's the deposit I read about before I approved.`);
      await s.hover(".next-step", 1100);
      await s.click({ sel: ".next-step a", text: "See and pay" }, 1000);
      await s.say("Invoices live under Execute");
      await s.hover({ sel: ".invoice-row", text: "INV-" }, 900);
      await s.click({ sel: ".invoice-row a.title", text: "INV-" }, 1200);
      await s.say("The invoice shows its lines, due date, and how to pay");
      await s.think(`Deposit on ${CODE}, ${depositWhat}. It matches what I signed.`);
      await s.scroll(500, 1400);
      await s.think("Bank transfer is preferred. I'll do that.");
      await s.top();
      await s.say("Pay opens Stripe's payment page. 1NEON never sees her bank or card details");
      await s.click({ sel: ".pp-tools button", text: /^Pay / }, 1200);
      await s.say("No money moves in a walkthrough, so a stand-in opens, laid out like Stripe's page");
      await s.think(`${MONEY.deposit} to neon1. Right amount.`);
      await s.hover(".dc-amount", 1000);
      await s.say("She pays from the organization's bank account");
      await bankCheckout(s, "Bank transfer, like the invoice suggests.");
      await s.say("A bank payment is started, not finished. It clears in a few business days");
      await s.click({ sel: "dialog[open] .dc-done button", text: "Return to 1NEON" }, 1000);
      await s.hover(".pp-state", 1400);
      await s.others(depositPaid, 1200, "Her bank payment cleared");
      await s.think("Paid in full. It says so right on the invoice.");
      await s.hover(".inv-lines tfoot", 1200);
      await s.click({ sel: "a", text: "Back to invoices" }, 1000);
      await s.hover({ sel: ".invoice-row", text: "INV-" }, 1000);
    },
  },
  {
    id: "build",
    title: "The work",
    why: "The work's started. Let me sign in and see how it's going.",
    run: async (s) => {
      await s.say("On the board, she drags the project into Build");
      await s.go(`${base}/workflow`, "Board");
      await s.drag({ sel: "article.pcard", text: KEY }, '.col[aria-label^="Build"]');
      await s.wait(600);
      await s.say("Pradeep plans the work and posts an update");
      await s.others(planWork, 900, "Pradeep planned the work and posted an update");
      await s.click({ sel: "article.pcard a.name", text: S.project.name }, 1200);
      await s.click({ sel: "nav.tabs a", text: "Execute" }, 1000);
      await s.say("She opens a task and leaves a comment");
      await s.think(S.voice.commentThink);
      await s.click({ sel: ".item-open", text: S.tasks[S.comment.task]! }, 900);
      await s.type('textarea[aria-label="Write a comment"]', S.comment.text);
      await s.click({ sel: ".comment-box button", text: "Send" }, 900);
      await s.click('dialog[open] button[aria-label="Close"]', 600);
      if (S.purchase) {
        const buy = S.purchase;
        await s.say("The one purchase from her option is on the list, for the organization to buy");
        await s.think("I picked it up yesterday. Let me mark it bought.");
        await s.hover({ sel: ".item", text: buy.name }, 900);
        await s.choose(`select[aria-label="Where ${buy.name} stands"]`, "bought", 900);
        await dropFile(s, { sel: ".item:has(.purchase-meta) .file-ask .chip", text: "Attach the receipt" }, buy.receipt, buy.text, { layer: "execution", itemId: (items) => items.find((i) => i.kind === "purchase")?.id });
        await s.wait(700);
      }
      await s.others(finishWork, 1200, "Pradeep finished four tasks and added files");
      await s.hover({ sel: ".item", text: S.tasks[3] }, 900);
      if (await s.has("#hours .hours-table")) {
        await s.say("Each logged hour is listed beside the estimate she approved");
        await s.think(`${MONEY.loggedAfterBuild} so far${MONEY.fixed ? "" : `, of ${MONEY.firstHours}`}. Each one says what it was for.`);
        if (await s.has("#hours .hours-at")) await s.hover("#hours .hours-at", 1300);
        await s.hover("#hours .hours-table", 1300);
      }
    },
  },
  // A scope change after a failed test, where the story has one: the failure, the revised terms, and her signature
  ...(S.revision ? [{
    id: "change",
    title: "When the plan changes",
    why: "Pradeep says the first test found a problem. Let me sign in and see what he wants to change.",
    run: async (s: Stage) => {
      await s.say("Pradeep replays a week of real data. The first dry run finds a wrong assumption of his");
      await s.others(async () => { await moveTo("verify"); await failedDryRun(); await reviseTerms(); }, 1200, "Pradeep posted the failed dry run and revised terms");
      await s.click({ sel: "nav.tabs a", text: "Overview" }, 1000);
      await s.say("His update says what went wrong, including that it was his assumption");
      await s.think("He says the dry run flagged too much because he assumed the wrong thing.");
      await s.hover({ sel: ".card, article, section", text: S.updates.fail.title }, 1600);
      await s.say("The fix is outside what she approved, so it comes as revised terms, not a surprise invoice");
      await s.click({ sel: "nav.tabs a", text: "Needs" }, 1000);
      await s.think(`Ten more hours, and nothing else changes. ${MONEY.firstHours} becomes ${MONEY.hours}.`);
      await s.hover(".revised-terms", 1600);
      await s.say("She approves the revised terms, and signs again");
      await s.think("That's fair, and I'd rather know now than at the end.");
      await s.click({ sel: ".options article button", text: "Approve the revised terms" }, 700);
      await s.hover("dialog[open] .terms-list", 1200);
      await s.type("#approve-sign-name", S.owner.name);
      await s.click("#approve-sign-name ~ .sign-consent input", 400);
      await s.click({ sel: "dialog[open] .actions button", text: /^Sign and (approve|change)/ }, 1600);
      await s.top();
      await s.think("The new terms are on record, and the old ones stay readable.");
      await s.hover(".decision", 1200);
    },
  } satisfies Section] : []),
  {
    id: "observe",
    title: "Measure it",
    why: "Is any of this actually working? Let me sign in and check the numbers.",
    run: async (s) => {
      await s.say(S.revision ? "Pradeep reruns the dry run with the fix, then runs two weeks beside the old way and records the numbers" : "Pradeep tests it for real, including what fails, then records the numbers");
      await s.others(async () => {
        if (!S.revision) await moveTo("verify");
        await dryRun();
        const { t, p, items } = await project();
        // Three readings each, on the way from where it started to where it is now
        for (const mm of items.filter((i) => i.kind === "metric")) {
          const m = S.measures.find((x) => x.title === mm.title);
          if (!m) continue;
          await as(`/t/${t}/projects/${p.id}/items/${mm.id}`, "PATCH", { version: mm.version, fields: { ...mm.fields, readings: m.readings.map((value, k) => ({ at: daysAgo([10, 5, 1][k]!), value, note: "" })) } });
        }
        await uploadFiles("observe");
      }, 900, "Pradeep posted the test results and recorded the numbers");
      await s.click({ sel: "nav.tabs a", text: "Overview" }, 1000);
      if (!S.revision && (await s.has({ sel: ".card, article, section", text: S.updates.fail.title }))) await s.hover({ sel: ".card, article, section", text: S.updates.fail.title }, 1500);
      await s.hover({ sel: ".card, article, section", text: S.updates.pass.title }, 1500);
      await s.click({ sel: "nav.tabs a", text: "Observe" }, 1000);
      await s.say("Each measure shows its baseline, its target, and where it is now");
      await s.think(S.voice.numbersThink);
      await s.hover(".scores > *", 1200);
      await s.type('input[aria-label^="New reading"]', S.measures[0]!.newReading);
      await s.key("Enter");
      await s.wait(900);
      await s.go(`${base}/insights`, "Insights");
      await s.wait(1400);
      await s.scroll(400, 1200);
    },
  },
  {
    id: "handover",
    title: "Hand over",
    why: "Pradeep says it's ready to hand over. Let me sign in and go through it.",
    run: async (s) => {
      await s.say("Pradeep hands over a runbook, a walkthrough, and the accounts in her name");
      await s.others(handOver, 900, "Pradeep uploaded the runbook");
      await s.think(S.voice.handoverThink);
      await s.go(`${base}/projects`, "Projects");
      // The page remembers List or Timeline; the project row is in List
      await s.click({ sel: ".switch button", text: "List" }, 500);
      await s.click({ sel: ".ptr a", text: S.project.name }, 1000);
      await s.click({ sel: "nav.tabs a", text: "Normalize" }, 1000);
      await s.say("She checks off the handover as each step is done");
      const steps: [string, string][] = [
        ["Accounts are in the client's name", S.voice.stepAccounts],
        ["Admin access transferred to the client", S.voice.stepAdmin],
        ["Docs delivered and walked through", S.voice.stepDocs],
      ];
      for (const [t, thought] of steps) {
        await s.think(thought);
        await s.click(`input[aria-label="Done: ${t}"]`, 450);
      }
      await s.say(`${mate} takes the walkthrough, and ${owner} marks the training done`);
      await s.think(`${mate} walked through it, start to finish, with the runbook open.`);
      await s.click(`input[aria-label="Done: ${TRAINING}"]`, 600);
      await s.say(S.voice.acceptSay);
      await s.others(async () => {
        await patch((i) => i.title === "Older tools it replaces retired or merged, and leftovers cleaned up", { status: "done" });
        await patch((i) => i.title === "neon1 access reduced or removed", { status: "done" });
      }, 900, "Pradeep finished his two handover steps");
      await s.say("With every step done, she accepts the handover with one signature");
      await s.think(S.voice.trainedThink);
      await s.click('input[aria-label="Done: The people who use it are trained on it"]', 700);
      await s.click({ sel: ".handover-all button", text: "Accept the handover" }, 500);
      await s.type('.handover-all input[aria-label="What you checked (optional)"]', S.voice.acceptNote);
      await s.type("#accept-handover-name", S.owner.name);
      await s.click(".handover-all .sign-consent input", 400);
      await s.click({ sel: ".handover-all button", text: /^Sign and accept the handover$/ }, 1000);
      await s.hover(".accepted-note", 900);
      await s.say("Accepting the handover drafts the final invoice for Pradeep to check and send");
      await s.say("And adds ongoing care from a suggestion");
      await s.click({ sel: "button", text: "+ Add care item" }, 500);
      await s.click({ sel: ".starters .chip", text: care }, 300);
      await s.click({ sel: "form.add-form button", text: /^Add$/ }, 900);
    },
  },
  {
    id: "final",
    title: "Pay the final invoice",
    why: "Pradeep's email says the final invoice is ready. Let me sign in and check it.",
    run: async (s) => {
      await s.say(MONEY.fixed ? "Pradeep issues the final invoice: the fixed price, less her deposit" : "Pradeep issues the final invoice: logged hours, less her deposit");
      await s.others(issueFinal, 900, "Pradeep issued the final invoice");
      await walkTo(s, `${base}/projects/${KEY}/execute`);
      await s.top();
      await s.think(`${MONEY.final}. ${S.voice.finalThink}`);
      await s.hover(".next-step", 1000);
      await s.click({ sel: ".next-step a", text: "See and pay" }, 1000);
      await s.click({ sel: ".invoice-row.is-open a.title, .invoice-row.is-overdue a.title", text: "INV-" }, 1200);
      await s.say(MONEY.fixed ? "The invoice shows the arithmetic: the price agreed, less what was paid" : "The invoice shows the arithmetic, and lists every hour it bills");
      await s.think(MONEY.fixed ? `${MONEY.high} agreed, less the ${MONEY.deposit} I already paid. Nothing added.` : `${MONEY.logged} worked is ${MONEY.earned}, less the ${MONEY.deposit} I already paid. Inside the ${MONEY.high} the revised terms allow.`);
      await s.hover(".inv-lines", 1600);
      if (await s.has(".inv-hours")) {
        await s.think("And each hour, with the date and what it was for. Nothing to take on trust.");
        await s.hover(".inv-hours", 1500);
      }
      await s.top();
      await s.click({ sel: ".pp-tools button", text: /^Pay / }, 1200);
      await bankCheckout(s, "From the bank account again, like the deposit.");
      await s.click({ sel: "dialog[open] .dc-done button", text: "Return to 1NEON" }, 1000);
      await s.others(finalPaid, 1200, "Her bank payment cleared");
      await s.think("Paid in full. Both invoices stay here for my accountant.");
      await s.hover(".inv-lines tfoot", 1200);
    },
  },
  {
    id: "care",
    title: "Ongoing care",
    why: "It's been running a while. Let me sign in and see how things look across everything.",
    run: async (s) => {
      await s.others(async () => { await moveTo("care"); }, 700, "Pradeep moved the project to Care");
      await s.say("The whole project, on a timeline");
      await s.go(`${base}/projects`, "Projects");
      await s.click({ sel: ".switch button", text: "Timeline" }, 1600);
      await s.say("Every file in one place");
      await s.go(`${base}/documents`, "Files");
      await s.wait(1200);
      // The history is Home's Recent activity: who did what, newest first, the same feed a
      // client reaches from the menu (each item's panel keeps its own History too)
      await s.go(`${base}/workspace`, "Home");
      await s.say("And every change, kept as history");
      await s.hover('[data-tour="activity"]', 1800);
      await s.say("From a first request to a measured result, all in one place");
      await s.think(S.voice.careThink);
      await s.wait(1800);
    },
  },
];


/** The full story as a show: the card before Start introduces the client, and the end card says what happened */
export const FULL: Show = {
  id: "project",
  title: "The full story",
  blurb: `A whole engagement for ${S.org.name}, from a first sign-in to ongoing care`,
  length: FULL_LENGTH,
  intro: {
    heading: `Meet ${owner}`,
    text: [
      S.voice.intro,
      `You'll watch ${owner} sign in with a code from an email, set up alerts, invite a teammate, start a project, compare ${live === 1 ? "the recommendation" : `${optionsWord} with their prices`}, sign for one, pay the deposit, follow the work${S.revision ? ", approve a change after a test fails" : ""}, check the result, take the handover, and pay the final invoice. A line under the controls says what's happening, and thoughts appear beside the cursor. Every name, number, and file is made up.`,
    ],
  },
  end: "That's a whole project, start to finish.",
  recap: S.voice.recap,
  sections: STORY,
};

// The hours behind the chosen option, summed, for the check that the story's figures agree
export const EXPECTED_HOURS = sum(CHOSEN.fields.basis ?? []);
export const SUMMARY_LINES = SUMMARY;
