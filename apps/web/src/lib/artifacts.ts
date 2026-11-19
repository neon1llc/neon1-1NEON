// apps/web/src/lib/artifacts.ts - The small pieces of real work the made-up engagements show: an
// exception report, a cost model, a canary and rollback log, a network plan, a restore test, an
// evaluation table. Each is a plain function over made-up data, so the sample page can run it in the
// browser and the walkthroughs can upload the same output as a file; nothing here is a client's data.
// Every figure agrees with the scenario it belongs to (lib/scenarios.ts, and artifacts.test.ts checks it).


/** Where a piece comes from: a working example runs its logic here, an illustration is drawn by hand */
export type Kind = "working" | "illustration";

/** A table a page can draw and a file can print: heads, rows, and an optional last line */
export interface Table { head: string[]; rows: (string | number)[][]; foot?: string }

/** A table as CSV, quoting what needs it */
export const csv = (t: Table) => [t.head, ...t.rows].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n");

/** A table as aligned plain text, for a file that opens in any viewer */
export function text(t: Table) {
  const w = t.head.map((h, i) => Math.max(h.length, ...t.rows.map((r) => String(r[i]).length)));
  const line = (r: (string | number)[]) => r.map((c, i) => String(c).padEnd(w[i]!)).join("  ").trimEnd();
  return [line(t.head), w.map((n) => "-".repeat(n)).join("  "), ...t.rows.map(line), ...(t.foot ? ["", t.foot] : [])].join("\n");
}


// --- Harborline Outfitters: the stock exception report ---------------------------------------------

/** One item's count in each system, plus what the warehouse's second file says about it */
export interface Stock { sku: string; name: string; pos: number; web: number; warehouse: number; inTransit: number; allocated: number; returnsOpen: number }

/** Fourteen of the week's 1,912 items, made up, chosen to show every reason a count can differ */
export const STOCK_SAMPLE: Stock[] = [
  { sku: "4100231", name: "Ridgeline shell, M, green", pos: 6, web: 6, warehouse: 6, inTransit: 0, allocated: 0, returnsOpen: 0 },
  { sku: "4100232", name: "Ridgeline shell, L, green", pos: 3, web: 7, warehouse: 4, inTransit: 0, allocated: 0, returnsOpen: 4 },
  { sku: "4100588", name: "Trailhead 40L pack, grey", pos: 9, web: 9, warehouse: 12, inTransit: 0, allocated: 3, returnsOpen: 0 },
  { sku: "4100590", name: "Trailhead 40L pack, red", pos: 2, web: 2, warehouse: 5, inTransit: 0, allocated: 3, returnsOpen: 0 },
  { sku: "4200017", name: "Kettle stove, single", pos: 14, web: 14, warehouse: 9, inTransit: 5, allocated: 0, returnsOpen: 0 },
  { sku: "4200019", name: "Fuel canister, 230 g", pos: 40, web: 40, warehouse: 31, inTransit: 9, allocated: 0, returnsOpen: 0 },
  { sku: "4300402", name: "Wool socks, M, 2-pack", pos: 22, web: 22, warehouse: 22, inTransit: 0, allocated: 0, returnsOpen: 0 },
  { sku: "4300403", name: "Wool socks, L, 2-pack", pos: 18, web: 18, warehouse: 24, inTransit: 0, allocated: 6, returnsOpen: 0 },
  { sku: "4400120", name: "Headlamp, 400 lm", pos: 11, web: 8, warehouse: 11, inTransit: 0, allocated: 0, returnsOpen: 3 },
  { sku: "4400121", name: "Headlamp charger", pos: 7, web: 7, warehouse: 7, inTransit: 0, allocated: 0, returnsOpen: 0 },
  { sku: "4500310", name: "Paddle, 220 cm", pos: 4, web: 4, warehouse: 4, inTransit: 0, allocated: 0, returnsOpen: 0 },
  { sku: "4500311", name: "Paddle, 230 cm", pos: 5, web: 5, warehouse: 2, inTransit: 0, allocated: 0, returnsOpen: 0 },
  { sku: "4600005", name: "Gift card holder", pos: 30, web: 30, warehouse: 30, inTransit: 0, allocated: 0, returnsOpen: 0 },
  { sku: "UNMAPPED-77", name: "Trail map set (no UPC on file)", pos: 12, web: 0, warehouse: 0, inTransit: 0, allocated: 0, returnsOpen: 0 },
];

/** Why a count differs, in the words the 7 am email uses */
export type Reason = "in transit" | "allocated to orders" | "return not posted" | "no item match" | "unexplained";
export interface Exception { sku: string; name: string; pos: number; web: number; warehouse: number; reason: Reason; gap: number }

/**
 * Compare the three systems' counts. With only the warehouse's daily "available" count, stock that is
 * allocated or in transit looks missing (the first dry run's false alarms); with the receiving and
 * allocations file, those units are added back and the difference gets a reason. Counts that agree
 * are left out; a difference that still can't be explained is the only kind a person checks
 */
export function reconcile(rows: Stock[], secondFile: boolean): Exception[] {
  const out: Exception[] = [];
  for (const r of rows) {
    if (r.sku.startsWith("UNMAPPED")) { out.push({ ...pick(r), reason: "no item match", gap: r.pos }); continue; }
    const warehouse = secondFile ? r.warehouse + r.allocated + r.inTransit : r.warehouse;
    const web = secondFile ? r.web - r.returnsOpen : r.web;
    const counts = [r.pos, web, warehouse];
    if (counts.every((c) => c === counts[0])) continue;
    const gap = Math.max(...counts) - Math.min(...counts);
    const reason: Reason = !secondFile ? "unexplained" : r.inTransit > 0 ? "in transit" : r.allocated > 0 ? "allocated to orders" : r.returnsOpen > 0 ? "return not posted" : "unexplained";
    out.push({ ...pick(r), reason, gap });
  }
  return out;
}
const pick = (r: Stock) => ({ sku: r.sku, name: r.name, pos: r.pos, web: r.web, warehouse: r.warehouse });

/** The sample's exception report as a table, for either pass */
export function exceptionTable(secondFile: boolean): Table {
  const ex = reconcile(STOCK_SAMPLE, secondFile);
  const unexplained = ex.filter((e) => e.reason === "unexplained").length;
  return {
    head: ["Item", "Name", "POS", "Web", "Warehouse", "Gap", "Reason"],
    rows: ex.map((e) => [e.sku, e.name, e.pos, e.web, e.warehouse, e.gap, e.reason]),
    foot: `${ex.length} of ${STOCK_SAMPLE.length} sample items flagged, ${unexplained} unexplained. A sample of the week's 1,912 items, made up.`,
  };
}


// --- Quillwork Software: cost model, canary, rollback, and an evaluation --------------------------------

/** Monthly cost of report generation, line by line, before and after the move (made-up usage and prices) */
export const COST_LINES: { line: string; before: number; after: number }[] = [
  { line: "Compute: six always-on workers, then tasks by the minute", before: 1580, after: 612 },
  { line: "Storage and snapshots for worker disks", before: 214, after: 0 },
  { line: "Container registry and report library image", before: 0, after: 14 },
  { line: "Queue, logs, and metrics", before: 86, after: 96 },
  { line: "Patching and rebuilding hosts (engineer time at 4 hours a month)", before: 270, after: 0 },
  { line: "Headroom kept for month end", before: 0, after: 288 },
];
export const monthly = (side: "before" | "after") => COST_LINES.reduce((n, l) => n + l[side], 0);

export function costTable(): Table {
  return {
    head: ["Line", "Before", "After"],
    rows: [...COST_LINES.map((l) => [l.line, `$${l.before.toLocaleString("en-US")}`, `$${l.after.toLocaleString("en-US")}`]), ["Monthly total", `$${monthly("before").toLocaleString("en-US")}`, `$${monthly("after").toLocaleString("en-US")}`]],
    foot: `The saving is an estimate from October's 9,184 jobs. The first month of real bills replaces it.`,
  };
}

/** The canary: report jobs run on both fleets, compared by output hash, time, and peak memory */
export interface Canary { run: string; where: string; jobs: number; identical: number; failed: number; note: string }
export const CANARY: Canary[] = [
  { run: "1. Staging, a day's jobs", where: "staging", jobs: 310, identical: 310, failed: 0, note: "Output matches. Peak memory 1.4 GB of 2 GB." },
  { run: "2. Production, 10% of jobs", where: "production", jobs: 918, identical: 915, failed: 3, note: "Three exports from the largest tenant ran out of memory at 2 GB. Rolled back." },
  { run: "3. Production, 10% of jobs, 4 GB and chunked exports", where: "production", jobs: 921, identical: 921, failed: 0, note: "Peak memory 3.1 GB. Largest export 11 minutes." },
];
export const FULL_COMPARISON = { jobs: 9184, identical: 9184 };

/** The rollback, minute by minute, from the first alarm to the old fleet carrying all jobs */
export const ROLLBACK_LOG: [string, string][] = [
  ["14:02", "Canary at 10% of production. Three jobs end with an out-of-memory error."],
  ["14:03", "Alarm on failed jobs fires. neon1 and the platform team's on-call both see it."],
  ["14:04", "Rollback switch set: new jobs go to the old workers. Failed jobs requeued."],
  ["14:06", "All three requeued jobs finish on the old workers, identical to the last run."],
  ["14:08", "Verified: no failed jobs in the last 4 minutes, the queue is draining, and the task count is zero."],
];
export const ROLLBACK_MINUTES = 4;

export function canaryTable(): Table {
  return {
    head: ["Run", "Jobs", "Identical", "Failed", "What happened"],
    rows: CANARY.map((c) => [c.run, c.jobs, c.identical, c.failed, c.note]),
    foot: `Full comparison against October's output: ${FULL_COMPARISON.identical.toLocaleString("en-US")} of ${FULL_COMPARISON.jobs.toLocaleString("en-US")} identical.`,
  };
}

/** The docs-assistant evaluation: twenty made-up questions, three ways to answer, each judged by two people */
export interface Evaluated { name: string; correct: number; cited: number; refused: number; cost: string }
export const ASSISTANT_EVAL: Evaluated[] = [
  { name: "The helpdesk product's built-in assistant, as it is", correct: 17, cited: 17, refused: 2, cost: "Included in the plan they already pay for" },
  { name: "A custom prototype over the same documents", correct: 18, cited: 20, refused: 2, cost: "About 30 hours to build, plus hosting and upkeep" },
  { name: "Search only, no assistant", correct: 12, cited: 20, refused: 0, cost: "Included" },
];
export const EVAL_QUESTIONS = 20;
export function evalTable(): Table {
  return {
    head: ["Option", "Correct of 20", "Cited its source", "Said it didn't know", "Cost"],
    rows: ASSISTANT_EVAL.map((e) => [e.name, e.correct, e.cited, e.refused, e.cost]),
    foot: "One question of difference is inside the judges' disagreement. Recommendation: use the product's assistant, add the three missing runbooks it couldn't find, and don't build.",
  };
}


// --- Fenwick & Marsh: the network plan, the restore test, the access review ------------------------

/** The VLANs of the new floor: what lives on each and what it may reach */
export interface Vlan { id: number; name: string; subnet: string; holds: string; reaches: string }
export const VLANS: Vlan[] = [
  { id: 10, name: "Staff", subnet: "10.20.10.0/24", holds: "22 workstations, staff wireless", reaches: "File server, printers, internet" },
  { id: 20, name: "Servers", subnet: "10.20.20.0/24", holds: "File server and its backup target", reaches: "Staff (replies only), backup storage" },
  { id: 30, name: "Devices", subnet: "10.20.30.0/24", holds: "3 plotters, the conference-room display", reaches: "Staff (print jobs in), internet for updates" },
  { id: 40, name: "Security", subnet: "10.20.40.0/24", holds: "8 cameras, recorder, badge-reader controller", reaches: "Nothing outbound except two named update hosts" },
  { id: 50, name: "Guest", subnet: "10.20.50.0/24", holds: "Visitor and personal-phone wireless", reaches: "Internet only" },
];
export function vlanTable(): Table {
  return { head: ["VLAN", "Name", "Subnet", "Holds", "May reach"], rows: VLANS.map((v) => [v.id, v.name, v.subnet, v.holds, v.reaches]), foot: "An illustration of the design: the live rules are in the firewall and the rule table handed over." };
}
/** The rule table, the one place a rule's reason is written down */
export const RULES: [string, string, string, string][] = [
  ["Staff", "Servers", "Allow SMB, backup agent", "Project folders and the backup job"],
  ["Staff", "Devices", "Allow print ports to the plotters", "Plot from any desk"],
  ["Devices", "Staff", "Deny", "A plotter never starts a connection into the staff network"],
  ["Guest", "Any internal VLAN", "Deny", "A visitor can't see the plotters, the file server, or the badge controller"],
  ["Security", "Any internal VLAN", "Deny", "The cameras and door readers sit apart"],
  ["Security", "Internet", "Allow two update hosts only", "Firmware updates without a general internet path"],
  ["Staff", "Security", "Allow HTTPS to the recorder from two admin desks", "Review footage without opening the network"],
];
export const ruleTable = (): Table => ({ head: ["From", "To", "Rule", "Why"], rows: RULES });

/** The restore test: three project folders sampled, restored to a scratch folder, and checked */
export interface Restore { folder: string; files: number; restored: number; minutes: number; result: string }
export const RESTORE_FIRST: Restore[] = [
  { folder: "2024-118 Library annex", files: 4210, restored: 4210, minutes: 48, result: "restored, checksums match" },
  { folder: "2025-031 Transit shelter", files: 2877, restored: 2877, minutes: 33, result: "restored, checksums match" },
  { folder: "2025-064 Fire station (Revit worksets)", files: 1932, restored: 1405, minutes: 0, result: "527 files missing: the shared Models share was never in the backup job" },
];
export const RESTORE_AFTER: Restore[] = [...RESTORE_FIRST.slice(0, 2), { folder: "2025-064 Fire station (Revit worksets)", files: 1932, restored: 1932, minutes: 41, result: "restored, checksums match, after adding the share to the job" }];
export const restoreTable = (rows: Restore[]): Table => ({
  head: ["Folder", "Files", "Restored", "Minutes", "Result"],
  rows: rows.map((r) => [r.folder, r.files, r.restored, r.minutes, r.result]),
  foot: `${rows.filter((r) => r.files === r.restored).length} of ${rows.length} sampled folders restored.`,
});

/** The access review: who can open the project drive, and what the review changed */
export const ACCESS_REVIEW = { accounts: 14, reviewed: 14, removed: 3, notes: "Two former interns and one shared drafting login, each confirmed with Mei before removal." };


// --- The files each walkthrough uploads, built from the pieces above ------------------------------------

/** Plain-text files by the name they're uploaded under */
export const FILES: Record<string, string> = {
  "exception-report-sample.txt": `Harborline Outfitters: morning exception report (sample, second pass)\n\n${text(exceptionTable(true))}`,
  "item-id-map-notes.txt": "Item ID map: POS number, web variant ID, and UPC, one row per item.\n1,912 items matched. 141 have no UPC on file and are listed on the second sheet for Tomas to add.\nRule: an item is the same item when its UPC matches; a POS number with no UPC is held for a person.",
  "report-worker-decision-record.md": "# Decision: move report workers to scheduled container tasks\n\nStatus: accepted by Elena Voss.\n\nConsidered:\n- Keep the six hosts and add scheduled scaling: cheapest to change, but hosts stay hand-patched and the idle cost stays.\n- Container tasks behind the existing queue (chosen): the monthly cost falls and nobody patches report hosts.\n\nConsequences: memory limits matter for the largest tenant (see the canary log); rollback is one switch back to the old workers until they are retired.",
  "canary-and-rollback-log.txt": `${text(canaryTable())}\n\nRollback (run 2)\n${ROLLBACK_LOG.map(([t, e]) => `${t}  ${e}`).join("\n")}`,
  "cost-model.txt": text(costTable()),
  "docs-assistant-evaluation.txt": text(evalTable()),
  "network-vlans.txt": text(vlanTable()),
  "firewall-rule-table.txt": text(ruleTable()),
  "restore-test-log.txt": `First test\n${text(restoreTable(RESTORE_FIRST))}\n\nAfter adding the share to the backup job\n${text(restoreTable(RESTORE_AFTER))}`,
  "access-review.txt": `Access review of the project drive\n\nAccounts: ${ACCESS_REVIEW.accounts}. Reviewed: ${ACCESS_REVIEW.reviewed}. Removed: ${ACCESS_REVIEW.removed}.\n${ACCESS_REVIEW.notes}\n\nThis is evidence the firm can show a client. It is not an audit or a certification.`,
};
