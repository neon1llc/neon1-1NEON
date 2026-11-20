// apps/web/src/live/journey.ts - The free-account journey, start to finish: Noor, who runs a fictional
// building-supply yard, starts a free account from the sign-in screen, writes down what her project
// needs, and asks for an assessment; Pradeep at neon1 reads the request, answers in her project, and,
// after they talk, makes her account a client. The cursor follows whoever is acting, and the line under
// the controls says whose side it is. Every name, business, and form here is made up.


import { CONTACT_TO } from "../../../api/src/routes/contact.ts";
import { liveEngine } from "../lib/api.ts";
import type { Show, Stage } from "./player.ts";
import { MailWindow } from "./props.ts";
import { PRADEEP } from "./seed.ts";


const engine = async () => (await liveEngine())!;

// Noor, who isn't a client of anyone yet, and her business as she types it at sign-up
const NOOR = "noor@calderbuildingsupply.example";
const SHOP = "Calder Building Supply";
// The project she writes down, and the request inside it
const PROJECT = {
  name: "Answer the insurer's security questions",
  today: "Our insurer sent a cyber-coverage form with 31 questions. Our files sit on one office PC and a USB drive, and I can't answer about half of them.",
  outcome: "Honest answers by the deadline, the gaps listed, and the cheapest fixes first.",
  example: "The form asks whether we back up and have tested a restore. We back up when someone remembers, and we've never tried a restore.",
};


/** Noor's free account's pages (the address ends in a random part the sign-up chose) */
async function shop() {
  const me = await (await engine()).actAs<{ orgs: { slug: string; name: string }[] }>(NOOR, "/me");
  return `/o/${me.orgs.find((o) => o.name === SHOP)!.slug}`;
}

/** Open someone's inbox with everything 1NEON sent them so far; the caller closes it */
async function inbox(s: Stage, owner: string) {
  const mail = new MailWindow(owner);
  mail.fill((await engine()).outbox());
  await s.wait(700);
  return mail;
}

/** Open the newest message whose subject matches, the way a person would: click its row */
async function read(s: Stage, mail: MailWindow, subject: string | RegExp) {
  await s.click(() => mail.row(subject), 300);
  mail.open([...mail.el.querySelectorAll(".mail-row")].indexOf(mail.row(subject)!));
  await s.wait(700);
}

/** Switch whose screen this is: the same portal, as the other person sees it in their own browser */
async function become(s: Stage, email: string, path: string) {
  await s.signInAs(email);
  await s.open(path, 900);
}


/** The journey as a show: sign-up to client, both sides */
export const JOURNEY: Show = {
  id: "free",
  title: "From free account to client",
  blurb: "Sign up, write down a project, ask for an assessment, and become a client",
  intro: {
    heading: "Meet Noor",
    text: [
      "Noor runs Calder Building Supply, a fictional lumber and hardware yard with eleven employees. Her insurer sent a security questionnaire she can't fully answer. She isn't a client yet and would rather write things down before any call.",
      "Watch her start a free 1NEON account, write down what her project needs, and ask for an assessment. Then switch to Pradeep at neon1: he reads her request, answers in her project, and, after they talk, makes her account a client account.",
    ],
  },
  length: "about six minutes",
  end: "A free account, a written-down project, and a client.",
  recap: "Noor saw what a free account holds, signed up with a code by email, wrote down one project, and asked for an assessment. Pradeep read it, asked her a question in the project, and promoted her account to a client once they'd talked. Everything she wrote stayed where it was.",
  sections: [
    {
      id: "free-start",
      title: "Start for free",
      run: async (s) => {
        await s.say("Noor runs a fictional building-supply yard. She wants help with an insurance form, but not a call just yet");
        await s.think("I'd rather write it down first. Start for free.");
        await s.click({ sel: "button", text: "Start for free" }, 900);
        await s.say("Before she types anything, the form says what a free account holds");
        await s.hover(".signin-limits", 1400);
        await s.think("Three projects, kept 30 days after my last change. Fair.");
      },
    },
    {
      id: "free-form",
      title: "Create the account",
      run: async (s) => {
        await s.say("A few answers are needed. Website, place, and how she found neon1 are optional");
        await s.type("#su-email", NOOR, 200);
        await s.type("#su-name", "Noor Haddad", 200);
        await s.choose("#su-kind", "small", 300);
        await s.type("#su-org", SHOP, 300);
        await s.think("The rest is optional, but where we are helps. I'll add it.");
        await s.type("#su-city", "Hudson", 200);
        await s.choose("#su-state", "NY", 300);
        await s.choose("#su-found", "maps", 300);
        await s.click(".su-terms input", 400);
        await s.click({ sel: "button", text: "Create account" }, 1200);
      },
    },
    {
      id: "free-code",
      title: "Prove the email",
      run: async (s) => {
        await s.say("1NEON emails a code to prove the address. No password");
        await s.waitFor("#code", 8000);
        const mail = await inbox(s, NOOR);
        let code = "";
        try {
          await read(s, mail, "sign-in code");
          code = mail.code()?.value ?? "";
          await s.think(`${code}. Back to 1NEON.`);
          await s.hover(() => mail.code()?.el, 700);
        } finally {
          await mail.close();
        }
        await s.type("#code", code, 400);
        await s.click({ sel: "form button", text: "Sign in" }, 1600);
      },
    },
    {
      id: "free-home",
      title: "Her free account",
      run: async (s) => {
        // The first time in, 1NEON offers a one-minute tour; she skips it for now
        const offer = await s.waitFor({ sel: "dialog[open] h2", text: "New here?" }, 8000).catch(() => undefined);
        if (offer) {
          await s.think("A tour? Maybe later.");
          await s.click({ sel: "dialog[open] button", text: "Skip" }, 900);
        }
        await s.say("Home says what a free account is for, with the sample project, walkthrough, and FAQs beside it");
        await s.hover(".prospect-note", 1400);
        await s.say("It also says how long the account is kept, and offers a download");
        await s.hover(".keep-card", 1200);
        await s.think("Kept 30 days after my last change. I'd like a little longer while I decide.");
        await s.say("Keep it 30 more days adds 30 days to the date shown, once");
        await s.click({ sel: ".keep-card button", text: "Keep it 30 more days" }, 1400);
        await s.hover(".keep-card strong", 1000);
      },
    },
    {
      id: "free-needs",
      title: "Write down the needs",
      run: async (s) => {
        await s.say("She writes down one project: what happens now, what she wants, and a real example");
        await s.go(`${await shop()}/projects`, "Projects");
        await s.click({ sel: "a, button", text: "New project" }, 700);
        await s.think("Security readiness. That's the closest.");
        await s.click({ sel: "label.option", text: "Security readiness" }, 500);
        await s.click({ sel: "button", text: /^Next$/ }, 700);
        await s.type("#n", PROJECT.name);
        await s.type("#s", PROJECT.today);
        await s.type("#o", PROJECT.outcome);
        await s.think("The backup question is the best example.");
        await s.type("#x", PROJECT.example);
        await s.click({ sel: "button", text: /^Next$/ }, 700);
        await s.think("How I'd know it worked: fewer questions I can't answer.");
        await s.type("#mt0", "Form questions we can't answer");
        await s.type("#mu0", "questions");
        await s.type("#mb0", "16");
        await s.type("#mg0", "2");
        await s.click({ sel: "button", text: /^Next$/ }, 900);
        await s.click({ sel: "button", text: "Create project" }, 1600);
      },
    },
    {
      id: "free-ask",
      title: "Ask for an assessment",
      run: async (s) => {
        await s.say("Home's Next step shows how far her project is outlined, with a tip for what would help");
        await s.go(`${await shop()}/workspace`, "Home");
        await s.hover(".outline-list li", 1200);
        await s.think("It's ticked already. One note for him, and it goes.");
        await s.type("#ask-note", "The insurer's deadline is the end of the month. Weekday mornings are best if a call helps.", 300);
        await s.click({ sel: ".next-step-ask button", text: "Request assessment" }, 1000);
        // A project that could say more gets one last look, which she can skip
        const review = await s.waitFor({ sel: "dialog[open] h2", text: "Before it goes" }, 2500).catch(() => undefined);
        if (review) await s.click({ sel: "dialog[open] button", text: "Send it anyway" }, 1200);
        await s.think("Sent. The reply comes by email.");
        await s.hover(".outline-list li.sent", 900);
      },
    },
    {
      id: "free-pradeep",
      title: "Pradeep answers",
      run: async (s) => {
        await s.say("Now Pradeep's side: the request reaches neon1's inbox");
        const mail = await inbox(s, CONTACT_TO);
        try {
          await read(s, mail, "Assessment requested");
          await s.think("A new free account, with a written-down project. Let me look.");
          await s.hover(() => mail.link("Open the account"), 900);
          await s.click(() => mail.link("Open the account"), 500);
        } finally {
          await mail.close();
        }
        const base = await shop();
        await become(s, PRADEEP, `${base}/workspace`);
        await s.say("He opens her project, as neon1 can in every account");
        await s.go(`${base}/projects`, "Projects");
        await s.click({ sel: ".ptr a, .tl-row a", text: PROJECT.name }, 1000);
        await s.think("Clear enough to assess. One question first.");
        await s.click({ sel: "nav.tabs a", text: "Needs" }, 900);
        await s.click({ sel: ".item-open", text: "One real example" }, 900);
        await s.say("He asks his question in a comment, which she sees in 1NEON and by email");
        await s.type('textarea[aria-label="Write a comment"]', "Thanks, Noor. How many people use the office PC, and is the register on the same network?");
        await s.click({ sel: ".comment-box button", text: "Send" }, 1000);
        await s.click('dialog[open] button[aria-label="Close"]', 600);
      },
    },
    {
      id: "free-reply",
      title: "Noor replies",
      run: async (s) => {
        await become(s, NOOR, `${await shop()}/workspace`);
        await s.say("Back on Noor's screen, the bell has something new");
        await s.click(".bell-btn", 1400);
        await s.think("Pradeep has a question.");
        await s.click({ sel: ".bell-list a.note", text: /comment/i }, 1000);
        await s.think("It took me to the item he asked about.");
        await s.click({ sel: ".item-open", text: "One real example" }, 900);
        await s.type('textarea[aria-label="Write a comment"]', "Five people use it, and yes, the register is on the same network. The insurer wants the form back by the end of next month.");
        await s.click({ sel: ".comment-box button", text: "Send" }, 1000);
        await s.click('dialog[open] button[aria-label="Close"]', 600);
        await s.say("They talk for thirty minutes, and she'd like to go ahead");
        await s.wait(1200);
      },
    },
    {
      id: "free-promote",
      title: "Make it a client",
      run: async (s) => {
        // Potentials sits under the organization switcher; his screen opens on it
        await become(s, PRADEEP, "/all/prospects");
        await s.say("Pradeep's side again: Potentials lists everyone who signed themselves up");
        await s.hover({ sel: "section.prospect", text: SHOP }, 1200);
        await s.think("Calder Building Supply, Hudson, found us on Google Maps. Promote.");
        await s.click({ sel: "section.prospect button", text: "Promote" }, 900);
        await s.say("Promoting gives the next client ID and lifts every limit. Nothing in her work changes");
        await s.click({ sel: "dialog[open] button", text: "Promote" }, 1400);
      },
    },
    {
      id: "free-client",
      title: "A client account",
      run: async (s) => {
        await become(s, NOOR, `${await shop()}/workspace`);
        await s.say("On Noor's Home, the free-account note and the keep date are gone");
        await s.hover("h1", 1000);
        await s.think("No more expiry date. I'm a client now.");
        await s.say("Her project is right where she left it, and the work goes on from there");
        await s.go(`${await shop()}/projects`, "Projects");
        await s.think("Same project, same notes. Now the real work starts.");
        await s.hover({ sel: ".ptr, .tl-row", text: PROJECT.name }, 1400);
      },
    },
  ],
};
