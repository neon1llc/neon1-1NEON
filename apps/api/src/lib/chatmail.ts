// apps/api/src/lib/chatmail.ts - The two emails chat sends: neon1's alert that someone wrote, and the person's
// notice that a reply is waiting. Both use the shared fact layout (lib/factmail.ts).
import { REPLY_HOURS_TEXT } from "@1neon/domain";
import { factMail, gist, subjectOf } from "./factmail.ts";
import { sentAt } from "../mail.ts";


/** To neon1: someone wrote. The message is in the mail itself, so the inbox link is only needed to answer */
export function chatAlertMail(o: { name: string; email: string; org?: string; free: boolean; body: string; private?: boolean; replyable?: boolean; unread: number; url: string; at: Date; zone?: string }) {
  const first = o.unread <= 1;
  return {
    subject: subjectOf("Chat", o.org ? `${o.name} (${o.org})` : o.name),
    ...factMail({
      kicker: "chat",
      title: o.name,
      sub: o.org,
      intro: [first ? `${o.name} wrote to you in 1NEON.` : `${o.name} wrote to you again. ${o.unread} messages are waiting.`],
      preheader: `${o.name}: ${gist(o.body, 80)}`,
      facts: [
        { k: "From", v: o.email ? `${o.name} <${o.email}>` : o.name },
        ...(o.org ? [{ k: "Organization", v: `${o.org}${o.free ? " (free account)" : ""}` }] : []),
        { k: "Sent", v: sentAt(o.at, o.zone).replace(/^Sent /, "") },
      ],
      blocks: [[o.private ? "Latest message (private to you)" : "Latest message", o.body]],
      action: { label: "Reply in 1NEON", url: o.url },
      why: "Someone wrote in an organization's 1NEON chat. More messages there add to the same alert until you open it.",
      ...(o.replyable ? { reply: "Reply to this email to answer in the chat." } : {}),
    }),
    as: "reach" as const,
  };
}


/** To the person: a reply is waiting. The reply is in the mail so a phone can read it without signing in */
export function chatReplyMail(o: { body: string; url: string; at: Date; zone?: string }) {
  return {
    subject: "Reply from Pradeep at neon1",
    ...factMail({
      kicker: "chat reply",
      title: "Pradeep replied",
      intro: ["He answered in your organization's chat in 1NEON, where everyone in it can see the conversation."],
      preheader: gist(o.body, 90),
      facts: [{ k: "Sent", v: sentAt(o.at, o.zone).replace(/^Sent /, "") }],
      blocks: [["Reply", o.body]],
      action: { label: "Open the conversation", url: o.url },
      why: `You wrote to neon1 in 1NEON chat. I read it ${REPLY_HOURS_TEXT}.`,
    }),
    as: "portal" as const,
  };
}
