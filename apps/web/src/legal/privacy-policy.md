# Privacy and data policy

*Last updated November 27, 2026.* This edition adds the chat with neon1 in 1NEON, says how anonymized case studies fit the no-marketing rule, states which records are kept for seven years, and says what deleting an account removes and keeps.

neon1 LLC ("neon1", "I", "me") runs the website neon1.tech, Neo (the assistant on the website), and the 1NEON client portal at neon1.tech/1NEON, and does technology work for clients. This policy covers all of them. The [cookie and browser storage notice](https://neon1.tech/1NEON/cookies) is part of it. [How neon1 is built](https://neon1.tech/knowledge/company/architecture/) describes the systems.

## What I collect, and why

### The website

There are no accounts, analytics, or tracking on neon1.tech. The servers that deliver it (Amazon CloudFront) handle your IP address and browser details to send you the pages, and Amazon may keep them briefly for security and operations. I don't turn on access logs for the website. Your browser saves the rain display settings you pick, on your device only.

### The contact form and email

When you send the contact form, your name, email address, organization, message, and, if you pick one, how you found neon1 (in your own words if you choose "Somewhere else") are emailed to my inbox (hello@neon1.tech) through Amazon's email service, with your address set as the one I reply to. The form doesn't save your message anywhere else. To stop floods, it counts messages per sender with a one-way code made from the IP address, not the address itself. Before sending, the form checks your email address the same way sign-up does (below).

Emails you send me, through the form or directly, are kept in my business email (Google Workspace) as correspondence.

### Booking a call

If you book a call through Calendly, Calendly collects your name, email address, and anything you add, and sends them to me. Calendly handles the booking under [its own privacy policy](https://calendly.com/legal/privacy-notice). The booking also appears in my calendar.

### Neo, the assistant on the website

Neo answers from neon1's public pages, using a model (Qwen3 Next 80B) that Amazon runs in its Bedrock service in AWS's US East (N. Virginia) region.

- Neo's service doesn't store the text of your questions or its answers. Its logs hold only timing, length, and errors.
- Bedrock's own logging of questions and answers is turned off in my AWS account.
- To notice the same question sent over and over, Neo keeps a one-way fingerprint of it. Its question limits count visitors by a one-way code, not by IP address.
- Amazon says Bedrock doesn't use prompts or answers to train models, and that depending on the model and account settings it may keep them for abuse detection. [Amazon's Bedrock documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html) has the details.

Please don't type anything sensitive into Neo.

### The 1NEON portal

The portal is available to people invited by me or by an administrator of their organization, and to anyone who makes their own free account (below). It holds:

- **Account details:** your email address, and optionally your name, job title, phone number, profile photo, LinkedIn profile, and website. People in the organizations you belong to can see your LinkedIn profile and website.
- **Organization details:** your organization's name, and, if you add them, where it's based, a link to its website or a public page (Google, Yelp), and its LinkedIn page. I use these to see who I'm working with.
- **Sign-in data:** your sign-in methods (an emailed code or a passkey, with an authenticator app as an optional second step; there's no password) and security events, such as sign-in times, the IP address and browser used, and when a sign-in method was added or removed. Passkeys and email codes are handled by Amazon Cognito.
- **Authenticator app key:** if you set up an authenticator app, the portal creates the app's secret key and keeps it, encrypted, so it can check your 6-digit codes. Only the portal's server reads it, you see it once during setup, and it's deleted when you remove the app. 
- **Project content:** what you and your colleagues add, such as requirements, decisions, tasks, metrics, comments, and files. Every uploaded file is scanned for malware (Amazon GuardDuty) before anyone can download it, and a file that fails the scan is blocked.
- **Signatures:** when you sign the service agreement (with your case-study and naming choices, and any later change to them), approve an option, or accept a handover (including any words you leave about the work and whether I may quote them), the portal records your name, email address, the time, your IP address and browser, and a fingerprint of exactly what you signed, so either of us can later show what was agreed.
- **Invoices and payments:** invoices name your organization and the person they're billed to. When you pay online, you enter your card or bank details on Stripe's own payment page. I never see or store them. Stripe receives the amount, the invoice number, a short description naming your organization and project, and your email address, and tells the portal whether the payment succeeded. Payments by check or transfer are recorded by hand.
- **Activity records:** who changed what and when, kept as an audit trail so both sides have a reliable history of the work, including handovers, review requests, invoice disputes, reminders, pauses, and endings.
- **Chat with neon1:** messages you send me in 1NEON's chat. Everyone in your organization can read its ordinary messages. A message marked private can be read only by its author and me, and I can read every message in your organization's chat; private doesn't mean encrypted end to end. If you edit a message, I keep its earlier versions with it. Chat messages are part of your organization's project records and are kept and deleted like them. To limit abuse, the chat counts messages per person and per network address, using a one-way code of the address, not the address itself. I may flag, mute, or ban someone from chat, and the chat mutes someone automatically for a day after repeated refused messages. Your browser keeps an unsent draft on your device.

**Emails and texts.** The portal emails you what you need (invitations, sign-in codes, security notices, and invoices) and notices about the kinds of changes you choose, each of which you can turn off in your profile. If you add a mobile number and agree to texts, 1NEON first texts a 6-digit code to confirm the number is yours (only a one-way code of it is stored, and it expires in 10 minutes). After that, it texts you about the kinds of changes you choose. Each text says only that something new is waiting, with a link to sign in; it doesn't name your organization, project, or files. Changing your number turns texts off until the new number is confirmed. Frequency varies with your projects, up to 10 notices a day. Message and data rates may apply. Reply STOP to opt out or HELP for help, or turn texts off in your profile at any time. A STOP reply is recorded, and turning texts back on needs a new code. I use your mobile number and text-message consent to send the notices you choose, manage opt-outs, and prevent misuse. I keep the limited records described in the retention schedule below. I never sell or share mobile numbers or text consent for another party's marketing.

**Neo inside the portal.** A signed-in version of Neo can help inside 1NEON, but it's turned off today. If I turn it on, I'll update this policy first. When it's on and you ask it a question, it sends your question and what it reads in 1NEON as you, such as the projects, items, options, file names, and comments you can already see, to an Anthropic model that Amazon runs in Bedrock in the United States, so it can answer. It sends nothing about organizations you can't see, nothing when you aren't asking, and it can't change anything until you approve it.

Please don't put passwords, keys, or other secrets in the portal.

### Free accounts

You can make your own 1NEON account from neon1.tech to describe your projects' needs before we work together. When you sign up, I collect:

- **What you type:** your email address, your name, which describes you best (an individual, a business by size, a technical team, a nonprofit, a school or public agency, or your own words), your organization's name (not asked of an individual, and optional if you describe yourself in your own words), and that you accepted the terms of use (with the date of the edition you saw). Optional: a link to your website or a public page, where you're based (a city and state, a state alone, or a place outside the US), and how you found neon1 (in your own words if you choose "Somewhere else").
- **Checks on what you type:** the portal looks up your email address's domain in public DNS to see that it takes mail, and compares it with a public list of temporary-mailbox services; it never contacts your mailbox. A link is checked only for its form; neon1's server never visits it. A US city is matched against a public list of US places (GeoNames) to spell it properly, and kept as you typed it if it isn't listed. None of these results are stored.
- **A bot check:** the sign-up form runs Cloudflare Turnstile, which looks at your browser and connection to tell a person from an automated script. Cloudflare receives your IP address and browser details for that check only. Turnstile runs only on the sign-up form. Cloudflare's [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/) says how Cloudflare handles that data.
- **A one-way fingerprint of your IP address,** used to limit how many sign-ups come from one place, and kept with your account's sign-up record. The address itself isn't stored.
- **What you add:** the projects, needs, comments, and files you put in the account, as in any portal account, and any assessment or call you ask for from it, which reaches me by email.

Only you and I see a free account. I use it to understand your needs, advise you, suggest options, and offer to talk. I don't add you to a mailing list. The portal emails you your sign-in codes and, if nothing in the account changes, check-ins and a final notice on the schedule below.


### Work on your own systems

Much of my work happens in your accounts and systems rather than in 1NEON. There:

- I use named accounts with the least access the job needs, and I remove my access at handover and check that it's gone.
- I look at your information only as far as the work needs, and I don't copy it to my own systems unless the work requires it and you agree.
- Your confidential information doesn't go into an AI service unless you've approved that service in writing, as [How I work with AI](https://neon1.tech/knowledge/policies/ai-use/) explains.
- Real client information never appears in a demo or a code issue. A public post or case study describes a client's work only as the client has allowed in the service agreement: anonymized, with nothing that identifies them, or with their separate permission for anything that does.

### Regulated data

The portal and my standard services aren't designed for health records, payment card data, or similar regulated personal data. I won't take on work involving such data until the right agreement is signed first, such as a [business associate agreement](https://neon1.tech/knowledge/templates/business-associate-agreement/) for health information.

## How I use it

- To answer you, and to communicate about the work we're doing together.
- To provide the portal: signing you in, showing your organization's projects, sending the emails and texts above, and issuing and collecting invoices.
- To keep everything secure: detecting misuse, investigating problems, and keeping an audit trail.
- To meet legal, tax, and accounting obligations.

I don't use your information for marketing or advertising, except anonymized case studies a client has allowed, and I don't use identifiable or confidential client information publicly without separate permission. I don't use it to train AI models, and I don't use automated decision-making that affects you.

## Tests and development use made-up data

I try every change on a private test copy of the website and portal (dev.neon1.tech) that only I can reach, through its own sign-in. It holds generated, fictional data only, and I never copy real client information, accounts, or files into it. Mail it sends goes only to neon1's own addresses. The same rule applies on my own computer. The public [interactive demo](https://neon1.tech/1NEON/demo) and [guided walkthrough](https://neon1.tech/1NEON/live) also use fictional data and run entirely in your browser.

## Who else handles it

I use a small number of service providers, all based in the United States, each only for the purpose listed.

| Provider | What it does for neon1 | What it receives |
|---|---|---|
| Amazon Web Services | Hosts the website, the portal, and Neo; stores portal data and files; scans uploads; handles sign-in; sends emails and texts; runs Neo's models (Amazon Bedrock) | Everything in the portal, website requests, contact form messages on their way to me, and questions sent to Neo |
| Stripe | Takes online payments | Your payment details, which you enter on Stripe's page, plus the amount, invoice number, a short description, and your email address |
| Google (Google Workspace) | My business email and calendar | Emails you send me, contact form messages, and bookings |
| Calendly | Booking calls from the website | What you enter when you book |
| Cloudflare (Turnstile) | Tells people from automated scripts on the 1NEON sign-up form | Your IP address and browser details while you fill in the sign-up form |

I disclose information only to these providers, when the law requires it, or to protect the rights and safety of people using neon1's services. If I add a provider that receives your information, I'll update this list first.

## Where it's stored and how it's protected

Portal data and files are stored on AWS in its US East (N. Virginia) region, encrypted in transit and at rest. Each organization's data is kept separate from every other organization's, and the server checks every request against the person's access. My own administrative access uses multi-factor sign-in, and keys and passwords are kept in a secure store, never in code. I keep backups and an audit trail, and I test that one organization can't reach another's data. I take reasonable measures to protect your information, but no system can guarantee absolute security.

## How long I keep it

Clients' projects and files are never deleted on a schedule, and I never sell, rent, or advertise with what I hold. The table lists the rest.

| Information | How long it's kept |
|---|---|
| Projects, items, comments, uploaded files, and projects moved to the trash | Until your organization asks me to delete them, including after our work ends. Trashed projects are hidden from everyone but kept |
| Files you delete | Removed right away, and earlier copies of deleted or replaced files are erased after 90 days |
| Database backups | 35 days |
| Signatures, issued invoices, and payments | Write-protected for seven years from the day they're made, as my business practice, subject to applicable obligations and legal holds. Only an administrator with a special permission can shorten that |
| Audit records of sign-ins and changes | Up to 3 years, then deleted. Removed sooner when the account or organization is deleted |
| Records that an email or text was delivered, or failed | 30 days |
| Portal server logs (request time, route, IP address, status, and errors, never what you sent) | 90 days |
| Neo's logs (timing, length, and errors, never the text) | 14 days |
| Contact form counters | A day after their first count |
| Free accounts (everything in them, including files, trashed projects too) | Deleted 30 days after the last change anyone in the account made, unless we're working together or I've told you I'm keeping it. Home shows the date, and **Keep it** adds 30 days to it, once. A suspended account waits for my review instead. You can ask me to delete one sooner. Check-ins come after 7 and 14 days and a final notice after 21 |
| A deleted account's sign-in details, security and audit records, queued notices, and unsent requests | Removed when the account is deleted. Delivery records, server logs, and backups follow their own periods |
| A protected identifier made from a deleted account's confirmed mobile number | Kept for 30 days to prevent immediate reuse in 1NEON, then deleted. It cannot be used to send messages |
| A record that a deletion happened: when, how much was removed, and who asked | Kept |
| An unconfirmed sign-up, and sign-up counters (one-way fingerprints of addresses and emails) | One day, and two days |
| Neo's question fingerprints | Ten minutes |
| An unfinished authenticator app setup | 10 minutes |
| Emails and contact form messages | As correspondence, while useful for our work or required by law, or until you ask me to delete them |
| Information copied from your systems for a project | Deleted when the project ends, unless you ask me to keep it |
| Chat network-address counters | Two days |
| Anything an actual or reasonably expected dispute, investigation, or legal obligation needs, such as delivery records, payment requests, and project evidence | Until it's resolved, even where the schedule above would end sooner |

## Getting a copy of your data

An administrator of your organization can download all of its data at any time from Settings with **Download everything**. You can also ask me for a copy of your own information, or your organization's, in a common format.

## Deleting your data

Your organization can ask me to delete its data, and you can ask me to delete your account.

I remove the requested information from active use, except records I need to keep for the reasons and periods listed above. Backups, earlier file copies, delivery records, and reserved mobile-number identifiers expire on their listed schedules.

I keep signatures, issued invoices, and payment records for seven years as a business practice, and retain other information only where needed for a stated purpose, an actual or reasonably expected dispute, or a legal obligation.

I'll explain what was deleted, what remains, why, and when it is expected to expire.

## If something goes wrong

If I learn that someone got to your information who shouldn't have, I'll tell you promptly, say what happened and what I'm doing about it, and give any notice the law requires. How I handle security reports is in the [security disclosure policy](https://neon1.tech/knowledge/policies/security/).

## Your choices and rights

You can view and update your profile at any time in the portal. You can also ask me to:

- give you a copy of your information, or your organization's data;
- correct or delete your information; or
- stop sending you non-essential emails or texts.

Your organization's administrator controls who can access its workspace. If a request concerns your organization's project content, I may need to involve that administrator. I'll respond within 30 days. Depending on where you live, you may have more rights under laws such as the GDPR or state privacy laws, and you can complain to your local data protection authority.

## Cookies and browser storage

The website sets no cookies. The portal uses only the cookies it needs to sign you in, so it shows no consent banner. The [cookie and browser storage notice](https://neon1.tech/1NEON/cookies) lists each one and how long it lasts. If I ever add optional cookies or storage, such as analytics, I'll ask for your consent first.

## Children

neon1's services are for adults and businesses. I don't knowingly collect information from children under 13.

## Changes

When I change this policy, I update the date and say what changed at the top. If a change matters, such as a new use of your information or a new provider, I'll tell portal users by email before it takes effect.

## Contact

neon1 LLC, 418 Broadway, Ste R, Albany, NY 12207 · [privacy@neon1.tech](mailto:privacy@neon1.tech)
