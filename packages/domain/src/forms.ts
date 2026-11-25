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


// --- People's names ---------------------------------------------------------
// One rule for every place a person's name is set: sign-up, the profile, invitations, and the contact
// form. After RFC 8266 (nicknames: NFKC, plain spaces, trimmed) and Unicode UTS #39 (one alphabet to a
// word, a limit on stacked marks, and a look-alike "skeleton" compared with reserved names)

export const NAME_MAX = 80;


/** A name as it's stored: NFKC (fullwidth and styled letters become plain ones), every space and hyphen
 * the ordinary one, runs of spaces collapsed, ends trimmed */
export function cleanName(name: string): string {
  return name.normalize("NFKC").replace(/[\p{Zs}\t\n\r]+/gu, " ").replace(/‐/g, "-").trim();
}


// Characters that draw nothing or reorder text: controls, zero-width and direction marks, invisible fillers
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
const hasHidden = (text: string) => HIDDEN.test(text.replace(/[\t\n\r]/g, " "));

// The alphabets a letter can belong to. One not listed counts as "other"; letters shared by all count for none
const SCRIPTS = ["Latin", "Cyrillic", "Greek", "Armenian", "Hebrew", "Arabic", "Devanagari", "Bengali", "Gurmukhi", "Gujarati", "Oriya", "Tamil", "Telugu", "Kannada", "Malayalam", "Sinhala", "Thai", "Lao", "Tibetan", "Myanmar", "Georgian", "Hangul", "Ethiopic", "Khmer", "Mongolian", "Hiragana", "Katakana", "Bopomofo", "Han", "Cherokee", "Canadian_Aboriginal", "Thaana", "Syriac", "Nko", "Tifinagh", "Vai", "Lisu", "Coptic"]
  .map((s) => [s, new RegExp(`\\p{Script=${s}}`, "u")] as const);
const COMMON = /[\p{Script=Common}\p{Script=Inherited}]/u;
// Written together every day, as UTS #39's "highly restrictive" level allows
const TOGETHER = [["Han", "Hiragana", "Katakana"], ["Han", "Bopomofo"], ["Han", "Hangul"]];

function mixedWord(word: string): boolean {
  const used = new Set<string>();
  for (const ch of word.match(/\p{L}/gu) ?? []) if (!COMMON.test(ch)) used.add(SCRIPTS.find(([, re]) => re.test(ch))?.[0] ?? "other");
  return used.size > 1 && !TOGETHER.some((set) => [...used].every((s) => set.includes(s)));
}


// Letters that pass for Latin ones, after accents are removed and case is folded: the part of UTS #39's
// confusables that matters for the reserved names below
const LOOKALIKE: Record<string, string> = {
  а: "a", в: "b", с: "c", ԁ: "d", е: "e", һ: "h", і: "l", ј: "j", к: "k", ӏ: "l", м: "m", н: "h", о: "o", р: "p", ԛ: "q", г: "r", ѕ: "s", т: "t", у: "y", ѵ: "v", ԝ: "w", х: "x",
  α: "a", β: "b", ε: "e", η: "n", ι: "l", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", γ: "y",
  ɑ: "a", ɡ: "g", ı: "l", ɩ: "l", ǀ: "l", ո: "n", օ: "o", ս: "u", հ: "h",
  // Look-alikes within Latin and digits: i, l, and 1 read alike, as do o and 0
  i: "l", "1": "l", "0": "o",
};

/** What a word looks like: two words with one skeleton can pass for each other */
export function skeleton(text: string): string {
  const plain = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  return [...plain].map((ch) => LOOKALIKE[ch] ?? ch).join("").replace(/rn/g, "m").replace(/[^\p{L}\p{N}]/gu, "");
}


const skeletons = (words: string[]) => new Set(words.map(skeleton));
// neon1, wherever it appears
const BRANDS = ["neon1", "1neon", "neonone", "oneneon"].map(skeleton);
// Titles that say who runs this place: refused anywhere in a name
const TITLES = skeletons(["admin", "administrator", "moderator", "helpdesk", "sysadmin", "webmaster", "postmaster", "noreply"]);
// Words some people are really named (Root, Staff, Neo): refused only when a name is made of nothing else
const ROLES = skeletons(["support", "security", "system", "staff", "team", "official", "billing", "service", "help", "desk", "root", "owner", "operator", "abuse", "info", "customer", "care", "account", "neon", "neo", "ai", "assistant", "bot", "the"]);
// neon1's owner, by the first name alone or the full name. Pradeep with another last name is someone else
const PRADEEP = skeleton("pradeep");
const OWNER = skeletons(["pradeep", "pradeeptathineni", "pradeept", "tathineni", "tathinenipradeep"]);
const OWNER_PARTS = skeletons(["pradeep", "tathineni", "t"]);
// Single words that are real first names, though they're on the list above
const FIRST_NAMES = skeletons(["neo", "neon"]);


/** Does this name pass for neon1, its staff, or its owner? */
export function claimsToBeNeon1(name: string): boolean {
  const words = cleanName(name).split(/[\s.’'·_-]+/u).map(skeleton).filter(Boolean);
  const all = words.join("");
  if (!all) return false;
  if (BRANDS.some((b) => all.includes(b)) || TITLES.has(all) || words.some((w) => TITLES.has(w))) return true;
  if (words.length === 1 && FIRST_NAMES.has(all)) return false;
  if (ROLES.has(all) || OWNER.has(all)) return true;
  // Nothing but roles, with or without the owner's name: "Support Team", "Pradeep Support"
  return words.some((w) => ROLES.has(w)) && words.every((w) => ROLES.has(w) || OWNER_PARTS.has(w));
}


/** A person's name: letters (any language), spaces, apostrophes, hyphens, and periods; a first and last
 * one name is fine, since many people go by one. `neon1` is for neon1's own people, the only ones who may
 * use the reserved names. Returns what to tell them, or undefined when it's fine */
export function nameProblem(name: string, opts: { neon1?: boolean } = {}): string | undefined {
  if (hasHidden(name)) return "Remove the hidden characters from your name. Typing it again usually works.";
  const t = cleanName(name);
  if (!t) return "Enter your name.";
  if ([...t].length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  if (!opts.neon1 && claimsToBeNeon1(t)) return skeleton(t) === PRADEEP ? "Add your last name." : "That name is reserved. Use your own name.";
  // neon1's own people may write the company's name, digit and all
  const typed = opts.neon1 ? t.replace(/neon1|1neon/gi, "neon") : t;
  if (/[@/\\:]|https?|www\./i.test(t) || /\d/.test(typed)) return "Enter your name without numbers, links, or email addresses.";
  if (!/^\p{L}[\p{L}\p{M}' .’·-]*$/u.test(typed) || /[' .’·-]\p{M}/u.test(t)) return "Use letters, spaces, apostrophes, hyphens, or periods.";
  // Marks piled on a letter spill over the lines around it
  const marks = t.normalize("NFD");
  if (/[\p{Mn}\p{Me}]{5}/u.test(marks) || /([\p{Mn}\p{Me}])\1/u.test(marks)) return "Remove the extra accent marks.";
  if (t.split(/[ .’'·-]+/u).some(mixedWord)) return "Use one alphabet in each part of your name.";
  if ((t.match(/\p{L}/gu) ?? []).length < MIN_TEXT) return `Enter at least ${MIN_TEXT} letters of your name.`;
  if (looksLikeJunk(t) || offensive(t)) return "Enter your real name.";
  // One name is a real name too (many people go by one), so a last name is never required
  return undefined;
}


/** An organization's name typed at sign-up: free text (digits and symbols are fine) with no hidden
 * characters, and not passing for neon1 or its staff */
export function orgNameProblem(name: string): string | undefined {
  if (hasHidden(name)) return "Remove the hidden characters from the name. Typing it again usually works.";
  if (claimsToBeNeon1(name)) return "That name is reserved. Use your organization's name.";
  return textProblem(name, "your organization's name", MIN_TEXT);
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
  if (offensive(text)) return `Reword ${what}.`;
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
  if (offensive(text)) return "Reword the note.";
  return undefined;
}
