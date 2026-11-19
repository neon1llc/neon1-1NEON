// apps/web/src/lib/scenarios.ts - The made-up engagements every walkthrough, the sample project page,
// and the interactive demo follow. Three clients, each from a different family of neon1's work, each
// with friction a real project has: a rejected option, a failed test, a rollback, a revised scope, a
// postponed release, a limit accepted. Each scenario's facts live here once, and its money is worked
// out with the same rules a real project uses (packages/domain billing), so no page can quote a
// figure the others don't. Every name, number, and file is made up; none is a quote or a price list.


import { DEPOSIT_PERCENT, dollars, hoursRange, hoursText, priceLine, priceOf, type BasisLine, type Price } from "@1neon/domain";
import { ACCESS_REVIEW, canaryTable, costTable, evalTable, exceptionTable, FILES, FULL_COMPARISON, monthly, restoreTable, RESTORE_AFTER, RESTORE_FIRST, ROLLBACK_MINUTES, ruleTable, vlanTable, type Kind, type Table } from "./artifacts.ts";


export type ScenarioId = "harborline" | "quillwork" | "fenwick";
export const SCENARIO_IDS: ScenarioId[] = ["harborline", "quillwork", "fenwick"];
export const DEFAULT_SCENARIO: ScenarioId = "harborline";

/** A person in the story: how they sign in, what the others call them, and what they do */
export interface Person { name: string; first: string; email: string; title: string }

/** One option as Pradeep writes it: the title, the details, and its fields */
export interface Opt { title: string; body: string; fields: Record<string, unknown> & { pricing: "estimate" | "fixed"; basis?: BasisLine[] } }

/** One logged hour: what was done, how long, how many days before the handover, and in which part */
export interface Hour { work: string; hours: number; when: number; phase: "plan" | "build" | "test" | "retest" | "handover" }

/** A piece of real work shown on the sample page: working (runs here on made-up data) or an illustration */
export interface Piece { title: string; kind: Kind; layer: "needs" | "execution" | "observation" | "next"; note: string; table?: Table; diagram?: "network" }

export interface Scenario {
  id: ScenarioId;
  /** The family of work, as neon1 names it, for the picker and the sample page */
  family: string;
  /** One line on what the engagement is, for the picker */
  blurb: string;
  /** The engagement type from the engagement guide this one is */
  engagement: string;
  org: { name: string; slug: string; place: string; about: string };
  owner: Person & { role: string };
  colleague: Person & { role: string };
  /** The project's template (and the label on its card), the one that is wrong for her, and its key */
  template: { id: string; label: string; wrong: string; key: string };
  project: { name: string; today: string; outcome: string; example: string; dueDays: number };
  measures: { title: string; unit: string; baseline: number; target: number; direction: "down" | "up"; readings: [number, number, number]; newReading: string }[];
  learned: [string, string][];
  better: string;
  constraints: [string, string][];
  assets: string[];
  fileAsk: { title: string; body: string; name: string; text: string; bell: string };
  options: Opt[];
  /** The option approved; the ones neon1 set aside as declined before issuing (the client's "no") */
  chosen: number;
  declined: number[];
  tasks: [string, string, string, string, string];
  milestone: string;
  hours: Hour[];
  updates: { plan: { title: string; body: string }; fail: { title: string; body: string }; pass: { title: string; body: string } };
  /** A scope change after approval: revised terms for the chosen option, which the client approves */
  revision?: { title: string; why: string; change: string; basisAdd: BasisLine[]; hoursLow: number; hoursHigh: number; depositPercent: number; sign: string };
  /** The one thing the client buys, if any, and the receipt */
  purchase?: { name: string; paid: string; receipt: string; text: string };
  /** Files Pradeep uploads, and when */
  files: { name: string; layer: "needs" | "execution" | "observation" | "next"; when: "build" | "observe" }[];
  pieces: Piece[];
  runbook: string;
  training: string;
  /** The task the client comments on, her comment, and why */
  comment: { task: number; text: string };
  condition: string;
  /** What she types in Needs: the sentence, a second need, an answer, and the requirement she picks */
  needs: { goals: string[]; who: string; now: string; often: string; second: { goal: string; own?: string; who: string; due: string }; answer: string; requirement: string };
  voice: Record<"opens" | "intro" | "recap" | "previewIntro" | "previewRecap" | "previewReason" | "teamSay" | "teamThink" | "startSay" | "startThink" | "wrongTemplate" | "nowThink" | "wantThink" | "exampleThink" | "dueThink" | "measureThink" | "baselineThink" | "needsFirst" | "needsSecondThink" | "answerThink" | "requirementThink" | "listenThink" | "listenWrote" | "listenLimit" | "compareA" | "compareB" | "compareC" | "basisThink" | "agreementThink" | "approveThink" | "conditionThink" | "buildThink" | "commentThink" | "doneThink" | "observeThink" | "numbersThink" | "readingThink" | "handoverThink" | "trainedThink" | "finalThink" | "careThink" | "stepAccounts" | "stepAdmin" | "stepDocs" | "acceptNote" | "acceptSay", string>;
}


/** An option's pricing as the portal's fields */
const estimate = (rateCents: number, hoursLow: number, hoursHigh: number, basis: BasisLine[]) => ({ pricing: "estimate" as const, rateCents, hoursLow, hoursHigh, basis });
const fixed = (total: number, depositPercent?: number) => ({ pricing: "fixed" as const, cost: `$${total.toLocaleString("en-US")} fixed`, ...(depositPercent === undefined ? {} : { depositPercent }) });
export const sum = (b: BasisLine[]) => b.reduce((n, x) => n + x.hours, 0);
/** neon1's rate for workflow work, in cents an hour (Knowledge Center, "How pricing works") */
export const RATE_CENTS = 10_000;


// --- 1. Harborline Outfitters: business systems integration --------------------------------------------------

const H_ID: BasisLine[] = [
  { work: "Read access in all five systems, and the follow-up questions from discovery", hours: 2 },
  { work: "Item matching across the POS, the web store, and the warehouse's UPCs, with the gaps listed", hours: 6 },
  { work: "Nightly comparison of counts across the POS, the web store, and the warehouse file", hours: 6 },
  { work: "A reason for each difference: transfers, returns not posted, unknown items", hours: 4 },
  { work: "The 7 am exception email and the exceptions sheet", hours: 3 },
  { work: "An alert when a feed doesn't arrive", hours: 2 },
  { work: "Dry run on a week of real exports, then two weeks beside Tomas's Monday count", hours: 4 },
  { work: "Runbook, training for Tomas and the store leads, and handover", hours: 3 },
];
const H_REVISED = [...H_ID,
  { work: "The warehouse's second file (receiving and allocations) read in, with reasons", hours: 6 },
  { work: "A second dry run, and a week beside the Monday count", hours: 4 },
];

const HARBORLINE: Scenario = {
  id: "harborline",
  family: "Business systems integration",
  blurb: "A three-store retailer wants its stock counts to agree across the POS, the web store, and the warehouse, without replacing a system.",
  engagement: "Focused integration, with a scope change after a failed test",
  org: { name: "Harborline Outfitters", slug: "harborline", place: "Kingston, NY", about: "an outdoor-gear retailer with three stores and a web store, about thirty people" },
  owner: { name: "Priya Raman", first: "Priya", email: "priya@harborlineoutfitters.example", title: "Operations director", role: "who runs operations at Harborline Outfitters" },
  colleague: { name: "Tomas Greer", first: "Tomas", email: "tomas@harborlineoutfitters.example", title: "Inventory lead", role: "who leads inventory for the stores" },
  template: { id: "workflow_automation", label: "Workflow automation", wrong: "Cloud migration", key: "FLOW-1" },
  project: {
    name: "One stock count across stores and web",
    today: "Each store's POS, the web store, and the warehouse keep their own count, and they drift. Tomas reconciles them by hand every Monday, about three hours, and about 11 web orders a month are for stock we don't have.",
    outcome: "The counts agree, and anything that doesn't is on one short exception list by 7 am, without replacing a system.",
    example: "Last Saturday the web store sold four Ridgeline shells in large that the Kingston POS had already sold. Tomas found out Monday, from the customers.",
    dueDays: 50,
  },
  measures: [
    { title: "Items whose counts disagree for no known reason, each week", unit: "items", baseline: 38, target: 5, direction: "down", readings: [31, 14, 4], newReading: "4" },
    { title: "Oversold web orders each month", unit: "orders", baseline: 11, target: 1, direction: "down", readings: [9, 4, 1], newReading: "1" },
  ],
  learned: [
    ["Which systems hold a count?", "The POS in each of the three stores, the web store, the warehouse partner's portal, and the accounting system for value. Each names an item differently: 7-digit POS numbers, web variant IDs, and UPCs at the warehouse. About 1,900 active items, and roughly 140 have no UPC on file."],
    ["What goes wrong today?", "Tomas reconciles by hand on Mondays, about three hours. Differences come from returns taken at a counter that never reach the web store, transfers between stores in transit, and stock the warehouse received late. About 38 items disagree in a typical week, and about 11 web orders a month are oversold."],
    ["What can't change?", "The stores keep their POS, which is under contract for two more years. The warehouse partner stays. Nobody on the floor learns a new tool for daily work."],
  ],
  better: "A count we can trust by 7 am, a short list of what to check instead of a spreadsheet to build, and no apologies to customers for stock we don't have.",
  constraints: [
    ["The POS can be read every night, but writing to it is limited", "The POS exports sales and counts on request. Updating counts through its API is limited to 60 calls a minute, which a busy Saturday would exceed. A live two-way sync would have to queue its writes and could lag by minutes. That is a real cost of option B."],
    ["The warehouse publishes one stock file each morning and has no API", "The file is ready by 6:30 am and reports what is available to sell."],
    ["No changes to checkout in the holiday weeks", "Anything that touches the web store's checkout waits until the holiday weeks are over."],
  ],
  assets: ["Web store admin, with read access to orders and stock", "POS back office, one login per store, with read-only report access", "The warehouse partner's portal and its daily stock file"],
  fileAsk: { title: "A week of stock exports from each system, item names only", body: "Export last week's counts from the POS, the web store, and the warehouse file. I use them to test the matching against the real thing before anything runs.", name: "stock-exports-week.zip", text: "Counts for 1,912 items from the three stores' POS, the web store, and the warehouse file, no customer data", bell: "stock exports" },
  options: [
    {
      title: "A. Exception report first",
      body: [
        "Match every item across the POS, the web store, and the warehouse once. Each morning, compare their counts and email a short exception list by 7 am, each with its likely reason. Read-only: nothing is written back to any system.",
        "Includes:\n- One item ID map across the POS number, the web variant, and the UPC, with the roughly 140 items that have no UPC listed for Tomas to fill in\n- A nightly comparison of the three stores' POS counts, the web store, and the warehouse file\n- A reason beside each difference: transfer in transit, return not posted, or no item match\n- A 7 am email to Priya and Tomas, and an exceptions sheet with what changed since yesterday\n- An alert when any feed doesn't arrive\n- A dry run on a week of real exports, then two weeks beside Tomas's Monday count\n- A runbook, training for Tomas and the store leads, and every account in Harborline's name",
        "Not included:\n- Writing counts back to any system\n- Any change to checkout",
        "Depends on:\n- Read access to the POS back offices, the web store, and the warehouse portal\n- The warehouse's file arriving by 6:30 am",
      ].join("\n\n"),
      fields: {
        ...estimate(RATE_CENTS, 26, 34, H_ID), timeline: "4 weeks, the last two beside Monday's count", outsideCosts: "None. It runs in an AWS account in Harborline's name, about $15 a month",
        result: "Counts are compared every morning, and unexplained differences fall from about 38 a week to 5 or fewer.",
        why: "Pick this to learn how much of the drift is process and how much is sync, before building anything that writes into a POS that limits writes. Option B can follow, and nothing in A is redone.",
        costScore: 4, qualityScore: 3, effortScore: 4, recommended: true,
      },
    },
    {
      title: "B. Two-way sync with queued writes",
      body: [
        "Everything in A, plus counts written back to the web store and the POS as sales and returns happen, through a queue that stays inside the POS's write limit, with a rule for which system wins and a log of every change.",
        "Includes:\n- Everything in A\n- A queue that retries writes to the POS at no more than 60 a minute\n- Write-back to the web store, held while a cart is open\n- Conflict rules, and a log of every change with who or what made it\n- A load test at holiday volume, and a switch that stops all writing at once",
        "Not included:\n- Changes to checkout\n- Replacing the POS or the warehouse partner",
        "Depends on:\n- The POS's write limit. At holiday volume the queue could lag by minutes, which is the cost of this option",
      ].join("\n\n"),
      fields: {
        ...estimate(RATE_CENTS, 58, 74, [...H_ID, { work: "A queue that retries POS writes within its limit", hours: 12 }, { work: "Write-back to the web store, held while a cart is open", hours: 9 }, { work: "Conflict rules and a log of every change", hours: 8 }, { work: "Load test at holiday volume, and the stop-all switch", hours: 5 }, { work: "Extra training and go-live support", hours: 2 }]),
        timeline: "10 weeks, after the holiday weeks", outsideCosts: "About $45 a month for the queue and its runtime, in Harborline's AWS account",
        result: "Counts correct themselves within minutes, at normal volume.",
        why: "Pick this once A shows how many differences are real and the holiday weeks are over. It writes to a POS that limits writes, so it is the riskier of the two to build first.",
        costScore: 2, qualityScore: 5, effortScore: 3,
      },
    },
    {
      title: "C. Move the stores to the web store's own POS",
      body: [
        "Replace the three stores' POS with the web store's, so one system holds one count.",
        "Includes:\n- A store-by-store cutover plan\n- Catalog and customer import\n- Card-reader and hardware testing\n- Staff training at each store\n- A parallel run and cutover support",
        "Not included:\n- New hardware, and the cost of leaving the current POS contract, which Harborline pays",
        "Depends on:\n- The current POS contract, which runs two more years",
      ].join("\n\n"),
      fields: {
        ...estimate(RATE_CENTS, 80, 100, [{ work: "Store-by-store cutover plan", hours: 14 }, { work: "Catalog and customer import", hours: 22 }, { work: "Card-reader and hardware testing", hours: 12 }, { work: "Staff training at the three stores", hours: 18 }, { work: "Parallel run and cutover support", hours: 24 }]),
        timeline: "14 weeks, and not before the contract ends", outsideCosts: "New hardware, and the cost of leaving the current POS contract early",
        result: "One system holds one count in every store and online.",
        why: "Pick this only if the POS contract is ending anyway. It removes the problem by removing a system, at the largest cost and the most disruption.",
        costScore: 1, qualityScore: 4, effortScore: 1,
      },
    },
  ],
  chosen: 0,
  declined: [2],
  tasks: ["Item ID map across the POS, web store, and warehouse", "Nightly comparison of counts", "Reasons for differences and the 7 am exception email", "Feed alerts and the runbook", "Dry run on a week of real exports"],
  milestone: "Two weeks beside the Monday count start",
  hours: [
    { work: "Read access in all five systems; follow-up questions from discovery", hours: 2.5, when: 28, phase: "plan" },
    { work: "Item matching across the POS, web store, and UPCs; gaps listed", hours: 5.5, when: 26, phase: "plan" },
    { work: "Nightly comparison of POS and web store counts", hours: 5, when: 22, phase: "build" },
    { work: "Warehouse file reader and the alert when a feed doesn't arrive", hours: 4, when: 20, phase: "build" },
    { work: "Reasons for differences, the 7 am exception email, and the sheet", hours: 7, when: 17, phase: "build" },
    { work: "Dry run on a week of exports: 118 flagged, 61 false; traced to the warehouse file", hours: 4, when: 12, phase: "test" },
    { work: "Second warehouse file read in; dry run again: 57 flagged, 53 explained", hours: 5, when: 9, phase: "retest" },
    { work: "Two weeks beside Tomas's Monday count", hours: 3, when: 4, phase: "retest" },
    { work: "Runbook, ID map, training for Tomas and the store leads, and handover", hours: 3.5, when: 1, phase: "handover" },
  ],
  updates: {
    plan: { title: "ID map and nightly comparison are running; reasons and the 7 am email come next", body: "Every item in the POS, the web store, and the warehouse file now has one ID: 1,912 matched, and 141 have no UPC and are listed for Tomas. The comparison runs each night at 5 am against the three POS and the web store. Next: the warehouse file, and a reason for each difference." },
    fail: { title: "Dry run: 118 items flagged, 61 of them false. My assumption about the warehouse file was wrong", body: "I replayed last week's exports through the comparison. 118 items were flagged, but 61 weren't real: the warehouse's file counts only stock available to sell, so anything allocated to an order or still being received looked missing. I had assumed it showed stock on hand. The fix needs the warehouse's second daily file (receiving and allocations), which is outside what you approved. I've sent revised terms, 0039-r2-A: 10 more hours, a range of 34 to 44, and nothing else changes. Writing back to the stores (option B) stays on hold." },
    pass: { title: "With the second file: 57 flagged, 53 explained", body: "Same week of exports, with the receiving and allocations file read in. 57 items are flagged. 53 have a reason (transfer in transit, return not posted, or late receiving), and 4 are for Tomas to check, which meets the target. Two weeks beside the Monday count agreed on every item the report flagged. Option B stays on hold: the POS's write limit hasn't changed." },
  },
  revision: {
    title: "A. Exception report first (revised)",
    why: "The dry run showed the warehouse's daily file counts only stock available to sell. Reading its second file (receiving and allocations) is outside what was approved.",
    change: "Adds the warehouse's second file and a second dry run: 10 more hours, so 34 to 44 hours. The deposit already paid covers the share asked up front, so nothing more is invoiced until handover.",
    basisAdd: [{ work: "The warehouse's second file (receiving and allocations) read in, with reasons", hours: 6 }, { work: "A second dry run, and a week beside the Monday count", hours: 4 }],
    hoursLow: 34, hoursHigh: 44, depositPercent: 30,
    sign: "Priya Raman",
  },
  files: [
    { name: "item-id-map-notes.txt", layer: "execution", when: "build" },
    { name: "exception-report-sample.txt", layer: "observation", when: "observe" },
  ],
  pieces: [
    { title: "Exception report, second pass", kind: "working", layer: "observation", note: "Runs here on 14 made-up items. The first pass, with only the warehouse's available count, flags the false alarms; the second adds the receiving and allocations file and gives each difference a reason.", table: exceptionTable(true) },
    { title: "Exception report, first pass", kind: "working", layer: "execution", note: "The same 14 items before the warehouse's second file was read. Every difference is flagged and none has a reason: this is the false-alarm problem the dry run found.", table: exceptionTable(false) },
  ],
  runbook: [
    "Harborline Outfitters: morning exception report runbook",
    "",
    "What arrives",
    "- At 7 am, an email to Priya and Tomas lists items whose counts disagree across the POS, the web store, and the warehouse, each with a reason.",
    "- Reasons: in transit (a transfer between stores), allocated to orders (stock reserved at the warehouse), return not posted (a return taken at a counter), no item match (an item with no UPC).",
    "- Only unexplained differences need a person. Check the item at the counter first, then the web store's stock page.",
    "",
    "When a feed doesn't arrive",
    "- An alert names the system. The warehouse files land by 6:30 am; if one is late, the report says so and skips that comparison.",
    "- Re-run the comparison from the exceptions sheet's Run now button once the file appears.",
    "",
    "Items with no UPC",
    "- The second sheet lists them. Add the UPC in the POS; the next night's run picks it up.",
    "",
    "Not built yet",
    "- Writing counts back to the stores. The POS limits writes to 60 a minute, so this stays on hold until that changes or the holiday weeks are over.",
    "",
    "Accounts (all in Harborline's name)",
    "- The AWS account is Harborline's. Priya is the owner; Tomas can read the logs. neon1's access has been removed.",
  ].join("\n"),
  training: "Walkthrough for Tomas and the store leads, recorded for new staff",
  comment: { task: 2, text: "Can the 7 am email list unexplained items first? Tomas only has ten minutes before the stores open." },
  condition: "Nothing changes at checkout until after the holiday weeks.",
  needs: {
    goals: ["save time", "stop mistakes"], who: "the weekly stock count", now: "Tomas reconciles four systems by hand every Monday, and web orders still go out for stock we don't have", often: "weekly",
    second: { goal: "fix", who: "the three stores' stock counts", due: "this quarter" },
    answer: "Tomas, every Monday morning, about three hours. The stores see it when a customer is told we're out.",
    requirement: "Staff can use it after a short walkthrough",
  },
  voice: {
    opens: "Priya, who runs operations at Harborline Outfitters, opens 1NEON for the first time",
    intro: "Priya runs operations at Harborline Outfitters, a fictional outdoor-gear retailer with three stores and a web store. Each store's POS, the web store, and the warehouse keep their own stock count, and Tomas reconciles them by hand every Monday. They don't want to replace a system. Pradeep at neon1 has invited her to 1NEON, the portal where they'll work on it together.",
    recap: "Priya asked for one stock count, compared three options (one of them rejected), approved the exception report, and paid a deposit. A dry run found a wrong assumption about the warehouse's file, so the scope was revised and approved before more hours were worked. The result was measured, Tomas was trained, the final invoice matched the hours, and live write-back stayed on hold for a reason that is on record.",
    previewIntro: "Priya runs operations at Harborline Outfitters, a fictional outdoor-gear retailer. Its POS, web store, and warehouse each keep their own stock count, and she has asked Pradeep at neon1 for help without replacing any of them.",
    previewRecap: "Priya asked for help in one sentence, compared options with the hours behind each price, signed for one, saw the work and a failed dry run, and took over the runbook. The full story shows the revised terms and both invoices.",
    previewReason: "The stock counts never agree. Let me sign in and ask Pradeep for help.",
    teamSay: "She invites Tomas, who leads inventory, as an editor",
    teamThink: "Tomas lives in these counts. He should see this too.",
    startSay: "She starts a project from a template",
    startThink: "Now the real reason I'm here: four systems, four different counts.",
    wrongTemplate: "Cloud migration? No, we're not moving anything.",
    nowThink: "What happens now… Tomas reconciles everything by hand every Monday.",
    wantThink: "And what I want instead:",
    exampleThink: "Last Saturday's shells are the best example.",
    dueThink: "Well before the holiday weeks would be ideal.",
    measureThink: "How will I know it worked? Items that disagree for no reason.",
    baselineThink: "About 38 a week now. Five or fewer would be a good week.",
    needsFirst: "It builds a sentence. I want to save time…",
    needsSecondThink: "And the stores' own counts: they need to be right too.",
    answerThink: "A question for me already. Easy one.",
    requirementThink: "One must-have: the store leads shouldn't need a new tool.",
    listenThink: "Pradeep wants a week of exports from each system, to test the matching. I can pull those.",
    listenWrote: "He wrote down what I told him: the three item numbers, Tomas's Mondays, the POS contract.",
    listenLimit: "And a limit I didn't know: the POS only accepts 60 updates a minute. That changes what a sync can do. Good to know now.",
    compareA: "A reads everything and tells us each morning what disagrees. It doesn't write anything back. Safe.",
    compareB: "B writes the counts back, but the POS only takes 60 changes a minute, so on a busy Saturday it could lag. Maybe later.",
    compareC: "C replaces the POS. Our contract has two years left. Not now.",
    basisThink: "Task by task, at an hourly rate. I pay for the hours he works, and never past the top of the range unless I agree first.",
    agreementThink: "Purchases at cost, an estimate never billed past its high end, invoices due in 15 days. Fair.",
    approveThink: "A it is. Pradeep recommends it too.",
    conditionThink: "Just nothing at checkout in the holiday weeks.",
    buildThink: "Let me check the board, then see how it's going.",
    commentThink: "Tomas only has ten minutes before the stores open. The unexplained ones should come first.",
    doneThink: "Four of the five are done. Only the dry run is left.",
    observeThink: "Now the numbers. Is it actually working?",
    numbersThink: "From 38 mismatches a week to 4. And one oversold order last month, not eleven.",
    readingThink: "Tonight's count agrees too. Let me add it.",
    handoverThink: "A runbook, so Tomas and the store leads can run it without Pradeep.",
    trainedThink: "Tomas ran Monday's check from the report alone. That's the last one.",
    finalThink: "Let me see how he got there.",
    careThink: "No more Monday spreadsheets. And one list in the morning for the stores.",
    stepAccounts: "The AWS account is in Harborline's name. Check.",
    stepAdmin: "I'm the owner now, and Tomas can read the logs. Check.",
    stepDocs: "Pradeep walked Tomas and me through the runbook.",
    acceptNote: "Tomas ran Monday's check from the report alone",
    acceptSay: "Pradeep steps his access down and retires the old Monday spreadsheet",
  },
};


// --- 2. Quillwork Software: cloud modernization --------------------------------------------------------------

const QUILLWORK: Scenario = {
  id: "quillwork",
  family: "Cloud modernization",
  blurb: "A scheduling-software company with a capable platform team wants its report workers off hand-managed hosts, without disturbing the product schedule.",
  engagement: "Architecture evaluation, then focused implementation, phased",
  org: { name: "Quillwork Software", slug: "quillwork", place: "Troy, NY", about: "a scheduling-software company with 24 engineers and its own platform team" },
  owner: { name: "Elena Voss", first: "Elena", email: "elena@quillwork.example", title: "VP of Engineering", role: "who leads engineering at Quillwork Software" },
  colleague: { name: "Marcus Obi", first: "Marcus", email: "marcus@quillwork.example", title: "Platform lead", role: "who leads the platform team" },
  template: { id: "cloud_migration", label: "Cloud migration", wrong: "Workflow automation", key: "MIG-1" },
  project: {
    name: "Report workers off the hand-managed fleet",
    today: "Customer report exports run on six long-lived workers we patch and size by hand. They sit mostly idle, then fall behind at month end. Our Terraform covers the network and databases but not these hosts.",
    outcome: "Report generation runs as scheduled container tasks in our existing pipeline and Terraform, sized to demand, with a tested rollback and a runbook our platform team owns.",
    example: "On the last day of October, large exports waited up to 47 minutes in the queue, and five of the six workers sat idle two hours later.",
    dueDays: 60,
  },
  measures: [
    { title: "Month-end export wait, 95th percentile", unit: "min", baseline: 47, target: 10, direction: "down", readings: [40, 22, 9], newReading: "9" },
    { title: "Monthly cost of report generation", unit: "$", baseline: monthly("before"), target: 1100, direction: "down", readings: [2150, 1690, monthly("after")], newReading: String(monthly("after")) },
  ],
  learned: [
    ["How do reports run today?", "A queue feeds six EC2 workers behind an auto-scaling group that was sized once. Each worker holds a full copy of the report library, and a deploy is an Ansible run. About 9,000 reports a month, 60% of them in the last three days."],
    ["What are the platform team's limits?", "Two engineers, both committed to the customer SSO launch through the end of the quarter. Nothing may change report output: customers compare files month to month. The team's conventions (module layout, naming, review) apply to everything added."],
    ["What stays as it is?", "The existing Terraform modules, the CI pipeline, and the on-call rota. The queue, the databases, and the report library itself don't change."],
    ["Should the runbooks get an assistant too?", "I tried it before proposing anything: 20 made-up questions over the runbooks and support docs, answered three ways and judged by two people. The helpdesk product's built-in assistant got 17 right and cited its source each time. A custom prototype got 18. One question of difference is inside the judges' disagreement. Recommendation: don't build one. Add the three runbooks it couldn't find, and keep using the product's own."],
  ],
  better: "Month-end exports don't queue, nobody patches report hosts, and the team can read, change, and roll back the setup without me.",
  constraints: [
    ["No change to report output", "The acceptance test is a byte-for-byte comparison against last month's files, all 9,184 of them."],
    ["Platform capacity is committed to the SSO launch", "I write every change and the platform team reviews and approves each merge. Nobody on the team writes or debugs it."],
    ["Production changes land outside month end", "Anything that reaches production goes live in the first half of a month, never in the last three days."],
  ],
  assets: ["AWS accounts (staging and production): read access, and a deploy role limited to report resources", "The existing Terraform repository and CI pipeline", "The report queue and the report library image"],
  fileAsk: { title: "October's report job logs, with customer names removed", body: "Export queue wait, run time, and peak memory per job as a zip, customer names removed. I size the new tasks from the real distribution.", name: "report-jobs-october.zip", text: "9,184 report jobs: queue wait, run time, and peak memory, customer names removed", bell: "report job logs" },
  options: [
    {
      title: "A. Container tasks behind the existing queue",
      body: [
        "Move report generation from the six hand-managed workers to scheduled container tasks that pull from the same queue, written in the team's own Terraform modules and deployed by the team's own pipeline, with a canary, a rollback switch, and a handover to the platform team.",
        "Includes:\n- Phase 1, a design note and decision record, with a cost model from October's real job logs\n- Phase 2, the container image, task definitions, queue scaling, alarms, and dashboards, as pull requests in the team's repository\n- A canary on staging and then on 10% of production jobs, compared byte for byte against the old workers\n- A rollback switch, tried for real before cutover\n- Phase 3, cutover outside month end, the old hosts retired, a runbook, and a walkthrough with the platform team\n- Every account and resource in Quillwork's name, and neon1's access removed",
        "Not included:\n- Changes to the report library, the queue, or the databases\n- An internal documentation assistant, which the evaluation recommends against",
        "Depends on:\n- The platform team reviewing each pull request within two working days\n- A production release in the first half of a month",
      ].join("\n\n"),
      fields: {
        ...fixed(9_800), timeline: "6 weeks, with cutover in the first half of next month", outsideCosts: "None to set up. Running costs are in the cost model: about $1,010 a month, down from $2,150",
        result: "Month-end exports no longer queue, report output is identical, and the platform team can roll back and change it themselves.",
        why: "It removes the idle cost and the patching, fits the team's own conventions, and leaves the team owning it. Do nothing beyond sizing the hosts if the team would rather not run a new kind of workload.",
        costScore: 3, qualityScore: 5, effortScore: 3, recommended: true,
      },
    },
    {
      title: "B. Right-size the existing workers",
      body: [
        "Keep the six hosts. Add scheduled scaling and a smaller instance type, and bring the hosts into Terraform.",
        "Includes:\n- A sizing study from October's job logs\n- Scheduled scaling for month end\n- The hosts and their auto-scaling group written into the team's Terraform\n- A runbook for patching",
        "Not included:\n- Removing the patching work\n- Any change to how reports run",
        "Depends on:\n- The platform team continuing to patch and rebuild the hosts",
      ].join("\n\n"),
      fields: {
        ...fixed(3_600), timeline: "2 weeks", outsideCosts: "None",
        result: "The month-end queue shortens, and the hosts are in Terraform. They are still patched by hand.",
        why: "Pick this if the team would rather not run containers yet. It cuts month-end waiting at the smallest change, and leaves the patching and the idle cost mostly as they are.",
        costScore: 4, qualityScore: 3, effortScore: 4,
      },
    },
  ],
  chosen: 0,
  declined: [],
  tasks: ["Design note and decision record", "Container image and scheduled tasks in Terraform", "Canary on staging, then 10% of production", "Rollback switch and alarms", "Cutover and retiring the old hosts"],
  milestone: "Cutover to container tasks",
  hours: [
    { work: "Read the Terraform, the pipeline, and 9,184 job logs; sizing model", hours: 6, when: 40, phase: "plan" },
    { work: "Design note and decision record: container tasks or right-sized hosts", hours: 4, when: 38, phase: "plan" },
    { work: "Container image from the report library; task definitions in the team's module layout", hours: 8, when: 32, phase: "build" },
    { work: "Queue consumer, scale rule, and the cost model", hours: 6, when: 28, phase: "build" },
    { work: "Alarms, dashboards, and the rollback switch", hours: 3, when: 25, phase: "build" },
    { work: "Canary: staging clean; production at 10% failed on 3 large exports (out of memory)", hours: 5, when: 14, phase: "test" },
    { work: "Rolled back in 4 minutes and verified; memory raised and large exports chunked; canary rerun clean", hours: 6, when: 12, phase: "test" },
    { work: "Byte-for-byte comparison against October: 9,184 of 9,184 identical", hours: 2.5, when: 6, phase: "test" },
    { work: "Runbook, decision record, pull-request walkthrough with the platform team, old hosts retired, neon1 access removed", hours: 5, when: 1, phase: "handover" },
  ],
  updates: {
    plan: { title: "Design note is in; the container image and task definitions come next", body: "I sized the tasks from October's real distribution: 9,184 jobs, a median run of 3 minutes, and a peak of 3 GB for the largest tenant's exports. The decision record compares container tasks with right-sizing the hosts. The first pull request, the module layout, is open for Marcus's review." },
    fail: { title: "Canary: 3 large exports failed at 10% of production. Rolled back in 4 minutes", body: "Staging was clean, but three exports from the largest tenant ran out of memory at 2 GB in production. The alarm fired, I switched new jobs back to the old workers, and the three jobs requeued and finished there, identical to the last run. No customer saw a failed export. The cause is my assumption: staging's biggest export is smaller than production's. Next: 4 GB tasks and chunked exports, then the canary again." },
    pass: { title: "Canary clean at 10%; all 9,184 jobs compared identical. Cutover moves to the 3rd", body: "With 4 GB tasks and chunked large exports, the canary ran 921 jobs with none failed and a peak of 3.1 GB. The full comparison against October's output matched 9,184 of 9,184. Cutover was set for the 28th, which would land on month end, so I've moved it to the 3rd, as the release rule says. Median export wait at 10% is under a minute." },
  },
  files: [
    { name: "report-worker-decision-record.md", layer: "execution", when: "build" },
    { name: "cost-model.txt", layer: "execution", when: "build" },
    { name: "docs-assistant-evaluation.txt", layer: "needs", when: "build" },
    { name: "canary-and-rollback-log.txt", layer: "observation", when: "observe" },
  ],
  pieces: [
    { title: "Cost model", kind: "working", layer: "execution", note: "Summed here from the model's lines, which come from October's made-up job logs. The first month of real bills replaces it.", table: costTable() },
    { title: "Canary and rollback log", kind: "working", layer: "observation", note: "Three canary runs and the minute-by-minute rollback of the second one, with the full output comparison.", table: canaryTable() },
    { title: "Documentation-assistant evaluation", kind: "working", layer: "needs", note: "Twenty made-up questions, three ways to answer them, two judges. The result is a recommendation not to build.", table: evalTable() },
  ],
  runbook: [
    "Quillwork Software: report workers runbook",
    "",
    "How it runs",
    "- A report job enters the queue; a container task starts, builds the report, writes it, and stops. Tasks scale with the queue, up to a ceiling of 40.",
    "- Large exports are chunked automatically. Task memory is 4 GB; the largest export peaks at 3.1 GB.",
    "",
    "Rolling back",
    "- Set the REPORTS_RUNNER flag to \"fleet\" in the pipeline's config and deploy. New jobs go to the old workers; running tasks finish.",
    "- The old workers were retired after two clean weeks. To roll back now, re-apply the retired-fleet module from the tag fleet-last-good, then set the flag.",
    "- Check: the failed-jobs alarm is quiet for 4 minutes and the queue is draining.",
    "",
    "If jobs fail",
    "- The failed-jobs alarm pages the platform on-call. First check memory (the dashboard's Peak memory panel), then the queue's dead-letter list.",
    "",
    "Changing it",
    "- All of it is in the team's Terraform modules under reports/. Open a pull request as for any other module; the pipeline plans and applies it.",
    "- Cost: about $1,010 a month at October's volume. The cost model is in the project's files.",
  ].join("\n"),
  training: "Walkthrough for the platform team, recorded for new engineers",
  comment: { task: 2, text: "Can the production canary run before 2 pm? The platform on-call is lightest then." },
  condition: "Cutover happens in the first half of a month, never at month end.",
  needs: {
    goals: ["save time", "cut costs"], who: "the report generation hosts", now: "six workers are patched and sized by hand, idle most of the month, and behind at month end", often: "monthly",
    second: { goal: "prepare", own: "hand over to the platform team", who: "whatever gets built", due: "this quarter" },
    answer: "Marcus and one other engineer, a few hours a month on patching, plus incidents at month end.",
    requirement: "Data stays in our own account",
  },
  voice: {
    opens: "Elena, who leads engineering at Quillwork Software, opens 1NEON for the first time",
    intro: "Elena leads engineering at Quillwork Software, a fictional scheduling-software company with 24 engineers and its own platform team. Customer reports run on six hand-managed workers that fall behind at month end. Her team could do the work, but it is committed to a customer launch. Pradeep at neon1 has invited her to 1NEON, the portal where they'll scope it, build it, and hand it back.",
    recap: "Elena asked for an independent hand on one part of her cloud setup, compared two options and approved one with a condition on timing, and paid a deposit. A canary failed in production, the rollback was verified in four minutes, and the cutover moved out of month end. The platform team took the runbook and the pull requests, and the final invoice was the agreed price less the deposit. A side question, an internal assistant, was assessed and not built.",
    previewIntro: "Elena leads engineering at Quillwork Software, a fictional scheduling-software company. Her platform team is committed to a launch, so she has asked Pradeep at neon1 to move customer report workers off hand-managed hosts.",
    previewRecap: "Elena asked for help in one sentence, compared two options, approved one, saw a failed canary and a rollback, and took over the runbook. The full story shows both invoices and the platform team's handover.",
    previewReason: "Month end is when the report queue falls over. Let me sign in and ask Pradeep for help.",
    teamSay: "She invites Marcus, who leads the platform team, as an editor",
    teamThink: "Marcus will review every change. He should be in here.",
    startSay: "She starts a project from a template",
    startThink: "Now the real reason I'm here: the report workers.",
    wrongTemplate: "Workflow automation? That's for office processes. Not this.",
    nowThink: "What happens now… six hosts we patch by hand, and month end falls over.",
    wantThink: "And what I want instead:",
    exampleThink: "October's last day shows it best.",
    dueThink: "Before the next quarter's launch work starts.",
    measureThink: "How will I know it worked? How long a big export waits at month end.",
    baselineThink: "47 minutes at the 95th percentile. Ten would be fine.",
    needsFirst: "It builds a sentence. I want to save time, and money…",
    needsSecondThink: "And the team has to own it afterwards. That's a need too.",
    answerThink: "A question for me already. Easy one.",
    requirementThink: "One must-have: everything stays in our own AWS account.",
    listenThink: "Pradeep wants October's job logs, to size the tasks from the real thing. I can export those.",
    listenWrote: "He wrote down what I told him: our review rule, the SSO launch, and that the team's Terraform conventions apply.",
    listenLimit: "And he already tried an assistant for the runbooks and says don't build one. Good, that's a question we'd have asked later.",
    compareA: "A moves the workers onto container tasks in our own Terraform. That's the real fix, and it ends the patching.",
    compareB: "B just resizes the hosts. Cheaper and quick, but we'd still patch them. A fallback if the team balks at containers.",
    compareC: "",
    basisThink: "It's a fixed price, so I know the total before the work starts, and the deposit is half of it.",
    agreementThink: "Purchases at cost, fixed prices stay fixed, invoices due in 15 days. Fair.",
    approveThink: "A. Pradeep recommends it, and the platform team's conventions are in the scope.",
    conditionThink: "Just never at month end. Our release rule.",
    buildThink: "Let me check the board, then see how it's going.",
    commentThink: "The platform on-call is lightest in the early afternoon. Let me say so.",
    doneThink: "Four of the five are done. The canary is what's left.",
    observeThink: "The canary failed, and he says exactly why. Did the rollback work?",
    numbersThink: "From 47 minutes to 9. And $1,010 a month instead of $2,150.",
    readingThink: "Tonight's export wait was 9 as well. Let me add it.",
    handoverThink: "A runbook, the decision record, and the pull requests. Marcus can own this.",
    trainedThink: "Marcus ran the rollback himself in the walkthrough. That's the last one.",
    finalThink: "Fixed price, less the deposit. Let me check it.",
    careThink: "No more patching report hosts. And the month-end queue stays short.",
    stepAccounts: "Everything is in Quillwork's AWS account. Check.",
    stepAdmin: "The deploy role is Marcus's team's now. Check.",
    stepDocs: "Pradeep walked Marcus's team through the pull requests.",
    acceptNote: "Marcus ran the rollback himself from the runbook",
    acceptSay: "Pradeep retires the old hosts and steps his access down",
  },
};


// --- 3. Fenwick & Marsh Architects: connected infrastructure and security readiness -------------------------

const FENWICK: Scenario = {
  id: "fenwick",
  family: "Connected infrastructure and security readiness",
  blurb: "An architecture firm moving to a renovated floor needs a segmented network, tested backups, and evidence for a client's security questionnaire.",
  engagement: "Phased project: network design and build, then readiness evidence",
  org: { name: "Fenwick & Marsh Architects", slug: "fenwick-marsh", place: "Albany, NY", about: "an architecture firm of 22 people moving to a renovated floor" },
  owner: { name: "Daniel Fenwick", first: "Daniel", email: "daniel@fenwickmarsh.example", title: "Principal", role: "a principal at Fenwick & Marsh Architects" },
  colleague: { name: "Mei Sato", first: "Mei", email: "mei@fenwickmarsh.example", title: "Studio manager", role: "who manages the studio" },
  template: { id: "network_systems", label: "Networks and connected systems", wrong: "Cloud migration", key: "NET-1" },
  project: {
    name: "A segmented network and security-review evidence",
    today: "We're moving to a renovated floor. Today everything shares one network: design workstations, the file server, guest Wi-Fi, door badge readers, and eight cameras. A municipal client's security questionnaire now asks about segmentation, access reviews, and tested backups.",
    outcome: "A segmented, documented network in the new space, access reviewed, and a restore test that has shown our project files come back, ready to answer the client's questionnaire.",
    example: "Last month a visitor on guest Wi-Fi could see the plotters and the badge-reader controller's web page.",
    dueDays: 55,
  },
  measures: [
    { title: "Devices reachable from guest Wi-Fi", unit: "devices", baseline: 31, target: 0, direction: "down", readings: [31, 9, 0], newReading: "0" },
    { title: "Sampled project folders restored in a test", unit: "of 3", baseline: 0, target: 3, direction: "up", readings: [0, 2, 3], newReading: "3" },
  ],
  learned: [
    ["What is on the network today?", "About 70 devices: 22 workstations, 3 plotters, a file server, 6 access points, 8 cameras on a recorder, badge readers on a controller, and personal phones. One flat network from a consumer router."],
    ["What does the client's questionnaire ask?", "Whether the network is segmented, who can open project files and when that was last reviewed, and whether a restore has been tested in the last year. neon1 builds the controls and collects the evidence. It does not audit or certify anything."],
    ["What can't change?", "The managed switches are two years old and stay. The cameras stay on the recorder they have. Design software licenses are tied to workstation hardware, so workstations are not reimaged."],
  ],
  better: "Guests can't reach anything of ours, the cameras and door readers sit apart, we know who can open which project folder, and we've seen a restore work.",
  constraints: [
    ["The badge-reader controller can't tag VLANs", "Its manual says it talks only on an untagged port. It gets its own switch port in the security VLAN and a firewall rule, in place of a separate tagged network. That is an accepted limit of this design."],
    ["The move date is fixed", "The new floor's network has to be ready the weekend of the move. Nothing in the old office is touched until then."],
    ["neon1 gives no audit opinion", "neon1 builds controls and collects evidence. A formal review, if the client requires one, comes from an independent auditor."],
  ],
  assets: ["The firewall and managed switches on the new floor", "The file server and its backup target", "The camera recorder and the badge-reader controller", "Staff accounts and the shared project drive"],
  fileAsk: { title: "The client's security questionnaire and the old network diagram", body: "Send the questionnaire as it came, and whatever drawing of the old network exists, even a photo of a whiteboard. I map each question to something that can be shown.", name: "questionnaire-and-old-diagram.zip", text: "The municipal client's 47-question security questionnaire and a hand-drawn diagram of the old network", bell: "security questionnaire" },
  options: [
    {
      title: "A. Segment with the existing switches",
      body: [
        "Design five segments on the new floor, put in a firewall with a written rule for each path, and keep the switches you own. Then show the controls the questionnaire asks about: a restore test, an access review, and the evidence to show.",
        "Includes:\n- A network design: five segments (staff, servers, devices, security, guest), an address plan, and a rule table with a reason for each rule\n- A firewall, and the switches and six access points configured, staged on the bench first\n- Guest Wi-Fi that reaches only the internet; the plotters on their own segment\n- The cameras, recorder, and badge-reader controller in the security segment, reachable from two admin desks\n- A backup job and a restore test of three sampled project folders\n- An access review of the project drive with Mei\n- A diagram, the rule table, a runbook, and an evidence pack for the client's questionnaire\n- Every account in the firm's name, and neon1's access removed",
        "Not included:\n- New cabling or switches\n- An audit, certification, or opinion of any kind\n- Reimaging workstations",
        "Depends on:\n- The firewall and any equipment the firm buys arriving two weeks before the move weekend\n- The badge-reader controller's limit: untagged ports only",
      ].join("\n\n"),
      fields: {
        ...fixed(11_800), timeline: "6 weeks, ready before the move weekend", outsideCosts: "The firewall (about $900 to $1,400) and any replacement access points, bought by the firm",
        result: "Guests reach nothing but the internet, the cameras and door readers sit apart, three sampled folders restore, and the evidence is ready for the questionnaire.",
        why: "It meets the move date and the questionnaire with the switches already owned. New cabling in B can't finish before the move.",
        costScore: 3, qualityScore: 4, effortScore: 4, recommended: true,
        purchases: [{ name: "Firewall for the new floor", estimate: "$900-$1,400", buyer: "client", why: "Enforces the rule table between the five segments", example: "A small-business firewall with VLAN and logging support" }],
      },
    },
    {
      title: "B. Re-cable and replace the switching",
      body: [
        "Replace the switches and add cabling for more headroom, then segment and show the controls as in A.",
        "Includes:\n- Everything in A\n- New switches, and new cable runs by a licensed installer\n- A wiring plan and labeling",
        "Not included:\n- The installer's quote, which the installer gives separately\n- An audit, certification, or opinion of any kind",
        "Depends on:\n- A licensed installer's availability, which can't be confirmed before the move weekend",
      ].join("\n\n"),
      fields: {
        ...fixed(17_500), timeline: "Not before the move weekend", outsideCosts: "New switches, cabling, and the installer's separate quote",
        result: "More ports and headroom, and a cleaner closet, after the move.",
        why: "Pick this only if more capacity is the goal. It can't finish before the move weekend, so it would leave the new floor on the old flat network at the start.",
        costScore: 1, qualityScore: 5, effortScore: 2,
      },
    },
  ],
  chosen: 0,
  declined: [],
  purchase: { name: "Firewall for the new floor", paid: "$1,149.00", receipt: "firewall-receipt.pdf", text: "Receipt: small-business firewall with VLAN and logging support, $1,149.00" },
  tasks: ["Network design and rule table", "Firewall, switches, and Wi-Fi configured", "Cameras and badge controller on the security segment", "Backups and the restore test", "Access review and the evidence pack"],
  milestone: "Move weekend cutover",
  hours: [
    { work: "Walk the new floor with Mei; device inventory; each questionnaire question mapped to something that can be shown", hours: 6, when: 40, phase: "plan" },
    { work: "Network design: five segments, address plan, and the rule table", hours: 5, when: 37, phase: "plan" },
    { work: "Firewall and switch configuration, staged on the bench", hours: 9, when: 30, phase: "build" },
    { work: "Guest Wi-Fi and staff wireless; the plotters on the devices segment", hours: 5, when: 26, phase: "build" },
    { work: "Cameras, recorder, and the badge controller on the security segment", hours: 4, when: 22, phase: "build" },
    { work: "Backup job and monitoring", hours: 3, when: 20, phase: "build" },
    { work: "On-site test: the badge controller dropped off after a switch reboot; fixed with a static port profile", hours: 5, when: 12, phase: "test" },
    { work: "Restore test: 2 of 3 sampled folders restored; the third's Models share was missing from the backup job; job fixed, retest 3 of 3", hours: 4.5, when: 9, phase: "test" },
    { work: "Access review of the project drive with Mei: 14 accounts, 3 removed", hours: 3, when: 6, phase: "test" },
    { work: "Diagram, rule table, runbook, walkthrough with Mei, accounts in the firm's name, neon1 access removed", hours: 5, when: 1, phase: "handover" },
  ],
  updates: {
    plan: { title: "Design and rule table are agreed; the firewall is staged on the bench", body: "Five segments (staff, servers, devices, security, guest), each rule with a reason beside it. I mapped each of the questionnaire's 47 questions to something that can be shown. The badge-reader controller can only use an untagged port, so it gets its own port in the security segment and a firewall rule. That is an accepted limit and it is in the design." },
    fail: { title: "Tests: the badge controller dropped off, and one folder didn't restore", body: "Two things failed on site, both fixed. After a switch reboot the badge-reader controller lost its port settings, because the switch's default profile reset it. It now has a static port profile, and I rebooted twice to check. The restore test brought back 2 of 3 sampled folders: the third, the Fire station Revit worksets, was missing 527 files because the shared Models share was never in the backup job. I assumed the job covered the whole project drive. I added the share and ran the test again." },
    pass: { title: "Retest passed: 3 of 3 folders restored; guest Wi-Fi reaches 0 internal devices", body: "All three sampled project folders restored with matching checksums, the slowest in 48 minutes. From guest Wi-Fi, a scan found 0 of the 31 devices that were reachable before. The access review covered 14 accounts and removed 3 (two former interns and a shared drafting login), each confirmed with Mei. The evidence pack answers 44 of the questionnaire's 47 questions with something to show. The other three are policy questions for the firm, not network ones. This is evidence, not an audit." },
  },
  files: [
    { name: "network-vlans.txt", layer: "execution", when: "build" },
    { name: "firewall-rule-table.txt", layer: "execution", when: "build" },
    { name: "restore-test-log.txt", layer: "observation", when: "observe" },
    { name: "access-review.txt", layer: "observation", when: "observe" },
  ],
  pieces: [
    { title: "Network segments", kind: "illustration", layer: "execution", note: "An illustration of the design: the five segments of the new floor and what each may reach. The live rules are in the firewall.", table: vlanTable(), diagram: "network" },
    { title: "Firewall rule table", kind: "illustration", layer: "execution", note: "Every rule has a reason beside it, so a reviewer, or whoever maintains it next, can tell what a rule is for.", table: ruleTable() },
    { title: "Restore test", kind: "working", layer: "observation", note: "The first test, where the third folder came back incomplete, and the retest after the share was added to the backup job.", table: restoreTable(RESTORE_FIRST) },
  ],
  runbook: [
    "Fenwick & Marsh Architects: network runbook",
    "",
    "The five segments",
    "- Staff, Servers, Devices, Security, Guest. The rule table lists what each may reach and why. Nothing is allowed that isn't in the table.",
    "- Guest Wi-Fi reaches the internet only. If a visitor needs the plotter, print for them.",
    "",
    "When the badge readers or cameras stop responding",
    "- The badge controller is on switch port 24 with a static profile. After a switch reboot, check that port first.",
    "- Cameras and the recorder are on the Security segment. View footage from the two admin desks only.",
    "",
    "Backups and the restore test",
    "- The backup job runs nightly at 1 am and covers the project drive, including the shared Models share. Once a quarter, restore three project folders to a scratch folder and compare checksums, as in the restore test log.",
    "",
    "Access review",
    "- Twice a year, list who can open the project drive and remove anyone who shouldn't. The last review covered 14 accounts and removed 3.",
    "",
    "Boundaries",
    "- This is evidence for the client's questionnaire, not an audit or a certification. A formal review would come from an independent auditor.",
    "",
    "Accounts (all in the firm's name)",
    "- The firewall and switch admin accounts belong to Daniel and Mei. neon1's access has been removed.",
  ].join("\n"),
  training: "Walkthrough for Mei and the studio, recorded for new staff",
  comment: { task: 2, text: "Move day is a Saturday. Can the camera and door tests happen the Friday evening before, while the old office is still ours?" },
  condition: "Nothing in the old office changes until the move weekend.",
  needs: {
    goals: ["secure", "prepare"], who: "the new studio network", now: "everything shares one network, including guest Wi-Fi, the plotters, and the door readers", often: "daily",
    second: { goal: "review", who: "who can open our project files", due: "this quarter" },
    answer: "Mei looks after it between jobs, and a consultant came once when the router died. Everyone depends on it all day.",
    requirement: "We can export everything",
  },
  voice: {
    opens: "Daniel, a principal at Fenwick & Marsh Architects, opens 1NEON for the first time",
    intro: "Daniel is a principal at Fenwick & Marsh Architects, a fictional architecture firm of 22 people moving to a renovated floor. The old network is one flat network from a consumer router, and a municipal client's security questionnaire has just arrived. Pradeep at neon1 has invited him to 1NEON, the portal where they'll design, build, test, and hand over the network and the evidence.",
    recap: "Daniel asked for a network and for evidence a client can read, compared two options, approved the one that met the move date, and paid a deposit. The badge controller and the backup both failed tests that were worth running, and both were fixed and retested. Guest Wi-Fi now reaches nothing internal, three sampled folders restore, and the access review is on record. The handover came with a diagram, the rule table, and a plain note that none of it is an audit.",
    previewIntro: "Daniel is a principal at Fenwick & Marsh Architects, a fictional architecture firm moving to a renovated floor. A client's security questionnaire has arrived, and he has asked Pradeep at neon1 for a segmented network and the evidence to answer it.",
    previewRecap: "Daniel asked for help in one sentence, compared two options, approved one, saw two tests fail and get fixed, and took over the runbook. The full story shows both invoices and the handover.",
    previewReason: "A client wants to know how our network is secured. Let me sign in and ask Pradeep for help.",
    teamSay: "He invites Mei, who manages the studio, as an editor",
    teamThink: "Mei looks after all of this day to day. She should be in here.",
    startSay: "He starts a project from a template",
    startThink: "Now the real reason I'm here: the new floor's network.",
    wrongTemplate: "Cloud migration? No, it's all in the office.",
    nowThink: "What happens now… one flat network, guests and door readers included.",
    wantThink: "And what I want instead:",
    exampleThink: "Last month's visitor is the best example.",
    dueThink: "It has to be ready the weekend of the move.",
    measureThink: "How will I know it worked? What a guest can reach.",
    baselineThink: "31 devices now. Zero is the only right answer.",
    needsFirst: "It builds a sentence. I want to secure it…",
    needsSecondThink: "And someone has to be able to say who opens the project files.",
    answerThink: "A question for me already. Easy one.",
    requirementThink: "One must-have: we can export everything, whatever we do later.",
    listenThink: "Pradeep wants the questionnaire and the old diagram. I have both, more or less.",
    listenWrote: "He wrote down what I told him: the switches stay, the licenses are tied to the workstations, and the questionnaire's three asks.",
    listenLimit: "And a limit: the badge controller can't be on a tagged network. He says so before designing anything. Good.",
    compareA: "A segments the network with the switches we have and shows the controls. It meets the move date.",
    compareB: "B adds new cabling, but the installer can't promise a date before the move. We'd start on the old network.",
    compareC: "",
    basisThink: "A fixed price, so I know the total, and the deposit is half. We buy the firewall ourselves.",
    agreementThink: "Purchases at cost, fixed prices stay fixed, invoices due in 15 days. Fair.",
    approveThink: "A. It meets the move date, and Pradeep recommends it.",
    conditionThink: "Nothing in the old office changes before the move.",
    buildThink: "Let me check the board, then see how it's going.",
    commentThink: "Friday evening is when the old office is still ours. Let me say so.",
    doneThink: "Four of the five are done. The access review and evidence are left.",
    observeThink: "Two tests failed, and he says exactly why. Are they fixed?",
    numbersThink: "Guests reach nothing now, and three of three folders restore.",
    readingThink: "Tonight's guest scan found nothing. Let me add it.",
    handoverThink: "A diagram, the rule table, and a runbook. Mei can keep this going.",
    trainedThink: "Mei restored a folder herself in the walkthrough. That's the last one.",
    finalThink: "Fixed price, less the deposit. Let me check it.",
    careThink: "A network we can explain, and evidence a client can read.",
    stepAccounts: "The firewall and switch accounts are in the firm's name. Check.",
    stepAdmin: "Mei and I are the admins now. Check.",
    stepDocs: "Pradeep walked Mei through the diagram and the rules.",
    acceptNote: "Mei restored a project folder herself from the runbook",
    acceptSay: "Pradeep steps his access down and removes his remote login",
  },
};


/** The optional care that follows handover, as each engagement names it */
export const CARE: Record<ScenarioId, string> = { harborline: "Monthly updates and backup check", quillwork: "Yearly cost review", fenwick: "Quarterly access review" };

export const SCENARIOS: Record<ScenarioId, Scenario> = { harborline: HARBORLINE, quillwork: QUILLWORK, fenwick: FENWICK };
export const scenarioOf = (id: string | null | undefined): Scenario => SCENARIOS[id as ScenarioId] ?? SCENARIOS[DEFAULT_SCENARIO];


// --- The money, worked out -----------------------------------------------------------------------------------

/** The numbers of one scenario as its story says them, every one derived from the option and the hours */
export function moneyOf(s: Scenario) {
  const chosen = s.options[s.chosen]!;
  const first = priceOf(chosen.fields)!;
  // After a revision the terms in force are the revised ones; the deposit was asked on the first
  const rev = s.revision ? priceOf({ ...chosen.fields, hoursLow: s.revision.hoursLow, hoursHigh: s.revision.hoursHigh, depositPercent: s.revision.depositPercent })! : undefined;
  const now = rev ?? first;
  const logged = s.hours.reduce((n, h) => n + h.hours, 0);
  const through = (...phases: string[]) => s.hours.filter((h) => phases.includes(h.phase)).reduce((n, h) => n + h.hours, 0);
  const depositCents = first.kind === "fixed" ? Math.round((first.totalCents * (first.depositPercent ?? DEPOSIT_PERCENT)) / 100) : Math.round((first.lowCents * (first.depositPercent ?? DEPOSIT_PERCENT)) / 100);
  const earnedCents = now.kind === "fixed" ? now.totalCents : Math.round(Math.min(logged, now.hoursHigh) * now.rateCents);
  const e = (p: Price) => p as Extract<Price, { kind: "estimate" }>;
  return {
    fixed: now.kind === "fixed",
    rate: now.kind === "estimate" ? dollars(now.rateCents) : "",
    range: priceLine(now).replace(" estimate", ""),
    firstRange: priceLine(first).replace(" estimate", ""),
    low: now.kind === "estimate" ? dollars(now.lowCents) : dollars(now.totalCents),
    high: now.kind === "estimate" ? dollars(now.highCents) : dollars(now.totalCents),
    firstLow: first.kind === "estimate" ? dollars(first.lowCents) : dollars(first.totalCents),
    firstHigh: first.kind === "estimate" ? dollars(first.highCents) : dollars(first.totalCents),
    hours: now.kind === "estimate" ? hoursRange(e(now)) : "",
    firstHours: first.kind === "estimate" ? hoursRange(e(first)) : "",
    expected: hoursText(sum(chosen.fields.basis ?? [])),
    deposit: dollars(depositCents),
    logged: hoursText(logged),
    loggedAfterBuild: hoursText(through("plan", "build")),
    earned: dollars(earnedCents),
    final: dollars(earnedCents - depositCents),
    depositCents, earnedCents, finalCents: earnedCents - depositCents,
  };
}

/** Each option's price line and hours, for pages that list them ("$2,600 to $3,400 estimate") */
export function summaryOf(s: Scenario) {
  return s.options.map((o) => {
    const p = priceOf(o.fields)!;
    return { title: o.title.replace(/^[A-C]\. /, ""), price: priceLine(p), hours: p.kind === "estimate" ? hoursRange(p) : "", expected: sum(o.fields.basis ?? []) };
  });
}

/** The option's text in a file listing, for artifacts keyed by name */
export const fileText = (name: string) => FILES[name] ?? "";
export { ACCESS_REVIEW, FULL_COMPARISON, ROLLBACK_MINUTES };
