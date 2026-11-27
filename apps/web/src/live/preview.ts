// apps/web/src/live/preview.ts - The short preview /1NEON/live opens with: one fictional request
// becoming a handover in about three minutes, signed in for real, on the real portal. Request, compare, approve,
// see progress, receive the handover. The full story (?play=full) and the short demos stay a pick
// away in the controls' menu. Which engagement it follows is the scenario in play (scenario.ts).


import { liveEngine } from "../lib/api.ts";
import { opening } from "./opening.ts";
import type { Show } from "./player.ts";
import { MONEY, OWNER, S, CHOSEN } from "./scenario.ts";
import { article, base, dryRun, failedDryRun, finishWork, handOver, KEY, listenNotes, moveTo, planWork, proposeOptions, signAgreementAsOwner, tid } from "./story.ts";


// The project the preview works in, and its pages
const PROJECT = `${base}/projects/${KEY}`;
const owner = S.owner.first;
// The options she compares: all but one neon1 set aside
const shown = S.options.filter((_, n) => !S.declined.includes(n));
const word = ["no", "one", "two", "three"][shown.length]!;


/** The client's project, made quietly before she signs in (she set it up earlier), so the walk leads to it */
async function startProject() {
  const engine = (await liveEngine())!;
  const m = S.measures[0]!;
  await engine.actAs(OWNER, `/t/${await tid()}/projects`, "POST", {
    name: S.project.name, template: S.template.id, summary: S.project.today, outcome: S.project.outcome, example: S.project.example,
    metrics: [{ title: m.title, unit: m.unit, baseline: m.baseline, target: m.target }],
    idempotencyKey: "live-preview-project",
  });
}


// The opening: the owner's reason, the sign-in, and the walk to the project's Needs tab
const IN = opening("p-in", S.voice.opens, S.voice.previewReason, `${PROJECT}/needs`);


/** About three minutes at the default speed: the sign-in and the walk to the project, then the five steps */
export const PREVIEW: Show = {
  id: "preview",
  title: "The short preview",
  blurb: "Request, compare, approve, progress, and handover",
  length: "about three minutes",
  intro: {
    text: [
      S.voice.previewIntro,
      `In about three minutes you'll watch ${owner} sign in, ask for what is needed, compare ${shown.length === 1 ? "the recommendation" : `${word} priced options`}, approve one, see the work and its hours, and take the handover. A line under the controls says what's happening, and ${owner}'s thoughts appear beside the cursor.`,
    ],
  },
  end: "That's the short version.",
  recap: S.voice.previewRecap,
  sections: [
    // She comes in the front door: why she's here, the emailed code, and the walk to the project's Needs
    { ...IN, run: async (s) => { await s.others(startProject, 0); await IN.run(s); } },
    {
      id: "p-request",
      title: "Ask for something",
      run: async (s) => {
        await s.say("She asks neon1 for help in one sentence");
        // An action button: the first press opens its name, the second adds
        await s.click('button.act[title="Add request"]', 500);
        await s.click('button.act[title="Add request"]', 500);
        const one = "form.sentence fieldset:nth-of-type(1)";
        await s.click({ sel: `${one} button`, text: S.needs.goals[0]! }, 250);
        await s.type(`${one} input[aria-label="Who or what it's for"]`, S.needs.who);
        await s.click({ sel: "button", text: /^Send request$/ }, 900);
        await s.wait(700);
      },
    },
    {
      id: "p-compare",
      title: "Compare options",
      run: async (s) => {
        await s.say(shown.length === 1 ? "neon1 listens first, then writes up one recommendation with its price and tradeoffs" : `neon1 listens first, then answers with ${word} options, each with its price and tradeoffs`);
        // She signed neon1's service agreement when her organization joined, and Pradeep wrote up their
        // first call (the full story shows both)
        await s.others(async () => { await signAgreementAsOwner(); await listenNotes(); await proposeOptions(); }, 900, "Pradeep proposed his options");
        await s.top();
        await s.click({ sel: "a, button", text: "Compare options" }, 1000);
        for (const [n, o] of S.options.entries()) {
          if (S.declined.includes(n)) continue;
          const thought = [S.voice.compareA, S.voice.compareB, S.voice.compareC][n];
          if (thought) await s.think(thought);
          await s.hover({ sel: ".options article", text: o.title }, 900);
        }
        const inForce = article(S.chosen);
        if (await s.has(`${inForce} .basis summary`)) {
          await s.say("A price is never a bare number: it opens to how it was worked out and when she pays");
          await s.click(`${inForce} .basis summary`, 800);
          await s.think(MONEY.fixed ? `${MONEY.firstRange}, fixed. I know what it costs before I say yes.` : `${MONEY.firstRange}, an estimate. I pay for the hours he works, and never more than ${MONEY.firstHigh} unless I agree first.`);
          await s.hover(`${inForce} ${await s.has(`${inForce} .basis-table`) ? ".basis-table" : ".basis-pay"}`, 1500);
        } else {
          await s.hover(inForce, 1500);
        }
      },
    },
    {
      id: "p-approve",
      title: "Approve one",
      run: async (s) => {
        await s.say(`${owner} approves one, and the decision is kept with the exact terms she saw`);
        await s.click({ sel: `${article(S.chosen)} button`, text: "Approve this option" }, 600);
        await s.think(S.voice.conditionThink);
        await s.type("#cond", S.condition);
        await s.type("#approve-sign-name", S.owner.name);
        await s.click("#approve-sign-name ~ .sign-consent input", 400);
        await s.click({ sel: "dialog[open] .actions button", text: /^Sign and approve/ }, 1200);
        await s.top();
        await s.hover(".decision", 1200);
      },
    },
    {
      id: "p-progress",
      title: "See progress",
      run: async (s) => {
        await s.say("The work shows up as it happens, in updates she can read in a minute, failures included");
        await s.others(async () => {
          await moveTo("build");
          await planWork();
          await finishWork();
          if (S.revision) await failedDryRun();
        }, 700, "Pradeep finished four tasks");
        await s.click({ sel: "nav.tabs a", text: "Execute" }, 900);
        await s.hover({ sel: ".item", text: S.tasks[3] }, 900);
        await s.hover("#hours .hours-table", 1300);
      },
    },
    {
      id: "p-handover",
      title: "Receive the handover",
      run: async (s) => {
        await s.say("At handover, the accounts and the know-how become hers");
        await s.others(async () => { await moveTo("verify"); await dryRun(); await handOver(); }, 700, "Pradeep uploaded the runbook");
        await s.click({ sel: "nav.tabs a", text: "Normalize" }, 900);
        await s.think(S.voice.stepAccounts);
        await s.click('input[aria-label="Done: Accounts are in the client\'s name"]', 500);
        await s.think(S.voice.stepDocs);
        await s.click('input[aria-label="Done: Docs delivered and walked through"]', 900);
        await s.think(S.voice.finalThink);
        await s.wait(1200);
      },
    },
  ],
};
