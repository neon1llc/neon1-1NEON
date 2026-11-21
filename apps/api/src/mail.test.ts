// apps/api/src/mail.test.ts - The sender the walkthrough's pretend inbox shows is the one production mail
// really uses, so the two can't drift apart.


import { readFileSync } from "node:fs";
import { PROSPECT_FINAL_DAYS, PROSPECT_GRACE_DAYS, type Tenant } from "@1neon/domain";
import { describe, expect, it } from "vitest";
import { MAIL_FROM, SENDERS } from "./mail.ts";


describe("mail sender", () => {
  it("matches the production sender set in Terraform", () => {
    const tf = readFileSync(new URL("../../../infra/modules/mail/main.tf", import.meta.url), "utf8");
    const prod = readFileSync(new URL("../../../infra/envs/prod/main.tf", import.meta.url), "utf8");
    // The module sends as `<name> <noreply@domain>`; prod's mail domain is notify.neon1.tech
    expect(tf).toContain(`output "from" { value = "${MAIL_FROM.name} <noreply@\${var.domain}>" }`);
    expect(prod).toContain(MAIL_FROM.address.split("@")[1]!);
  });
  it("sends Cognito's codes from the same name as the API's security notices", () => {
    const tf = readFileSync(new URL("../../../infra/modules/mail/main.tf", import.meta.url), "utf8");
    const prod = readFileSync(new URL("../../../infra/envs/prod/main.tf", import.meta.url), "utf8");
    const dev = readFileSync(new URL("../../../infra/envs/dev/main.tf", import.meta.url), "utf8");
    expect(tf).toContain(`output "from_security" { value = "${SENDERS.security.name} <${SENDERS.security.local}@\${var.domain}>" }`);
    // Production keeps its sign-in codes on the main sender until moving them to "1NEON Security" is decided
    expect(prod).toContain("mail_from                      = module.mail.from\n");
    // Dev marks the name and nothing else
    expect(dev).toContain(`security_from = "\\"[DEV] ${SENDERS.security.name}\\" <${SENDERS.security.local}@notify.\${var.domain}>"`);
  });
});


describe("sent-at line", () => {
  it("reads in the given zone with UTC beside it, flips with daylight saving, and defaults to New York", async () => {
    const { sentAt } = await import("./mail.ts");
    expect(sentAt(new Date("2026-01-15T17:00:00Z"), "America/Chicago")).toBe("Sent Jan 15, 2026, 11:00 AM CST (17:00 UTC)");
    expect(sentAt(new Date("2026-07-15T17:00:00Z"), "America/Chicago")).toBe("Sent Jul 15, 2026, 12:00 PM CDT (17:00 UTC)");
    expect(sentAt(new Date("2026-07-15T17:00:00Z"))).toBe("Sent Jul 15, 2026, 1:00 PM EDT (17:00 UTC)");
  });
});


describe("emails take the reader's zone", () => {
  it("notice, invite and security emails all show it in text and HTML", async () => {
    const { noticeEmail, passkeyEmail, inviteEmail } = await import("./emails.ts");
    const at = new Date("2026-07-15T13:25:00Z");
    for (const m of [noticeEmail({ orgName: "Acme", trial: false, by: "Dana", action: "comment.created", summary: "x", url: "https://x", at, zone: "Asia/Tokyo" }), passkeyEmail({ url: "https://x", at, zone: "Asia/Tokyo" })]) {
      expect(m.text).toMatch(/(Sent|When)\s+Jul 15, 2026, 10:25 PM GMT\+9 \(13:25 UTC\)/);
      expect(m.html).toContain("Jul 15, 2026, 10:25 PM GMT+9 (13:25 UTC)");
    }
    expect(inviteEmail({ orgName: "A", inviter: "B", url: "https://x", at }).text).toMatch(/Sent\s+Jul 15, 2026, 9:25 AM EDT \(13:25 UTC\)/);
  });
});


describe("who mail is from", () => {
  it("names what the mail is: 1NEON for the portal, Trial and Reach for free accounts, neon1 Reach, Bugs, and Feedback for the site", async () => {
    const { fromHeader } = await import("./mail.ts");
    const d = "notify.neon1.tech";
    expect(fromHeader("portal", d)).toBe('"1NEON" <noreply@notify.neon1.tech>');
    expect(fromHeader("trial", d)).toBe('"1NEON Trial" <trial@notify.neon1.tech>');
    expect(fromHeader("reach", d)).toBe('"1NEON Reach" <reach@notify.neon1.tech>');
    expect(fromHeader("requests", d)).toBe('"neon1 Reach" <requests@notify.neon1.tech>');
    expect(fromHeader("bugs", d)).toBe('"neon1 Bugs" <bugs@notify.neon1.tech>');
    expect(fromHeader("feedback", d)).toBe('"neon1 Feedback" <feedback@notify.neon1.tech>');
    expect(fromHeader("alerts", d)).toBe('"neon1 Alerts" <alerts@notify.neon1.tech>');
    expect(fromHeader("billing", d)).toBe('"1NEON Billing" <billing@notify.neon1.tech>');
    expect(fromHeader("security", d)).toBe('"1NEON Security" <security@notify.neon1.tech>');
  });
  it("puts [DEV] first in the sender's display name in dev", async () => {
    const { fromHeader } = await import("./mail.ts");
    expect(fromHeader("bugs", "notify.neon1.tech", true)).toBe('"[DEV] neon1 Bugs" <bugs@notify.neon1.tech>');
    expect(fromHeader("portal", "notify.neon1.tech", true)).toBe('"[DEV] 1NEON" <noreply@notify.neon1.tech>');
    expect(fromHeader("reach", "notify.neon1.tech", true)).toBe('"[DEV] 1NEON Reach" <reach@notify.neon1.tech>');
  });
});


describe("notice emails", () => {
  const base = { orgName: "Pradeep Test", trial: true, ref: "NP-0002", by: "Alotta Pickles", byEmail: "a@example.com", at: new Date("2026-11-19T22:45:00Z"), url: "https://x/ws" };

  it("says who did what in a short subject and a plain first sentence, with no placeholders like 'something changed'", async () => {
    const { noticeEmail } = await import("./emails.ts");
    const m = noticeEmail({ ...base, action: "doc.uploaded", summary: 'Uploaded "plan.pdf"', operator: true, important: true });
    expect(m.subject).toBe("File uploaded: Pradeep Test (NP-0002)");
    expect(m.text).toContain('Alotta Pickles uploaded "plan.pdf"');
    expect(m.text).toMatch(/Who\s+Alotta Pickles <a@example.com>/);
    expect(m.text).toMatch(/Organization\s+Pradeep Test \(NP-0002, free account\)/);
    expect(m.html).not.toMatch(/something (important )?changed/);
    expect(m.subject).not.toContain("plan.pdf");
  });

  it("puts the project in its own row and out of the sentence", async () => {
    const { noticeEmail } = await import("./emails.ts");
    const m = noticeEmail({ ...base, trial: false, orgName: "Harborline", action: "task.created", summary: 'FLOW-1: added task "Map the stock export"', projectKey: "FLOW-1", projectUrl: "https://x/p/FLOW-1" });
    expect(m.subject).toBe("Task added: FLOW-1 · Harborline");
    expect(m.text).toMatch(/Project\s+FLOW-1/);
    expect(m.text).toContain('Alotta Pickles added task "Map the stock export"');
    expect(m.html).toContain('href="https://x/p/FLOW-1"');
  });

  it("picks the sender by what the change is: Reach for neon1's important alerts, Trial for other free-account changes, 1NEON for a client's", async () => {
    const { noticeEmail } = await import("./emails.ts");
    expect(noticeEmail({ ...base, action: "prospect.signedup", summary: "x signed up", operator: true, important: true }).as).toBe("reach");
    expect(noticeEmail({ ...base, action: "member.signedin", summary: "x signed in", operator: true, important: false }).as).toBe("trial");
    expect(noticeEmail({ ...base, action: "doc.uploaded", summary: "Uploaded y", operator: false, important: true }).as).toBe("trial");
    expect(noticeEmail({ ...base, trial: false, action: "doc.uploaded", summary: "Uploaded y", operator: false, important: true }).as).toBe("portal");
    // neon1's own copy of a client's change is an alert; an invoice or payment is billing, to the client
    expect(noticeEmail({ ...base, trial: false, action: "doc.uploaded", summary: "Uploaded y", operator: true, important: true }).as).toBe("alerts");
    expect(noticeEmail({ ...base, trial: false, action: "invoice.issued", summary: "issued", operator: false, important: true }).as).toBe("billing");
    expect(noticeEmail({ ...base, trial: false, action: "payment.failed", summary: "failed", operator: false, important: true }).as).toBe("billing");
  });

  it("lets neon1 reply to the person on a Reach alert, and nobody else", async () => {
    const { noticeEmail } = await import("./emails.ts");
    expect(noticeEmail({ ...base, action: "prospect.signedup", summary: "x signed up", operator: true, important: true }).replyTo).toBe("a@example.com");
    expect(noticeEmail({ ...base, action: "doc.uploaded", summary: "Uploaded y", operator: false, important: true }).replyTo).toBeUndefined();
    expect(noticeEmail({ ...base, by: "You", action: "prospect.signedup", summary: "x signed up", operator: true, important: true }).replyTo).toBeUndefined();
  });

  it("escapes what people typed", async () => {
    const { noticeEmail } = await import("./emails.ts");
    const m = noticeEmail({ ...base, orgName: "<b>Org</b>", action: "comment.created", summary: 'FLOW-1: <script>x</script> commented on "y"' });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<b>Org</b>");
  });
});


describe("dev marking", () => {
  it("marks the sender name only, never the subject", async () => {
    const { SesMailer } = await import("./services.ts");
    const sent: { FromEmailAddress: string; Content: { Simple: { Subject: { Data: string } } } }[] = [];
    const mailer = new SesMailer("1NEON <noreply@notify.neon1.tech>", undefined, true) as unknown as { ses: { send: (c: { input: never }) => Promise<void> }; send: InstanceType<typeof SesMailer>["send"] };
    mailer.ses = { send: async (c) => void sent.push(c.input) };
    await mailer.send("pradeep@neon1.tech", "Call requested · Org", "t", "<p>h</p>", undefined, undefined, [], "reach");
    expect(sent[0]!.FromEmailAddress).toBe('"[DEV] 1NEON Reach" <reach@notify.neon1.tech>');
    expect(sent[0]!.Content.Simple.Subject.Data).toBe("Call requested · Org");
  });
});


describe("every email", () => {
  it("has a short subject with no dev tag, one action, a reason for arriving, and the same facts in text and HTML", async () => {
    const { samples } = await import("./scripts/mail-samples.ts");
    const all = samples();
    expect(all.length).toBeGreaterThanOrEqual(22);
    for (const m of all) {
      const at = `${m.name}: ${m.subject}`;
      expect(m.subject.length, at).toBeLessThanOrEqual(90);
      expect(m.subject, at).not.toContain("[DEV]");
      expect(m.subject, at).not.toMatch(/[\r\n]/);
      // Why it arrived, in both versions; a mail app that shows only text still says it
      expect(m.text, at).toContain("Why you got this:");
      expect(m.html, at).toContain('<html lang="en">');
      expect(m.html, at).toMatch(/<title>[^<]+<\/title>/);
      expect(m.html, at).toContain("prefers-color-scheme:dark");
      expect(m.html, at).toContain('name="color-scheme" content="light dark"');
      // The logo is HTML borders that recolor with the text, with the image only for Outlook for Windows
      expect(m.html, at).toContain('class="mk"');
      expect(m.html, at).toMatch(/\[data-ogsc\] \.mk\{border-color/);
      expect(m.html, at).toContain('<!--[if mso]><img src="https://neon1.tech/shared/mail/neon1-mark-mid.png"');
      expect(m.html, at).not.toContain("invert(1)");
      // One primary action: a single button, and its address is in the text too
      const buttons = m.html.match(/class="btn" href="([^"]+)"/g) ?? [];
      expect(buttons.length, at).toBe(1);
      const href = /class="btn" href="([^"]+)"/.exec(m.html)![1]!.replace(/&#38;/g, "&").replace(/&#35;/g, "#").replace(/&#61;/g, "=").replace(/&#37;/g, "%");
      expect(m.text.replace(/\s/g, ""), at).toContain(href.replace(/&#\d+;/g, "").replace(/\s/g, "").slice(0, 20));
      // Nothing to scroll sideways at 320px: no fixed widths wider than a phone
      expect(m.html, at).not.toMatch(/(?<![-\w])width:\s*(?:[4-9]\d\d|\d{4,})px/);
      expect(m.html, at).not.toMatch(/<table[^>]*width="(?:[4-9]\d\d|\d{4,})"/);
      expect(m.html, at).not.toContain("<script");
    }
  });

  it("names its sender by what the email is, one name per kind, so no two kinds share a name", async () => {
    const { samples } = await import("./scripts/mail-samples.ts");
    const { SENDERS } = await import("./mail.ts");
    const used = new Set(samples().map((m) => m.as));
    for (const k of ["requests", "bugs", "feedback", "reach", "trial", "portal", "billing", "security", "alerts"] as const) expect(used.has(k), k).toBe(true);
    expect(new Set(Object.values(SENDERS).map((x) => x.name)).size).toBe(Object.keys(SENDERS).length);
    expect(new Set(Object.values(SENDERS).map((x) => x.local)).size).toBe(Object.keys(SENDERS).length);
  });

  it("keeps what people typed out of subjects and escapes it in the body", async () => {
    const { contactMail, contactSubject } = await import("./lib/contactmail.ts");
    const m = { name: "<i>Dana</i>", email: "d@example.com", company: "A & B", about: "Cloud", today: "<script>alert(1)</script> text", better: "", timing: "", found: "", localTime: "", at: new Date(), zone: "America/New_York" };
    const mail = contactMail(m);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<i>Dana</i>");
    expect(mail.html).toContain("&#60;script&#62;");
    expect(contactSubject(m)).not.toContain("alert");
    expect(contactSubject({ ...m, name: "x".repeat(200) }).length).toBeLessThanOrEqual(80);
  });

  it("stacks the facts table on a narrow phone and uses light text on dark in dark mode", async () => {
    const { factMail } = await import("./lib/factmail.ts");
    const m = factMail({ kicker: "k", title: "t", preheader: "p", facts: [{ k: "Who", v: "a" }], why: "w" });
    expect(m.html).toMatch(/@media \(max-width:480px\)\{[^]*\.k\{display:block/);
    expect(m.html).toMatch(/@media \(prefers-color-scheme:dark\)[^]*\.card\{background:#16241c/);
    // No fact label is below a 12px size, so a phone doesn't shrink it past reading
    const sizes = [...m.html.matchAll(/font:(?:\d{3} )?(\d+)px/g)].map((x) => Number(x[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it("lists a signup's details as facts instead of one long sentence", async () => {
    const { noticeEmail, prospectFacts } = await import("./emails.ts");
    const details = prospectFacts({ place: "Queens, NY", link: "https://kimdental.example", prospect: { kind: "other", kindOther: "A dental practice", found: "other", foundOther: "LinkedIn" } });
    const m = noticeEmail({ orgName: "Kim Dental", trial: true, ref: "NP-0002", by: "Dana Kim", byEmail: "dana@example.com", action: "prospect.signedup", summary: "Dana Kim (dana@example.com) signed up as Kim Dental (NP-0002), A dental practice, Queens, NY", url: "https://x/ws", operator: true, important: true, details });
    expect(m.subject).toBe("Free account created: Kim Dental (NP-0002)");
    expect(m.text).toMatch(/Where\s+Queens, NY/);
    expect(m.text).toMatch(/Link\s+https:\/\/kimdental\.example/);
    expect(m.text).toMatch(/Found neon1 via\s+LinkedIn/);
    expect(m.text).toContain("Dana Kim created a free account.");
    expect(m.text).not.toContain("signed up as");
  });

  it("says what changed when an edit recorded its changes", async () => {
    const { noticeEmail } = await import("./emails.ts");
    const m = noticeEmail({ orgName: "Harborline", trial: false, by: "Dana", action: "project.updated", summary: "FLOW-1: updated the project", url: "https://x", changes: ["health At risk → On track"] });
    expect(m.text).toContain("WHAT CHANGED\nhealth At risk → On track");
  });
});


describe("the free account's final notice", () => {
  it("says what the clock does: a notice after three quiet weeks, deleted nine days later", async () => {
    // The words below are the clock's numbers, so a change to the clock has to change them
    expect(PROSPECT_FINAL_DAYS).toBe(21);
    expect(PROSPECT_GRACE_DAYS).toBe(9);
    const { quietEmail } = await import("./routes/prospects.ts");
    const m = quietEmail({ name: "Kim Dental" } as Tenant, "https://x/1NEON/", "final", "December 9, 2026", "https://x/1NEON/?signup=1");
    expect(m.text).toContain("A final notice comes after three quiet weeks, and the account is deleted nine days later.");
    expect(m.text).not.toContain("close after three quiet weeks");
  });
});
