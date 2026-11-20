// apps/api/src/lib/factmail.ts - The one layout for mail that tells neon1 or a client what happened: a kicker line,
// a title, a left-aligned table of facts, then optional blocks (what someone wrote), one button, and a footer. The
// contact, bug, and feedback emails, the request email, and every portal notice use it, so they read the same way.
// Plain text carries the same rows in aligned columns, so mail apps without HTML read it too.
import { esc } from "../mail.ts";

const BRAND = "#035704", PAPER = "#F2F4F2", INK = "#12241A", MUTED = "#56665c", LINE = "rgba(18,36,26,.14)";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "Figtree,-apple-system,'Segoe UI',Roboto,sans-serif";

/** One row of the fact table; `mono` sets the value in the code face, `small` quiets it, `href` makes it a link */
export interface Fact { k: string; v: string; mono?: boolean; small?: boolean; href?: string }

/** One piece of mail: everything that varies */
export interface FactMail {
  kicker: string; // after "neon1 ·" at the top, such as "request"
  title: string; // the one-line statement of what happened
  sub?: string; // muted words after the title
  preheader: string; // the inbox preview line
  facts: Fact[];
  blocks?: [string, string][]; // what someone wrote, each under its own label
  todo?: string; // what to do about it, in a sentence under the table
  action?: { label: string; url: string };
  extraHtml?: string; // after the blocks (screenshots, notes)
  extraText?: string[]; // the same, for the plain text
  footer: string[]; // small print lines
  textHead?: string; // first line of the plain text; defaults to the title
}

/** One line of text for a subject or preview: no newlines, cut at a word */
export const gist = (s: string, n = 60) => { const t = s.replace(/\s+/g, " ").trim(); return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`; };

const label = (s: string, color = MUTED) => `font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${color}`;

/** One row of the fact table */
export function cell(f: Fact) {
  const face = f.mono ? `13px ${MONO}` : f.small ? `11px ${MONO}` : `14px ${SANS}`;
  const color = f.small ? MUTED : INK;
  const value = f.href ? `<a href="${esc(f.href)}" style="color:${BRAND};text-decoration:underline">${esc(f.v)}</a>` : esc(f.v);
  return `<tr><td style="padding:7px 14px 7px 0;border-bottom:1px solid ${LINE};${label(f.k)};vertical-align:top;white-space:nowrap">${esc(f.k)}</td><td style="padding:7px 0;border-bottom:1px solid ${LINE};font:${face};color:${color};vertical-align:top;word-break:break-word">${value}</td></tr>`;
}

/** A labelled block for what someone wrote */
export const block = (k: string, v: string) =>
  `<p style="margin:0 0 8px;${label(k)}">${esc(k)}</p>
<div style="margin:0 0 22px;padding:12px 14px;background:${PAPER};border-left:3px solid ${BRAND};border-radius:4px;font:15px/1.55 ${SANS};color:${INK};white-space:pre-wrap;word-break:break-word">${esc(v)}</div>`;

/** The card around everything, with the kicker and title above the table */
export function shell(m: Pick<FactMail, "kicker" | "title" | "sub" | "preheader">, inner: string, footer: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${PAPER};font:15px/1.55 ${SANS};color:${INK}">
<span style="display:none;max-height:0;overflow:hidden">${esc(m.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:20px 10px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:22px 24px 20px;text-align:left">
<p style="margin:0 0 4px;font:600 12px ${MONO};letter-spacing:.06em;color:${BRAND}">neon1 · ${esc(m.kicker)}</p>
<h1 style="margin:0 0 16px;font:700 22px ${MONO};color:${INK}">${esc(m.title)}${m.sub ? ` <span style="font:500 14px ${SANS};color:${MUTED}">· ${esc(m.sub)}</span>` : ""}</h1>
${inner}
${footer}
</td></tr></table></td></tr></table></body></html>`;
}

/** The footer's small print */
export const small = (lines: string[]) => `<p style="margin:14px 0 0;padding-top:12px;border-top:1px solid ${LINE};font:12px/1.6 ${MONO};color:${MUTED}">${lines.map(esc).join("<br>")}</p>`;

/** A button that opens the thing in 1NEON, left-aligned under the table */
const button = (a: { label: string; url: string }) =>
  `<p style="margin:0 0 20px"><a href="${esc(a.url)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font:600 13px ${MONO};letter-spacing:.02em">${esc(a.label)}</a></p>`;

/** The HTML and plain text of one fact mail */
export function factMail(m: FactMail) {
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};margin:0 0 20px">${m.facts.map(cell).join("")}</table>`;
  const todo = m.todo ? `<p style="margin:0 0 18px;font:15px/1.55 ${SANS};color:${INK}"><b>What to do:</b> ${esc(m.todo)}</p>` : "";
  const html = shell(m, `${table}${(m.blocks ?? []).map(([k, v]) => block(k, v)).join("\n")}${m.extraHtml ?? ""}${todo}${m.action ? button(m.action) : ""}`, small(m.footer));
  const pad = Math.max(0, ...m.facts.map((f) => f.k.length)) + 2;
  const rule = "-".repeat(60);
  const text = [
    m.textHead ?? m.title,
    rule,
    ...m.facts.map((f) => `${f.k.padEnd(pad)}${f.v}`),
    ...(m.blocks ?? []).flatMap(([k, v]) => [rule, k.toUpperCase(), "", v, ""]),
    ...(m.extraText ?? []),
    ...(m.todo ? ["", `What to do: ${m.todo}`] : []),
    ...(m.action ? ["", `${m.action.label}: ${m.action.url}`] : []),
    "",
    rule,
    ...m.footer,
  ].join("\n");
  return { html, text };
}
