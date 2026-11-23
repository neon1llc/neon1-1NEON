// apps/api/src/dev-sample.ts - Give dev.neon1.tech/1NEON made-up data: empty dev's table and documents,
// then fill them with the same fictional organizations, people, and projects local development uses
// (seed.ts), plus one harmless text file. Nothing is read from production, so dev never holds a real
// client's name, address, document, or payment. Payments in the sample are records only: dev has no
// Stripe keys, so no money can move, and dev-guard.ts keeps mail to neon1's own people.
// Usage (an admin AWS profile, never CI):
//   AWS_PROFILE=neon1 npx tsx apps/api/src/dev-sample.ts [--operator you@neon1.tech] [--yes]


import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DocumentRecord, newId } from "@1neon/domain";
import { seed } from "./seed.ts";
import { DynamoTable } from "./store/dynamo.ts";
import { Repo } from "./store/repo.ts";


// The only target this script will write to; the guard refuses anything that isn't dev
const TO = { table: "1neon-dev", docs: "neon1-1neon-docs-dev" };
if (!TO.table.endsWith("-dev") || !TO.docs.endsWith("-dev")) throw new Error("dev-sample: target must be dev");

// The operator the sample is built around (signs in by email code); defaults to Pradeep's address
const at = process.argv.indexOf("--operator");
const operator = (at > 0 ? process.argv[at + 1] : "pradeep@neon1.tech")?.trim().toLowerCase();
if (!operator?.endsWith("@neon1.tech")) throw new Error("dev-sample: --operator must be a neon1.tech address");

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);


// Say what will happen, and wait for --yes
if (!process.argv.includes("--yes")) {
  console.log(`This empties ${TO.table} and s3://${TO.docs}, then fills them with made-up sample data for ${operator}.`);
  console.log("Production is never touched. Run again with --yes to go ahead.");
  process.exit(0);
}


// 1. Empty dev's table: every row, page by page, deleted in batches of 25 with retries for throttling
let cleared = 0;
let start: Record<string, unknown> | undefined;
do {
  const page = await db.send(new ScanCommand({ TableName: TO.table, ProjectionExpression: "PK, SK", ExclusiveStartKey: start }));
  const keys = (page.Items ?? []).map((r) => ({ DeleteRequest: { Key: { PK: r.PK, SK: r.SK } } }));
  for (let i = 0; i < keys.length; i += 25) {
    let batch: Record<string, typeof keys> = { [TO.table]: keys.slice(i, i + 25) };
    for (let tries = 0; batch[TO.table]?.length; tries++) {
      if (tries > 8) throw new Error("dev-sample: DynamoDB kept throttling");
      const r = await db.send(new BatchWriteCommand({ RequestItems: batch }));
      batch = (r.UnprocessedItems ?? {}) as typeof batch;
      if (batch[TO.table]?.length) await new Promise((ok) => setTimeout(ok, 200 * 2 ** tries));
    }
  }
  cleared += keys.length;
  start = page.LastEvaluatedKey;
} while (start);
console.log(`dev-sample: cleared ${cleared} rows`);

// 2. Empty dev's documents, so no copied file outlives the copied rows
execFileSync("aws", ["s3", "rm", `s3://${TO.docs}`, "--recursive", "--only-show-errors"], { stdio: "inherit" });
console.log("dev-sample: documents cleared");

// 3. The fictional organizations, people (.example addresses), projects, invoices, and payment records
const repo = new Repo(new DynamoTable(TO.table, client));
const { acme, pradeep } = await seed(repo, operator);
console.log("dev-sample: sample organizations, people, and projects written");

// 4. One harmless file on Harborline's intake project, so downloads and the export have something to carry
const intake = (await repo.listProjects(acme.id)).find((p) => p.key === "FLOW-1");
if (intake) {
  const text = "Sample intake form (made up for the dev site).\n\nName: ____\nInsurance: ____\n";
  const ts = new Date().toISOString();
  const d = DocumentRecord.parse({ tenantId: acme.id, projectId: intake.id, id: newId("d"), name: "sample-intake-form.txt", layer: "needs", contentType: "text/plain", size: Buffer.byteLength(text), key: "", scan: "skipped", uploaded: true, state: "ready", version: 1, createdAt: ts, updatedAt: ts, updatedBy: pradeep.id });
  // Same key shape the documents route writes (routes/docs.ts docKey)
  d.key = `t/${d.tenantId}/${d.projectId}/${d.id}/${d.name}`;
  const file = join(mkdtempSync(join(tmpdir(), "dev-sample-")), d.name);
  writeFileSync(file, text);
  execFileSync("aws", ["s3", "cp", file, `s3://${TO.docs}/${d.key}`, "--content-type", "text/plain", "--only-show-errors"], { stdio: "inherit" });
  await repo.saveDoc(d, { create: true });
  console.log("dev-sample: one sample file uploaded");
}
console.log("dev-sample: done. Sign in to dev again with the email code (sessions were cleared).");
