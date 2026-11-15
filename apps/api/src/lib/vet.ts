// apps/api/src/lib/vet.ts - The form checks every route shares: the rules in @1neon/domain's forms.ts,
// plus the outside checks (Vetting) when the app has them. Each check answers for one field, so a form
// can show its message beside that field. A check that can't decide never refuses anyone.


import { emailDomain, emailShapeOk, nameProblem, placeShapeProblem, splitPlace, stateCode, textProblem, US_STATES } from "@1neon/domain";
import type { Vetting } from "../vetting/types.ts";
import { fail } from "./http.ts";


/** Field name to what to tell the person */
export type FieldProblems = Record<string, string>;


/** Refuse with every field's message at once; the web form and the site's contact form show each beside
 * its field (`current.fields`), and the message alone still reads well */
export function failFields(problems: FieldProblems): never {
  const first = Object.values(problems)[0] ?? "Check the form and try again.";
  fail(400, "check_fields", Object.keys(problems).length > 1 ? `${first} Some other fields need a look too.` : first, { fields: problems });
}


/** An email address: its shape, then (with Vetting) that it isn't a throwaway mailbox and its domain
 * takes mail. No mail server is ever asked about the mailbox itself */
export async function emailProblem(v: Vetting | undefined, email: string): Promise<string | undefined> {
  if (!emailShapeOk(email)) return "Enter a full email address, like you@company.com.";
  if (!v) return undefined;
  const domain = emailDomain(email);
  const [throwaway, mail] = await Promise.all([v.disposable(domain), v.mailDomain(domain)]);
  if (throwaway) return "Use an email address you'll keep. Temporary mailboxes can't be used.";
  if (mail === "no_mail") return `${domain} doesn't receive email. Check the address for typos.`;
  return undefined;
}


/** A website or public page, already shaped by the domain rules: it has to answer */
export async function linkProblem(v: Vetting | undefined, link: string): Promise<string | undefined> {
  if (!link || !v) return undefined;
  const r = await v.reachable(link);
  if (r === "refused") return "That address can't be used. Enter a public website or page.";
  if (r === "unreachable") return "That address didn't answer. Check it, or leave it empty.";
  return undefined;
}


// Common names a populated-places list spells another way
const PLACE_ALIASES: Record<string, Record<string, string>> = {
  NY: { "new york": "New York", nyc: "New York City", "new york city": "New York City", bronx: "The Bronx" },
  DC: { washington: "Washington", "washington dc": "Washington" },
};


/**
 * A place as stored ("City, ST" or a state's name): a city needs its state, and (with Vetting) must be a
 * populated place in that state. Returns the place in its proper spelling, or the message to show
 */
export async function placeCheck(v: Vetting | undefined, place: string): Promise<{ place: string } | { problem: string }> {
  if (!place.trim()) return { place: "" };
  const { city, state } = splitPlace(place);
  const shape = placeShapeProblem(city, state);
  if (shape) return { problem: shape };
  const code = stateCode(state)!;
  if (!city) return { place: US_STATES[code] };
  const alias = PLACE_ALIASES[code]?.[city.trim().toLowerCase().replace(/\./g, "")];
  if (alias) return { place: `${alias}, ${code}` };
  if (!v) return { place: `${city.trim()}, ${code}` };
  const found = await v.place(city, code);
  return found ? { place: `${found}, ${code}` } : { problem: `We couldn't find ${city.trim()} in ${US_STATES[code]}. Check the spelling, or choose only the state.` };
}


/** An organization's place and link together (Settings, a new organization): refuses with each field's
 * message, or returns the place in its proper spelling */
export async function checkFace(v: Vetting | undefined, place: string, link: string): Promise<string> {
  const [p, l] = await Promise.all([placeCheck(v, place), linkProblem(v, link)]);
  const problems: FieldProblems = {};
  if ("problem" in p) problems.place = p.problem;
  if (l) problems.link = l;
  if (Object.keys(problems).length) failFields(problems);
  return "place" in p ? p.place : "";
}


export { nameProblem, textProblem };
