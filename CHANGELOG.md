# Changelog

1NEON releases use `v0.MINOR.PATCH` until the first complete release, v1.0.0 (see neon1's [versioning standard](https://neon1.tech/knowledge/standards/versioning/)). Each release is tagged on the commit that shipped it, once it's live.

## Unreleased
- The neon1.tech row shows the site logo's mark in a round border, in the theme's logo green.
- The menu has a new order: your profile ends the Organization group, under Contact neon1, so it shows on the first screen and isn't mistaken for Report a bug. Report a bug and Feedback form their own untitled group under a rule, and neon1.tech sits last, centered with the bottom bar.
- Two edge to edge rules sit exactly on the top bar's bottom edge (under the 1NEON mark) and the bottom bar's top edge (above neon1.tech). The other rules stay inset.
- A group's name (Layers, Organization) sits in the middle of its rule, which parts around it as the menu opens and closes over it as the Mini rail returns.
- The Mini rail and the open menu follow each other row for row as either scrolls; opening or closing starts on the row at the top of the other. The default menu (no rail) always opens at its top.

## v0.19.0 - 2026-11-17
- The menu and the Mini rail no longer show a scroll bar in any theme; the page's own content keeps its bar.
- The Mini rail keeps its place when Settings, Contact neon1, or your profile opens, and after the full menu closes, instead of jumping to the top.
- The Mini rail answers a tap while the page is still coasting from a swipe.
- Every row of the Mini rail has the same 40px width with equal space either side of its icon, so the highlight on Home, the 1NEON mark, neon1.tech, and your profile sits evenly. The rail is 4px wider on a computer and 5px wider on a phone to make the room.
- Files has three placement levels. Organization level is the catch-all and shows no layer to pick. Choosing a project adds "in" and its layers, with Project level at the top for files that belong to the project as a whole. Files lists the levels as filters, shows where each file sits, and a project's overview lists its project level files. **Move** on a file re-files it between levels, to another project, or to another layer, later; the file's bytes are never touched, and a file answering a request stays with its project. Existing files keep their placement, and older organization files simply stop showing a layer, so nothing is changed or deleted.
- Insights puts the same gap above "How these are counted" as between the charts.
- Each section of the app (Settings, Contact, Documents, one project, and so on) keeps the scroll position you left it at. Moving from a scrolled Settings to Contact opens Contact at its top the first time, and returning to Settings puts you back where you were. This lasts for the tab, survives a reload, and is cleared on sign-out; a link to a spot on a page (#item-...) still goes to that spot. Works on desktop, phones, and iPhone, where the page body is what scrolls.
- Sign-in and create account in the dark theme no longer show the rain's grid, text, and pause buttons, which met the report and feedback links in the corner. The rain still follows the choice made on the landing page.
- "Feedback" sits beside "report a bug" everywhere it appears: the corner of sign-in and create account reads "report bug \ feedback" ("report" a plain muted word leading both, a bug before "bug", a speech bubble before "feedback"), the menu has a Feedback row under Report a bug, and the profile and Settings have a Feedback button beside Report a bug. Each opens neon1.tech's feedback page in a new tab.
- A feedback route takes comments, complaints, concerns, and suggestions from that page: a kind, where it is about, what they wrote, and an optional email, with the report form's gates. It mails feedback@neon1.tech with a reference (FDB-) and no screenshots.
- The report-a-bug and feedback forms have more gates. The site's policy loads nothing from outside neon1.tech, so a hosted bot check is not used there; instead the page asks for a one-time challenge when it opens (`GET /form-gate/:form`), solves a small proof of work in the background, and sends the answer with the form. The server refuses a send with no challenge, a made-up, wrong, stale, reused, or other form's one, or one answered faster than a person fills a form. Both routes also take JSON only, cap the body at 16 KB, accept a post only from neon1's own origin when the browser names one, drop control and direction-override characters from what was typed, and keep the page, theme, and window fields to the shapes a browser sends (the page only if it is a neon1.tech address).

## v0.18.0 - 2026-11-16

- Sign-in and create account carry "report a bug" in the page's bottom right corner, centered on Neo's button with its right edge on the theme switch's, as on neon1.tech's footer, and no longer in the links inside the form. In the dark theme the rain controls sit one row above it. The bug mark's gap to the text is the arrow's gap to the text, everywhere.
- Neo's 1NEON guide takes in the corpus's new hours (Monday to Thursday 6pm to 9pm, Friday 6pm to 8pm, weekends 8am to 8pm, Eastern) and "a few clients at a time", and the Engagement links, read from neon1-corpus v0.48.0.
- The interactive demo's landing has the sign-in's top bar (the neon1 logo on the left, the theme switch on the right) and opens in the awake or matrix theme you chose on neon1.tech. Neo sits at the bottom left there, and at the bottom right once you pick a person.
- The report form's "Where" list includes "1NEON live walkthrough".
- **Report a bug** in the menu, on your profile, in Settings, and under the sign-in links, in the demo too. It opens the site's report page in a new tab, on dev from dev and on production from production, and each takes its neighbours' look.
- Dropdowns show their focus border from the moment they are pressed or opened until focus leaves, and show the hand pointer over the whole box. The arrow uses the same heavier stroke as the neon1 site. Neo's links that leave the app open in a new tab with the northeast arrow. Dropdowns carry a brand-colour rule under their placeholder, and open folds under their header. Report a bug's mark is centred on the line and the outbound arrow is drawn exactly like the site's.
- The profile, Settings, and Contact show two columns on a wide window and one below about 760 px.
- On the profile, a changed theme or menu style says "Showing this now. Press Save to keep it.", the menu style previews at once, and leaving without saving puts both back.
- Links from 1NEON to the site are paths, never the production address, and a test fails the build on a new hardcoded one.
- The API names its SES configuration set when it sends mail (`SES_CONFIGURATION_SET`, set by Terraform to each environment's own). The sending identity's default set is production's, which dev's role may not use, so mail sent from dev was refused.
- Email shows times in the reader's own zone with UTC beside it, such as "Nov 15, 2026, 8:25 AM EST (13:25 UTC)". The zone is an IANA name from the browser, so daylight saving and leap days follow the calendar; the abbreviation flips between EST and EDT on its own. The contact form's mail to neon1 reads in New York time and shows the sender's local time. Anyone without a saved zone reads in New York time.
- Email now says who it is from by what sends it: "1NEON" only for the portal, "neon1" for the website (contact form, use-case requests, bug reports, from `requests@` and `bugs@` on notify.neon1.tech), and "neon1 alerts" kept for system mail. In dev the sender and the subject both start with "[DEV] " (replacing "1NEON dev"). Subjects carry one short tag and don't repeat the sender: `[request] Workflows · Dana`, `[bug] BUG-ABC123 · Neo chat · …`. Bug reports go to bugs@neon1.tech (set as `BUG_TO` in both environments; the API falls back to hello@ when it is unset).
- The profile has a Time zone setting; the browser's zone is saved at the first sign-in.

## v0.17.1 - 2026-11-16

- Switching the public screens to the dark theme, the bar's logo and Neo's button ease up smoothly to full brightness once instead of flickering, as on neon1.tech; the 1NEON mark and the other green parts keep their flicker.
- Dark theme: text is off-white with green kept for headings and links, links are underlined in running text, and fields and focus rings are easier to see.
- Dark theme: dropdowns, menus, and other controls now follow the dark theme.
- The site's report-a-bug form has a backend: `POST /1NEON/api/bug` mails hello@ with a reference id, and `POST /1NEON/api/bug/:ref/image` takes up to three PNG or JPEG screenshots (3 MB each, checked by their first bytes). Screenshots are kept under `t/_bugs/<reference>/` in the private, malware-scanned documents bucket and are never deleted. The report email reads like a tracker's issue (a left-aligned table of reference, where, time, reporter, page, theme, browser, and window, then what happened), with the screenshots shown inline and attached once the scan passes: a report with screenshots goes out within a minute or so of the scan, at most 15 minutes after it was made, with any screenshot that didn't scan clean named instead of attached. The form has the contact form's hidden field and hourly and daily limits.

## v0.17.0 - 2026-11-16

### Added
- New walkthrough, **From free account to client** (`/1NEON/live?play=free`): a made-up florist starts a free account, writes down a project, keeps the account 30 more days, and asks for an assessment; Pradeep reads the request, asks a question in her project, and promotes the account to a client from Potentials. The FAQs link it.
- Every walkthrough's sign-in now reads exactly as the real one: the site's awake or matrix theme, "New here? Start for free.", **Start for free** opening the real create-account form, and "Try it yourself · Or see how it works" under the panel.
- The walkthrough's pretend mail window names whose inbox it is, not always Maria's.

### Changed
- The privacy and data policy and the terms read from neon1-corpus v0.47.1: a suspended free account waits for review instead of being deleted, and Keep it adds 30 days. Neo's guide reads from the same release.
- Create account says what a free account holds before anything is typed, on one quiet line under the heading: up to 3 projects, kept 30 days after the last change. The numbers come from the same limits the API enforces.
- Create account's note under the optional fields ends "You can add these later." It stays on one line on a wide screen; narrower, that whole sentence moves to the next line rather than breaking mid-sentence.
- "How free accounts work" under Create account does the same: on a phone it moves to its own line whole instead of splitting.
- Sign-in and create account both end with "Try it yourself · Or see how it works": the demo and the guided walkthrough, side by side.
- Create account on a phone shows a faint horizontal line between the needed fields and the optional ones, the same line the wide layout runs between its two columns.
- In the light theme, "I agree to the terms of use" reads in the page's text color with the link in the brand green; the link had been pale green on white.
- **Keep it 30 more days** adds 30 days to the date already shown, so pressing it early no longer gives fewer days. It's still offered once.
- Deleting a free account happens in two steps. Its people are shut out at once; everything else goes a few minutes later, once any request or upload link already under way has run out. Pressing Delete says so, and Potentials shows "Being deleted" until it's done.
- Suspended free accounts are never deleted by the 30-day clock. Potentials lists them first, with how long each has been suspended, until neon1 resumes or deletes them.
- Potentials counts files (and their size) the way the file limit does, trashed projects included, and shows the date a quiet account would be deleted.

### Fixed
- A deletion keeps a record of everything it has to remove until every step is checked, so a pass cut short resumes from that record instead of from whatever rows are left.
- A quiet account's deletion checks every condition again on a fresh read (a hold, a suspension, a keep, or a change since the daily pass), and a change that lands while requests drain cancels it.
- Free-account limits (projects, items per project, files) hold under simultaneous requests: only one of several creates racing for the last place lands, and the others are asked to try again.
- On a phone, opening Neo or tapping its box no longer moves the page behind it.

## v0.16.3 - 2026-11-16

- On the sign-in and create-account screens, the space from the policies to "Or see how it works" now matches the space below it, with the line between them halfway.

## v0.16.2 - 2026-11-16

- The sign-in's Continue button takes the neon flicker with the other green parts when the theme changes.

## v0.16.1 - 2026-11-16

### Security
- The origin lock is on in production. neon1.tech sends the API's secret header, so requests to the API's own AWS address are refused.

## v0.16.0 - 2026-11-16

### Added
- A free account's Home shows the date it's kept until, with **Keep it 30 more days** (once) and **Download a copy**.
- Sign-in and the public pages (FAQs, Cookies, Privacy, Terms, agreement) follow neon1.tech's light or dark look, with the site's bar and a sun/moon switch, and move between each other with one short cross-fade.

### Changed
- Sign-up takes one name, a website as typed (never visited by the server), any US town, and places outside the US.
- Sign-in reads "Sign in to your 1NEON account. New here? Start for free." The FAQ says how to start a free account.
- Phone: the Menu tab always sits at the far right of the bottom bar.
- Legal pages and Neo's guide from neon1-corpus v0.46.2.

### Fixed
- Deleting a free account reaches its trashed projects and their files, stops without deleting anything else if a file or sign-in can't be removed, and finishes on the next daily pass. Each deletion leaves a receipt with no content.
- A free account being deleted can't be promoted, and a promotion or change that lands first stops the deletion.
- A free account's file limit counts files in trashed projects.
- A reminder the mail service refuses doesn't move the deletion clock; it's sent again the next day.

### Security
- The API can refuse requests that skip CloudFront (a secret header, off in production for now), and visitor addresses come from CloudFront's own header instead of one a caller could write.

## v0.15.1 - 2026-11-16

### Changed
- Sign-up: the organization's name is optional for **Something else**. Without one, the account is named for the person.
- Opening 1NEON from neon1.tech is one smooth fade.
- Legal pages and Neo's guide from neon1-corpus v0.46.1.

## v0.15.0 - 2026-11-15

### Added
- **Next step** on a free account's Home: ask neon1 for an assessment or a call, with an optional note.
- **Contact neon1** in the menu for every account: email, call or text, a booked call, and hours.
- "How did you find neon1?" on sign-up and the site's contact form, shown on Potentials.
- **Motion** on the profile: **Smooth** or **Reduced**, kept in this browser.

### Changed
- Sign-up asks "Which describes you best?" in place of "Organization / Area"; individuals give no organization name. Website and city are optional, with city and state as separate fields.
- Stronger form checks on sign-up, the contact form, Settings, and invites: a real mail domain that isn't a temporary mailbox, a first and last name, a website that answers, a real city in its state, minimum lengths, and no junk. Each problem shows under its own field.
- Required fields carry a green asterisk instead of "optional" labels.
- Smooth motion on one timing shared with neon1.tech: dialogs, menus, messages, folds, and sign-in steps ease in. Reduced motion turns it all off.
- Dropdowns have more room for their arrow; in Chrome and Edge, neon1's arrow turns toward where the list opens.
- Sign-in code emails start with "Your 1NEON sign-in code is …", so mail apps can offer one-tap copy.
- Sign-up fits on a wide screen in two columns, opens without a blink, and its wording says what the portal does.
- The contact route takes neon1.tech's new topics.
- Each production release also brings dev up to date.
- Legal pages and Neo's guide from neon1-corpus v0.46.0.

## v0.14.0 - 2026-11-15

### Added
- **Free-account sign-up opens in production** with the real Cloudflare Turnstile keys (`signup = true`).
- Sign-up asks where the business can be seen: its website or a public page (Google, Yelp, LinkedIn), or the city and state it's based in. One is required. Potentials shows them, any admin can change them in Settings without confirming it's them, and Home asks an organization's own admins for them until one is added (clients invited before this included). The demo's and live playback's sample organizations have places.
- The sign-up form links the Knowledge Center's "Free 1NEON accounts" guide.
- Each release's changelog entry is published as its GitHub release.

### Changed
- Sign-up and the new account's welcome line invite people to write down what their project needs, without advertising file uploads (still allowed within the limits).
- The operator page for prospects is now called Potentials. On a phone its four actions sit two by two, and "Promote to client" is now "Promote".
- The sign-up route's own throttle (1 a second, burst 5) is back, now that the deploy role may set up API log delivery (neon1-aws-infrastructure).
- Cut wording that repeats a table, list, or linked page.
- Legal pages and Neo's 1NEON guide come from neon1-corpus v0.45.0 (terms 1.5 and privacy 3.2, with free accounts and the website-or-place field).

### Fixed
- Production's outbox alarms no longer go off for dev. Both environments sent their outbox numbers to the same CloudWatch metric, so dev's stuck test emails set off the production alarms three times on 2026-11-15. The numbers now carry an `Env` label, and the production alarms watch `Env=prod` only.
- Notifications to @neon1.tech addresses (the operators) are allowed to send. SES refused them because it also checks the recipient's identity when it's verified in the account, and the API's role only covered notify.neon1.tech.

## v0.13.0 - 2026-11-15

### Added
- **Sign-up for prospects.** Visitors can make their own 1NEON account from the site and add their projects' needs and files before any call. The emailed code proves the address before anything is saved. A new account is a limited prospect: at most 3 projects, 50 items in a project, and 10 files (documents and pictures only, 10 MB each, 50 MB in all, malware scanned), and no inviting, signing, approvals, proposals, billing, Neo, or texts. neon1 joins each prospect's organization, so Pradeep hears about every sign-up, project, and file.
- Sign-up guards: an invisible Cloudflare Turnstile check, a hidden field, a minimum fill time, limits per address, per email, and per day, an API Gateway throttle on the sign-up route, and a switch that pauses sign-up. Unconfirmed sign-ups lose their sign-in account after a day. Sign-up stays off in production (`signup = false`) until the real Turnstile keys are in.
- Prospects page for neon1: who signed up, when, last change, projects, and files, with Promote to client (the next N1 client ID, limits lifted), Keep, Suspend, Resume, and Delete.
- Quiet prospects: kind check-ins after 7 and 14 days without a change, a final notice at 21 days, and deletion of the organization and its files on day 30, unless neon1 keeps it. Any real change restarts the clock. Clients are never deleted.
- Change limits for everyone (300 an hour, 2,000 a day per person; prospects 60 and 300), so no one account can run away with the portal.

### Fixed
- On an iPhone, the walkthrough's view of the portal drew its top bar partway down the page, over the cards, with an empty band above the page title. The bar now sits right under the walkthrough's narration, as it does elsewhere. The interactive demo (/1NEON/demo) had the same gap under its notice bar, now gone too. The walkthrough check now fails if the bar drifts from under the narration.
- The first chapter of a walkthrough says "Sign in to Home" instead of "Sign in", since it shows Home too.
- On a phone, a walkthrough scrolls a row that runs past the screen's edge (a project's tabs) to bring what Maria taps next into view, instead of her cursor drifting off screen to reach Execute.

### Changed
- **The demo's payment page looks like a real checkout.** Pay in the demo and the walkthroughs opens a stand-in laid out like a hosted payment page: who's paid and how much, the email, card details (with a one-tap test card) or a bank and an account, then Pay, a moment of processing, and a receipt with the way back. It still says it's a demo, and no money moves. The walkthroughs pay the deposit and the final invoice through it.
- Password managers recognize the sign-in's email field, so they offer the saved email and passkeys.
- **Remember me keeps the email filled in.** Ticked, the email you signed in with is saved on this device (`1neon.email`, listed in the cookie and storage notice) and filled in next time; unticked, it's cleared.
- Shorter, plainer wording in the README, docs, errors, emails, and walkthrough captions.
- The terms (1.4), the privacy and data policy (3.1), and the cookie and storage notice come from neon1-corpus v0.44.0.
- The sign-up route's own API throttle is left out for now (the deploy role can't change the API stage yet). Sign-up stays closed on prod, and the app's own limits still apply.

## v0.12.0 - 2026-11-15

### Changed
- **The privacy and data policy, the cookie and storage notice, and the terms come from neon1-corpus.** `node scripts/legal.mjs <ref>` copies them at a pinned corpus ref, so /1NEON/privacy, /1NEON/cookies, and /1NEON/terms match the Knowledge Center word for word. The privacy page becomes the privacy and data policy (edition 3.0): the contact form, Stripe payments, upload scanning, signatures, log periods, a retention table, the test environment on generated data only, downloads, deletion, client systems, and incidents. The terms catch up with the corpus (Download everything, the business address).
- **Contact form counters expire.** The per-sender hourly and daily counters behind the neon1.tech contact form's limits now expire a day after their first count (DynamoDB TTL), instead of staying in the table.
- **Dev runs on made-up data, never a copy of production's.** `apps/api/src/dev-sample.ts` empties dev and fills it with fictional organizations, people, projects, invoices, payment records, and one harmless file; the production-to-dev copy (`scripts/dev-data.mjs`) is gone. Dev still admits and mails only neon1's own people. For payments, dev takes Stripe test-mode keys only, so checkout, bank transfers, and webhooks can be tried end to end with test numbers; a live key on dev turns online payment off.
- **The board says what's open and what's finished.** A closed project shows "Closed" and the day it closed instead of its last health, so finished work never reads "On track". All clients counts each organization's projects as open and closed (it used to call every one "active"), and its introduction says it shows open and closed projects, archived ones left out. The project list and a project's page do the same.
- Cards and the project list say time in a stage in words ("4 days in Build", "new today"), not "4d".

### Fixed
- An invoice that asks for exactly what an issued deposit or final invoice already asks for (a double click, or a second request) can't be issued; the draft says which invoice already covers it.
- A credit can't be more than what's left on the invoice it reduces, alone or added to other credits, so a refund never exceeds what was invoiced. The closing refund credits the invoice with the most room and says if more is owed back on another.
- Two approvals sent at the same moment from two tabs no longer make two decisions (and two deposits): one is recorded and the other is told. The same holds for two hand-recorded payments on one invoice, which could together have come to more than was owed.
- **Download everything** is marked partial, with the reason, when a file arrives shorter or longer than 1NEON's record of it, or when a project is added, edited, or moved to Trash while the export runs. It used to call such an export complete.
- Two exports running at once in two tabs no longer delete each other's files: each builds in its own folder, and the leftovers of an export whose tab closed mid-way are cleared later without touching one still running.

### Tests
- Twelve commercial scenarios each have tests: revised terms keeping the signed ones, deposit share changes, duplicate drafts, late, failed, and pending bank transfers, cancellation after a deposit, refunds, a changed decision, two tabs at once, a client leaving, and Quick fix. Edited Word copies are tested to only suggest changes for neon1 to check, to never change signed terms, and to list what they couldn't match.

## v0.11.0 - 2026-11-14

### Added
- **A deposit share per option.** An option says how much is asked up front: the usual 50%, or what the client agreed (20%, or nothing). The proposal, the approval, and every deposit invoice follow it, including a second deposit draft made while the first is still a draft.
- **Revise terms after approval.** neon1 drafts revised terms from the approved option; the card says what changes ("Deposit up front: 30%, was 20%"), they go out in the next revision, and the client approves them in place of the original. Money already invoiced counts toward them, so only the difference is drafted.
- **Edited proposal copies.** A Word file carrying a proposal's ID (edited in Word, Google Docs, or Pages) is asked about on upload. Kept with that revision, it shows what changed word by word, maps each change to the option field it belongs to (deposit share, title, description, timeline, hours, result), and applies the checked ones, to a shared option directly or to revised terms for an approved one. Changes that fit no field are listed to answer by hand.
- **Option history.** Each option shows when it was added, issued in each revision, approved and signed (with the signed name and reason), replaced, revised, invoiced, and paid.
- **Pay from 1NEON.** The Pay button shows in neon1's own organization too, and neon1 can copy a client's pay link to send.
- Copies of what you sign (approvals, changes, the agreement, handovers) reach you by email and in the bell; billing in neon1's own organization reaches neon1.
- **Quick fix, for small jobs.** A project template for a fix of a few hours: neon1 sends one quote (a fixed price, or hours at a rate never billed past the most hours quoted) with **Quote and issue**, the client sees **Approve the quote** and signs once with nothing up front, then accepts one step, "Fixed and shown working", and neon1 prepares the one invoice. A first-time client signs the service agreement in the same dialog, as its own record. The card moves to Build on approval and to Hand over on acceptance, and notices say "Quote". Records, signatures, and invoices are kept like any project's.
- **A complete export.** Download everything now also holds projects in Trash, every comment, and the activity history, plus manifest.json listing every file with its size and SHA-256 checksum. The zip's name ends in -complete or -partial, README.txt's first line says which, and Settings lists anything missing with the reason. In Chrome, Edge, and Firefox the zip is built on disk as it goes, so a large export doesn't fill memory; elsewhere, an export over 1.5 GB asks first.
- Moving a project back to Decide or before once an option is approved asks for a reason, and Next step says when the board is behind what's been done ("An option is approved: move to Build").

### Changed
- Dev can hold a copy of production's data: `node scripts/dev-data.mjs --yes` (admin profile) replaces dev's table and documents with production's, leaving out queued messages, sessions, and sign-in links. Because that copy holds real clients, dev now admits only neon1's own people, sends mail only to them, and creates no dev accounts for anyone else.
- One way in for newcomers: the sign-in page offers "New here? See how it works", the guided walkthrough, and the sample project and demo are offered from it.
- The bakery's proposal says Instagram messages stay manual for now because automating them costs more than it saves for about six orders a night, not that they can't be read.
- Pay says it opens Stripe's hosted payment page.
- Proposals, previews, invoices, and documents open in a new tab.
- The export's decisions.csv says each decision's deposit share.
- Money boxes show a $ sign, the deposit box a % sign; new invoice lines come filled in from the approved option and can be changed or added to, with a running total.
- Forms and dialogs have even spacing between fields and buttons; date boxes keep their width on phones.
- On phones, the box being typed in, and the line being typed in a long one, stays above the keyboard as it wraps; scrolling away to read is left alone until the next keystroke. Dialogs stay in the part of the screen that's showing, and a panel's name and Close stay at its top.
- A typed signature has to read as the signer's name.

### Fixed
- On dev, where files aren't scanned, uploads are ready right away (marked "not scanned (test site)") instead of waiting on a scan that never runs. Anywhere scanning is on, a scan that hasn't finished after 30 minutes now fails the upload, where it used to wait six hours.
- On iPhone browsers (DuckDuckGo included), the strips above the top bar and below the tab bar are solid, so nothing scrolls by under the browser's own bars.
- An option panel no longer runs under the browser's top bar, out of reach of its Close button.
- **Check invoices** under Next step goes to the invoices again when pressed a second time.
- A new deposit draft no longer replaces a typed amount with the 50% suggestion.
- In the walkthrough, the deposit is due in 15 days, as on every invoice.
- A one-step handover no longer says "all 1 steps".

## v0.10.0 - 2026-11-13

### Added
- **Download everything.** An organization's admins can download a copy of all of it from Settings, any time, without asking neon1: one zip with every project's records, decisions and signatures, proposals, invoices, payments, and handover steps as JSON and CSV, every uploaded file as uploaded, and a README saying what each file holds.

### Changed
- Maria's bakery, in every walkthrough and the sample project, is re-estimated to match the Knowledge Center's proposal: account setup and discovery follow-up, training for each person, and two weeks of go-live support are now listed. Her chosen option is 22 to 28 hours ($2,200 to $2,800 at $100 an hour, a $1,100 deposit); the work took 24.5 hours, and the final invoice comes to $1,350.
- The privacy policy (edition 2.2, November 13) says which records a deletion request can't remove: signatures, issued invoices, and payments stay locked for seven years, and the rest is deleted with a written note of what remains.

## v0.9.0 - 2026-11-13

### Added
- **Change the decision.** After an option is approved, the decision maker can still choose another one, until the handover is accepted. The change asks why, shows what it replaces, what was already invoiced, the hours already logged, and the deposit asked now, and is signed like an approval. Nothing is billed twice: money invoiced for the earlier option counts toward the new one, an unissued deposit draft for it is replaced, and if what was invoiced comes to more than the new option can cost, accepting the handover drafts a credit for the difference. The earlier decision stays on record, marked replaced, with the reason on the new one. A replaced option can be chosen again once neon1 confirms it in the next revision. Everyone who follows decisions is told.
- Archive a project from the project list or the timeline, behind a quiet menu at the end of each row.
- A question before archiving a project or deactivating a person, saying what happens and how to undo it.

### Changed
- The walkthrough's narration sits in a band under the controls, above the page, so it never covers what's happening. Every walkthrough plays about 15% slower, and Maria's thoughts wait until the narration has had time to be read. Each says its new length: the preview about three minutes, the whole story about 17, and a chapter on its own a few minutes.
- The bakery example and the demo are priced at $100 an hour, the rate for small-business workflow work: Maria's chosen option is now $1,200 to $1,500, and her final invoice comes to $775 after a $600 deposit.
- A project's stage says how long it's been there in words ("Decide for 4 days", "since today"), not "0d".

### Fixed
- On phones, the walkthrough's Start and end cards are centered on the screen.
- In DuckDuckGo on iPhone, the strip under the browser's toolbar no longer shows the page scrolling under the tab bar.
- Checkboxes keep their size: the consent box when signing was stretched across the dialog, squeezing its words into a narrow column on phones.
- A pressed link styled as a button, such as **Compare options** under Next step, kept a readable label.

## v0.8.0 - 2026-11-13

- `infra/envs/dev`: a dev backend for dev.neon1.tech/1NEON with its own Cognito pool (auth-dev.neon1.tech), table, and buckets; no texts, no malware scan, and a one-day lock on test records. The `dev` workflow ships the API and app there; `dev-sync` keeps the `dev` branch following main.
- Modules take a `boundary` (api, storage) and `retain_days` (records); production keeps its values. Sign-in code emails link to the environment's own portal, and contact form mail sent from dev says "[dev]" in its subject.

## v0.7.1 - 2026-11-13

### Fixed
- The emails shown in a walkthrough no longer make the browser log dozens of refused styles. Nothing looked wrong on screen: the styles were applied a moment later, as intended, but each one was first refused by the site's content policy as the email was read.

### Changed
- The walkthrough check that gates every release now applies the same content policy neon1.tech sends, so anything the live site would refuse fails the check before a release.

## v0.7.0 - 2026-11-13

### Added
- An option's price is now one of two kinds, and says which. A **fixed** price is the whole price for the work described. An **estimate** is a range of hours at an hourly rate: you pay for the hours worked, and the total never passes the high end unless you approve a change first.
- **How this adds up**, under every price: the work behind it line by line with the hours each piece should take, the expected total, and **When you pay** (the deposit at approval and the rest at handover). The approval restates the price, what kind it is, and when you pay before you sign. The proposal and its Word copy print the same breakdown.
- Each option says why neon1 recommends it, or when it's the right one to pick.
- **Hours**, under Execute: every entry neon1 logs, with its date, what the time went to, and how long it took, beside a bar showing the hours against the estimate and what they come to so far. Hours past the high end are listed and not billed. Only neon1 adds entries, and an entry stays as logged once an invoice bills it.
- An invoice for hours lists each entry it covers, so its total can be checked against the work, and the line that subtracts earlier invoices names them by number.
- Two walkthrough chapters, **Pay the deposit** and **Pay the final invoice**, so the full story shows both invoices and how each was worked out.
- A bank payment (ACH) shows on its invoice from the day it's started: "bank payment clearing", with the amount and the date. While it clears, **Pay** is gone and the invoice isn't counted as overdue, so nobody pays twice. If the bank refuses it, the invoice says so, is open again with **Pay again**, and both sides are told the same day. Before this, an invoice looked unpaid for the days a transfer took, and a refused one left no trace the client could see.
- When an estimate's hours come to less than the deposit, accepting the handover drafts a credit for the difference against the deposit invoice, so the refund the service agreement promises is on neon1's list to issue and not left to memory.
- **Accept the handover**: once every handover step is done, the decision maker accepts all of them with one signature. Each step is still signed for, and an accepted step stays done.
- **Needs you**, on Home, now lists invoices to pay (with the due date, overdue first), drafts for neon1 to issue, and a handover ready to accept.
- In the interactive demo and the walkthroughs, **Pay** opens a stand-in for the payment page that says no money moves, and lets you pay by bank or card to see each outcome. In the demo you can also play the bank and clear or refuse a transfer.
- FAQ answers: whether a price is fixed or an estimate, where the hours worked are listed, what happens if the work needs more or fewer hours than estimated, what happens if a bank payment doesn't go through, whether you get a receipt, whether paying by card or paying late costs more, and what to do if an invoice looks wrong.

### Changed
- The service agreement is edition 2.0. Its Paying section says how fixed prices and estimates are billed, that a deposit counts toward the final invoice, and that any difference is refunded if the work comes to less than a deposit paid. An organization that signed edition 1.0 signs 2.0 before its next approval, and its earlier signature keeps the text it was given.
- Deposits: half of a fixed price, or half of an estimate's low end. The final invoice on an estimate is the hours worked, less earlier invoices.
- Maple Street Bakery, the fictional client in every walkthrough and on the sample page, is rebuilt as one consistent example: a team of eight taking orders by email, voicemail, and Instagram; limits found before any option was written; three options priced as estimates with the hours behind each; a dry run on a past week of real orders; 21 hours logged against an estimate of 20 to 24; and a deposit and a final invoice that add up. Every figure is illustrative.
- The interactive demo offers an estimate beside a fixed price to choose from, and its project in progress shows hours, a paid deposit, and an open invoice worked out from those hours.
- The full story is 14 chapters and says about 13 minutes.
- **Next step** tells a client who has the work: "Build is with neon1. It's done when: all milestone tasks done. Then neon1 moves the project to Verify. Nothing needs you right now." It used to tell the client to move the project themselves. Moving a stage from Next step is offered to neon1.
- "Handoff" reads "handover" everywhere, and a finished step no longer offers its own signature beside the one that accepts them all.
- An email about an invoice or a payment opens that invoice, with **See the invoice**, where it used to open Home.
- Notices about payments name the payment page as their source, where they used to say "Someone".
- Progress counts skip records: hours, invoices, payments, decisions, and updates are never counted as work to finish.
- The interactive demo's history reads in order: each project was created before the stages it has passed, its proposal was issued the day it reached Decide, and each project's health says who assessed it and when.
- A walkthrough of one chapter sets the story up a second time by itself if the first setup stumbles, and only then shows a card.
- The demo bar's **Switch person** and **Start over** are as tall as the bar, so they're easy to tap on a phone.

### Fixed
- A project tab tapped just before another link (two quick taps on a busy phone) could leave the tab's page on screen under the link's address. The page shown now always matches the address, and a tab still slides to the next one.
- A walkthrough could stop partway in Safari while it set the story up out of sight, for the same reason. Setup now moves between pages without sliding, and a step that can't find what it needs says what the page showed instead.

## v0.6.0 - 2026-11-13

### Changed
- Every guided walkthrough now waits for you. It opens on a card that says who Maria is, what you'll see, and how long it takes, and nothing moves until you press **Start**. Coming back after a refresh, the card offers to continue where you left off or start from the beginning.
- Every walkthrough ends on a closing card that says what happened, with **Watch again**, the full story or the interactive demo, the other walkthroughs, help, and a way to get in touch.
- The narration is a line at the bottom of the screen, like subtitles, and screen readers hear each new line. The bar at the top keeps only the chapter's name and the controls.
- The full-screen chapter title between chapters is gone. Chapters follow one another without a cut.
- Maria gets everywhere the way a person does. She opens the menu and picks the page, including her profile, and she reaches the service agreement from a notice above her options and returns with **Back to your options**.
- Jumping ahead, or opening one chapter from help, shows a loading screen that names the chapter and fills a line while the story so far is set up. That setup takes about half the time it did.
- If a walkthrough can't play a step, it stops on a card that says so and offers to play the chapter again, start over, or try the demo, in place of looping.
- **Exit** returns to the page and the question you came from. The cookie and storage notice lists the one item this saves in your tab.
- Each walkthrough's stated length is now measured: the full story says about 11 minutes (it said 8), and the short ones say one to two minutes each. The FAQ says the same length, and a test keeps the two in step.

### Added
- A notice above the options tells a decision maker when the service agreement needs signing first, with a link to read and sign it and a button back to the options afterwards.
- A check that plays every walkthrough in a real browser, on a desktop and a phone screen, and stops a release if any of them doesn't reach its end. It also jumps between chapters, reloads partway, pauses and clicks around, turns the phone, and leaves the tab, and it fails when a walkthrough takes much longer or shorter than it says it does.
- A phone's screen stays lit while a walkthrough plays, and dims as usual once it's paused or over. Browsers without that ability behave as before.

### Fixed
- On phone browsers that float their controls over the page (DuckDuckGo on iPhone), the strip under the menu showed the page scrolling by. The menu, the dimmed backdrop behind it, and the walkthrough's cards and loading screen now reach the screen's edge, as the tab bar already did.
- The short walkthrough no longer redraws the page a moment after it opens.
- Maria's cursor no longer rests on top of the opening card.
- On a phone with the mini menu, the walkthrough picked the wrong menu item for People and Projects and stopped. It now finds each page by where its link leads.
- In the "Texts and text codes" walkthrough, the menu stayed open over the profile and the walkthrough stopped.
- A measure that starts at zero keeps its zero in the "Measure it" chapter.
- Pausing a walkthrough and closing its open dialog with Escape, then pressing Play, replays the chapter from its start, as clicking around already did.
- Changing tabs twice in quick succession no longer logs an error in the browser's console.

## v0.5.2 - 2026-11-12

### Fixed
- The two-minute walkthrough at /1NEON/live plays to the end again. Approving now needs a typed signature and a signed service agreement, and the short version stopped at the approval; Maria now signs both, as in the full story.

## v0.5.1 - 2026-11-12

### Changed
- Help matches the proposal as it works now: the proposal opens from **Read the proposal** and downloads as Word as well as PDF, and the approval lists its terms again, including anything to buy, before you sign.
- Help answers three more questions: how to suggest changes with a marked-up copy, who buys equipment or software (with receipts and paying back at cost), and what happens to a request made after approving. Searching help for markup, change order, reimburse, or an expired quote now finds them.
- The sample project shows the numbered proposal and option ID, the signed approval, the label printer bought with its receipt, and the handover accepted by the owner.
- Neo answers from the updated help (corpus v0.37.1).

## v0.5.0 - 2026-11-12

### Added
- Proposals are issued in numbered revisions, one proposal per project. neon1 issues a revision (the first is 0039-r1), which freezes a copy of everything the proposal shows; every option in it gets an ID such as 0039-r1-B, and the decision names it. Earlier revisions stay readable, marked as replaced, and none can be edited or deleted.
- Approving restates exactly what's being accepted: the option and its ID, the proposal it's from, the estimate, the timeline, neon1's time, what's paid directly, what's to buy, and the result to check. An option edited after its revision was issued waits for the next revision.
- A price check replaces expiry: a revision shows when its estimates were checked and when to recheck. After that date approval waits, the client can ask neon1 to refresh, and refreshing issues the next revision.
- Purchases in Execute, filled in from the approved option's expected purchases and marked with its ID. Each shows its estimate, what was paid and where, who buys it, and its receipt, with a flag when a bought item has no receipt yet. Items neon1 buys need the decision maker's initials, on the approval or afterwards, and are paid back at cost.
- Download a revision as a Word file. The proposal's ID travels in the file name, a document property, and the header on every page, so a marked-up copy uploaded to Files is recognized ("Is this a revision of Proposal 0039-r1?") and filed under Files → Proposals with the revision it answers.
- Constraints and assumptions, as their own list in Needs and their own section of the proposal.
- A request added after a decision asks whether it changes the agreed scope; one that does is flagged for the next revision.
- Handover steps can be checked and accepted by the decision maker, with a note on what they checked.
- neon1's service agreement, in 1NEON and at /1NEON/agreement. An admin of a client organization signs it once, with their typed name and a consent box, before the first option can be approved. The signature records the edition, a fingerprint of the exact text, the time, and where it came from.
- Approvals and handover acceptances are signed the same way. The approval records a fingerprint of the terms that were signed, the printed proposal and its Word copy show the signature, and initials for purchases come from the signed name.
- Invoices under Execute: a deposit invoice is drafted when a fixed-price option is approved and a final invoice when the handover is accepted. Reimbursement, progress, care plan, and credit invoices can be added too. neon1 checks a draft and issues it; issuing numbers it (such as INV-0039-01), sets its due date, and fixes its contents with a fingerprint. Clients never see drafts.
- An invoice page on neon1's letterhead, ready to print or save as a PDF, showing the lines, credits, payments, what is left, and how to pay.
- Pay online through Stripe Checkout, by bank transfer (ACH, preferred) or card. Stripe's signed webhook records the payment once, including bank payments that clear days later. Checks, Zelle, and wires are recorded by neon1. If the Stripe account can't take bank payments yet, Checkout offers card alone.
- Issued invoices and payments are permanent. A mistake is corrected with a credit or by voiding with a reason, and an invoice with payments can't be voided. A locked copy of every signature, issued invoice, and payment is kept for seven years.
- A Billing notification group (on by default) for signatures, issued and voided invoices, and payments.
- A "Pay an invoice" chapter in the walkthrough (/1NEON/live?play=pay): Pradeep issues the deposit, Next step tells Maria it's ready, she reads it on the letterhead and pays it by bank transfer. The full story also has her sign the service agreement and her approval, Pradeep finish his own handover steps, Maria sign her acceptance, and the final invoice paid in Care.
- Pay on the invoice page itself, as well as in the project's Invoices.
- The interactive demo's Backups that restore project has a deposit paid by bank transfer and an open progress invoice to pay.
- Help: what a proposal revision is, how to accept a handover step, and a new Invoices and paying section (where invoices are, how to pay, when they're sent, corrections, and the service agreement), each with a walkthrough link.

### Infrastructure
- A records bucket with S3 Object Lock (governance mode, seven years) for the locked copies.
- Stripe's restricted key and webhook signing secret are read from SecureString parameters (/1neon/prod/stripe/...). Terraform creates them with placeholder values and never sees the real ones; until they are set, online payment stays off.

### Changed
- Approving an option or accepting a handover step needs a typed signature; initials alone no longer approve. Neo can't approve on anyone's behalf and points to Approve instead.
- The help page explains invoices, paying, and the service agreement.
- The printed proposal shows the date its revision was issued, which no longer moves when an option is edited or approved, and only the acceptance recorded against that revision. Each printed page carries the proposal's ID and its page number, and a demo proposal says on every page that it's a fictional sample.
- Maria's walkthrough reads the numbered proposal, sees the approval restate the terms, buys the label printer from her option and attaches the receipt, marks Sam's training done, and accepts the last handover step. The runbook she receives is a full page instead of one line.

### Fixed
- A guided walkthrough no longer stops at "One moment…" for someone whose Projects page is set to Timeline. The walkthrough keeps its own List or Timeline choice, last organization, and loading background in memory, so it never reads or changes the visitor's own, and it opens a project from either layout.
- Before Start (with reduced motion on, or in a tab opened in the background), Back, On, and the chapter list start the walkthrough at the chosen chapter instead of throwing an error.
- Jumping to a later chapter sets it up behind a panel that names the chapter, so the earlier chapters' screens no longer flash past. The bar shows the new chapter and its neighbours from the moment it's chosen, and no thought from the skipped chapters carries over.
- The interactive demo keeps changes made in two tabs. Each change is applied on top of whatever another tab saved, under one lock shared by the browser's tabs, and is confirmed only once it's saved. Tabs opened together share the same starting data.
## v0.4.5 - 2026-11-12

### Added
- A closed project leads with the short version of its handover: what changed (the agreement as approved and the finished changes), the measured result before and now, who owns each system or account, and how much of the handoff checklist is done. Only the parts the project has are shown.

### Changed
- The Terms of use open with a short version, matching the Privacy policy. Nothing else in them changes.

## v0.4.4 - 2026-11-12

### Fixed
- In the interactive demo, Switch person starts the next person at their own home, instead of on a page from an organization they can't open.
- In a paused walkthrough, the messages in Maria's pretend inbox are buttons, so they open from the keyboard as well as with a click.

### Changed
- Help says how someone who has lost every second step gets back in: an email from the account's address, then a call to a phone number already on record and, where there is one, another admin's written OK, before anything is removed.

## v0.4.3 - 2026-11-12

### Changed
- The privacy, terms, and cookie pages name their Knowledge Center copies as the page for search engines to credit, so a search for neon1 shows the site instead of a portal screen.
- The portal lists neon1.tech's 192px matrix green icon first, the one search results show.

## v0.4.2 - 2026-11-12

### Changed
- Text messages have their own block under Notifications on your profile, apart from the email choices. The yes to texts and every kind of text start unticked, and the kinds stay off until you agree to texts. The email column keeps its defaults.

## v0.4.1 - 2026-11-12

### Fixed
- In DuckDuckGo on iPhone, the strip below the bottom tab bar shows the theme's background instead of the page scrolling underneath it (the v0.3.3 fix didn't take there). The tab bar is now solid rather than see-through.

### Changed
- The demo's sign-in screen is laid out like the real one: an "Interactive demo" heading with its line under it at the same size as the client portal's, the FAQs and policy links under the people, then a divider and the guided walkthrough link, where the real sign-in has the sample and the demo. The people's names and roles read a size larger.

## v0.4.0 - 2026-11-11

### Added
- **Read the full proposal**, under a project's options: discovery, goals, every shared option with what's in and out, neon1's hours, price, timeline, and outside costs, what each side will do, and the agreement, as one page in neon1's letterhead look. **Print or save as PDF** prints only the proposal. Once an option is approved, the page shows who approved which version and when; before that, it has signature lines.
- Options carry neon1's estimated hours, the costs paid directly to vendors, and the result the client can check. All three are copied into the decision when an option is approved.

### Changed
- The bakery's options in the walkthrough and the example are re-estimated from the actual work: about 3, 10, and 17 hours, with prices and timelines to match, and each lists what's included, what isn't, and what it depends on. In the walkthrough, Maria reads the full proposal before she approves.
- An option's card shows its first paragraph; the full details are in its panel and the proposal.

## v0.3.3 - 2026-11-11

### Fixed
- In DuckDuckGo on iPhone, the strip below the bottom tab bar shows the theme's background instead of the page scrolling underneath it, whether the browser's toolbar is showing or not.

## v0.3.2 - 2026-11-11

### Changed
- Text is set in Figtree, the typeface neon1.tech now uses, and emails ask for it too. JetBrains Mono stays for labels and codes.

## v0.3.1 - 2026-11-11

### Changed
- The tab icon is neon1's mark on a transparent background, matching the app's theme: brand green on awake, matrix green on Matrix. It replaces the rings.

## v0.3.0 - 2026-11-11

### Added
- Home's calendar shows a full month, headed by the month and year, with arrows back and forward, a Today button, and a jump to any month. Click a day to see what falls on it and add leave, an office closure, a meeting, a care plan call, or anything else that affects the work, once or repeating weekly or monthly.
- The calendar's lists fold the same way as the rest of 1NEON: Past and Repeated start closed, and Upcoming (formerly Later) starts open.
- Home has a "Projects at a glance" card, with each project's stage, health, progress, and next step, and an "Away this week" card listing who is on leave.
- A new "What is the calendar on Home?" walkthrough.

### Changed
- The 1NEON mark sits in the top bar beside the menu button, lined up with the mark inside the menu, in full and Mini mode, and both lead Home.
- Every change in the activity record says what changed ("status To do → Done; due Nov 3, 2026 → Nov 7, 2026") instead of just "Updated", for projects, work, people, stages, and calendar events. A save that changes nothing records nothing.
- The bell splits notifications into New and Earlier, so it is clear which ones you hadn't seen before opening it.
- On Home, Deciding opens the Decide stage on the Needs page and Building opens the Execute page, instead of both opening the board.
- Each FAQ walkthrough plays on its own, from signing in to the end of that topic, then stops. The bakery's earlier steps are set up out of sight first, so nothing unrelated plays on screen.
- Maria's thoughts stay up long enough to read, beside the part of the page they're about, and clear before the next step starts.
- The walkthrough cursor is a clean pointing hand over things you can click and a grabbing hand while dragging, in neon1's colors, with the arrow everywhere else.

## v0.2.4 - 2026-11-11

### Fixed
- Going Back from the invite demo's first look no longer leaves the welcome tour's shade and popover over the sign-in, and the replayed sign-in keeps the email the invite link filled in.
- The FAQ link into the full story's Needs chapter no longer goes off script on phones: catching up waits for the new project's page to open before Maria signs in and walks there.

## v0.2.3 - 2026-11-11

### Fixed
- On iPhone (Safari, DuckDuckGo, and Chrome), the sign-in box sits between the top bar and a bottom row that holds Neo's button and the rain controls, so neither covers the form or its border, and the browser's bottom toolbar stays dark like the top one instead of turning white.
- The 1NEON wordmark spells out as "1portal Needs Execute Observe Normalize", with a small gap between the words, and a tap on a phone opens it for a few seconds instead of leaving it open.
- In a walkthrough, the sign-in box centers in the screen below the walkthrough's bar instead of running off the bottom.
- Coming back to a walkthrough after switching apps or tabs plays on by itself, and time while the phone had the page frozen no longer counts against a step, so it doesn't go off script.
- Going Back a chapter in a walkthrough replays it from a clean start: a half-finished sign-in, a passkey added later, or a welcome tour already offered no longer send the invite and passkey demos off script.
- The browser's Back button inside a walkthrough returns to the page that linked to it (an FAQ, say) instead of stepping back through the pages the story visited.
- The passkey demo plays in browsers with no passkey support of their own.
- The sample project fits a 320px-wide phone without a sideways scroll.
- No more "blocked eval" errors logged on every page in Firefox and Safari.

### Changed
- The walkthrough's cursor is the plain arrow everywhere (an I-beam over text fields), with no pointing or grabbing hand.

## v0.2.2 - 2026-11-11

### Changed
- The privacy policy's Neo paragraph matches the website's word for word, and says plainly that Amazon Bedrock doesn't keep questions or answers, or use them to train models.

## v0.2.1 - 2026-11-11

### Changed
- Every guided walkthrough starts at the beginning: Maria on the sign-in screen with a thought about what she's come to do, the real email-code sign-in, and then the walk, menu by menu and tab by tab, to the page she needs. That includes the opening preview, the short demos, and links from the FAQs into the middle of the story.
- The sign-in box sits evenly between the walkthrough's bar and the bottom of the screen, and on phones it keeps clear of the rain controls.

### Fixed
- Pausing, changing the speed, or stepping Back and forth no longer makes a walkthrough stall, restart, and replay from the beginning. Time spent paused no longer counts against a step, a section's saved starting page is read once the page has settled, and pausing leaves an open notification list open.

## v0.2.0 - 2026-11-11

### Changed
- Next step and the Overview name the same current agreement: the decision no later approval replaced. Earlier approvals stay in Needs, marked replaced.
- Today, overdue, on time, the weekly counts, and a new reading's date follow the organization's calendar (Eastern time by default), so an evening in New York is still that day.
- A measure whose starting point already equals its target counts as reached by the same rule on its card and in Insights, using which direction is better.
- Every measure number (new project, Add measure, the item panel, and a reading) follows one rule: blank is unset, 0 is 0, and anything else must be a plain number. "1,5" or "1..2" shows a message under the field instead of being changed or dropped.
- Uploads run file by file. If some files don't make it, the rest still finish, the message says which, and Retry sends only those. An upload can be cancelled, and a stalled transfer stops with a message.
- Files that are still being checked for viruses update on their own, with Check again; archived projects show as unavailable for new uploads.
- Search opens with Ctrl+K (Cmd+K on a Mac) only; a bare "/" no longer does.
- Board cards can move up or down within their column from the same Move menu, without dragging.
- The help sheet has a Close button, the onboarding tour holds still with reduced motion, and toasts are read once and stay longer when they say more.

### Fixed
- Posting a status update starts from the project's current health, and says so when the chosen health differs.
- A slow save, comment, add, or workflow save no longer clears or closes over text typed while it was pending.
- Retrying a request with several needs after part of it failed, or after a lost reply, doesn't create the sent ones twice.
- A failed reading keeps the number in the box.
- A target date conflict shows both dates before Keep mine.
- Setting up an authenticator app ignores replies from a setup that was cancelled, and keeps errors in the dialog beside the code.
- The Enter that confirms an input method's candidate no longer adds an item or an action.
- Focus: arriving on a page puts it on the page title, each New project step announces itself, and Escape from the bell or the walkthrough lists returns to their button.
- On phones, Neo's launcher and window sit above the bottom tab bar, and the open menu keeps full-size rows and scrolls.
- Read-only board cards no longer mark their project links as disabled, and template cards show keyboard focus.
- Coming up and Insights refresh after changes like the rest of the organization's pages.

## v0.1.1 - 2026-11-10

### Fixed
- Emails in the walkthrough, such as the sign-in code, show their own layout on neon1.tech instead of plain text.

## v0.1.0 - 2026-11-10

The first tagged release. 1NEON had been live at neon1.tech/1NEON since 2026-11-06, deployed from main without version numbers; this entry records what that release holds.

### Added
- Sign-in by email with an emailed code or a passkey, and "Confirm it's you" with a passkey, an authenticator app, or a texted code before admin actions.
- Organizations, people with viewer, editor, and admin access, and invitations by email.
- Projects through Needs, Execute, Observe, and Normalize: requests, discovery questions, requirements, options with cost, quality, and effort, approvals with conditions, tasks and milestones, status updates, measures, files, handover, and care.
- Home, the board, Insights, search, notifications under the bell with per-kind email and text switches, and Default and Mini menus.
- Awake (light) and Matrix (dark) themes that follow a choice or the device.
- The interactive demo, a sample project, the guided walkthrough with a primer, the code sign-in, and five short demos, and FAQs that link into the walkthrough.
- Neo for signed-in people, off until its model is switched on.
- The contact route behind neon1.tech's form.

### Fixed
- Phone pages no longer zoom out when a project's tabs or the invite form are on screen.

## Before v0.1.0

1NEON shipped from main for several days before releases were tagged. These pre-releases mark the points in that history where a meaningful piece landed, on the commits as they are on main. They were tagged on 2026-11-10; the dates below are when each one shipped.

### v0.1.0-alpha.8 - 2026-11-10
- Neo for signed-in people, grounded in the 1NEON guide, and the contact route takes any number of topics or none.

### v0.1.0-alpha.7 - 2026-11-10
- Review fixes across new projects, Home, requests, Insights, and the outbox; route titles and descriptions; FAQs that link each answer; and a release that's fully checked before any AWS change.

### v0.1.0-alpha.6 - 2026-11-09
- A Watch it link on every FAQ the walkthrough can show, the contact form endpoint for neon1.tech, and plainer thoughts for the demo's client.

### v0.1.0-alpha.5 - 2026-11-09
- Notifications open what they're about, Default and Mini menus, items that edit, check off, and delete the same way, and Next step after each action.

### v0.1.0-alpha.4 - 2026-11-09
- A facet review of every page, search that offers only what you can do, one release workflow for infrastructure and app, and API routes split by feature.

### v0.1.0-alpha.3 - 2026-11-09
- Four short demos, the branded sign-in code email, and text notices in the portal.

### v0.1.0-alpha.2 - 2026-11-09
- A hardening pass: a durable outbox for notices and invitations, texted codes to confirm it's you, safer decisions and uploads, a full-history secret scan before deploys, and signed-in pages that load on first visit.

### v0.1.0-alpha.1 - 2026-11-08
- The earliest commit in the published history: the portal, the demo, and a walkthrough that holds up to jumps, pauses, and clicks.
