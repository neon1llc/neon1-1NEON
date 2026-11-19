// apps/api/src/lib/contactmail.ts - The contact form email, laid out like the bug report and feedback emails: a
// left-aligned table of facts (from, organization, about, timing, how they found neon1, their local time, when it was
// sent), then what they wrote in its own blocks. Plain text carries the same rows in aligned columns.
import { esc, sentAt } from "../mail.ts";

/** What the form sent and the route checked: everything one message holds */
export interface ContactMessage {
  name: string;
  email: string;
  company: string;
  about: string; // every topic picked by name, or "Not said"
  today: string; // "What happens today"
  better: string; // "What would be better", may be empty
  timing: string;
  found: string; // "Found neon1 through", already worded; empty when not said
  localTime: string; // their clock when they sent it, already worded; empty when the zone was unknown
  at: Date;
  zone: string; // the zone the sent time reads in (neon1's)
}

const BRAND = "#035704", PAPER = "#F2F4F2", INK = "#12241A", MUTED = "#56665c", LINE = "rgba(18,36,26,.14)";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "Figtree,-apple-system,'Segoe UI',Roboto,sans-serif";
const gist = (s: string, n = 90) => { const t = s.replace(/\s+/g, " ").trim(); return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`; };

export function contactMail(m: ContactMessage) {
  const rows: [string, string][] = [
    ["From", `${m.name} <${m.email}> (reply to this email)`],
    ...(m.company ? [["Organization", m.company] as [string, string]] : []),
    ["About", m.about],
    ...(m.timing ? [["Timing", m.timing] as [string, string]] : []),
    ...(m.found ? [["Found neon1 through", m.found] as [string, string]] : []),
    ...(m.localTime ? [["Their local time", m.localTime] as [string, string]] : []),
    ["Sent", sentAt(m.at, m.zone).replace(/^Sent /, "")],
  ];
  const blocks: [string, string][] = [["What happens today", m.today], ...(m.better ? [["What would be better", m.better] as [string, string]] : [])];

  // ---- Plain text: aligned columns, each block under its own rule ----
  const pad = Math.max(...rows.map(([k]) => k.length)) + 2;
  const rule = "-".repeat(60);
  const text = [
    `${m.name}  ${m.about}`,
    rule,
    ...rows.map(([k, v]) => `${k.padEnd(pad)}${v}`),
    ...blocks.flatMap(([k, v]) => [rule, k.toUpperCase(), "", v, ""]),
    rule,
    "Reply to this email to answer them directly.",
  ].join("\n");

  // ---- HTML: a card with a header line, the fact table, then one block per answer ----
  const cell = (k: string, v: string) =>
    `<tr><td style="padding:7px 14px 7px 0;border-bottom:1px solid ${LINE};font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${MUTED};vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid ${LINE};font:14px ${SANS};color:${INK};vertical-align:top;word-break:break-word">${esc(v)}</td></tr>`;
  const table = rows.map(([k, v]) => cell(k, v)).join("");
  const blockHtml = blocks.map(([k, v]) =>
    `<p style="margin:0 0 8px;font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">${esc(k)}</p>
<div style="margin:0 0 22px;padding:12px 14px;background:${PAPER};border-left:3px solid ${BRAND};border-radius:4px;font:15px/1.55 ${SANS};color:${INK};white-space:pre-wrap;word-break:break-word">${esc(v)}</div>`).join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${PAPER};font:15px/1.55 ${SANS};color:${INK}">
<span style="display:none;max-height:0;overflow:hidden">${esc(`${m.name}: ${gist(m.about)}`)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:20px 10px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:22px 24px 20px;text-align:left">
<p style="margin:0 0 4px;font:600 12px ${MONO};letter-spacing:.06em;color:${BRAND}">neon1 · request</p>
<h1 style="margin:0 0 16px;font:700 22px ${MONO};color:${INK}">${esc(m.name)} <span style="font:500 14px ${SANS};color:${MUTED}">· ${esc(gist(m.about, 60))}</span></h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};margin:0 0 20px">${table}</table>
${blockHtml}
<p style="margin:14px 0 0;padding-top:12px;border-top:1px solid ${LINE};font:12px ${MONO};color:${MUTED}">Reply to this email to answer them directly.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
