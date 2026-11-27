# MATRIS, Inc. (dev fixture)

MATRIS, Inc. is a made-up client on dev that holds every state 1NEON knows, so anyone can sign in and find each feature with believable data in it. It is a regional fiber and tower operator in Meta City, MX, and a returning client: work in 2025, a lapse as a potential, and a full slate of projects now.

- Data: [`apps/api/src/fixtures/matris.ts`](../apps/api/src/fixtures/matris.ts) (`MATRIS_VERSION`)
- Put it on dev, or reset it to the story: `AWS_PROFILE=neon1 npx tsx src/scripts/matris.ts --yes` from `apps/api`. It keeps the organization ID and client number, and touches nothing else.
- Checked by [`apps/api/src/matris.test.ts`](../apps/api/src/matris.test.ts): every signed-in read for every role, and the edge cases below that the API can see.
- Seeding sends no mail. Afterwards dev's own hourly passes may email the people below about overdue decisions and invoices; those addresses all land in neon1llc@gmail.com.

**Every new feature adds its states here**: data in the fixture, a row in the table, and a bump of `MATRIS_VERSION`.

## People

Sign in at `/1NEON/` with "Email me a code". Codes arrive in neon1llc@gmail.com; match the address in the To line.

In neon1llc@gmail.com, the label neon1/MATRIS holds all MATRIS mail: a filter matches `deliveredto:` each address below. Sign-in codes keep the neon1/Codes label and stay in the inbox. When you add a person, add their address to that filter.

| Person | Access | Role in the story | Sign-in |
|---|---|---|---|
| super (Pradeep) | operator | neon1 | neon1llc@gmail.com, pradeep@neon1.tech |
| Jorgeus Hittemi | admin | COO; workflows, every project, Home arrangement, Settings | neon1llc+jhittemi@gmail.com |
| Neil Dojj | admin | NOC lead; chat, Neo and Trin, contact, comments | neon1llc+ndojj@gmail.com |
| Felicity Thise-Dojj | editor, decision maker | Finance; proposals, quotes, approvals, invoices | neon1llc+fthise-dojj@gmail.com |
| Lennon K | editor | Field analyst; everything else | neon1llc+lk@gmail.com |
| Sirus Hill | viewer | Troublemaker; suspended for abuse, asking to come back | neon1llc+shill@gmail.com |
| Cypher Reyes | admin, deactivated | Signed the 2025 agreement, then left | no sign-in |
| Tank Ortiz | viewer, invited | Never accepted | neon1llc+tortiz@gmail.com |

## Coverage

| Area | State | Where |
|---|---|---|
| Organization | Client with place, link, LinkedIn, Mexico City time zone | Settings |
| | Returning client: downgraded to potential, promoted back with the same client ID | Activity, ZION-1, ORA-1 |
| | Kept by super (off the inactivity clock) | Settings, super section |
| Agreement | Signed at 2.3 (2025, by a now-deactivated admin) and at the current edition | Agreement |
| | Case-study and naming choices changed over time | Agreement |
| Board | Listen renamed Discover; custom Security review stage; hidden Parked stage | Workflow, Settings |
| | WIP limits Build 2 (holds 5), Verify 1 | Workflow |
| Ways of working | Steps (NEON) | NEB-1 and every NEON project |
| | Board | MORPH-1, TANK-1 |
| | Timeline | APOC-1 |
| | Page (Workbench) | NOTE-1 (beginning), MOUSE-1 (done) |
| Beginning | Request just in, not assessed, timing in its own words | NEB-1 |
| | Outline half written, assets, constraint, baseline, PII flag | KEY-1 |
| | Draft options neon1 hasn't shared | CONS-1 |
| Middle | Two issued revisions, an edited option, a declined option | SRC-1 |
| | Decision overdue, reminded twice, neon1 told | SRC-1 (Felicity) |
| | Comment threads on options and file requests | SRC-1, MORPH-1 |
| | Quick fix: quote waiting for approval | DOZER-1 |
| | Approved, terms revised (smaller deposit), first decision superseded with a reason | MORPH-1 |
| | Waiting on the client (contract state) | MORPH-1 |
| | Paused, with a draft invoice | CYPH-1 |
| | Tasks in every status, blocked with comments, change request, sign-off, health update | MORPH-1, TANK-1 |
| | Updates: messages to everyone, one answered by email reply | MORPH-1 |
| | neon1 buys: awaiting initials (a decision) and bought with a receipt | MORPH-1 |
| | Late milestones and a passed target date | APOC-1 |
| Observe | Measures past target, one without readings, a failing check, a resolved incident | SENT-1, ORA-1, ZION-1 |
| | Custom stage with an open incident, off track | AUDIT-1 |
| End | Handover delivered, every step done, acceptance waiting | LINK-1 |
| | Closed with signed acceptances, a quotable client quote, and a retro | ZION-1 |
| | In care, with care items and a monthly care call | ORA-1 |
| | Quick fix approved, done, paid by card | PATCH-1 |
| | Ended by notice | IVR-1 |
| | Archived, in a hidden stage | IDEA-1 |
| | In Trash | KEY-2 |
| Billing | Deposit paid (wire, ACH); final with a resolved dispute and a credit | ZION-1, MORPH-1 |
| | Progress invoice with an open dispute, hours billed and unbilled | MORPH-1 |
| | Void invoice and its reissue, paid by check | ZION-1 |
| Files | Organization, project, and layer level; answers a file request; a receipt | Files, SRC-1, KEY-1, SENT-1, MORPH-1 |
| | Needs approval; rejected by the scan; failed size check; still checking | KEY-1, MORPH-1, Files |
| Pages | Organization page; project pages with headings, lists, and checklists | Files, NOTE-1, MOUSE-1, SRC-1 |
| Calendar | Leave, office closure, meeting on a project, monthly care, weekly repeat with an end | Calendar, Coming up |
| Chat | Team conversation, edited message with history, private thread with super | Chat |
| | Links flagged, offensive message reported, automatic pause | Chat (Sirus) |
| Suspension | Account suspended for abuse (third pause in 30 days) | People, Sirus's banner |
| | Recommission request open, an earlier one dismissed | super: Potentials, Suspended |
| Home | Custom layout: hidden cards, moved and resized, wide and phone | Jorgeus |
| | Trimmed layout | Felicity |
| | Default | Neil, Lennon |
| Profiles | Every theme, slim menu, tour new/later/done, links, notification choices, two time zones | each person |
| Neo and Trin | Trin answers from the projects, pages, and files above | Neil |

## Not covered yet

States that need a live action rather than seeded records:

- A whole-organization suspension (MATRIS itself stays active so it can be used).
- An open assessment or call request (those belong to potentials).
- Passkeys, authenticator apps, and text-message sign-in for the MATRIS people.
- A Stripe payment in progress ("clearing").
