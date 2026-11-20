// apps/api/src/mail.test.ts - The sender the walkthrough's pretend inbox shows is the one production mail
// really uses, so the two can't drift apart.


import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIL_FROM } from "./mail.ts";


describe("mail sender", () => {
  it("matches the production sender set in Terraform", () => {
    const tf = readFileSync(new URL("../../../infra/modules/mail/main.tf", import.meta.url), "utf8");
    const prod = readFileSync(new URL("../../../infra/envs/prod/main.tf", import.meta.url), "utf8");
    // The module sends as `<name> <noreply@domain>`; prod's mail domain is notify.neon1.tech
    expect(tf).toContain(`output "from" { value = "${MAIL_FROM.name} <noreply@\${var.domain}>" }`);
    expect(prod).toContain(MAIL_FROM.address.split("@")[1]!);
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
      expect(m.text).toMatch(/Sent\s+Jul 15, 2026, 10:25 PM GMT\+9 \(13:25 UTC\)/);
      expect(m.html).toContain("Jul 15, 2026, 10:25 PM GMT+9 (13:25 UTC)");
    }
    expect(inviteEmail({ orgName: "A", inviter: "B", url: "https://x", at }).text).toContain("Sent Jul 15, 2026, 9:25 AM EDT (13:25 UTC)");
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
    expect(m.subject).toBe("File uploaded · Pradeep Test");
    expect(m.text).toContain('Alotta Pickles uploaded "plan.pdf"');
    expect(m.text).toMatch(/Who\s+Alotta Pickles <a@example.com>/);
    expect(m.text).toMatch(/Organization\s+Pradeep Test \(NP-0002, free account\)/);
    expect(m.html).not.toMatch(/something (important )?changed/);
    expect(m.subject).not.toContain("plan.pdf");
  });

  it("puts the project in its own row and out of the sentence", async () => {
    const { noticeEmail } = await import("./emails.ts");
    const m = noticeEmail({ ...base, trial: false, orgName: "Harborline", action: "task.created", summary: 'FLOW-1: added task "Map the stock export"', projectKey: "FLOW-1", projectUrl: "https://x/p/FLOW-1" });
    expect(m.subject).toBe("Task added · FLOW-1 · Harborline");
    expect(m.text).toMatch(/Project\s+FLOW-1/);
    expect(m.text).toContain('Alotta Pickles added task "Map the stock export"');
    expect(m.html).toContain('href="https://x/p/FLOW-1"');
  });

  it("picks the sender by what the change is: Reach for neon1's important alerts, Trial for other free-account changes, 1NEON for a client's", async () => {
    const { noticeEmail } = await import("./emails.ts");
    expect(noticeEmail({ ...base, action: "prospect.signedup", summary: "x signed up", operator: true, important: true }).as).toBe("reach");
    expect(noticeEmail({ ...base, action: "member.signedin", summary: "x signed in", operator: true, important: false }).as).toBe("trial");
    expect(noticeEmail({ ...base, action: "doc.uploaded", summary: "Uploaded y", operator: false, important: true }).as).toBe("trial");
    expect(noticeEmail({ ...base, trial: false, action: "doc.uploaded", summary: "Uploaded y", operator: true, important: true }).as).toBe("portal");
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
