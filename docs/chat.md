# Chat

Direct, asynchronous messaging between a signed-in person (a free account or a client) and neon1's lead. People write any time. Replies come in the reply hours (weekdays 6 to 9 pm, Fridays to 8 pm, weekends 8 am to 8 pm, Eastern), so the page never promises a live answer.

## Where it lives

| Piece | File |
|---|---|
| Rules, limits, reply hours | `packages/domain/src/chat.ts` |
| Routes | `apps/api/src/routes/chat.ts` |
| Storage | `apps/api/src/store/repo.ts` (`getChat`, `chatMessages`, `chatOps`, `chatInbox`) |
| Delivery | `apps/api/src/outbox.ts` (`chat-owner`, `chat-user`), `apps/api/src/lib/chatmail.ts` |
| Pages | `apps/web/src/pages/Chat.tsx` |

## Routes

All sit under `/1NEON/api`, need a sign-in and the `x-1neon` header, and are not tied to an organization.

| Route | Who | Does |
|---|---|---|
| `GET /chat` | the person | Their thread and the reply hours. Opening it marks replies seen. |
| `POST /chat` | the person | Sends a message (`{ text }`). |
| `GET /chat/inbox` | neon1 only | Every thread, most recent first. |
| `GET /chat/threads/:uid` | neon1 only | One thread. Opening it marks it seen. |
| `POST /chat/threads/:uid` | neon1 only | Replies. |

Anyone else gets 404 on the neon1 routes. A person can only ever read their own thread: the thread key is the signed-in person's ID, never a parameter.

## Storage

One summary row per person (`CHAT#<uid>` / `META`, in the inbox index `GSI1` partition `CHATBOX` sorted by last message) and one row per message (`MSG#<id>`). A message and its summary save in one transaction. Messages are kept until a person asks for them to be erased, like project data.

## Alerts

- A new message emails every operator address (sender "1NEON Reach") with the message in the mail. A burst of messages alerts once, until neon1 opens the thread.
- With `PUSHOVER_TOKEN_PARAM` and `PUSHOVER_USER_PARAM` set, the same event also pushes "Chat: name" to neon1's phone, without the message, and quietly outside the reply hours. Without them, nothing else changes.
- A reply emails the person unless they opened the thread in the last two minutes, once per burst of replies. The reply is in the mail.
- Delivery uses the existing outbox: durable, retried with backoff, one receipt per recipient and channel.

## Limits

| | Per hour | Per day |
|---|---|---|
| Free account | 6 | 20 |
| Client | 20 | 100 |

A message is 1 to 2,000 characters. A free account's message may carry up to two links. Counters expire after two days.

## Not here yet

Attachments, Neo answering first, and replying by answering the alert email. Each is a separate step; none changes these routes.
