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
