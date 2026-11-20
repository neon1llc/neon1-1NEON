# Chat

One shared chat per organization. Every member and neon1's lead write in the same conversation, with their names, so it is also the record of what was said. A free account is an organization of one. Messages are asynchronous: people write any time, and replies come in the reply hours (weekdays 6 to 9 pm, Fridays to 8 pm, weekends 8 am to 8 pm, Eastern), so the page never promises a live answer.

## Where it lives

| Piece | File |
|---|---|
| Rules, limits, reply hours | `packages/domain/src/chat.ts` |
| Routes | `apps/api/src/routes/chat.ts` |
| Storage | `apps/api/src/store/repo.ts` (`getChat`, `chatMessages`, `chatOps`, `chatSeen`, `chatInbox`) |
| Delivery | `apps/api/src/outbox.ts` (`chat-owner`, `chat-members`), `apps/api/src/lib/chatmail.ts` |
| Page | `apps/web/src/pages/Chat.tsx` |

## Routes

Under `/1NEON/api`. All need a sign-in and the `x-1neon` header.

| Route | Who | Does |
|---|---|---|
| `GET /t/:tid/chat` | a member, or neon1 | The conversation you may see, how many messages are new to you, and the reply hours. Opening it marks it seen. |
| `POST /t/:tid/chat` | a member who can comment, or neon1 | Sends `{ text }`. A member may add `private: true`; neon1 may add `to` (a member's ID). |
| `PATCH /t/:tid/chat/:mid` | the message's author | Edits it. The earlier text stays on the message. |
| `GET /chat/inbox` | neon1 only | Every organization that wrote, most recent first. |

A member of another organization gets 404. A free account passes the free-account allowlist for `POST` and `PATCH` (`packages/domain/src/prospect.ts`).

## Storage

One partition per organization (`CHAT#<tenant>`): a summary row (`META`, listed in the inbox through `GSI1` partition `CHATBOX`), one row per message (`MSG#<id>`, the ID sorts by time), and one row per member for when they last opened the chat (`SEEN#<user>`). A message and the summary save in one transaction. Nothing is deleted: an edit keeps up to 20 earlier versions on the message, and messages stay until an organization asks for them to be erased, like project data.

## Private messages

The same rows, with a flag. A member's private message has `privateWith` set to themselves, and neon1's private reply has it set to the member it answers. Only that member and neon1 can read it; it is left out of everyone else's list, unread count and summary (a member's summary carries no preview, author or neon1 counts). A private reply emails only that member.

## Sending and drafts

A message saves the moment Send is pressed. What is typed and not sent is kept on the device in local storage (`1neon.chat.draft.<organization>`, listed in the cookie notice) and cleared once a send is accepted, so closing the page or locking a phone loses nothing. Earlier versions of an edited message are shown to neon1 only; everyone sees that it was edited.

## Alerts

- A member's message emails every operator address (sender "1NEON Reach") with the message in the mail. A burst alerts once, until neon1 opens the chat.
- With `PUSHOVER_TOKEN_PARAM` and `PUSHOVER_USER_PARAM` set, the same event pushes "Chat: organization" to neon1's phone, without the message, quietly outside the reply hours. Without them, nothing else changes.
- A reply from neon1 emails each member it is for who opened the chat more than two minutes ago and has not been emailed since they last looked. The reply is in the mail. Members are not emailed about each other's messages.
- Delivery uses the existing outbox: durable, retried with backoff, one receipt per recipient and channel.

## Limits

| | Per hour | Per day |
|---|---|---|
| Free account | 6 | 20 |
| Client | 20 | 100 |

Per person. A message is 1 to 2,000 characters, a free account's may carry two links, and a message can be edited 20 times.

## Not here yet

Attachments, Neo answering first, replying by answering the alert email, and a way for a member to turn the reply emails off.
