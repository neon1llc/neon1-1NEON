// apps/api/src/handlers/api.ts - Lambda entry for the API (behind API Gateway HTTP API, routed from
// CloudFront /1NEON/api/*).


import { handle } from "hono/aws-lambda";
import { createApp } from "../app.ts";
import type { Deps } from "../lib/kit.ts";
import { CognitoAuth } from "../auth.ts";
import { loadConfig } from "../config.ts";
import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { AwsTexter, CognitoDirectory, S3Records, S3Storage, SesMailer, TurnstileCheck } from "../services.ts";
import { sweepSignups } from "../routes/signup.ts";
import { finishPurges, sweepQuietProspects } from "../routes/prospects.ts";
import { StripePayments } from "../payments.ts";
import { beforeDeadline, drainOutbox } from "../outbox.ts";
import { sweepFiles } from "../files.ts";
import { sweepBugs } from "../routes/bug.ts";
import { DynamoTable } from "../store/dynamo.ts";
import { Repo } from "../store/repo.ts";
import { bedrockNeo } from "../neo/bedrock.ts";
import { DEFAULT_BUDGET } from "../routes/neo.ts";
import { RealVetting } from "../vetting/real.ts";
import { guardDirectory, guardMailer } from "../dev-guard.ts";


// Built once per cold start and reused across invocations
const cfg = loadConfig();
// Fail at cold start, loudly, rather than on the first request
if (!cfg.table || !cfg.userPoolId || !cfg.clientId || !cfg.authDomain || !cfg.mailFrom || !cfg.docsBucket) {
  throw new Error("Missing configuration: TABLE_NAME, USER_POOL_ID, USER_POOL_CLIENT_ID, AUTH_DOMAIN, MAIL_FROM, DOCS_BUCKET");
}


// Production wiring: DynamoDB, Cognito, SES, and S3 behind the same interfaces tests use
const repo = new Repo(new DynamoTable(cfg.table));
// In dev (made-up sample data) mail reaches neon1 only; see dev-guard.ts
const mailer = guardMailer(cfg, new SesMailer(cfg.mailFrom, cfg.sesConfigSet));
// Texts only once the toll-free number is set up
const texter = cfg.smsFrom ? new AwsTexter(cfg.smsFrom) : undefined;
const storage = new S3Storage(cfg.docsBucket, cfg.malwareScan !== false);

// Stripe's keys stay in SSM (SecureString), read once at cold start; never in the environment or the repo.
// Without both parameters, invoices are still issued and paid by check, Zelle, or wire
async function stripe() {
  if (!cfg.stripeKeyParam || !cfg.stripeWebhookParam) return undefined;
  // A read that fails (say, access not granted yet) leaves online payment off rather than the whole API down
  const r = await new SSMClient({}).send(new GetParametersCommand({ Names: [cfg.stripeKeyParam, cfg.stripeWebhookParam], WithDecryption: true })).catch((e: unknown) => {
    console.error(JSON.stringify({ level: "error", message: "stripe keys unreadable; online payment off", error: String(e) }));
    return undefined;
  });
  if (!r) return undefined;
  const value = (name: string) => r.Parameters?.find((x) => x.Name === name)?.Value;
  const key = value(cfg.stripeKeyParam), hook = value(cfg.stripeWebhookParam);
  // Dev runs on made-up data and must never move real money: it takes Stripe test-mode keys only, and a
  // live key put there by mistake leaves online payment off (and says so) instead of charging anyone
  if (cfg.env === "dev" && key && /^(sk|rk)_live_/.test(key)) {
    console.error(JSON.stringify({ level: "error", message: "dev has a live Stripe key; online payment off. Use test-mode keys on dev" }));
    return undefined;
  }
  // A placeholder value (set by Terraform before the real key is put in) leaves online payment off. A restricted key (rk_) with Checkout Sessions write is all it needs
  return key && /^(sk|rk)_/.test(key) && hook?.startsWith("whsec_") ? new StripePayments(key, hook) : undefined;
}
const payments = await stripe();

// Turnstile's secret for the sign-up form, read once at cold start from SSM. Without it sign-up stays
// shut (signup.ts refuses deployed sign-ups with no bot check), and the rest of the API runs as usual
async function turnstile() {
  if (!cfg.signup || !cfg.turnstileSecretParam) return undefined;
  const r = await new SSMClient({}).send(new GetParametersCommand({ Names: [cfg.turnstileSecretParam], WithDecryption: true })).catch((e: unknown) => {
    console.error(JSON.stringify({ level: "error", message: "turnstile secret unreadable; sign-up shut", error: String(e) }));
    return undefined;
  });
  const secret = r?.Parameters?.[0]?.Value;
  // Tokens must come from our own pages; dev uses Cloudflare's test keys, whose tokens name example.com
  const host = new URL(cfg.publicUrl).hostname;
  return secret && secret !== "unset" ? new TurnstileCheck(secret, secret.startsWith("1x0000") ? [] : [host]) : undefined;
}
const humanCheck = await turnstile();

// Production wiring, shared by the API and the scheduled pass
const deps: Deps = {
  cfg,
  repo,
  directory: guardDirectory(cfg, new CognitoDirectory(cfg.userPoolId)),
  mailer,
  storage,
  texter,
  auth: new CognitoAuth({ userPoolId: cfg.userPoolId, clientId: cfg.clientId, authDomain: cfg.authDomain, publicUrl: cfg.publicUrl }),
  // Messages wait in the outbox for the scheduled worker below, never inside a request
  outbox: "worker",
  // Neo for signed-in people, once a model is configured; capped by the month's budget
  payments,
  // Locked copies of signed approvals, agreements, invoices, and payments
  records: cfg.recordsBucket ? new S3Records(cfg.recordsBucket) : undefined,
  // The bot check on the sign-up form
  humanCheck,
  // The form checks that look outside: mail domains, websites, and places
  vetting: new RealVetting(),
  neo: cfg.neoModel ? { model: bedrockNeo(), modelId: cfg.neoModel, budget: { ...DEFAULT_BUDGET, monthlyUsd: cfg.neoMonthlyUsd ?? DEFAULT_BUDGET.monthlyUsd } } : undefined,
};
const app = createApp(deps);


// API Gateway HTTP API (payload 2.0) events in, responses out
const http = handle(app);


/**
 * One function, two callers: API Gateway requests, and the EventBridge schedule that runs the outbox
 * worker and the file sweep once a minute. A schedule event has source "aws.events"; nothing from the internet reaches
 * this function except through API Gateway, so that shape can't be forged by a visitor
 */
export const handler = async (event: Parameters<typeof http>[0] | { source?: string }, context: Parameters<typeof http>[1]) => {
  if ((event as { source?: string }).source === "aws.events") {
    // One absolute end for the whole pass, from the time Lambda says is left (less room to log and
    // return). The outbox gets up to seven seconds of it and the file sweep the rest
    const left = typeof context?.getRemainingTimeInMillis === "function" ? context.getRemainingTimeInMillis() : 15_000;
    const end = Date.now() + Math.max(0, left - 2_000);
    const result = await drainOutbox({ repo, mailer, texter, cfg }, { deadline: Math.min(end - 2_000, Date.now() + 7_000) });
    // Then files whose scan finished since the last pass become ready (or rejected) without a re-upload
    const files = await beforeDeadline(sweepFiles({ repo, storage }, { deadline: end - 500 }), end).catch((e) => ({ watched: 0, settled: 0, error: (e as Error).name }));
    // Bug reports waiting for their screenshots to scan go out, with the clean ones attached
    const bugs = await beforeDeadline(sweepBugs({ repo, storage, mailer, cfg }, { deadline: end - 400 }), end).catch((e) => ({ held: 0, sent: 0, error: (e as Error).name }));
    // Sign-ups never confirmed lose their sign-in account after a day; quiet prospects get their emails
    // (and, at the end, deletion) once a day. Neither may hold up the next pass
    const signups = await beforeDeadline(sweepSignups({ repo, d: deps }, { deadline: end - 300 }), end).catch((e) => ({ removed: 0, error: (e as Error).name }));
    const quiet = Date.now() < end - 1_000 ? await beforeDeadline(sweepQuietProspects({ repo, d: deps, cfg }), end).catch((e) => ({ error: (e as Error).name })) : undefined;
    // Free-account deletions under way go on every minute until each is done and checked
    const purges = Date.now() < end - 1_000 ? await beforeDeadline(finishPurges({ repo, d: deps, cfg }, { deadline: end - 500 }), end).catch((e) => ({ error: (e as Error).name })) : undefined;
    // One line per pass in CloudWatch's embedded metric format: counts and queue age only, never
    // addresses or bodies. Written to stdout directly, because the JSON log wrapper would hide the
    // metric directive inside its message field
    process.stdout.write(`${JSON.stringify({ ...outboxMetrics(result, cfg.env), files, bugs, signups, quiet, purges })}\n`);
    return { ...result, files, bugs, signups, quiet, purges };
  }
  return http(event as Parameters<typeof http>[0], context);
};


/** A pass's counts as embedded metrics: the oldest message's age and how many gave up this pass.
 *  Labelled with the environment (Env), so production's alarms never see dev's queue */
function outboxMetrics(r: Awaited<ReturnType<typeof drainOutbox>>, env: string) {
  return {
    _aws: { Timestamp: Date.now(), CloudWatchMetrics: [{ Namespace: "1NEON", Dimensions: [["Env"]], Metrics: [{ Name: "OutboxOldestAgeSec", Unit: "Seconds" }, { Name: "OutboxFailed", Unit: "Count" }] }] },
    message: "outbox",
    Env: env,
    OutboxOldestAgeSec: r.oldestAgeSec,
    OutboxFailed: r.failed,
    deferred: r.deferred,
    possibleDuplicates: r.possibleDuplicates,
    processed: r.processed,
    sent: r.sent,
    retrying: r.retrying,
    pending: r.pending,
  };
}
