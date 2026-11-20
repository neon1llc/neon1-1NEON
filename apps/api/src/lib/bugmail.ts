// apps/api/src/lib/bugmail.ts - The bug report email, laid out like a tracker's issue: a left-aligned table of facts
// (reference, where, time, reporter, page, theme, browser, window), then what happened in its own block, then the
// screenshots. Plain text carries the same rows in aligned columns, so mail apps without HTML read it the same way.
// Screenshots show inline in the HTML (cid:) and also attach.
import { esc, sentAt } from "../mail.ts";
import { factMail, gist, replyTo, subjectOf } from "./factmail.ts";

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

/** The subject: what it is and where ("Bug report BUG-2KNJ49 — Neo chat"); the preview line has the start of the report */
export function bugSubject(r: BugReport) {
  return subjectOf(`Bug report ${r.ref}`, r.where);
}

export function bugMail(r: BugReport, shots: Shot[], notes: string[]) {
  const browser = browserName(r.browser);
  const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", SANS = "Figtree,-apple-system,'Segoe UI',Roboto,sans-serif", LINE = "rgba(18,36,26,.14)", MUTED = "#56665c", INK = "#12241A";
  const images = shots.map((s) => `<p class="muted" style="margin:0 0 6px;font:12px ${MONO};color:${MUTED}">${esc(s.name)} · ${size(s.size)}</p><p style="margin:0 0 16px"><img src="cid:${s.cid}" alt="${esc(s.name)}" style="display:block;max-width:100%;height:auto;border:1px solid ${LINE};border-radius:6px"></p>`).join("");
  const noteHtml = notes.length ? `<p class="warn" style="margin:0 0 6px;font:600 12px ${MONO};letter-spacing:.06em;text-transform:uppercase;color:#92400E">Notes</p>${notes.map((n) => `<p class="ink" style="margin:0 0 6px;font:14px ${SANS};color:${INK}">${esc(n)}</p>`).join("")}` : "";
  const rule = "-".repeat(60);
  return factMail({
    kicker: "bug report",
    title: r.ref,
    sub: r.where,
    intro: [`${r.email || "Someone"} reported a problem in ${r.where}.`],
    preheader: `${r.where}: ${gist(r.what, 90)}`,
    facts: [
      { k: "Reference", v: r.ref, mono: true },
      { k: "Where", v: r.where },
      { k: "Reported", v: when(r.at) },
      { k: "Reporter", v: r.email ? `${r.email} (reply to this email)` : "no email left" },
      ...(r.page ? [{ k: "Page", v: r.page, mono: true }] : []),
      ...(r.theme ? [{ k: "Theme", v: r.theme }] : []),
      ...(browser ? [{ k: "Browser", v: browser }] : []),
      ...(r.viewport ? [{ k: "Window", v: r.viewport, mono: true }] : []),
      { k: "Screenshots", v: shots.length ? `${shots.length} attached` : "none" },
      ...(r.browser && browser !== r.browser ? [{ k: "Agent", v: r.browser, small: true }] : []),
    ],
    blocks: [["What happened", r.what]],
    extraHtml: `${shots.length ? `<p class="muted" style="margin:0 0 8px;${"font:600 12px " + MONO};letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">Screenshots</p>${images}` : ""}${noteHtml}`,
    extraText: [
      ...(shots.length ? [rule, "SCREENSHOTS", "", ...shots.map((s) => `${s.name} (${size(s.size)})`)] : []),
      ...(notes.length ? ["", rule, "NOTES", "", ...notes] : []),
    ],
    action: r.email ? { label: "Reply to the reporter", url: replyTo(r.email, bugSubject(r)) } : undefined,
    why: "Someone sent this with Report a bug on neon1.tech or in 1NEON.",
    reply: r.email ? "Reply to this email to answer the reporter." : "The reporter left no email.",
    textHead: `${r.ref}  ${r.where}`,
  });
}
