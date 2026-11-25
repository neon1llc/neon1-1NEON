// apps/web/src/lab/model.ts - Workflow prototype: board states, workflows, and made-up projects.
// Held in memory only; a reload starts over


// The five board states every workflow reports into
export const STATES = [
  { id: "shaping", name: "Shaping", hint: "Working out what's needed" },
  { id: "deciding", name: "Deciding", hint: "Waiting on an approval" },
  { id: "doing", name: "In progress", hint: "Agreed work" },
  { id: "wrapping", name: "Wrapping up", hint: "Checking and handing over" },
  { id: "done", name: "Done", hint: "Finished or stopped" },
] as const;
export type StateId = (typeof STATES)[number]["id"];
export const stateIndex = (s: StateId) => STATES.findIndex((x) => x.id === s);
export const stateName = (s: StateId) => STATES[stateIndex(s)]!.name;


// A step is what a project is on; a group is the larger part of the path it sits in (NEON's four)
export interface Step {
  id: string;
  name: string;
  state: StateId;
  doneWhen: string;
  // What the step asks of whoever has it, and the button that does it
  todo: string[];
  action: string;
  who: Side;
  limit?: number;
  // A record that ends the step by itself (a proposal issued, a signature, an acceptance).
  // Without one, the step ends when its list is ticked and someone taps the move
  event?: "issued" | "signed" | "accepted";
}
export interface Group { id: string; name: string; hint: string; steps: Step[] }
export type Side = "client" | "neon1";
export type WorkflowId = "neon" | "bench" | "quick" | "custom";
export interface Workflow { id: WorkflowId; name: string; hint: string; groups: Group[] }


const step = (id: string, name: string, state: StateId, who: Side, doneWhen: string, action: string, todo: string[], event?: Step["event"]): Step =>
  ({ id, name, state, who, doneWhen, action, todo, event });
// A group of one step, for workflows whose path is flat
const flat = (s: Step): Group => ({ id: s.id, name: s.name, hint: "", steps: [s] });


export const NEON: Workflow = {
  id: "neon",
  name: "NEON",
  hint: "Options, a signed decision, measured results",
  groups: [
    { id: "needs", name: "Needs", hint: "What you need", steps: [
      step("intake", "Intake", "shaping", "neon1", "Fit call held", "Mark the call held", ["Book the fit call", "Say what's wrong today"]),
      step("listen", "Listen", "shaping", "client", "Questions answered, starting numbers recorded", "Finish answers", ["How does this work today?", "What would better look like in three months?", "Add one starting number"]),
      step("propose", "Propose", "shaping", "neon1", "Options issued", "Issue the proposal", ["Write two or three options", "Check prices"], "issued"),
      step("decide", "Decide", "deciding", "client", "One option approved and signed", "Approve option B", ["Compare the options", "Sign one"], "signed"),
    ] },
    { id: "execute", name: "Execute", hint: "Work in progress", steps: [
      step("build", "Build", "doing", "neon1", "Milestone tasks done", "Ready to check", ["Nightly comparison job", "Morning email", "Exception reasons"]),
    ] },
    { id: "observe", name: "Observe", hint: "Results", steps: [
      step("verify", "Verify", "wrapping", "neon1", "Checks pass, new numbers recorded", "Record results", ["Restore tested", "Mismatches per week: 38, target 5"]),
    ] },
    { id: "normalize", name: "Normalize", hint: "Handover and care", steps: [
      step("handover", "Hand over", "wrapping", "client", "Handover accepted", "Accept the handover", ["Accounts in your name", "Walkthrough done", "neon1 access reduced"], "accepted"),
      step("care", "Care", "done", "neon1", "Care running, or closed", "Close the project", ["Monthly check"]),
    ] },
  ],
};

export const BENCH: Workflow = {
  id: "bench",
  name: "Workbench",
  hint: "One shared page, no pipeline",
  groups: [
    flat(step("open", "Open", "doing", "neon1", "", "Mark done", [])),
    flat(step("finished", "Done", "done", "neon1", "", "Reopen", [])),
  ],
};

export const QUICK: Workflow = {
  id: "quick",
  name: "Quick fix",
  hint: "One quote, one signature",
  groups: [
    flat(step("quote", "Quote", "deciding", "client", "Quote signed", "Approve the quote", ["Read the quote"], "signed")),
    flat(step("fix", "Fix", "doing", "neon1", "Fix shown working", "Ready to check", ["Make the fix"])),
    flat(step("accept", "Accept", "wrapping", "client", "Fix accepted", "Accept the fix", ["Check it works"], "accepted")),
    flat(step("fixed", "Fixed", "done", "neon1", "", "Reopen", [])),
  ],
};

export const CUSTOM_START: Workflow = {
  id: "custom",
  name: "Event rollout",
  hint: "Your own phases",
  groups: [
    flat(step("c1", "Plan", "shaping", "client", "Dates and venue confirmed", "Plan agreed", ["Confirm dates"])),
    flat(step("c2", "Sign-off", "deciding", "client", "Budget approved", "Approve the budget", ["Approve the budget"], "signed")),
    flat(step("c3", "Set up", "doing", "neon1", "Network and devices live", "Ready to check", ["Install", "Test"])),
    flat(step("c4", "Event week", "doing", "neon1", "", "Week finished", ["On call"])),
    flat(step("c5", "Wrap", "wrapping", "client", "Gear returned, notes shared", "Close out", ["Share notes"])),
    flat(step("c6", "Done", "done", "neon1", "", "Reopen", [])),
  ],
};


export const stepsOf = (w: Workflow) => w.groups.flatMap((g) => g.steps);


export interface Project {
  key: string;
  org: string;
  name: string;
  workflow: Workflow;
  stepId: string;
  approved: boolean;
  // Ticked list items, as "stepId:item"
  ticked?: string[];
  // Off the board, kept with its history. Never a column
  archived?: Reason;
}

export const REASONS = ["Canceled", "Tabled", "Replaced"] as const;
export type Reason = (typeof REASONS)[number];

export const nextStep = (p: Project): Step | undefined => stepsOf(p.workflow)[stepsOf(p.workflow).indexOf(stepOf(p)) + 1];
export const isTicked = (p: Project, item: string) => !!p.ticked?.includes(`${stepOf(p).id}:${item}`);
// Everything a hand-moved step asks for is done, so its move is one tap
export const isReady = (p: Project) => {
  const s = stepOf(p);
  return !s.event && !!nextStep(p) && s.todo.length > 0 && s.todo.every((t) => isTicked(p, t));
};

// A project's current step; a step removed by an edit falls back to the first
export const stepOf = (p: Project) => stepsOf(p.workflow).find((s) => s.id === p.stepId) ?? stepsOf(p.workflow)[0]!;


// Where a project lands in another workflow: the first step in the same state, else the nearest earlier one
export function landing(from: Project, to: Workflow): Step {
  const at = stateIndex(stepOf(from).state);
  const steps = stepsOf(to);
  return steps.find((s) => stateIndex(s.state) === at)
    ?? [...steps].reverse().find((s) => stateIndex(s.state) < at)
    ?? steps[0]!;
}

// The one gate: reaching agreed work or beyond without an approval asks for a reason.
// A workbench is open work from the start, so only billing is gated there
export const needsReason = (p: Project, to: Step) =>
  !p.approved && p.workflow.id !== "bench" && stateIndex(stepOf(p).state) < stateIndex("doing") && stateIndex(to.state) >= stateIndex("doing") && to.state !== "done";


export const SEED: Project[] = [
  { key: "FLOW-1", org: "Harborline", name: "Stock reconciliation report", workflow: NEON, stepId: "decide", approved: false },
  { key: "PRJ-4", org: "Harborline", name: "Front desk tidy-up", workflow: BENCH, stepId: "open", approved: false },
  { key: "FIX-2", org: "Ridgeview", name: "Label printer stopped", workflow: QUICK, stepId: "fix", approved: true },
  { key: "NET-3", org: "Ridgeview", name: "Spring event network", workflow: CUSTOM_START, stepId: "c1", approved: false },
  { key: "SEC-1", org: "Harborline", name: "Admin sign-in hardening", workflow: NEON, stepId: "verify", approved: true, ticked: ["verify:Restore tested", "verify:Mismatches per week: 38, target 5"] },
  { key: "AI-2", org: "Harborline", name: "Policy answers assistant", workflow: NEON, stepId: "listen", approved: false },
  { key: "HOME-1", org: "Ridgeview", name: "Second office phones", workflow: NEON, stepId: "propose", approved: false, archived: "Tabled" },
];
