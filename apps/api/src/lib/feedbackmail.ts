// apps/api/src/lib/feedbackmail.ts - The feedback email, laid out like the bug report's: a left-aligned table of facts
// (reference, kind, where, time, sender, page, theme, browser, window), then what they wrote in its own block. Plain
// text carries the same rows in aligned columns.
import { esc, sentAt } from "../mail.ts";
import { browserName } from "./bugmail.ts";

/** What the page sent and the route fixed: everything one piece of feedback holds */
export interface Feedback {
  ref: string;
  kind: string; // the dropdown's words ("Concern")
  where: string; // the dropdown's words ("Neo chat")
  what: string;
  email: string;
  page: string;
  theme: string;
  browser: string; // the raw agent string
  viewport: string;
  at: string; // ISO time
}

const BRAND = "#035704", PAPER = "#F2F4F2", INK = "#12241A", MUTED = "#56665c", LINE = "rgba(18,36,26,.14)";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "Figtree,-apple-system,'Segoe UI',Roboto,sans-serif";
const when = (iso: string) => sentAt(new Date(iso)).replace(/^Sent /, "");
const gist = (s: string, n = 60) => { const t = s.replace(/\s+/g, " ").trim(); return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`; };

/** The subject: tracker-style, with the reference first and a glance at what they wrote */
export function feedbackSubject(f: Feedback) {
  return `[feedback] ${f.ref} · ${f.kind} · ${f.where} · ${gist(f.what)}`;
}

export function feedbackMail(f: Feedback) {
  const browser = browserName(f.browser);
  const rows: [string, string][] = [
    ["Reference", f.ref],
    ["Kind", f.kind],
    ["About", f.where],
    ["Sent", when(f.at)],
    ["From", f.email ? `${f.email} (reply to this email)` : "no email left"],
    ...(f.page ? [["Page", f.page] as [string, string]] : []),
    ...(f.theme ? [["Theme", f.theme] as [string, string]] : []),
    ...(browser ? [["Browser", browser] as [string, string]] : []),
    ...(f.viewport ? [["Window", f.viewport] as [string, string]] : []),
  ];

  const pad = Math.max(...rows.map(([k]) => k.length)) + 2;
  const rule = "-".repeat(60);
  const text = [
    `${f.ref}  ${f.kind}  ${f.where}`,
    rule,
    ...rows.map(([k, v]) => `${k.padEnd(pad)}${v}`),
    rule,
    "WHAT THEY WROTE",
    "",
    f.what,
    "",
    rule,
    f.email ? "Reply to this email to answer them." : "They left no email.",
  ].join("\n");

  const cell = (k: string, v: string, mono = false) =>
    `<tr><td style="padding:7px 14px 7px 0;border-bottom:1px solid ${LINE};font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${MUTED};vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid ${LINE};font:${mono ? `13px ${MONO}` : `14px ${SANS}`};color:${INK};vertical-align:top;word-break:break-word">${esc(v)}</td></tr>`;
  const table = rows.map(([k, v]) => cell(k, v, k === "Reference" || k === "Page" || k === "Window")).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${PAPER};font:15px/1.55 ${SANS};color:${INK}">
<span style="display:none;max-height:0;overflow:hidden">${esc(`${f.kind}: ${gist(f.what, 90)}`)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:20px 10px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:22px 24px 20px;text-align:left">
<p style="margin:0 0 4px;font:600 12px ${MONO};letter-spacing:.06em;color:${BRAND}">neon1 · feedback</p>
<h1 style="margin:0 0 16px;font:700 22px ${MONO};color:${INK}">${esc(f.ref)} <span style="font:500 14px ${SANS};color:${MUTED}">· ${esc(f.kind)} · ${esc(f.where)}</span></h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};margin:0 0 20px">${table}</table>
<p style="margin:0 0 8px;font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">What they wrote</p>
<div style="margin:0 0 22px;padding:12px 14px;background:${PAPER};border-left:3px solid ${BRAND};border-radius:4px;font:15px/1.55 ${SANS};color:${INK};white-space:pre-wrap;word-break:break-word">${esc(f.what)}</div>
<p style="margin:14px 0 0;padding-top:12px;border-top:1px solid ${LINE};font:12px ${MONO};color:${MUTED}">${f.email ? "Reply to this email to answer them." : "They left no email."}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
