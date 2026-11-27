// apps/api/src/lib/messagemail.ts - The email a project message sends to everyone else on the project, with
// the message in the mail and, where reply-by-email is set up, a Reply-To that posts the answer back.
import { factMail, gist, subjectOf } from "./factmail.ts";
import { sentAt } from "../mail.ts";


/** To one person on the project: who wrote, the words, and how to answer */
export function messageMail(o: { by: string; org: string; projectKey: string; projectName: string; body: string; url: string; replyTo?: string; at: Date; zone?: string }) {
  return {
    subject: subjectOf(o.projectKey, `${o.by} wrote`),
    ...factMail({
      kicker: "project message",
      title: `${o.by} wrote`,
      sub: `${o.projectKey} ${o.projectName}`,
      intro: [`${o.by} wrote to everyone on ${o.projectKey} in 1NEON.`],
      preheader: gist(o.body, 90),
      facts: [{ k: "Organization", v: o.org }, { k: "Sent", v: sentAt(o.at, o.zone).replace(/^Sent /, "") }],
      blocks: [["Message", o.body]],
      action: { label: "Open the project's updates", url: o.url },
      why: "Someone wrote in a project's Updates. You can turn these emails off under Notifications on your profile.",
      ...(o.replyTo ? { reply: "Reply to this email to answer everyone on the project." } : {}),
    }),
    replyTo: o.replyTo,
    as: "portal" as const,
  };
}
