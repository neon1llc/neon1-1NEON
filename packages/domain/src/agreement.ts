// packages/domain/src/agreement.ts - neon1's service agreement as a client signs it in 1NEON. The text
// and its edition travel together: a signature records this edition and a SHA-256 hash of this exact
// text, so a later edition never changes what an earlier signer agreed to.


/** The edition new signers sign */
export const AGREEMENT_EDITION = "2.3";


/** Editions whose signature still covers approvals. 2.3 added only the two choices below, so a 2.1
 * signature stands; its organization hasn't allowed case studies until an admin chooses */
export const AGREEMENT_ACCEPTED = ["2.1", AGREEMENT_EDITION];


/** Has one of these signatures signed an edition that still covers approvals? */
export const agreementCovers = (signatures: { ref: string }[] | undefined) => (signatures ?? []).some((a) => AGREEMENT_ACCEPTED.includes(a.ref));


/** The agreement's text (Markdown). Changing a word here means a new edition above */
export const AGREEMENT_TEXT = `# Service agreement

Edition ${AGREEMENT_EDITION}

This agreement is between neon1 LLC, doing business as neon1 ("neon1", "I", "me"), and the organization named where it is signed in 1NEON ("you"). It covers every project I do for you while it is in effect.

## How work is agreed

Each project has a proposal in 1NEON, issued in numbered revisions. When your decision maker approves an option, its ID (for example 0039-r2-B) fixes that project's scope, price, and timeline. A change is agreed the same way, by approving an option in the next revision. This agreement governs everything else, and if a proposal and this agreement disagree, this agreement wins.

## Purchases

Prices for equipment, software, and services from other vendors are estimates. You buy them yourself, unless an approval says that I buy them for you. When I do, you pay me back exactly what I paid, shown by the receipt in 1NEON, with no markup.

## Paying

I send invoices through 1NEON. Each one is due within 15 days unless it says otherwise. A proposal prices the work as an estimate that discovery sets, billed for the hours I work, at the rate it states; each hour is listed in 1NEON, and the total never passes the estimate's high end unless you approve a change first. Unforeseen work or purchases are agreed with you before I add them. When a proposal states a fixed price, for a small, well-defined job, that price is the whole price for the work described. An option may ask for a deposit when it is approved, as the proposal states. A deposit counts toward the final invoice; if the work done comes to less than a deposit you paid, I refund the difference. You can pay by bank transfer (ACH), card, check, Zelle, or wire. If an invoice is more than 30 days overdue, I may pause work until it is paid, after telling you.

## What you provide

You give me timely answers, the access the work needs, and accounts held in your organization's name. Please don't put passwords or other secrets in 1NEON.

## Ownership

Once you have paid for a project, what I made for you in it is yours. I keep my general know-how and the tools I had before or build for my own use, and open-source software stays under its own license.

## Confidentiality

We each keep what we learn about the other's business private, and use it only for the work. This doesn't cover what is already public, what the law requires us to disclose, or what your choices below allow.

## Case studies

Good work is worth showing. If you're fine with it, I may use what I did and measured on your projects in case studies, blog posts, and other examples of my work. They're anonymous: nothing that names or points to you or your people, and none of your data or confidential details. A quote or logo always takes a separate yes.

You choose when you sign:

- **Yes, anonymized is fine.**
- **Decide later.** I ask you about a project before I write about it.
- **No.** I don't write about your projects.

## Using your name

You also choose whether I may list your organization's name as a client: **ask me first**, **yes**, or **no**. A name on a list doesn't link you to an anonymized case study.

An admin can change either choice in 1NEON at any time, and the change applies from then on. Ask me to take down something I published about your work, and I remove it from the places I control.

## Regulated data

I don't handle health records, payment card data, or similar regulated personal data unless we sign a separate agreement for it first, such as a business associate agreement.

## Records

I keep project records, signed approvals, invoices, and receipts, and I don't delete them on a schedule. If you ask me to delete something, I will, except what the law requires me to keep.

## Quality

I do the work with care. If something I delivered doesn't work as agreed and you tell me within 30 days of handover, I fix it at no charge.

## Limits

My total liability for any claim is limited to what you paid me for that project in the 12 months before the claim. Neither of us is liable to the other for indirect or consequential losses, such as lost profits.

## Ending

Either of us may end this agreement with 14 days' written notice, by message in 1NEON or by email. You pay for the work done and the purchases made up to that point.

## Signing and law

We agree to sign and keep these records electronically, and a name typed in 1NEON is a signature. You can ask me for a paper copy at any time. New York law governs this agreement.
`;


/** What a signer agrees to before their typed name counts as a signature (ESIGN and New York ESRA) */
export const SIGN_CONSENT = "I agree to sign electronically. My typed name is my signature, and I can ask neon1 for a paper copy at any time.";


/** The choices an organization makes with the agreement, in the order shown. Every option is shown
 * with the same weight; `start` is what the form has selected before anyone picks */
export const AGREEMENT_CHOICES = [
  {
    id: "caseStudies", question: "Anonymous case studies of our projects", start: "yes",
    options: [
      { value: "yes", label: "Yes, that's fine", hint: "Nothing names or points to you" },
      { value: "later", label: "Decide later", hint: "Ask us about a project first" },
      { value: "no", label: "No", hint: "Don't write about our projects" },
    ],
  },
  {
    id: "naming", question: "Our organization's name on neon1's client list", start: "ask",
    options: [
      { value: "ask", label: "Ask us first", hint: "" },
      { value: "yes", label: "Yes, list us", hint: "" },
      { value: "no", label: "No", hint: "" },
    ],
  },
] as const;


/** What an organization allows before anyone has chosen: nothing without asking */
export const UNCHOSEN: ChoiceValues = { caseStudies: "later", naming: "ask" };


/** What the signing form has selected to start */
export const STARTING_CHOICES: ChoiceValues = { caseStudies: "yes", naming: "ask" };


export type ChoiceValues = { caseStudies: "yes" | "later" | "no"; naming: "ask" | "yes" | "no" };


/** The label shown for one chosen value */
export const choiceLabel = (id: keyof ChoiceValues, value: string) => AGREEMENT_CHOICES.find((c) => c.id === id)?.options.find((o) => o.value === value)?.label ?? value;
