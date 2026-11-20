// packages/domain/src/forms.ts - The rules every form shares: who someone is ("Which describes you
// best?"), US states and how a place is written, and the checks on names, free text, and email
// addresses that need nothing from outside. The API runs these and the network checks (a mail domain
// that takes mail, a website that answers, a place that exists); the web app runs the same ones first so
// a person sees a problem before sending. Tested in forms.test.ts.


/** "Which describes you best?" on sign-up. Every answer but an individual names an organization, and
 * "other" says in its own words what it is */
export const DESCRIBES = {
  individual: "An individual",
  small: "A small business (under 100 people)",
  medium: "A medium business (100 to 499 people)",
  large: "A large business (500 people or more)",
  tech: "A technical team",
  nonprofit: "A nonprofit",
  public: "A school or public agency",
  other: "Something else",
} as const;
export type Describes = keyof typeof DESCRIBES;
export const DESCRIBES_KEYS = Object.keys(DESCRIBES) as [Describes, ...Describes[]];


/** The states, DC, and the territories, by postal code */
export const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands", AS: "American Samoa", MP: "Northern Mariana Islands",
} as const;
export type StateCode = keyof typeof US_STATES;


/** A state's code from its code or name, in any case; undefined if it isn't one */
export function stateCode(typed: string): StateCode | undefined {
  const t = typed.trim().replace(/\./g, "").toLowerCase();
  if (!t) return undefined;
  for (const [code, name] of Object.entries(US_STATES)) if (code.toLowerCase() === t || name.toLowerCase().replace(/\./g, "") === t) return code as StateCode;
  return undefined;
}


/** The state picker's choice for anywhere outside the US: the place is then typed freely ("Toronto,
 * Canada"). neon1 works in the US first, and others are welcome to ask */
export const OUTSIDE_US = "intl";


/** A place as stored: "City, ST", the state's name alone, or a place outside the US as typed. Empty
 * when nothing is given */
export function joinPlace(city: string, state: string): string {
  const code = stateCode(state);
  if (!code) return city.trim() ? city.trim().replace(/\s+/g, " ") : "";
  return city.trim() ? `${city.trim()}, ${code}` : US_STATES[code];
}


/** A stored or typed place split back into its city and state code, for the two fields that edit it.
 * Anything that doesn't end in a US state is a place outside the US, kept whole */
export function splitPlace(place: string): { city: string; state: StateCode | typeof OUTSIDE_US | "" } {
  const p = place.trim();
  if (!p) return { city: "", state: "" };
  const alone = stateCode(p);
  if (alone) return { city: "", state: alone };
  const i = p.lastIndexOf(",");
  if (i > 0) {
    const code = stateCode(p.slice(i + 1));
    if (code) return { city: p.slice(0, i).trim(), state: code };
  }
  return { city: p, state: OUTSIDE_US };
}


/** What's wrong with a place's two parts before anyone looks it up: a city needs its state */
export function placeShapeProblem(city: string, state: string): string | undefined {
  if (state === OUTSIDE_US) return !city.trim() ? "Enter your city and country." : !/\p{L}/u.test(city) ? "Enter a place, like Toronto, Canada." : undefined;
  if (city.trim() && !stateCode(state)) return "Choose the state too (or Outside the US), or leave the city empty.";
  if (city.trim() && !/\p{L}/u.test(city)) return "Enter a city, like Albany.";
  return undefined;
}


// Words people type when they don't mean to give a real answer
const PLACEHOLDERS = new Set(["test", "testing", "asdf", "asdfgh", "qwerty", "foo", "bar", "foobar", "none", "na", "n/a", "nil", "null", "undefined", "abc", "xxx", "xyz", "aaa", "blah", "nobody", "anonymous", "fake", "dummy", "sample", "example", "lorem", "ipsum"]);

/** Does this look like typing to fill a box rather than an answer? Light on purpose: real names and
 * businesses are odd, so only the unmistakable is caught. No letters at all; one character five or more
 * times in a row; a web address or email where a name belongs; or only placeholder words */
export function looksLikeJunk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!/\p{L}/u.test(t)) return true;
  if (/(.)\1{4,}/u.test(t.replace(/\s/g, ""))) return true;
  const words = t.toLowerCase().split(/[\s,.;:!?]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => PLACEHOLDERS.has(w));
}


/** A person's name: letters (any language), spaces, apostrophes, hyphens, and periods; a first and last
 * one name is fine, since many people go by one. Returns what to tell them, or undefined when it's fine */
export function nameProblem(name: string): string | undefined {
  const t = name.trim().replace(/\s+/g, " ");
  if (!t) return "Enter your name.";
  if (/[@/\\:]|https?|www\./i.test(t) || /\d/.test(t)) return "Enter your name without numbers, links, or email addresses.";
  if (!/^[\p{L}\p{M}][\p{L}\p{M}' .’-]*$/u.test(t)) return "Use letters, spaces, apostrophes, hyphens, or periods.";
  if ((t.match(/\p{L}/gu) ?? []).length < MIN_TEXT) return `Enter at least ${MIN_TEXT} letters of your name.`;
  if (looksLikeJunk(t) || offensive(t)) return "Enter your real name.";
  // One name is a real name too (many people go by one), so a last name is never required
  return undefined;
}


/** An email address's shape: one @, a sensible local part, and a domain with a real top-level part.
 * Whether the domain takes mail, and isn't a throwaway, is the API's to check */
export function emailShapeOk(email: string): boolean {
  const t = email.trim();
  if (t.length > 254 || /\s/.test(t)) return false;
  const m = /^([^@]+)@([^@]+)$/.exec(t);
  if (!m) return false;
  const [, local, domain] = m as unknown as [string, string, string];
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) return false;
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain);
}


/** The domain of an email address, lowercased */
export function emailDomain(email: string): string {
  return email.trim().slice(email.trim().lastIndexOf("@") + 1).toLowerCase();
}


// Unmistakable obscenities and slurs, matched as whole words only so real names and places (Cumming,
// Penistone, Dikshit, Shiitake) pass. Kept short on purpose: this catches someone messing about, and is
// never a reason to refuse a real answer
const OFFENSIVE = /\b(?:fuck\w*|motherfuck\w*|shit|shits|shitty|shithead|bullshit|cunts?|bitch(?:es)?|assholes?|dickheads?|cocksuck\w*|sluts?|whores?|wankers?|nigg(?:er|a)s?|faggots?|fags|retards?|spics?|chinks?|kikes?|wetbacks?|trann(?:y|ies))\b/i;

/** Does this text use an unmistakable obscenity or slur? Letters swapped for look-alike digits or
 * symbols (sh1t, f@ck) count, and so do letters split by dots or spaces in a short word */
export function offensive(text: string): boolean {
  const plain = text.toLowerCase().replace(/[0134@$5!]/g, (ch) => ({ "0": "o", "1": "i", "3": "e", "4": "a", "@": "a", "$": "s", "5": "s", "!": "i" })[ch]!);
  if (OFFENSIVE.test(plain)) return true;
  // "f u c k" or "f.u.c.k": single letters joined back up
  const joined = plain.replace(/\b(\p{L})[\s.*_-](?=\p{L}\b)/gu, "$1");
  return joined !== plain && OFFENSIVE.test(joined);
}


// The fewest characters a typed answer may have. Names of people and organizations can be two (Li, Ng,
// 3M, HP); any other answer in a person's own words needs three, so a stray key or two doesn't pass
export const MIN_TEXT = 2;
export const MIN_ANSWER = 3;
// A contact message says what's going on, so it needs a sentence's worth
export const MIN_MESSAGE = 10;
// An assessment request's note is the person's last word before neon1 reads their projects: a real
// sentence, not "thanks"
export const MIN_ASSESSMENT_NOTE = 20;


/** One check for any free text a person types into a form (an organization's name, an "other" answer):
 * at least three characters (two for a name, by `min`), not junk, and not offensive. Empty is left to the caller, which knows whether
 * the field is required. Returns what to tell them, or undefined when it's fine */
export function textProblem(text: string, what = "this", min = MIN_ANSWER): string | undefined {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  if (t.length < min) return `Enter at least ${min} characters for ${what}.`;
  if (offensive(text)) return `Please reword ${what}.`;
  if (looksLikeJunk(text)) return `Enter a real answer for ${what}.`;
  return undefined;
}


/** A contact message: required, and long enough to say something. Returns what to tell them, or
 * undefined when it's fine */
export function messageProblem(text: string): string | undefined {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "Say what's going on.";
  if (t.length < MIN_MESSAGE) return `Tell me a little more, at least ${MIN_MESSAGE} characters.`;
  if (looksLikeJunk(t)) return "Describe what's going on in a few words.";
  return undefined;
}


/** An assessment request's note: required, a real sentence (MIN_ASSESSMENT_NOTE), and not junk. Returns
 * what to tell them, or undefined when it's fine */
export function assessmentNoteProblem(text: string): string | undefined {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "Add a note for me to keep in mind.";
  if (t.length < MIN_ASSESSMENT_NOTE) return `Too short. Add a little more: at least ${MIN_ASSESSMENT_NOTE} characters.`;
  if (looksLikeJunk(t)) return "Write it in a few real words.";
  if (offensive(text)) return "Please reword the note.";
  return undefined;
}
