# Route intent map

What each route under neon1.tech/1NEON is for, and what it asks of search engines. `apps/web/src/lib/head.ts` applies this map (title, description, robots, canonical) on every navigation, and `head.test.ts` checks it. Indexing tags are a hint only. API authentication keeps account data private.

| Route | Who it's for | Indexing | Canonical |
|---|---|---|---|
| `/1NEON/` (sign-in) | Invited clients signing in | `noindex` | none |
| `/1NEON/o/...`, `/1NEON/all/...`, `/1NEON/me` | Signed-in clients and neon1 | `noindex` | none |
| `/1NEON/demo/...` | Prospects trying the interactive demo (in-browser, temporary) | `noindex` | none |
| `/1NEON/live...` | Prospects watching the guided walkthrough (fictional, resets on load) | `noindex` | none |
| `/1NEON/example` | Anyone: a sample project to read | indexable | `https://neon1.tech/1NEON/example` |
| `/1NEON/faqs` | Anyone: portal help | indexable | `https://neon1.tech/knowledge/faq/1neon-help/` (the same answers, published from neon1-corpus) |
| `/1NEON/privacy`, `/terms`, `/cookies` | Anyone: policies | indexable | the knowledge center's copy (`/knowledge/policies/<name>/`) |
| `/1NEON/faq`, `/1NEON/help` | Old addresses | redirect to `/1NEON/faqs` in the app | |

Notes:

- `noindex` pages stay crawlable (robots.txt doesn't block them), so crawlers can see the tag.
- Nothing uses the site's home page as a catch-all canonical.
- Code sets the tags after the app loads, so search engines that render JavaScript see them. Every route serves the same `index.html`, whose raw HTML has only the generic title and description. Route-specific tags in the raw HTML need a pre-rendered page or an edge rewrite for `/1NEON/example` and `/1NEON/faqs`, which belongs in neon1-site's hosting setup.
- Keep `apps/web/src/help/faqs.md` and `neon1-corpus/corpus/faq/1neon-help.md` word for word (links aside), since the knowledge page is canonical. Anchors use the same rule in both (`lib/faq.ts` `slug`).
- The policy pages match their knowledge-center copies, which are canonical. Search engines then rank the site's page instead of a portal screen.
- No inline scripts are added, so the content security policy is unchanged.
