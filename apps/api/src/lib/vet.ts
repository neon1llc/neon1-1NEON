// apps/api/src/lib/vet.ts - The form checks every route shares: the rules in @1neon/domain's forms.ts,
// plus the outside checks (Vetting) when the app has them. Each check answers for one field, so a form
// can show its message beside that field. A check that can't decide never refuses anyone.


import { emailDomain, emailShapeOk, MIN_TEXT, nameProblem, OUTSIDE_US, placeShapeProblem, splitPlace, stateCode, textProblem, US_STATES } from "@1neon/domain";
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


/** A website or public page: only its shape is checked (the domain rules, before this). The server never
 * visits it, so nothing typed here can make it reach anywhere, and a new or private site is never refused */
export async function linkProblem(_v: Vetting | undefined, _link: string): Promise<string | undefined> {
  return undefined;
}


// Common names a populated-places list spells another way
const PLACE_ALIASES: Record<string, Record<string, string>> = {
  NY: { "new york": "New York", nyc: "New York City", "new york city": "New York City", bronx: "The Bronx" },
  DC: { washington: "Washington", "washington dc": "Washington" },
};


/**
 * A place as stored ("City, ST", a state's name, or a place outside the US as typed). A US city is
 * given its proper spelling when the places list (Vetting) knows it, and kept as typed when it doesn't,
 * since the list misses small towns. Returns the place, or the message to show
 */
export async function placeCheck(v: Vetting | undefined, place: string): Promise<{ place: string } | { problem: string }> {
  if (!place.trim()) return { place: "" };
  const { city, state } = splitPlace(place);
  const shape = placeShapeProblem(city, state);
  if (shape) return { problem: shape };
  if (state === OUTSIDE_US) {
    const t = textProblem(city, "where you're based", MIN_TEXT);
    return t ? { problem: t } : { place: city.trim().replace(/\s+/g, " ") };
  }
  const code = stateCode(state)!;
  if (!city) return { place: US_STATES[code] };
  const alias = PLACE_ALIASES[code]?.[city.trim().toLowerCase().replace(/\./g, "")];
  if (alias) return { place: `${alias}, ${code}` };
  if (!v) return { place: `${city.trim()}, ${code}` };
  const found = await v.place(city, code);
  return { place: `${found ?? city.trim()}, ${code}` };
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
