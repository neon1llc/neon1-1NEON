// apps/api/src/mail-policy.test.ts - A message with attachments (a bug report with screenshots) goes out as a raw SES message,
// which AWS authorizes as ses:SendRawEmail, not ses:SendEmail. The API's role once had only the second, so such reports
// waited in the table and never went out, and nothing failed loudly. This holds the role to both, and the sender to the
// raw path for attachments.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");

describe("the API's mail permission", () => {
  it("allows plain and raw sending in the role the API runs as", () => {
    const tf = readFileSync(join(ROOT, "infra/modules/api/main.tf"), "utf8");
    const statement = /statement \{\s*sid\s*=\s*"Mail"[\s\S]*?\n  \}/.exec(tf)?.[0] ?? "";
    expect(statement, "the Mail statement is missing").not.toBe("");
    expect(statement).toMatch(/"ses:SendEmail"/);
    expect(statement).toMatch(/"ses:SendRawEmail"/);
  });

  it("still sends attachments as a raw message (which is why the permission is needed)", () => {
    const src = readFileSync(join(ROOT, "apps/api/src/services.ts"), "utf8");
    expect(src).toMatch(/Content: \{ Raw: \{ Data: data \} \}/);
  });
});
