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
    for (const m of [noticeEmail({ orgName: "Acme", by: "Dana", summary: "x", url: "https://x", at, zone: "Asia/Tokyo" }), passkeyEmail({ url: "https://x", at, zone: "Asia/Tokyo" })]) {
      expect(m.text).toContain("Sent Jul 15, 2026, 10:25 PM GMT+9 (13:25 UTC)");
      expect(m.html).toContain("Sent Jul 15, 2026, 10:25 PM GMT+9 (13:25 UTC)");
    }
    expect(inviteEmail({ orgName: "A", inviter: "B", url: "https://x", at }).text).toContain("Sent Jul 15, 2026, 9:25 AM EDT (13:25 UTC)");
  });
});


describe("who mail is from", () => {
  it("names the sending part: 1NEON for the portal, neon1 for the site, neon1 alerts for system mail", async () => {
    const { fromHeader } = await import("./mail.ts");
    const d = "notify.neon1.tech";
    expect(fromHeader("portal", d)).toBe('"1NEON" <noreply@notify.neon1.tech>');
    expect(fromHeader("requests", d)).toBe('"neon1" <requests@notify.neon1.tech>');
    expect(fromHeader("bugs", d)).toBe('"neon1" <bugs@notify.neon1.tech>');
    expect(fromHeader("alerts", d)).toBe('"neon1 alerts" <alerts@notify.neon1.tech>');
  });
  it("puts [DEV] first in the sender's display name in dev", async () => {
    const { fromHeader } = await import("./mail.ts");
    expect(fromHeader("bugs", "notify.neon1.tech", true)).toBe('"[DEV] neon1" <bugs@notify.neon1.tech>');
    expect(fromHeader("portal", "notify.neon1.tech", true)).toBe('"[DEV] 1NEON" <noreply@notify.neon1.tech>');
  });
});
