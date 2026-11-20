// apps/api/src/config.ts - Runtime configuration from the environment (set by Terraform on the
// Lambda function).


/** Everything the API reads from its environment */
export interface Config {
  // Deployment stage, reported by the health check
  env: "local" | "dev" | "prod";
  // AWS resources; unset locally, where the memory table and stand-ins run
  table?: string;
  docsBucket?: string;
  userPoolId?: string;
  clientId?: string;
  authDomain?: string;
  // Origin the browser sees, for OAuth redirects and links in email
  publicUrl: string;
  // Sender for invites, on the verified SES domain
  mailFrom?: string;
  /** Where bug reports go; hello@neon1.tech until a bugs@ alias exists (BUG_TO) */
  bugTo?: string;
  /** Where feedback goes; hello@neon1.tech until a feedback@ alias exists (FEEDBACK_TO) */
  feedbackTo?: string;
  /** The SES configuration set to send under. The sending identity's default is production's, which dev's role may not use, so each environment names its own */
  sesConfigSet?: string;
  /** The toll-free number (its ARN) texts come from; unset means no texts */
  smsFrom?: string;
  /** The E.164 number that owns inbound confirmation replies */
  smsNumber?: string;
  /** SecureString parameter holding the development-only SMS destination allowlist */
  smsAllowlistParameter?: string;
  /** Destinations that may receive texts; undefined means no application allowlist */
  smsAllowedDestinations?: string[];
  /** Emails that get the operator role (Pradeep). Never stored in the database */
  operatorEmails: string[];
  /** Local development only: trust an `x-dev-user` header instead of Cognito */
  devAuth: boolean;
  /** Neo's model on Bedrock (an inference profile ID); unset means Neo is off */
  neoModel?: string;
  /** The month's ceiling for Neo's model spend, in US dollars */
  neoMonthlyUsd?: number;
  /** SSM SecureString names holding the Stripe secret key and webhook secret; unset means no online payments */
  stripeKeyParam?: string;
  stripeWebhookParam?: string;
  /**
   * Whether uploads wait for a GuardDuty malware verdict. True unless MALWARE_SCAN is exactly "off" (or unset on dev),
   * so a missing or mistyped value can only ever keep scanning on
   */
  malwareScan?: boolean;
  /** The Object Lock bucket for locked copies of signed and issued records */
  recordsBucket?: string;
  /** Whether people may sign themselves up as prospects. Only SIGNUP=on opens it; anything else keeps it shut */
  signup?: boolean;
  /** How long an assessment request waits after its last change before it's emailed (routes/requests.ts).
   * Missing means an hour; the in-browser demo sets 0 so it goes at once */
  requestDelayMs?: number;
  /** Cloudflare Turnstile: the public site key the sign-up form shows, and the SSM SecureString holding the secret */
  turnstileSiteKey?: string;
  turnstileSecretParam?: string;
  /** The secret CloudFront adds to every request (x-origin-verify), and whether requests without it are refused */
  originSecret?: string;
  originLock?: boolean;
}


/** Read the environment once at start-up; refuse dev sign-in anywhere on Lambda */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Dev sign-in trusts a header, so it must never reach a deployed function
  const onLambda = Boolean(env.AWS_LAMBDA_FUNCTION_NAME);
  const devAuth = env.DEV_AUTH === "1";
  if (devAuth && onLambda) throw new Error("DEV_AUTH must never be set on Lambda");
  // Scanning is skipped only where Terraform says "off", and never in production
  // dev never has the GuardDuty scanner (infra/envs/dev), so an unset value there means off; anywhere else unset means on
  const scanSetting = env.MALWARE_SCAN?.trim().toLowerCase() ?? (env.APP_ENV === "dev" ? "off" : "on");
  const malwareScan = scanSetting !== "off";
  if (!malwareScan && env.APP_ENV === "prod") throw new Error("MALWARE_SCAN=off is not allowed in prod");
  // A lock with no secret would refuse every request, so say so at start-up instead
  if (env.ORIGIN_LOCK?.trim().toLowerCase() === "on" && !env.ORIGIN_SECRET) throw new Error("ORIGIN_LOCK=on needs ORIGIN_SECRET");
  // Operator emails compare case-insensitively
  return {
    malwareScan,
    env: (env.APP_ENV as Config["env"]) ?? "local",
    table: env.TABLE_NAME,
    docsBucket: env.DOCS_BUCKET,
    userPoolId: env.USER_POOL_ID,
    clientId: env.USER_POOL_CLIENT_ID,
    authDomain: env.AUTH_DOMAIN,
    publicUrl: env.PUBLIC_URL ?? "http://localhost:5173",
    mailFrom: env.MAIL_FROM,
    bugTo: env.BUG_TO?.trim() || undefined,
    feedbackTo: env.FEEDBACK_TO?.trim() || undefined,
    sesConfigSet: env.SES_CONFIGURATION_SET || undefined,
    smsFrom: env.SMS_FROM || undefined,
    smsNumber: env.SMS_NUMBER || undefined,
    smsAllowlistParameter: env.SMS_ALLOWLIST_PARAM || undefined,
    // Development texting must fail closed even if its SSM parameter is accidentally omitted.
    smsAllowedDestinations: env.APP_ENV === "dev" ? [] : undefined,
    operatorEmails: (env.OPERATOR_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    devAuth,
    neoModel: env.NEO_MODEL || undefined,
    // A missing, zero, or nonsense value falls back to $8, never to unlimited
    stripeKeyParam: env.STRIPE_KEY_PARAM || undefined,
    stripeWebhookParam: env.STRIPE_WEBHOOK_PARAM || undefined,
    recordsBucket: env.RECORDS_BUCKET || undefined,
    signup: env.SIGNUP?.trim().toLowerCase() === "on",
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || undefined,
    turnstileSecretParam: env.TURNSTILE_SECRET_PARAM || undefined,
    originSecret: env.ORIGIN_SECRET || undefined,
    originLock: env.ORIGIN_LOCK?.trim().toLowerCase() === "on",
    neoMonthlyUsd: Number(env.NEO_MONTHLY_USD) > 0 ? Math.min(Number(env.NEO_MONTHLY_USD), 50) : 8,
  };
}
