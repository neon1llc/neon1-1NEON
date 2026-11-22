// apps/api/src/lib/factmail.ts - The one layout for every email neon1 and 1NEON send: a headline that says what
// happened, a left-aligned table of key facts, optional blocks (what someone wrote), one primary action, and small
// print that says why the mail arrived and how to change that. The plain text carries the same parts in the same
// order, so a mail app without HTML reads it as clearly. Inline styles carry the light look, since mail clients
// strip many style sheets; a small style block adds dark mode and a stacked table on a narrow phone where the
// client keeps it, and where it doesn't, the inline look is already readable.
import { MARK, esc } from "../mail.ts";

const BRAND = "#035704", PAPER = "#F2F4F2", INK = "#12241A", MUTED = "#56665c", LINE = "rgba(18,36,26,.14)";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "Figtree,-apple-system,'Segoe UI',Roboto,sans-serif";

/** One row of the fact table; `mono` sets the value in the code face, `small` quiets it, `href` makes it a link */
export interface Fact { k: string; v: string; mono?: boolean; small?: boolean; href?: string }

/** One piece of mail: everything that varies */
export interface FactMail {
  kicker: string; // after "neon1 ·" at the top: the kind of mail, such as "free account alert"
  title: string; // the one-line statement of what happened
  sub?: string; // muted words after the title, such as the organization
  preheader: string; // the inbox preview line
  intro?: string[]; // one or two plain sentences under the title
  code?: string; // a sign-in code, shown large; may be Cognito's {####} placeholder
  facts: Fact[];
  blocks?: [string, string][]; // what someone wrote, each under its own label
  todo?: string; // what to do about it, in a sentence under the table
  action?: { label: string; url: string }; // the one primary action
  extraHtml?: string; // after the blocks (screenshots, notes)
  extraText?: string[]; // the same, for the plain text
  why: string; // why this email arrived, such as "You're a member of Kim Dental on 1NEON."
  settings?: { text: string; url?: string; label?: string }; // how to change that, with where
  reply?: string; // what a reply does, when it does something
  textHead?: string; // first line of the plain text; defaults to the title
}

/** A link that opens a reply to someone, with the subject already "Re: ..." */
export const replyTo = (email: string, subject: string) => `mailto:${email}?subject=${encodeURIComponent(`Re: ${subject}`)}`;

/** One line of text for a subject or preview: no newlines, cut at a word */
export const gist = (s: string, n = 60) => { const t = s.replace(/\s+/g, " ").trim(); return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`; };

/** A short, scannable subject: what happened, then who or where. Details stay in the body */
export const subjectOf = (what: string, who: string, n = 80) => gist(`${what}: ${who}`, n);

// Each class has its light look inline; the style block below changes it for dark mode and narrow screens
// A long name with no spaces must wrap inside the card, not widen it
const WRAP = "word-break:break-word;overflow-wrap:anywhere";
// dir="auto" on what someone wrote and bdi on the title let right-to-left text read correctly; facts stay left to right
const label = (color = MUTED) => `font:600 12px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${color}`;

/** One row of the fact table */
export function cell(f: Fact) {
  const face = f.mono ? `13px ${MONO}` : f.small ? `12px ${MONO}` : `15px ${SANS}`;
  const cls = f.small ? "muted" : "ink";
  const color = f.small ? MUTED : INK;
  const value = f.href ? `<a class="lk" href="${esc(f.href)}" style="color:${BRAND};text-decoration:underline">${esc(f.v)}</a>` : esc(f.v);
  return `<tr><td class="k muted rule" style="padding:8px 16px 8px 0;border-bottom:1px solid ${LINE};${label()};vertical-align:top;white-space:nowrap">${esc(f.k)}</td><td class="v ${cls} rule" style="padding:8px 0;border-bottom:1px solid ${LINE};font:${face};color:${color};vertical-align:top;word-break:break-word;overflow-wrap:anywhere">${value}</td></tr>`;
}

/** A labelled block for what someone wrote */
export const block = (k: string, v: string) =>
  `<p class="muted" style="margin:0 0 8px;${label()}">${esc(k)}</p>
<div class="quote ink" dir="auto" style="margin:0 0 22px;padding:12px 14px;background:${PAPER};border-left:3px solid ${BRAND};border-radius:4px;font:15px/1.55 ${SANS};color:${INK};white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere">${esc(v)}</div>`;

// Dark mode and the narrow-phone table. The logo is HTML borders so it recolors with the text: a mail app that force-inverts colors
// (Gmail's apps) flips its borders like the text, and one that honors dark mode takes the .mk rule. Dark colors keep AA contrast: light text on #16241c, bright green links and a
// bright green button with dark text
const STYLES = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.page{background:#0e1712 !important}
.card{background:#16241c !important;border-color:rgba(255,255,255,.18) !important}
.ink{color:#e9f0ea !important}
.muted{color:#aebdb2 !important}
.brand,.lk{color:#6fe36f !important}
.rule{border-color:rgba(255,255,255,.18) !important}
.quote{background:#1d2f25 !important;border-left-color:#6fe36f !important}
.btn{background:#6fe36f !important;color:#08210a !important}
.code{background:#0e1712 !important;color:#6fe36f !important;border-color:rgba(111,227,111,.5) !important}
.warn{color:#fbbf24 !important}
.mk{border-color:#6cffa8 !important}
}
[data-ogsc] .mk{border-color:#6cffa8 !important}
@media (max-width:480px){
.pad{padding:18px 16px 16px !important}
.k{display:block !important;padding:10px 0 0 !important;border-bottom:0 !important}
.v{display:block !important;padding:2px 0 10px !important}
.btn{display:block !important;text-align:center !important}
}`;


// The neon1 mark drawn as nested bordered boxes (a quarter-turn arc each: top and right borders with a rounded corner),
// scaled from the 64-unit site mark so it stands 26px tall beside 13px text, as the site's logo does, with a 1px stroke.
// Borders, not an image, so a mail app that recolors HTML for dark mode recolors the logo with the text. Outlook for
// Windows ignores border-radius, so it gets the image
function markHtml() {
  const k = 0.48, px = (n: number) => +n.toFixed(2);
  // Arc radii in mark units, widest first; each arc nests one stroke gap inside the last
  const radii = [24, 18, 12, 6], gap = px(6 * k - 1);
  const outerW = (r: number) => px(r * k + 0.5);
  let h = px(60 * k - (6 * k - 0.5)) - 1;
  const group = radii.map((r, i) => {
    const content = px(h - i * (gap + 1));
    return { r, content };
  }).reduceRight((inner, { r, content }, i) =>
    `<div class="mk" style="${i ? `margin:${gap}px ${gap}px 0 0;` : `width:${px(outerW(r) - 1)}px;`}height:${content}px;border-top:1px solid ${BRAND};border-right:1px solid ${BRAND};border-top-right-radius:${outerW(r)}px;font-size:0;line-height:0">${inner}</div>`, "");
  const cell = `<td valign="top" style="width:${outerW(24)}px;padding:0">${group}</td>`;
  return `<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0"><tr>${cell}<td style="width:${px(4 * k - 0.5)}px;padding:0"></td>${cell}</tr></table><!--<![endif]-->`
    + `<!--[if mso]><img src="${MARK}" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border:0"><![endif]-->`;
}

// The wordmark as the site sets it: JetBrains Mono, "neon" at 1.3x and weight 450 so its letters match the "1" in height
// and stroke, and the "1" at 700, then the kind of email in the same green
const wordmark = (kicker: string) =>
  `<span style="font-size:13px;letter-spacing:.06em"><span style="font-size:1.3em;font-weight:450">neon</span><span style="font-weight:700">1</span></span><span style="font-size:12px;font-weight:600;letter-spacing:.06em"> · ${esc(kicker)}</span>`;

/** The card around everything: the brand line, the title, then what the caller puts inside, then the small print */
export function shell(m: Pick<FactMail, "kicker" | "title" | "sub" | "preheader" | "intro">, inner: string, footer: string) {
  const intro = (m.intro ?? []).map((p) => `<p class="ink" style="margin:0 0 14px;font:16px/1.55 ${SANS};color:${INK};${WRAP}">${esc(p)}</p>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(m.title)}${m.sub ? ` · ${esc(m.sub)}` : ""}</title><style>${STYLES}</style></head>
<body class="page" style="margin:0;background:${PAPER};font:15px/1.55 ${SANS};color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(m.preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${PAPER}"><tr><td align="center" style="padding:20px 10px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:600px;background:#fff;border:1px solid ${LINE};border-radius:12px"><tr><td class="pad" style="padding:22px 24px 20px;text-align:left">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr><td style="vertical-align:middle">${markHtml()}</td><td class="brand" style="vertical-align:middle;padding-left:10px;font-family:${MONO};color:${BRAND}">${wordmark(m.kicker)}</td></tr></table>
<h1 class="ink" style="margin:0 0 14px;font:700 22px/1.3 ${MONO};color:${INK};${WRAP}"><bdi>${esc(m.title)}</bdi>${m.sub ? ` <span class="muted" style="display:block;font:500 15px/1.4 ${SANS};color:${MUTED};margin-top:4px;${WRAP}">${esc(m.sub)}</span>` : ""}</h1>
${intro}${inner}
${footer}
</td></tr></table></td></tr></table></body></html>`;
}

/** The footer's small print, each line its own paragraph so a screen reader reads them apart */
export const small = (lines: (string | { text: string; url?: string; label?: string })[]) =>
  `<div class="muted rule" style="margin:14px 0 0;padding-top:12px;border-top:1px solid ${LINE};font:12px/1.65 ${SANS};color:${MUTED}">${lines.map((l) => (typeof l === "string" ? `<p style="margin:0 0 4px;${WRAP}">${esc(l)}</p>` : `<p style="margin:0 0 4px;${WRAP}">${esc(l.text)}${l.url ? ` <a class="lk" href="${esc(l.url)}" style="color:${BRAND};text-decoration:underline">${esc(l.label ?? "Notification settings")}</a>` : ""}</p>`)).join("")}</div>`;

/** The one primary action, left-aligned under the table, tall enough to tap */
const button = (a: { label: string; url: string }) =>
  `<p style="margin:0 0 20px"><a class="btn" href="${esc(a.url)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:13px 22px;min-height:20px;border-radius:8px;font:600 14px ${MONO};letter-spacing:.02em;${WRAP}">${esc(a.label)}</a></p>`;

/** A sign-in code: one unbroken text node that selects whole on a tap or double click */
const codeBox = (code: string) =>
  `<p style="margin:4px 0 22px"><span class="code" style="display:inline-block;font:700 30px ${MONO};letter-spacing:.2em;color:${BRAND};background:#fff;border:1px solid rgba(3,87,4,.4);border-radius:10px;padding:14px 14px 14px 20px;-webkit-user-select:all;user-select:all">${code}</span></p>`;

/** The HTML and plain text of one fact mail */
export function factMail(m: FactMail) {
  const table = m.facts.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="rule" style="border-top:1px solid ${LINE};margin:0 0 20px">${m.facts.map(cell).join("")}</table>`
    : "";
  const todo = m.todo ? `<p class="ink" style="margin:0 0 18px;font:15px/1.55 ${SANS};color:${INK}"><b>What to do:</b> ${esc(m.todo)}</p>` : "";
  const footer = small([m.why, ...(m.settings ? [m.settings] : []), ...(m.reply ? [m.reply] : [])]);
  const html = shell(m, `${m.code ? codeBox(m.code) : ""}${table}${(m.blocks ?? []).map(([k, v]) => block(k, v)).join("\n")}${m.extraHtml ?? ""}${todo}${m.action ? button(m.action) : ""}`, footer);
  const pad = Math.max(0, ...m.facts.map((f) => f.k.length)) + 2;
  const rule = "-".repeat(60);
  const text = [
    m.textHead ?? m.title,
    ...(m.sub ? [m.sub] : []),
    rule,
    ...(m.intro ?? []).flatMap((p) => [p, ""]),
    ...(m.code ? [`Code: ${m.code}`, ""] : []),
    ...m.facts.map((f) => `${f.k.padEnd(pad)}${f.v}`),
    ...(m.blocks ?? []).flatMap(([k, v]) => ["", k.toUpperCase(), v]),
    ...(m.extraText ?? []),
    ...(m.todo ? ["", `What to do: ${m.todo}`] : []),
    ...(m.action ? ["", `${m.action.label}: ${m.action.url}`] : []),
    "",
    rule,
    `Why you got this: ${m.why}`,
    ...(m.settings ? [`${m.settings.text}${m.settings.url ? ` ${m.settings.label ?? "Notification settings"}: ${m.settings.url}` : ""}`] : []),
    ...(m.reply ? [m.reply] : []),
  ].join("\n");
  return { html, text };
}
