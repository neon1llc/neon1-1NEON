// apps/api/src/scripts/matris.ts - Put MATRIS, Inc. (fixtures/matris.ts) on dev: wipe its records and files,
// rebuild them, make sure each person can sign in, and upload the file bytes. Dev only; run it again any
// time to reset MATRIS to the story. Keeps its organization ID and client ID across runs.
// Usage (admin AWS profile): AWS_PROFILE=neon1 npx tsx src/scripts/matris.ts [--yes]


import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MATRIS_SLUG, MATRIS_VERSION, PEOPLE, matrisEmail, seedMatris } from "../fixtures/matris.ts";
import { CognitoDirectory } from "../services.ts";
import { DynamoTable } from "../store/dynamo.ts";
import { Repo } from "../store/repo.ts";


// The only targets this script writes to
const TO = { table: "1neon-dev", docs: "neon1-1neon-docs-dev", pool: "us-east-1_esCtB0X3J" };
const OPERATORS = ["pradeep@neon1.tech", "neon1llc@gmail.com"];
if (!TO.table.endsWith("-dev") || !TO.docs.endsWith("-dev")) throw new Error("matris: target must be dev");
if (!process.argv.includes("--yes")) {
  console.log(`MATRIS ${MATRIS_VERSION}: this deletes and rebuilds the MATRIS organization in ${TO.table} and s3://${TO.docs}. Nothing else is touched. Add --yes.`);
  process.exit(0);
}

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
const s3 = new S3Client({ region: "us-east-1" });
const repo = new Repo(new DynamoTable(TO.table));

// Keep the organization's ID and client ID so bookmarks and the client number survive a reset
const was = (await repo.listTenants()).find((t) => t.slug === MATRIS_SLUG);
const tid = was?.id;

if (tid) {
  // Every row that belongs to MATRIS: its partitions, its chat, its slug, and its rows in shared partitions
  const mine = (pk: string, sk: string) => pk === `T#${tid}` || pk.startsWith(`T#${tid}#`) || pk === `CHAT#${tid}` || pk === `SLUG#${MATRIS_SLUG}` ||
    (["RECOMMISSION", "WATCH"].includes(pk) && sk.startsWith(`${tid}#`)) || (pk === "COUNTER" && sk.startsWith(`ABUSE#${tid}#`));
  const doomed: { PK: string; SK: string }[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await db.send(new ScanCommand({ TableName: TO.table, ProjectionExpression: "PK, SK", ExclusiveStartKey: start }));
    for (const i of r.Items ?? []) if (mine(String(i.PK), String(i.SK))) doomed.push({ PK: String(i.PK), SK: String(i.SK) });
    start = r.LastEvaluatedKey;
  } while (start);
  for (let n = 0; n < doomed.length; n += 25) {
    await db.send(new BatchWriteCommand({ RequestItems: { [TO.table]: doomed.slice(n, n + 25).map((Key) => ({ DeleteRequest: { Key } })) } }));
  }
  // And its files
  const objs = await s3.send(new ListObjectsV2Command({ Bucket: TO.docs, Prefix: `t/${tid}/` }));
  if (objs.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: TO.docs, Delete: { Objects: objs.Contents.map((o) => ({ Key: o.Key! })) } }));
  console.log(`reset: ${doomed.length} rows, ${objs.Contents?.length ?? 0} files`);
}

const m = await seedMatris(repo, { operators: OPERATORS, tenantId: tid, clientId: was?.clientId });
for (const f of m.files) await s3.send(new PutObjectCommand({ Bucket: TO.docs, Key: f.key, Body: f.body, ContentType: f.contentType }));

// Sign-in accounts (Cognito sends nothing: SUPPRESS); the former admin stays without one
const dir = new CognitoDirectory(TO.pool);
for (const p of PEOPLE.filter((x) => x.status !== "deactivated")) await dir.ensureUser(matrisEmail(OPERATORS[1]!, p.tag));

console.log(`MATRIS ${MATRIS_VERSION} on dev: ${m.tenant.name} ${m.tenant.clientId} (${m.tenant.id}), ${Object.keys(m.projects).length} projects, ${m.files.length} files`);
for (const p of PEOPLE) console.log(`  ${p.name.padEnd(20)} ${p.access.padEnd(6)} ${p.status.padEnd(11)} ${matrisEmail(OPERATORS[1]!, p.tag)}`);
