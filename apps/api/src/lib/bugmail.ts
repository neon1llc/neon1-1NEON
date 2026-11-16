// apps/api/src/lib/bugmail.ts - The bug report email, laid out like a tracker's issue: a left-aligned table of facts
// (reference, where, time, reporter, page, theme, browser, window), then what happened in its own block, then the
// screenshots. Plain text carries the same rows in aligned columns, so mail apps without HTML read it the same way.
// Screenshots show inline in the HTML (cid:) and also attach.
import { esc, sentAt } from "../mail.ts";

/** What the page sent and the route fixed: everything one report holds */
export interface BugReport {
  ref: string;
  where: string; // the dropdown's words ("Neo chat")
  what: string;
  email: string;
  page: string;
  theme: string;
  browser: string; // the raw agent string
  viewport: string;
  at: string; // ISO time of the report
}

/** A screenshot as the email names it */
export interface Shot { name: string; type: string; size: number; cid: string }

const BRAND = "#035704", PAPER = "#F2F4F2", INK = "#12241A", MUTED = "#56665c", LINE = "rgba(18,36,26,.14)";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "Figtree,-apple-system,'Segoe UI',Roboto,sans-serif";

/** "Safari 17 on iOS" from an agent string; the string itself if nothing is recognized */
export function browserName(ua: string): string {
  if (!ua) return "";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
  // Edge and Opera also say "Chrome", and Chrome also says "Safari", so the more specific name is tried first
  let name = "";
  for (const [re, label] of [[/Edg\/(\d+)/, "Edge"], [/OPR\/(\d+)/, "Opera"], [/(?:FxiOS|Firefox)\/(\d+)/, "Firefox"], [/(?:CriOS|Chrome)\/(\d+)/, "Chrome"], [/Version\/(\d+)[^]*Safari/, "Safari"]] as [RegExp, string][]) {
    const m = re.exec(ua);
    if (m) { name = `${label} ${m[1]}`; break; }
  }
  return name ? `${name}${os ? ` on ${os}` : ""}` : ua.slice(0, 80);
}

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (iso: string) => sentAt(new Date(iso)).replace(/^Sent /, "");
// One line of the description, for the subject: no newlines, cut at a word
const gist = (s: string, n = 60) => { const t = s.replace(/\s+/g, " ").trim(); return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`; };

/** The subject: tracker-style, with the reference first and a glance at the description */
export function bugSubject(r: BugReport) {
  return `[bug] ${r.ref} · ${r.where} · ${gist(r.what)}`;
}

export function bugMail(r: BugReport, shots: Shot[], notes: string[]) {
  const browser = browserName(r.browser);
  const rows: [string, string][] = [
    ["Reference", r.ref],
    ["Where", r.where],
    ["Reported", when(r.at)],
    ["Reporter", r.email ? `${r.email} (reply to this email)` : "no email left"],
    ...(r.page ? [["Page", r.page] as [string, string]] : []),
    ...(r.theme ? [["Theme", r.theme] as [string, string]] : []),
    ...(browser ? [["Browser", browser] as [string, string]] : []),
    ...(r.viewport ? [["Window", r.viewport] as [string, string]] : []),
    ["Screenshots", shots.length ? `${shots.length} attached` : "none"],
  ];

  // ---- Plain text: aligned columns, the description under its own rule ----
  const pad = Math.max(...rows.map(([k]) => k.length)) + 2;
  const rule = "-".repeat(60);
  const text = [
    `${r.ref}  ${r.where}`,
    rule,
    ...rows.map(([k, v]) => `${k.padEnd(pad)}${v}`),
    ...(r.browser && browser !== r.browser ? [`${"Agent".padEnd(pad)}${r.browser}`] : []),
    rule,
    "WHAT HAPPENED",
    "",
    r.what,
    ...(shots.length ? ["", rule, "SCREENSHOTS", "", ...shots.map((s) => `${s.name} (${size(s.size)})`)] : []),
    ...(notes.length ? ["", rule, "NOTES", "", ...notes] : []),
    "",
    rule,
    r.email ? "Reply to this email to answer the reporter." : "The reporter left no email.",
  ].join("\n");

  // ---- HTML: a card with a header line, the fact table, the description block, then the images ----
  const cell = (k: string, v: string, mono = false) =>
    `<tr><td style="padding:7px 14px 7px 0;border-bottom:1px solid ${LINE};font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${MUTED};vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid ${LINE};font:${mono ? `13px ${MONO}` : `14px ${SANS}`};color:${INK};vertical-align:top;word-break:break-word">${esc(v)}</td></tr>`;
  const table = rows.map(([k, v]) => cell(k, v, k === "Reference" || k === "Page" || k === "Window")).join("")
    + (r.browser && browser !== r.browser ? cell("Agent", r.browser, true).replace(`font:13px ${MONO};color:${INK}`, `font:11px ${MONO};color:${MUTED}`) : "");
  const images = shots.map((s) => `<p style="margin:0 0 6px;font:12px ${MONO};color:${MUTED}">${esc(s.name)} · ${size(s.size)}</p><p style="margin:0 0 16px"><img src="cid:${s.cid}" alt="${esc(s.name)}" style="display:block;max-width:100%;height:auto;border:1px solid ${LINE};border-radius:6px"></p>`).join("");
  const noteHtml = notes.length ? `<p style="margin:0 0 6px;font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:#B45309">Notes</p>${notes.map((n) => `<p style="margin:0 0 6px;font:13px ${SANS};color:${INK}">${esc(n)}</p>`).join("")}` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${PAPER};font:15px/1.55 ${SANS};color:${INK}">
<span style="display:none;max-height:0;overflow:hidden">${esc(`${r.where}: ${gist(r.what, 90)}`)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:20px 10px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:22px 24px 20px;text-align:left">
<p style="margin:0 0 4px;font:600 12px ${MONO};letter-spacing:.06em;color:${BRAND}">neon1 · bug report</p>
<h1 style="margin:0 0 16px;font:700 22px ${MONO};color:${INK}">${esc(r.ref)} <span style="font:500 14px ${SANS};color:${MUTED}">· ${esc(r.where)}</span></h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};margin:0 0 20px">${table}</table>
<p style="margin:0 0 8px;font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">What happened</p>
<div style="margin:0 0 22px;padding:12px 14px;background:${PAPER};border-left:3px solid ${BRAND};border-radius:4px;font:15px/1.55 ${SANS};color:${INK};white-space:pre-wrap;word-break:break-word">${esc(r.what)}</div>
${shots.length ? `<p style="margin:0 0 8px;font:600 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">Screenshots</p>${images}` : ""}
${noteHtml}
<p style="margin:14px 0 0;padding-top:12px;border-top:1px solid ${LINE};font:12px ${MONO};color:${MUTED}">${r.email ? "Reply to this email to answer the reporter." : "The reporter left no email."}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
