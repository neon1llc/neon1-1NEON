// apps/api/src/lib/alert.ts - How mail that only neon1 receives (the contact form, bug and feedback reports, assessment
// and call requests, chat alerts) leaves the API: through neon1's alert service when one is set up, else straight
// out, as before. The service adds a phone push by severity; its title and text never name a client.
import type { Deps } from "./kit.ts";
import type { SenderKind } from "../mail.ts";
import type { Attachment } from "./mime.ts";


/** One alert to neon1: what its email says, who gets it, and how loud it is */
export interface Alert {
  severity: "important" | "info";
  // Words for the phone push: no client or sender names, no message text
  title: string;
  text: string;
  source: string;
  url?: string;
  quiet?: boolean;
  to: string[];
  mail: { subject: string; text: string; html: string; replyTo?: string; as: SenderKind; attachments?: Attachment[]; replyThread?: { kind: "chat"; ref: string } };
  // Without the service, send a push too (chat alerts always did; the others did not)
  directPush?: boolean;
}


// Bytes as base64 for the service's JSON payload
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");


/** Send the alert. A failed email throws, so the caller's retry or error path still runs; a failed push never does */
export async function alertNeon1(d: Pick<Deps, "mailer" | "pusher" | "notifier">, a: Alert, signal?: AbortSignal) {
  if (d.notifier) {
    const r = await d.notifier.notify({
      severity: a.severity, title: a.title, text: a.text, source: a.source, ...(a.url ? { url: a.url } : {}), ...(a.quiet ? { quiet: true } : {}),
      email: {
        to: a.to, subject: a.mail.subject, text: a.mail.text, html: a.mail.html, as: a.mail.as,
        ...(a.mail.replyTo ? { replyTo: a.mail.replyTo } : {}), ...(a.mail.replyThread ? { replyThread: a.mail.replyThread } : {}),
        ...(a.mail.attachments?.length ? { attachments: a.mail.attachments.map((f) => ({ name: f.name, type: f.type, b64: b64(f.bytes), ...(f.cid ? { cid: f.cid } : {}) })) } : {}),
      },
    }, signal);
    if (r.delivered.email === "error" || r.delivered.email.startsWith("skipped:no_allowed")) throw Object.assign(new Error("alert email not sent"), { name: "NotifyError" });
    return;
  }
  for (const to of a.to) await d.mailer.send(to, a.mail.subject, a.mail.text, a.mail.html, a.mail.replyTo, signal, a.mail.attachments, a.mail.as);
  if (a.directPush && d.pusher) await d.pusher.send(a.title, a.text, { url: a.url, quiet: a.quiet, signal });
}
