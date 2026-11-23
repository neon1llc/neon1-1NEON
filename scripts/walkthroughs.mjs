// scripts/walkthroughs.mjs - Plays every guided walkthrough in a real browser, the way a visitor would,
// and fails if one doesn't reach its end card. Beyond a straight play it does what visitors do: jump
// between chapters, go back, pause and poke at the page, reload partway, turn the phone, and leave the
// tab. Run after `npm run build`:
//
//   node scripts/walkthroughs.mjs                      every walkthrough, desktop and phone, played through
//   node scripts/walkthroughs.mjs --shows preview --scenarios play,jumps,reload,explore,rotate,away
//   node scripts/walkthroughs.mjs --sizes tablet --browser webkit
//
// It serves the build itself. The site's shared styles come from NEON1_SITE_DIR (a local checkout of
// neon1-site's public folder) or, without it, from neon1.tech.


import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";


// --- What to run ------------------------------------------------------------------------

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

// The walkthroughs by their ?play= value: the short preview (the bare address), the full story, the
// short demos, and each chapter of the story that an FAQ links to on its own
const SHORTS = ["preview", "full", "free", "invite", "passkey", "authenticator", "texts", "calendar"];
const CHAPTERS = ["profile", "team", "start", "needs", "listen", "propose", "decide", "pay", "build", "observe", "handover", "final", "care"];
const SIZES = {
  desktop: { width: 1280, height: 800 },
  laptop: { width: 1024, height: 640 },
  tablet: { width: 820, height: 1180 },
  phone: { width: 390, height: 844 },
  small: { width: 360, height: 640 },
  landscape: { width: 844, height: 390 },
  // An iPhone in DuckDuckGo: its user agent turns on the page that stays still while the body scrolls (lib/edge.ts)
  ddg: { width: 390, height: 844 },
};
const DDG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15";
const shows = arg("shows", [...SHORTS, ...CHAPTERS].join(",")).split(",").filter(Boolean);
const sizes = arg("sizes", "desktop,phone").split(",").filter(Boolean);
const scenarios = arg("scenarios", "play").split(",").filter(Boolean);
// The made-up engagements the story can follow (?scenario=); the first is what the bare address plays. A
// plain run also plays the other two through the preview and the full story, so none of them rots
const ENGAGEMENTS = ["harborline", "quillwork", "fenwick"];
const engagements = arg("engagements", "").split(",").filter(Boolean);
const engine = { chromium, firefox, webkit }[arg("browser", "chromium")];
const workers = Number(arg("workers", "4"));
const verbose = process.argv.includes("--verbose");
// How long one walkthrough may take at double speed before it counts as stuck
const LIMIT = Number(arg("limit", "720")) * 1000;
// Every run plays at double speed, the fastest a visitor can pick
const SPEED = 2;
// A failed run gets this many more tries. On CI's shared machines one retry keeps a slow moment from
// blocking a release; a run that only passes on a retry is still named in the output
const RETRIES = Number(arg("retries", process.env.CI ? "1" : "0"));


// --- A small server for the build -----------------------------------------------------------

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = join(ROOT, "apps/web/dist/1NEON");
const SITE_DIR = process.env.NEON1_SITE_DIR;
const SITE = process.env.NEON1_SITE ?? "https://neon1.tech";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain", ".webp": "image/webp" };
// The content policy neon1.tech sends with every page, so anything it would refuse there (an inline
// style, a script from elsewhere) is refused here too and fails the run as a console error. Images
// may also come from neon1.tech itself, which is "self" there: the emails in the story link their logo by its full address
const POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://neon1.tech; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const isFile = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };
// Shared site files fetched once from neon1.tech when there's no local checkout
const fetched = new Map();

/** /1NEON/* from the build (any unknown path is the app, as CloudFront serves it); the rest from the site */
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const send = (body, type, code = 200) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...(type.startsWith("text/html") ? { "content-security-policy": POLICY } : {}) }); res.end(body); };
    if (path.startsWith("/1NEON")) {
      const rel = normalize(path.replace(/^\/1NEON\/?/, ""));
      const file = !rel.startsWith("..") && (await isFile(join(APP, rel))) ? join(APP, rel) : join(APP, "index.html");
      return send(await readFile(file), TYPES[extname(file)] ?? "application/octet-stream");
    }
    if (SITE_DIR) {
      const rel = normalize(path);
      const file = join(SITE_DIR, rel === "/" ? "index.html" : rel);
      if (rel.includes("..") || !(await isFile(file))) return send("not found", "text/plain", 404);
      return send(await readFile(file), TYPES[extname(file)] ?? "application/octet-stream");
    }
    if (!fetched.has(path)) {
      const r = await fetch(SITE + path);
      fetched.set(path, { code: r.status, type: r.headers.get("content-type") ?? "application/octet-stream", body: Buffer.from(await r.arrayBuffer()) });
    }
    const f = fetched.get(path);
    send(f.body, f.type, f.code);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${server.address().port}`;


// --- Reading the walkthrough's state off the page ------------------------------------------------

/** What a visitor would see: the chapter in the bar, the narration, and which card is up, if any */
const state = (page) => page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? "";
  const eye = text(".live-card .live-card-eye");
  return {
    title: text(".live-title"),
    line: text(".live-sub.on"),
    eye,
    card: !eye ? "" : eye.startsWith("The end") ? "end" : eye.startsWith("Stopped") ? "failed" : "intro",
    paused: Boolean(document.querySelector('.live-play[aria-label="Play"]')),
    chapter: Number(/^(\d+)\//.exec(text(".live-title"))?.[1] ?? 0),
    of: Number(/^\d+\/(\d+)/.exec(text(".live-title"))?.[1] ?? 0),
    // How far the portal's top bar sits from the bottom of the narration band; 0 when it's where it belongs
    barGap: (() => {
      const bar = document.querySelector(".top")?.getBoundingClientRect();
      const sub = document.querySelector(".live-sub")?.getBoundingClientRect();
      return bar && sub && bar.height > 0 ? Math.round(bar.top - sub.bottom) : 0;
    })(),
  };
}).catch(() => ({ title: "", line: "", eye: "", card: "", paused: false, chapter: 0, of: 0 }));

// The intro card says how long the walkthrough takes ("about two minutes"). Read as seconds, with the
// range that still counts as true: 40% either way, or the two ends of "a minute or two" or "a few minutes"
const WORDS = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function statedLength(eye) {
  if (/a minute or two/.test(eye)) return { said: "a minute or two", low: 40, high: 160 };
  if (/a few minutes/.test(eye)) return { said: "a few minutes", low: 60, high: 240 };
  const m = /about (a|one|two|three|four|five|six|seven|eight|nine|ten|\d+) minutes?( and a half)?/.exec(eye);
  if (!m) return undefined;
  const sec = ((WORDS[m[1]] ?? Number(m[1])) + (m[2] ? 0.5 : 0)) * 60;
  return { said: m[0], low: sec * 0.6, high: sec * 1.4 };
}

/** Wait until `test(state)` holds; a stumble card or the time limit fails the run */
async function until(page, test, what, limit = LIMIT) {
  const end = Date.now() + limit;
  let s;
  let offBar = 0;
  while (Date.now() < end) {
    s = await state(page);
    if (s.card === "failed") throw new Error(`stopped at "${s.title}" while waiting for ${what}`);
    // The portal's top bar sticks right under the narration. Twice in a row off by more than a couple
    // of pixels is the bar drawn partway down the page (as WebKit did where the body scrolls), not a frame mid-slide
    offBar = !s.card && Math.abs(s.barGap) > 2 ? offBar + 1 : 0;
    if (offBar >= 2) throw new Error(`the portal's top bar is ${s.barGap}px from the narration band at "${s.title}"; it should sit right under it`);
    if (test(s)) return s;
    await page.waitForTimeout(150);
  }
  throw new Error(`timed out waiting for ${what}; last seen "${s?.title}" / "${s?.line}" / card "${s?.card}"`);
}

const address = (show, engagement) => {
  if (show === "demo") return `${BASE}/1NEON/demo/`;
  const q = [show === "preview" ? "" : `play=${show}`, engagement ? `scenario=${engagement}` : ""].filter(Boolean).join("&");
  return `${BASE}/1NEON/live${q ? `?${q}` : ""}`;
};
const press = (page, label) => page.locator(".live-card .live-btn", { hasText: label }).first().click();


// --- What visitors do --------------------------------------------------------------------------

const SCENARIOS = {
  /** The interactive demo (not a walkthrough): its landing takes the site's bar and the chosen theme, Neo sits bottom left
   * there and bottom right once a person is picked, and "report a bug" is a new-tab link inside */
  async demo(page) {
    const { width } = page.viewportSize();
    const mode = await page.evaluate(() => { try { return localStorage.getItem("neon1.mode"); } catch { return null; } });
    await page.waitForSelector(".signin .demo-pick", { timeout: 20_000 });
    if (!(await page.locator(".n1-bar.pub-bar .n1-logo").count()) || !(await page.locator(".n1-bar.pub-bar [role=switch]").count())) throw new Error("the demo landing lacks the sign-in's bar (logo left, theme switch right)");
    const awake = (await page.locator(".signin.awake").count()) > 0;
    if (awake !== (mode !== "dark")) throw new Error(`the demo landing shows ${awake ? "awake" : "dark"} while the saved mode is ${mode ?? "unset"}`);
    const side = async () => { const b = await page.locator(".n1chat-launch").first().boundingBox({ timeout: 15_000 }); return b.x + b.width / 2 < width / 2 ? "left" : "right"; };
    if ((await side()) !== "left") throw new Error("Neo isn't bottom left on the demo landing");
    await page.getByRole("button", { name: /Priya Raman/ }).click();
    await page.waitForSelector(".shell", { timeout: 20_000 });
    await page.waitForTimeout(800);
    if ((await side()) !== "right") throw new Error("Neo isn't bottom right inside the demo");
    const href = await page.locator("a.bug-link").first().getAttribute("href", { timeout: 5000 }).catch(() => null);
    if (!href || !href.startsWith("/report-bug/")) throw new Error("the demo menu has no Report a bug link to the same origin's /report-bug/ page");
  },

  /** Press Start and watch it to the end */
  async play(page) {
    const intro = await until(page, (s) => s.card === "intro", "the intro card", 20_000);
    await press(page, "Start");
    // The clock starts once the first chapter is on screen: setting up an FAQ chapter isn't playing time
    await until(page, (s) => s.chapter >= 1, "chapter 1");
    const t0 = Date.now();
    await until(page, (s) => s.card === "end", "the end card");
    // Played at double speed, so the time at the default speed is twice what it took here
    const took = ((Date.now() - t0) / 1000) * SPEED;
    const stated = statedLength(intro.eye);
    if (stated && (took < stated.low || took > stated.high)) throw new Error(`says it takes "${stated.said}" but took ${Math.round(took)} seconds at the default speed; correct its length`);
    // With --verbose, the measured length is printed, for setting what each intro card says
    if (verbose) console.log(`      ${Math.round(took)}s at the default speed; says "${stated?.said ?? "nothing"}"`);
  },

  /** Skip ahead a chapter at a time as soon as each begins, then step back through every one, then on to the end */
  async jumps(page) {
    await until(page, (s) => s.card === "intro", "the intro card", 20_000);
    await press(page, "Start");
    const first = await until(page, (s) => s.chapter === 1, "chapter 1");
    for (let k = 2; k <= first.of; k++) {
      await page.locator(".live-step.fwd").click();
      await until(page, (s) => s.chapter === k && Boolean(s.line), `chapter ${k} to start playing`);
    }
    for (let k = first.of - 1; k >= 1; k--) {
      await page.locator(".live-step.back").click();
      await until(page, (s) => s.chapter === k && Boolean(s.line), `chapter ${k} after Back`);
    }
    // From the menu, straight to the last chapter, and let it end
    await page.locator(".live-now").click();
    await page.locator("#live-list ol button").last().click();
    await until(page, (s) => s.card === "end", "the end card");
  },

  /** Reload in the middle; the card offers to carry on, and it plays to the end from there */
  async reload(page, show) {
    await until(page, (s) => s.card === "intro", "the intro card", 20_000);
    await press(page, "Start");
    const first = await until(page, (s) => s.chapter >= 1, "the first chapter");
    const mid = Math.max(2, Math.ceil(first.of / 2));
    await until(page, (s) => s.chapter === mid && Boolean(s.line), `chapter ${mid}`);
    await page.reload();
    await until(page, (s) => s.card === "intro", "the card after a reload", 20_000);
    const words = await page.locator(".live-card").innerText();
    // One chapter on its own (a link from help) is a sign-in and one thing: a reload starts it again.
    // Everything longer offers to carry on from the chapter it was in
    const again = CHAPTERS.includes(show);
    if (!again && !/Pick up where you left off/.test(words)) throw new Error("a reload partway through didn't offer to carry on");
    await press(page, again ? "Start" : "Continue");
    await until(page, (s) => s.card === "end", "the end card");
    // And again from the end: Watch again starts over without a reload
    await press(page, "Watch again");
    await until(page, (s) => s.chapter === 1 && Boolean(s.line), "chapter 1 after Watch again");
  },

  /** Pause in each chapter, click around the portal underneath, and play on */
  async explore(page) {
    await until(page, (s) => s.card === "intro", "the intro card", 20_000);
    await press(page, "Start");
    const first = await until(page, (s) => s.chapter === 1, "chapter 1");
    for (let k = 1; k <= first.of; k++) {
      await until(page, (s) => s.chapter === k && Boolean(s.line), `chapter ${k}`);
      await page.waitForTimeout(1500);
      await page.keyboard.press("Space");
      await until(page, (s) => s.paused, "pause");
      // A visitor pokes at whatever is on screen: the first few things that can be clicked
      for (const sel of ["#root a[href]:visible", "#root button:visible", "#root summary:visible"]) {
        const el = page.locator(sel).first();
        if (await el.count()) await el.click({ timeout: 1500, trial: false }).catch(() => undefined);
      }
      await page.keyboard.press("Escape");
      await page.locator(".live-play").click();
      await until(page, (s) => !s.paused, "play again");
      if (k < first.of) await until(page, (s) => s.chapter > k || s.card === "end", `chapter ${k} to finish after exploring`);
    }
    await until(page, (s) => s.card === "end", "the end card");
  },

  /** Turn the phone (or resize the window) every few seconds while it plays */
  async rotate(page) {
    const size = page.viewportSize();
    await until(page, (s) => s.card === "intro", "the intro card", 20_000);
    await press(page, "Start");
    let flip = false;
    const end = Date.now() + LIMIT;
    while (Date.now() < end) {
      const s = await state(page);
      if (s.card === "failed") throw new Error(`stopped at "${s.title}" after turning the screen`);
      if (s.card === "end") return;
      flip = !flip;
      await page.setViewportSize(flip ? { width: size.height, height: size.width } : size);
      await page.waitForTimeout(4000);
    }
    throw new Error("timed out while turning the screen");
  },

  /** Leave the tab and come back, twice in every chapter */
  async away(page) {
    await until(page, (s) => s.card === "intro", "the intro card", 20_000);
    await press(page, "Start");
    const hide = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
    // Away for a third of the time, and a moment to pick up on each return: allow twice the usual limit
    const end = Date.now() + LIMIT * 2;
    while (Date.now() < end) {
      const s = await state(page);
      if (s.card === "failed") throw new Error(`stopped at "${s.title}" after leaving the tab`);
      if (s.card === "end") return;
      await page.waitForTimeout(3000);
      await hide(true);
      await page.waitForTimeout(1200);
      await hide(false);
    }
    throw new Error("timed out while leaving and returning to the tab");
  },
};


// --- Running ---------------------------------------------------------------------------------

const browser = await engine.launch();
const jobs = [];
for (const show of shows) for (const size of sizes) for (const scenario of scenarios) jobs.push({ show, size, scenario });
// The other engagements: the preview and the full story, on the first size named (the phone's the
// tighter one, so a plain run uses it for the preview and the desktop for the full story). Longest first
{
  const named = engagements.length ? engagements : process.argv.some((a) => a === "--shows" || a.startsWith("--shows=")) ? [] : ENGAGEMENTS.slice(1);
  for (const engagement of named) {
    if (shows.includes("full") || !process.argv.includes("--shows")) jobs.unshift({ show: "full", size: sizes[0], scenario: "play", engagement });
    if (shows.includes("preview") || !process.argv.includes("--shows")) jobs.push({ show: "preview", size: sizes.at(-1), scenario: "play", engagement });
  }
}
// The demo's landing is checked in both themes; "--shows demo --scenarios demo" runs only it
const demoJobs = (sizes) => sizes.flatMap((size) => ["awake", "matrix"].map((theme) => ({ show: "demo", size, scenario: "demo", theme })));
// With no --shows given, the demo's landing is checked too, in both themes, at each size
if (!process.argv.some((a) => a === "--shows" || a.startsWith("--shows="))) jobs.push(...demoJobs(sizes));
else if (shows.includes("demo")) jobs.splice(0, jobs.length, ...demoJobs(sizes));
const failures = [];
let done = 0;

const retried = [];

/** One walkthrough, one screen size, one scenario, in a fresh browser profile at double speed */
async function run({ show, size, scenario, theme, engagement }, tries = RETRIES) {
  const name = `${show} · ${size} · ${scenario}${theme ? ` · ${theme}` : ""}${engagement ? ` · ${engagement}` : ""}`;
  const ctx = await browser.newContext({ viewport: SIZES[size], ignoreHTTPSErrors: true, hasTouch: ["phone", "small", "landscape", "tablet", "ddg"].includes(size), ...(size === "ddg" ? { userAgent: DDG_UA } : {}) });
  // The landing's theme: the browser's mode (and the matrix family when dark), as the site and portal share them
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem("neon1.mode", t === "matrix" ? "dark" : "light"); localStorage.setItem("neon1.style", "matrix"); } catch { /* blocked */ } }, theme);
  await ctx.addInitScript((speed) => { try { localStorage.setItem("1neon.liveSpeed", `2:${speed}`); } catch { /* blocked */ } }, SPEED);
  const page = await ctx.newPage();
  const problems = [];
  // The player warns ("live: …") when a step had no visible way to happen; errors are errors
  page.on("console", (m) => { if (/^live: /.test(m.text()) || m.type() === "error") problems.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
  page.on("pageerror", (e) => problems.push(`page error: ${String(e).slice(0, 240)}`));
  const t0 = Date.now();
  try {
    await page.goto(address(show, engagement));
    await SCENARIOS[scenario](page, show);
    // A missing shared file or a blocked font isn't the walkthrough's doing; anything else is
    const real = problems.filter((p) => !/Failed to load resource|net::ERR|favicon/.test(p));
    if (real.length) throw new Error(real.join("\n      "));
    if (verbose) console.log(`ok    ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (e) {
    const shot = join(ROOT, `walkthrough-failure-${show}-${size}-${scenario}${engagement ? `-${engagement}` : ""}.png`);
    await page.screenshot({ path: shot }).catch(() => undefined);
    // Where the page was and what it was saying: a refused request shows as a notice, not in the console
    const seen = await page.evaluate(() => `at ${location.pathname.replace("/1NEON/live", "") || "/"}${location.hash}${[...document.querySelectorAll(".toast, [role=alert]")].map((n) => `; on screen: ${n.textContent.trim().slice(0, 160)}`).join("")}`).catch(() => "");
    const why = `${name}\n      ${String(e.message ?? e)}${seen ? `\n      ${seen}` : ""}${problems.length ? `\n      console: ${problems.slice(0, 4).join(" | ")}` : ""}`;
    if (tries > 0) {
      console.log(`retry ${name}`);
      retried.push(why);
      await ctx.close();
      return run({ show, size, scenario, theme, engagement }, tries - 1);
    }
    failures.push(why);
    console.log(`FAIL  ${name}`);
  }
  await ctx.close().catch(() => undefined);
  done++;
  if (!verbose && done % 5 === 0) console.log(`${done}/${jobs.length} done`);
}

// A few at a time: each is a real page doing real clicks, and too many at once slows them all down
const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) await run(job);
}));
await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} of ${jobs.length} walkthrough runs failed:\n\n  ${failures.join("\n\n  ")}\n`);
  process.exit(1);
}
// Runs that needed a second try passed, but they're worth a look: say which, and why the first try failed
const flaky = retried.filter((why) => !failures.some((f) => f.split("\n")[0] === why.split("\n")[0]));
if (flaky.length) console.log(`\n${flaky.length} run${flaky.length === 1 ? "" : "s"} passed only on a retry:\n\n  ${flaky.join("\n\n  ")}\n`);
console.log(`All ${jobs.length} walkthrough runs reached their end.`);
