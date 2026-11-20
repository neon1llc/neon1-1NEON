// apps/api/src/scripts/mail-samples.ts - One sample of every email 1NEON sends, built by the real code, so a layout
// change can be read in an inbox before it ships. Usage (from apps/api, with SES credentials for the dev account):
//   npx tsx src/scripts/mail-samples.ts --out <dir>        write each as .html and .txt
//   npx tsx src/scripts/mail-samples.ts --send <address>   send each from dev ("[DEV]" before the sender name)
// Only neon1's own addresses are accepted, the same rule dev follows; every name and value is made up.
import { mkdirSync, writeFileSync } from "node:fs";
import { SesMailer } from "../services.ts";
import type { Attachment } from "../lib/mime.ts";
import { neon1Only } from "../dev-guard.ts";
import { bugMail, bugSubject } from "../lib/bugmail.ts";
import { contactMail, contactSubject } from "../lib/contactmail.ts";
import { feedbackMail, feedbackSubject } from "../lib/feedbackmail.ts";
import { codeEmail, factorRemovedEmail, inviteEmail, noticeEmail, passkeyEmail, prospectFacts, requestEmail, signInCodeEmail } from "../emails.ts";
import { quietEmail } from "../routes/prospects.ts";
import { fromHeader, type SenderKind } from "../mail.ts";
import type { Tenant } from "@1neon/domain";

export interface Sample { name: string; as: SenderKind; subject: string; text: string; html: string; replyTo?: string; attachments?: Attachment[] }

// A 1x1 PNG, enough for the bug report's inline screenshot
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHhIEoQAAAABJRU5ErkJggg==", "base64"));

export function samples(): Sample[] {
  const at = new Date("2026-11-19T22:45:00Z");
  const portal = "https://dev.neon1.tech/1NEON/o/harborline/workspace";
  const out: Sample[] = [];
  const add = (name: string, as: SenderKind, m: { subject: string; text: string; html: string; replyTo?: string }, attachments?: Attachment[]) => out.push({ name, as, ...m, attachments });

  // neon1 Reach, Bugs, Feedback: the site's forms
  const contact = { name: "Dana Kim", email: "dana@example.com", company: "Kim Dental", about: "Business workflows and technology, Security awareness and readiness", today: "Orders land in a shared sheet and someone retypes them into the billing system every Friday.", better: "One place for orders that the billing system reads.", timing: "This quarter", found: "LinkedIn", localTime: "Nov 19, 2026, 5:45 PM EST (22:45 UTC), America/New_York", at, zone: "America/New_York" };
  add("neon1-reach-contact", "requests", { subject: contactSubject(contact), ...contactMail(contact), replyTo: contact.email });
  const bug = { ref: "BUG-2KNJ49", where: "Neo chat", what: "The chat box stays open after I press Escape on my phone, and the page behind it scrolls.", email: "dana@example.com", page: "https://neon1.tech/knowledge/", theme: "Sentinel, light", browser: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1", viewport: "390x844", at: at.toISOString() };
  const shots = [{ name: "screenshot-1.png", type: "image/png", size: PNG.length, cid: "shot1@neon1" }];
  add("neon1-bugs", "bugs", { subject: bugSubject(bug), ...bugMail(bug, shots, []), replyTo: bug.email }, [{ name: "screenshot-1.png", type: "image/png", bytes: PNG, cid: "shot1@neon1" }]);
  const fb = { ref: "FDB-G8889Y", kind: "Suggestion", where: "1NEON", what: "The Next step card could say how long the assessment takes.", email: "dana@example.com", page: "https://neon1.tech/1NEON/o/kim-dental/workspace", theme: "Sentinel, dark", browser: bug.browser, viewport: "1440x900", at: at.toISOString() };
  add("neon1-feedback", "feedback", { subject: feedbackSubject(fb), ...feedbackMail(fb), replyTo: fb.email });

  // 1NEON Reach: important free-account actions, to neon1 only
  const free = { orgName: "Kim Dental", trial: true, ref: "NP-0002", by: "Dana Kim", byEmail: "dana@example.com", at, url: "https://dev.neon1.tech/1NEON/o/kim-dental/workspace", operator: true, zone: "America/New_York", settingsUrl: "https://dev.neon1.tech/1NEON/me" };
  const kimDental = { place: "Queens, NY", link: "https://kimdental.example", prospect: { kind: "dental", found: "linkedin" } };
  const details = prospectFacts({ ...kimDental, prospect: { kind: "other", kindOther: "A dental practice", found: "other", foundOther: "LinkedIn" } });
  add("1neon-reach-signup", "reach", noticeEmail({ ...free, action: "prospect.signedup", summary: "Dana Kim (dana@example.com) signed up as Kim Dental (NP-0002), A dental practice, Queens, NY, https://kimdental.example, found via LinkedIn", important: true, button: "Open the account", details }));
  const ask = { who: "Dana Kim", email: "dana@example.com", org: "Kim Dental", ref: "NP-0002", free: true, place: "Queens, NY", link: "https://kimdental.example", url: free.url, at };
  add("1neon-reach-assessment", "reach", requestEmail({ ...ask, kind: "assessment", what: "an assessment", note: "The intake form first, then the billing sheet." }));
  add("1neon-reach-call", "reach", requestEmail({ ...ask, kind: "call", what: "a call", note: "" }));

  // 1NEON Trial: other changes in a free account, and its check-ins
  add("1neon-trial-signin", "trial", noticeEmail({ ...free, action: "member.signedin", summary: "Dana Kim signed in", important: false, details }));
  add("1neon-trial-project", "trial", noticeEmail({ ...free, action: "project.created", summary: "Created KD-1 Billing sheet to system", projectKey: "KD-1", projectUrl: "https://dev.neon1.tech/1NEON/o/kim-dental/projects/KD-1", important: true, operator: false }));
  add("1neon-trial-kept", "trial", noticeEmail({ ...free, action: "prospect.kept", summary: "Kim Dental was kept 30 more days, until 2027-01-18", important: false, operator: false }));
  add("1neon-trial-file", "trial", noticeEmail({ ...free, action: "doc.uploaded", summary: 'KD-1: Uploaded "orders-export.csv"', projectKey: "KD-1", projectUrl: "https://dev.neon1.tech/1NEON/o/kim-dental/projects/KD-1", important: true, operator: false }));
  const kim = { name: "Kim Dental" } as Tenant;
  add("1neon-trial-checkin", "trial", quietEmail(kim, "https://dev.neon1.tech/1NEON/", "nudge", "December 9, 2026", "https://dev.neon1.tech/1NEON/?signup=1", at));
  add("1neon-trial-closing", "trial", quietEmail(kim, "https://dev.neon1.tech/1NEON/", "final", "December 9, 2026", "https://dev.neon1.tech/1NEON/?signup=1", at));

  // 1NEON: client changes, to the people in the organization
  const project = { projectKey: "FLOW-1", projectUrl: "https://dev.neon1.tech/1NEON/o/harborline/projects/FLOW-1" };
  const client = { orgName: "Harborline Outfitters", trial: false, ref: "C-0004", by: "Dana Kim", byEmail: "dana@example.com", at, url: portal, zone: "America/New_York", operator: false, settingsUrl: "https://dev.neon1.tech/1NEON/me" };
  add("1neon-client-comment", "portal", noticeEmail({ ...client, action: "comment.created", summary: 'FLOW-1: Dana Kim commented on "Stock export format"', ...project, important: false }));
  add("1neon-client-update", "portal", noticeEmail({ ...client, action: "project.updated", summary: "FLOW-1: updated the project", ...project, important: false, changes: ["health At risk → On track", "next step Review the export → Send the sample file"] }));
  add("1neon-client-decision", "portal", noticeEmail({ ...client, by: "You", action: "decision.approved", summary: 'FLOW-1: approved A1 "Nightly stock sync" (version 2), signed by Dana Kim', ...project, important: true }));

  // 1NEON Billing: invoices and payments
  add("1neon-billing-invoice", "billing", noticeEmail({ ...client, by: "Pradeep Tathineni", byEmail: "pradeep@neon1.tech", action: "invoice.issued", summary: "FLOW-1: issued INV-0007 for $1,200.00, due Dec 4, 2026", ...project, important: true, button: "See the invoice" }));
  add("1neon-billing-payment", "billing", noticeEmail({ ...client, by: "The payment page (Stripe)", byEmail: undefined, action: "payment.failed", summary: "FLOW-1: the bank payment of $1,200.00 on INV-0007 didn't go through. $1,200.00 is still owed", ...project, important: true, button: "See the invoice" }));

  // neon1 Alerts: neon1's own copy of a client's changes
  add("neon1-alerts-client", "alerts", noticeEmail({ ...client, operator: true, action: "comment.created", summary: 'FLOW-1: Dana Kim commented on "Stock export format"', ...project, important: false }));

  // 1NEON: invitations
  add("1neon-invite", "portal", inviteEmail({ orgName: "Harborline Outfitters", inviter: "Pradeep Tathineni", url: "https://dev.neon1.tech/1NEON/?email=dana%40example.com", at }));

  // 1NEON Security: codes and sign-in method changes
  add("1neon-security-signin-code", "security", signInCodeEmail({ code: "482913", portal: "https://dev.neon1.tech/1NEON/", at }));
  add("1neon-security-email-code", "security", codeEmail({ kind: "email confirmation", title: "Confirm your email", says: "Your 1NEON confirmation code is", lead: "Enter it in 1NEON to confirm this address.", subject: "Confirm your email for 1NEON", code: "305918", portal: "https://dev.neon1.tech/1NEON/", at }));
  add("1neon-security-passkey", "security", passkeyEmail({ url: "https://dev.neon1.tech/1NEON/me", email: "dana@example.com", at }));
  add("1neon-security-factor-removed", "security", factorRemovedEmail({ url: "https://dev.neon1.tech/1NEON/me", what: "Your authenticator app", how: "removed", email: "dana@example.com", at }));
  return out;
}

if (process.argv[1]?.endsWith("mail-samples.ts")) {
  const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
  const all = samples();
  const dir = arg("--out"), to = arg("--send");
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const s of all) { writeFileSync(`${dir}/${s.name}.html`, s.html); writeFileSync(`${dir}/${s.name}.txt`, `From: ${fromHeader(s.as, "notify.neon1.tech", true)}\nSubject: ${s.subject}\n\n${s.text}`); }
    console.log(`${all.length} samples in ${dir}`);
  }
  if (to) {
    if (!neon1Only({ operatorEmails: ["pradeep@neon1.tech"] }, to)) throw new Error("dev mail goes only to neon1's own addresses");
    const mailer = new SesMailer("1NEON <noreply@notify.neon1.tech>", process.env.SES_CONFIG_SET, true);
    for (const s of all) { await mailer.send(to, s.subject, s.text, s.html, s.replyTo, undefined, s.attachments, s.as); console.log("sent", s.name); }
  }
}
