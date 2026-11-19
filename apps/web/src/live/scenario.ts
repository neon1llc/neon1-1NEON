// apps/web/src/live/scenario.ts - The made-up engagement this walkthrough follows: the one the link
// named (?scenario=), the one a refresh saved, or the first. Chosen once at load, before the
// in-browser API seeds, so the seed, the story, and the player agree (lib/scenarios.ts holds them all).


import { moneyOf, scenarioOf, summaryOf } from "../lib/scenarios.ts";
import { PLAY } from "./where.ts";

/** The scenario in play */
export const S = scenarioOf(PLAY.scenario);
/** Its people, by email: the client's decision maker and the teammate she invites */
export const OWNER = S.owner.email;
export const COLLEAGUE = S.colleague.email;
/** Its money, worked out from the option and the hours */
export const MONEY = moneyOf(S);
export const SUMMARY = summaryOf(S);
export const CHOSEN = S.options[S.chosen]!;
