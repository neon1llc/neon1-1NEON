# Legal copy changes for the corpus copies

Every change below is in this worktree's `apps/web/src/legal/*.md`, `apps/web/src/pages/Proposal.tsx`,
and `apps/web/src/lib/docx.ts`. Wording must match in neon1-corpus. No obligation, right, deadline, number,
or defined term was removed. Each retention schedule now lives in one place: the privacy policy's
"How long I keep it" table. Numbers still stated once: 30 days (free account), 7/14/21 quiet days (check-ins),
35 and 90 days (backups, file copies), seven years (signed records), 3 years (audit), 30 days (delivery records),
90 days (server logs), 14 days (Neo logs), one day (contact counters, unconfirmed sign-ups), two days (sign-up
counters), ten minutes (Neo fingerprints).

## Terms of use

1. Header note: "This update adds free 1NEON accounts, with their limits and conduct rules (section 3). A suspended free account waits for my review instead of being deleted on schedule. Invited clients take on no new obligations."
2. Short version cut from five bullets to three. Removed the bullet on "A signed agreement or proposal governs paid work" (the opening paragraph says it) and the one on keeping sign-in methods and secrets private (section 2 says it). The free-account bullet no longer states 30 days: "A free account isn't an agreement to any work, and it's deleted after a quiet period unless we're working together." The approvals bullet is now "Approvals are recorded with a name and the time, and both of us may rely on them."
3. Section 2, Your account: "Keep your sign-in methods secure and don't share your account." is now "Don't share your account." (the short version and acceptable use already cover secrecy).
4. Section 2, Text messages: "frequency varies." is now "at a frequency that varies."
5. Section 3, Who can sign up: semicolon replaced by a full stop.
6. Section 3, Quiet accounts: the 7/21/30-day schedule is replaced by a pointer to the privacy policy, which holds the schedule. "Keep it adds 30 days, once" and "sign up again any time" stay.
7. Section 3, Suspension: "isn't deleted on the 30-day schedule; it waits" is now "isn't deleted on that schedule. It waits".
8. Section 5: "whenever they like" (second use) is now "at any time".

## Privacy and data policy

1. Header note shortened: adds free accounts, what I collect at sign-up (location, link, and how you found neon1 optional), the Cloudflare Turnstile check, the check-in emails, and deletion after a quiet period, which a suspension pauses for my review.
2. Short version: the retention bullet now reads "Clients' projects and files are deleted when your organization asks, never on a schedule. The table under "How long I keep it" lists everything else." The 30-day figure stays only in the table.
3. Contact form: removed "and is deleted a day after its first count" and removed the correspondence retention clause ("for as long as they're useful for our work together or the law requires. You can ask me to delete them."). Both stay in the table.
4. Neo: removed "deleted after 14 days" and "for ten minutes". Both stay in the table.
5. "Please don't type anything sensitive into Neo." is now "Don't type anything sensitive into Neo."
6. Removed "Please don't put passwords, keys, or other secrets in the portal." from the portal section. The terms (acceptable use) own that rule.
7. Free accounts: "a short check-in after 7 and 14 days and a final notice after 21. If you don't confirm your email within a day of signing up, the unfinished sign-up is removed." is now "the check-ins listed under "How long I keep it"." The 7/14/21 schedule moves into the free-accounts table row. The one-day unconfirmed sign-up rule stays in its own table row.
8. Work on your own systems: "Anything I do copy is deleted when the project ends, unless you ask me to keep it." is now "What I copy follows the retention table below." The table row ("Information copied from your systems for a project") is unchanged.
9. Table, free accounts row: adds "I email a check-in after 7 and 14 quiet days and a final notice after 21." and a full stop in place of a semicolon before "It waits until I've reviewed it."
10. Deleting your data: "within 35 and 90 days" is now "on the schedule above", and "until their seven years end" is now "for their retention period". The numbers stay in the table.
11. Cookies and browser storage: removed the last sentence ("If I ever add optional cookies or storage, such as analytics, I'll ask for your consent first."). The cookie notice carries it.

## Cookie notice

1. Header note reworded: "Scroll positions are now kept per page in a tab's history, and the older per-section record is removed. Matrix or Sentinel and light or dark mode are saved separately and shared with neon1.tech. There is no new tracking." The item tables are unchanged.

## Proposal and signing text (Proposal.tsx, docx.ts)

1. Prices note: removed "Every hour is listed in 1NEON as it's logged." (the service agreement says it). Purchases sentence tightened: "...unless you agree with your initials that neon1 buys them, paid back at cost with the receipt."
2. "Choosing an option..." bullet: removed "which covers payment, ownership, confidentiality, and how either of us can end the work." The service agreement lists what it covers.
3. Semicolons replaced by full stops ("before choosing. Refreshing issues the next revision.").

## Left alone, with suggested cuts for the corpus agent

- Service agreement text (`packages/domain/src/agreement.ts`, edition 2.0). Any wording change needs a new edition and a re-sign by every client, so I did not touch it. Suggested for a future edition: remove "Please" in What you provide, replace the two semicolons in Paying with full stops, and drop the Regulated data and Records sections in favor of the privacy policy's wording.
- The sign-in-time summary in `Project.tsx` (three bullets: scope and price, 15 days and ownership, 14 days' notice) repeats the agreement, but the agreement has no short version, so it stays.
- Terms section 5 and the privacy policy both say an admin can download everything. Keep one, probably the privacy policy.
