// apps/api/src/handlers/auth-triggers.ts - Cognito triggers. Pre sign-up: only invited, verified
// emails may get an account, including first-time Google sign-ins (which Cognito creates even with
// admin-only sign-up). Custom message: sign-in and verification codes in the neon1 email design.


import type { CustomMessageTriggerEvent, PreSignUpTriggerEvent } from "aws-lambda";
import { codeEmail, signInCodeEmail } from "../emails.ts";
import { DynamoTable } from "../store/dynamo.ts";
import { Repo } from "../store/repo.ts";


// TABLE_NAME is set by Terraform on the trigger function
const repo = new Repo(new DynamoTable(process.env.TABLE_NAME!));
// The sign-in page that codes are entered on (PUBLIC_URL is set by Terraform; dev.neon1.tech in dev)
const PORTAL = `${process.env.PUBLIC_URL ?? "https://neon1.tech"}/1NEON/`;
// Where the dev site's gate takes its emailed link (neon1-aws-infrastructure site-dev)
const GATE = `${process.env.PUBLIC_URL ?? "https://neon1.tech"}/__auth`;


/** One function serves both triggers; Cognito names the trigger in triggerSource */
export async function handler(event: PreSignUpTriggerEvent | CustomMessageTriggerEvent) {
  if (event.triggerSource.startsWith("CustomMessage_")) {
    // The person's own time zone, when 1NEON has one; a lookup that fails never holds back a code
    const mail = String((event as CustomMessageTriggerEvent).request.userAttributes?.email ?? "").toLowerCase();
    const zone = await (async () => (mail ? (await repo.getUser((await repo.userIdForEmail(mail)) ?? ""))?.timeZone : undefined))().catch(() => undefined);
    return message(event as CustomMessageTriggerEvent, new Date(), zone);
  }
  return preSignUp(event as PreSignUpTriggerEvent);
}


// The wording for each kind of code Cognito sends; {####} is where Cognito puts the code. Subjects carry no code:
// Cognito documents the placeholder for the message body only. `says` is the plain sentence that names the code
// ("Your 1NEON reset code is 123456"), which mail apps that offer to copy a code look for
const CODES: Record<string, { subject: string; kind: string; title: string; says: string; lead: string }> = {
  CustomMessage_ForgotPassword: { subject: "Your 1NEON reset code", kind: "reset code", title: "Your reset code", says: "Your 1NEON reset code is", lead: "Enter it to choose a new password." },
  CustomMessage_UpdateUserAttribute: { subject: "Confirm your new email for 1NEON", kind: "email confirmation", title: "Confirm your new email", says: "Your 1NEON confirmation code is", lead: "Enter it in 1NEON to confirm this address." },
  CustomMessage_VerifyUserAttribute: { subject: "Confirm your email for 1NEON", kind: "email confirmation", title: "Confirm your email", says: "Your 1NEON confirmation code is", lead: "Enter it in 1NEON to confirm this address." },
};


/** Custom message: put the code in the 1NEON email design; any other message keeps Cognito's default. Cognito sends
 * the HTML only, from the "1NEON Security" address set in Terraform */
export function message(event: CustomMessageTriggerEvent, at = new Date(), zone?: string) {
  // Sign-in codes share their template with the browser demo
  if ((event.triggerSource as string) === "CustomMessage_Authentication") {
    // A code the dev site's gate asked for links back to the gate, which holds that sign-in; 1NEON doesn't
    const gate = Boolean(process.env.GATE_CLIENT_ID) && event.callerContext?.clientId === process.env.GATE_CLIENT_ID;
    const mail = signInCodeEmail({ code: event.request.codeParameter, portal: gate ? GATE : PORTAL, gate, at, zone });
    event.response.emailSubject = mail.subject;
    event.response.emailMessage = mail.html;
    return event;
  }
  const kind = CODES[event.triggerSource];
  if (!kind) return event;
  const mail = codeEmail({ ...kind, code: event.request.codeParameter, portal: PORTAL, at, zone });
  event.response.emailSubject = mail.subject;
  event.response.emailMessage = mail.html;
  return event;
}


/** Pre sign-up: refuse any first sign-in whose email has no invite */
async function preSignUp(event: PreSignUpTriggerEvent) {
  if (event.triggerSource === "PreSignUp_AdminCreateUser") return event; // our own invite path
  // Self sign-up and federated sign-in are admitted only for an invited email
  const email = String(event.request.userAttributes.email ?? "").toLowerCase();
  if (!email || !(await repo.userIdForEmail(email))) {
    throw new Error("This email hasn't been invited to 1NEON. Ask your organization's admin for an invite.");
  }
  return event;
}
