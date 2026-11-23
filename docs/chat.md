# Chat

One shared chat per organization. Every member and neon1's lead write in the same conversation, with their names, so it is also the record of what was said. A free account is an organization of one. Messages are asynchronous: people write any time, and replies come in the reply hours (weekdays 6 to 9 pm, Fridays to 8 pm, weekends 8 am to 8 pm, Eastern), so the page never promises a live answer.

## Where it lives

| Piece | File |
|---|---|
| Rules, limits, reply hours | `packages/domain/src/chat.ts` |
| Routes | `apps/api/src/routes/chat.ts` |
| Storage | `apps/api/src/store/repo.ts` (`getChat`, `chatMessages`, `chatOps`, `chatSeen`, `chatInbox`) |
| Delivery | `apps/api/src/outbox.ts` (`chat-owner`, `chat-members`), `apps/api/src/lib/chatmail.ts` |
| Conversation view | `apps/web/src/components/Talk.tsx` (inside Neo's panel, `apps/web/src/components/Neo.tsx`) |

## Routes

Under `/1NEON/api`. All need a sign-in and the `x-1neon` header.

| Route | Who | Does |
|---|---|---|
| `GET /t/:tid/chat/unread` | a member, or neon1 | How many messages are new to you, without opening the chat. The launcher badge asks this. |
| `GET /t/:tid/chat` | a member, or neon1 | The conversation you may see, how many messages are new to you, and the reply hours. Opening it marks it seen. |
| `POST /t/:tid/chat` | a member who can comment, or neon1 | Sends `{ text }`. A member may add `private: true`; neon1 may add `to` (a member's ID). |
| `PATCH /t/:tid/chat/:mid` | the message's author | Edits it. The earlier text stays on the message. |
| `GET /chat/inbox` | neon1 only | Every organization that wrote, most recent first. |

A member of another organization gets 404. A free account passes the free-account allowlist for `POST` and `PATCH` (`packages/domain/src/prospect.ts`).

## Storage

One partition per organization (`CHAT#<tenant>`): a summary row (`META`, listed in the inbox through `GSI1` partition `CHATBOX`), one row per message (`MSG#<id>`, the ID sorts by time), and one row per member for when they last opened the chat (`SEEN#<user>`). A message and the summary save in one transaction. Nothing is deleted: an edit keeps up to 20 earlier versions on the message, and messages stay until an organization asks for them to be erased, like project data.

## Private messages

The same rows, with a flag. A member's private message has `privateWith` set to themselves, and neon1's private reply has it set to the member it answers. Only that member and neon1 can read it; it is left out of everyone else's list, unread count and summary (a member's summary carries no preview, author or neon1 counts). A private reply emails only that member.

## How it looks, and what it follows

There is no chat page and no menu entry. Chat is a second conversation inside Neo's floating panel, opened from anywhere without leaving the page. The patterns, and what each one is used for:

- **Neo's own widget (the first model).** The panel, launcher, log, message bubbles, composer, sizes, safe areas and phone behavior are Neo's, unchanged. The conversation with Pradeep is the same shell with a different log, so it needs nothing new to learn.
- **Intercom Messenger.** One launcher for everything, with a switch between conversations inside the panel and a count on the launcher for what is new. Replies you have not seen are emailed after a short wait (here, two minutes).
- **Crisp.** A short line under the header for when to expect an answer, instead of a paragraph. The reply hours are one line: "Pradeep is reading now", or when he next is.
- **Help Scout Beacon.** Opens in context and returns you to the page you were on. Alert emails open the organization's page with the panel already open (`?chat=1`).
- **Slack and shared channels (for the shared record).** Everyone in an organization sees one conversation with names; an author can edit their own message and the edit is marked.

Rules for the screen: no explanatory copy (the controls explain themselves), one short hours line, private is a small toggle next to Send, and nothing is added to the menu.

## Sending and drafts

A message saves the moment Send is pressed (Enter sends, Shift Enter adds a line, as in Neo). What is typed and not sent is kept on the device in local storage (`1neon.chat.draft.<organization>`, listed in the cookie notice) and cleared once a send is accepted, so closing the page or locking a phone loses nothing. Earlier versions of an edited message are shown to neon1 only; everyone sees that it was edited. For neon1, the panel's inbox lists every organization that wrote, with new counts; choosing one opens its conversation without leaving the page.

## Alerts

- A member's message emails every operator address (sender "1NEON Reach") with the message in the mail. A burst alerts once, until neon1 opens the chat.
- Where `NOTIFY_FUNCTION` names the neon1-notify service (dev), one call carries the email and a phone push that says only that a client or free account wrote, quiet outside the reply hours. The email's Reply-To is a signed address on reply.neon1.tech: answering the email posts the reply into this chat as Pradeep (the service drops anything not signed, not from an operator, or failing SPF and DKIM; the API takes the post as a direct invoke, `source: "neon1-notify"`). Without the service (production for now), `PUSHOVER_TOKEN_PARAM` and `PUSHOVER_USER_PARAM` push "Chat: organization" the same way, and there is no reply by email.
- A reply from neon1 emails each member it is for who opened the chat more than two minutes ago and has not been emailed since they last looked. The reply is in the mail. Members are not emailed about each other's messages.
- Delivery uses the existing outbox: durable, retried with backoff, one receipt per recipient and channel.

## Protection against abuse

Everything below is counted in the table, so it costs nothing, and none of it applies to neon1's own lead. A refused message adds a strike (the cooldown doesn't); five strikes in an hour mute the person for 24 hours and neon1 is told.

| Rule | What it does |
|---|---|
| Pause | A muted or banned person can read the chat but not write, edit, or report. They are told how long and to email hello@neon1.tech. A mute ends on its own; a ban doesn't. |
| What it says | No letters at all, or one character repeated eight times or more, is refused. A short real message ("hi") is fine. |
| Links | A free account's message may carry one link and is flagged for neon1; two are refused. |
| Same text again | Refused within ten minutes. |
| Cooldown | Two seconds between one person's messages. |
| New accounts | An account under 15 minutes old may send three messages. |
| Per person | The hourly and daily allowances below. |
| Per network address | Twelve messages an hour and forty a day from one address across every account, hashed, so many sign-ups don't multiply a person's allowance. |
| Auto-flag | A message with an obscenity or slur is accepted, flagged for neon1 (told on its own, even inside a burst), and counts as two strikes. |
| Report | A member can report another member's message. neon1 is told with the message, once per reporter. |
| Mute and ban | neon1 can mute a member for a time or ban them from the message, and lift either. The inbox marks organizations with flags. |

## Limits

| | Per hour | Per day |
|---|---|---|
| Free account | 6 | 20 |
| Client | 20 | 100 |

Per person. A message is 1 to 2,000 characters, a free account's may carry one link, and a message can be edited 20 times.

## Not here yet

Attachments, Neo answering first, replying by email in production, and a way for a member to turn the reply emails off.
