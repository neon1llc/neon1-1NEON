// a11y/portal.mjs - Audit the signed-in demo portal with axe and keyboard probes.
// Run after `npm run build --workspace @1neon/web`:
//
//   node a11y/portal.mjs
//   node a11y/portal.mjs --roles priya --themes sentinel-light --viewports desktop


import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";


// The demo identities exercise an organization admin, an editor, and the neon1 operator.
const ROLES = {
  priya: { name: "Priya Raman", email: "priya@harborlineoutfitters.example", orgs: ["harborline-outfitters"] },
  tomas: { name: "Tomas Greer", email: "tomas@harborlineoutfitters.example", orgs: ["harborline-outfitters"] },
  pradeep: { name: "Pradeep", email: "pradeep@neon1.tech", orgs: ["neon1", "harborline-outfitters", "ridgeview-auto"] },
};

// Each routed screen is checked after authentication; all project tabs and seeded project records
// cover the route variants declared in the router, while visible links add concrete record routes.
const PROJECTS = {
  neon1: ["PRJ-1"],
  "harborline-outfitters": ["FLOW-1", "SEC-1", "AI-1"],
  "ridgeview-auto": ["MIG-1", "NET-1"],
};
const THEMES = {
  "sentinel-light": { style: "sentinel", mode: "light", colorScheme: "light" },
  "sentinel-dark": { style: "sentinel", mode: "dark", colorScheme: "dark" },
  "matrix-light": { style: "matrix", mode: "light", colorScheme: "light" },
  "matrix-dark": { style: "matrix", mode: "dark", colorScheme: "dark" },
};
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } };
const ARG = (name, fallback) => {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const selected = (all, raw) => raw.split(",").map((name) => {
  if (!all[name]) throw new Error(`Unknown selection: ${name}`);
  return [name, all[name]];
});
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = join(ROOT, "apps/web/dist/1NEON");
const AXE = join(ROOT, "node_modules/axe-core/axe.min.js");
const BASELINE = JSON.parse(await readFile(join(ROOT, "a11y/findings-baseline.json"), "utf8"));
const EVIDENCE_DIR = process.env.A11Y_EVIDENCE_DIR ?? join(tmpdir(), "1neon-a11y-evidence");
const ROLES_SELECTED = selected(ROLES, ARG("roles", Object.keys(ROLES).join(",")));
const THEMES_SELECTED = selected(THEMES, ARG("themes", Object.keys(THEMES).join(",")));
const VIEWPORTS_SELECTED = selected(VIEWPORTS, ARG("viewports", Object.keys(VIEWPORTS).join(",")));
const REQUESTED_ROUTES = ARG("routes", "").split(",").filter(Boolean);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webp": "image/webp" };
const POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://neon1.tech; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const SPACING_CSS = "* { letter-spacing: .12em !important; word-spacing: .16em !important; line-height: 1.5 !important; } p { margin-block-end: 2em !important; }";
const failures = [];
const routeErrors = [];
const observedStates = [];
const findings = new Map();
const results = [];
const fetched = new Map();

// The built app stays local; shared design files mirror the production asset origin used by Vite.
const isFile = async (path) => { try { return (await stat(path)).isFile(); } catch { return false; } };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://local").pathname);
    const send = (body, type, status = 200) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...(type.startsWith("text/html") ? { "content-security-policy": POLICY } : {}) });
      res.end(body);
    };
    if (path.startsWith("/1NEON")) {
      const rel = normalize(path.replace(/^\/1NEON\/?/, ""));
      const file = !rel.startsWith("..") && (await isFile(join(APP, rel))) ? join(APP, rel) : join(APP, "index.html");
      return send(await readFile(file), TYPES[extname(file)] ?? "application/octet-stream");
    }
    if (path === "/a11y/axe.min.js") return send(await readFile(AXE), "text/javascript");
    if (path === "/a11y/spacing.css") return send(SPACING_CSS, "text/css");
    if (!fetched.has(path)) {
      const response = await fetch(`https://neon1.tech${path}`);
      fetched.set(path, { status: response.status, type: response.headers.get("content-type") ?? "application/octet-stream", body: Buffer.from(await response.arrayBuffer()) });
    }
    const file = fetched.get(path);
    send(file.body, file.type, file.status);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

// The route seeds follow the router's public signed-in branches and the fictional database records.
function seedRoutes(role) {
  const paths = new Set();
  for (const slug of role.orgs) {
    const base = `/1NEON/demo/o/${slug}`;
    for (const route of ["workspace", "workflow", "projects", "projects/new", "agreement", "people", "documents", "settings"]) paths.add(`${base}/${route}`);
    for (const key of PROJECTS[slug]) {
      paths.add(`${base}/projects/${key}`);
      for (const tab of ["needs", "execute", "observe", "normalize"]) paths.add(`${base}/projects/${key}/${tab}`);
      paths.add(`${base}/projects/${key}/proposal`);
    }
  }
  if (role.email === ROLES.pradeep.email) for (const route of ["workflow", "prospects", "me", "contact"]) paths.add(`/1NEON/demo/all/${route}`);
  else paths.add("/1NEON/demo/me");
  return [...paths];
}

// Capture every same-app route reachable from a rendered page, including concrete invoices and
// notification destinations that the seeded route list cannot name without reading demo records.
async function linkedRoutes(page) {
  return page.locator("a[href]").evaluateAll((links) => links.map((link) => {
    try {
      const url = new URL(link.href, location.href);
      const portal = /^\/1NEON\/demo\/(?:o\/[^/]+\/|all\/|me(?:\/|$))/.test(url.pathname);
      return url.origin === location.origin && portal ? url.pathname : "";
    } catch { return ""; }
  }).filter(Boolean));
}

// Run axe's WCAG A/AA rules and identify each issue by rule plus affected selector for a stable baseline.
async function auditAxe(page, meta, state) {
  await page.addScriptTag({ url: `${BASE}/a11y/axe.min.js` });
  const report = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }));
  for (const item of report.violations) for (const node of item.nodes) {
    const selector = node.target.join(" ").slice(0, 500);
    const stableSelector = selector.replace(/#item-[A-Za-z0-9_-]+/g, "#item-*");
    const key = `${item.id}|${stableSelector}`;
    const context = { route: meta.route, role: meta.role, theme: meta.theme, viewport: meta.viewport, state };
    const previous = findings.get(key);
    if (previous) previous.contexts.push(context);
    else findings.set(key, { id: item.id, impact: item.impact ?? "unknown", selector, stableSelector, html: node.html.slice(0, 320), failureSummary: node.failureSummary, summary: item.help, helpUrl: item.helpUrl, ...context, contexts: [context], reason: "" });
  }
  return report.violations.length;
}

// A route must render the signed-in shell or its own documented missing/error state, never silently fail.
async function openRoute(page, meta, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("#root").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(50);
  const loading = await page.locator('[aria-busy="true"], [role="progressbar"]').count();
  if (loading) observedStates.push({ ...meta, state: "loading", indicators: loading });
  await page.waitForTimeout(800);
  const welcome = page.getByRole("dialog", { name: /welcome to 1neon/i });
  if (await welcome.isVisible().catch(() => false)) {
    await auditAxe(page, { ...meta, route: `${route} (welcome dialog)` }, "welcome-dialog");
    await welcome.getByRole("button", { name: "Skip", exact: true }).click();
  }
  const state = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent?.trim() ?? document.title,
    shell: Boolean(document.querySelector(".shell")),
    boot: document.querySelector("#boot-failed")?.hidden === false,
    text: (document.querySelector("#root")?.innerText ?? "").slice(0, 300),
  }));
  if (state.boot || (!state.shell && !/not found|couldn't|could not|try again/i.test(state.text))) {
    routeErrors.push({ ...meta, route, error: `Route did not reach the signed-in shell: ${state.text}` });
  }
  return state;
}

// Probe keyboard order, visible focus, and 24 CSS pixel target floors on a rendered route.
async function auditKeyboardAndTargets(page, meta) {
  await page.evaluate(() => { document.activeElement instanceof HTMLElement && document.activeElement.blur(); document.body.focus(); });
  const expected = await page.evaluate(() => [...document.querySelectorAll("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")]
    .filter((el) => { const box = el.getBoundingClientRect(); const style = getComputedStyle(el); return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none" && style.pointerEvents !== "none" && !el.closest("[inert]") && !el.closest('[aria-hidden="true"]'); })
    .map((el) => ({ tag: el.tagName, name: el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("name") || "", id: el.id })));
  const found = [];
  let missingFocusStyle = 0;
  let priorOrder = -1;
  for (let i = 0; i < Math.min(expected.length, 80); i++) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return null;
      const order = [...document.querySelectorAll("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")].indexOf(el);
      const box = el.getBoundingClientRect();
      let ring = false;
      for (let node = el, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
        const style = getComputedStyle(node);
        if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 || style.boxShadow !== "none") ring = true;
      }
      const style = getComputedStyle(el);
      return { tag: el.tagName, name: el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("name") || "", id: el.id, className: String(el.className), html: el.outerHTML.slice(0, 240), order, visible: box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth, ring, focusVisible: el.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, borderColor: style.borderColor, boxShadow: style.boxShadow };
    });
    if (!active) break;
    found.push(active);
    if (!active.ring) missingFocusStyle++;
    if (!active.visible) failures.push({ type: "focus-hidden", ...meta, element: active });
    if (active.order >= 0 && active.order < priorOrder) failures.push({ type: "focus-order-reversed", ...meta, previous: priorOrder, current: active.order });
    if (active.order >= 0) priorOrder = active.order;
  }
  if (expected.length && found.length === 0) failures.push({ type: "keyboard-unreachable", ...meta });
  if (missingFocusStyle) failures.push({ type: "focus-indicator", ...meta, count: missingFocusStyle, checked: found.length, elements: found.filter((item) => !item.ring).slice(0, 8) });

  const smallTargets = await page.evaluate(() => [...document.querySelectorAll("button,a[href],input,select,textarea,[role=button],[role=tab],[role=menuitem]")]
    .filter((el) => !el.classList.contains("sr") && !el.closest(".sr"))
    .filter((el) => { const target = el.closest("label") ?? el; const box = target.getBoundingClientRect(); const style = getComputedStyle(target); return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none" && style.pointerEvents !== "none" && !el.closest("[inert]") && !el.closest('[aria-hidden="true"]') && (box.width < 24 || box.height < 24); })
    .map((el) => {
      const target = el.closest("label") ?? el;
      const box = target.getBoundingClientRect();
      return { name: el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "", selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().replace(/\s+/g, ".")}` : ""}`, html: el.outerHTML.slice(0, 240), width: Math.round(box.width), height: Math.round(box.height), inlineLink: el.matches("a[href]") && Boolean(el.closest("p,li,td,dd")) };
    })
    .filter((target) => !target.inlineLink));
  if (smallTargets.length) failures.push({ type: "target-size-under-24", ...meta, targets: smallTargets.slice(0, 20) });
  return { expected: expected.length, visited: found.length, smallTargets: smallTargets.length };
}

// Exercise menu and command-palette dialog patterns with Escape, focus containment, and focus return.
async function auditOpenControls(page, meta) {
  const orgChooser = page.locator("button.org[aria-controls='org-list']:visible").first();
  if (await orgChooser.count()) {
    await orgChooser.click();
    const popover = page.locator("#org-list:visible");
    if (await popover.count()) {
      await auditAxe(page, meta, "organization-popover-open");
      await page.keyboard.press("Escape");
      await popover.waitFor({ state: "hidden" });
      if (await popover.count()) failures.push({ type: "escape-popover", ...meta });
      if (!await orgChooser.evaluate((el) => document.activeElement === el).catch(() => false)) failures.push({ type: "popover-focus-return", ...meta });
    }
  }

  const menu = page.getByRole("button", { name: "Menu", exact: true }).first();
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await auditAxe(page, meta, "menu-open");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    if (await page.locator(".side.open").count()) failures.push({ type: "escape-menu", ...meta });
    if (!await menu.evaluate((el) => document.activeElement === el).catch(() => false)) failures.push({ type: "menu-focus-return", ...meta });
  }

  const search = page.getByRole("button", { name: /search/i }).first();
  if (await search.isVisible().catch(() => false)) {
    await search.focus();
    await search.click();
    const dialog = page.getByRole("dialog", { name: /search/i }).first();
    if (await dialog.isVisible().catch(() => false)) {
      await auditAxe(page, meta, "command-palette-open");
      const opener = search;
      await page.keyboard.press("Shift+Tab");
      const priorFocus = await page.evaluate(() => { const el = document.activeElement; return { tag: el?.tagName, name: el instanceof HTMLElement ? el.getAttribute("aria-label") || el.innerText : "" }; });
      if (!await dialog.evaluate((el) => el.contains(document.activeElement))) failures.push({ type: "dialog-focus-trap", ...meta, direction: "shift-tab", active: priorFocus });
      await page.keyboard.press("Tab");
      const nextFocus = await page.evaluate(() => { const el = document.activeElement; return { tag: el?.tagName, name: el instanceof HTMLElement ? el.getAttribute("aria-label") || el.innerText : "" }; });
      if (!await dialog.evaluate((el) => el.contains(document.activeElement))) failures.push({ type: "dialog-focus-trap", ...meta, direction: "tab", active: nextFocus });
      await page.keyboard.press("Escape");
      if (await dialog.isVisible().catch(() => false)) failures.push({ type: "escape-dialog", ...meta });
      if (!await opener.evaluate((el) => document.activeElement === el).catch(() => false)) failures.push({ type: "dialog-focus-return", ...meta });
    }
  } else {
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: /search/i }).first();
    if (await dialog.isVisible().catch(() => false)) {
      await auditAxe(page, meta, "command-palette-open");
      await page.keyboard.press("Escape");
      if (await dialog.isVisible().catch(() => false)) failures.push({ type: "escape-dialog", ...meta });
    }
  }

  const rowMenu = page.locator(".row-menu-btn:visible").first();
  if (await rowMenu.count()) {
    await rowMenu.click();
    if (await page.getByRole("menu").count()) await auditAxe(page, meta, "row-menu-open");
    await page.keyboard.press("Escape");
  }
}

// Probe narrow reflow and text spacing without changing the application source or browser settings.
async function auditReflow(page, meta) {
  await page.setViewportSize({ width: 320, height: 640 });
  const narrow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (narrow.width > narrow.viewport + 1) failures.push({ type: "reflow-320", ...meta, ...narrow });
  await page.addStyleTag({ url: `${BASE}/a11y/spacing.css` });
  const spaced = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (spaced.width > spaced.viewport + 1) failures.push({ type: "text-spacing", ...meta, ...spaced });
  await page.setViewportSize({ width: 1280, height: 900 });
}

// Submit the blank required measure on New project; the page keeps the form and announces the error.
async function auditFormError(page, meta) {
  if (!meta.route.endsWith("/projects/new")) return;
  await page.locator("#n").fill("Accessibility fixture");
  await page.getByText("More about it", { exact: true }).click();
  await page.locator("#mb0").fill("not-a-number");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForTimeout(50);
  const alert = page.getByRole("alert").filter({ hasText: "A measure needs fixing." });
  if (!await alert.isVisible().catch(() => false)) failures.push({ type: "form-error-not-announced", ...meta });
  else await auditAxe(page, meta, "form-error");
}

// Search for a project name that is not present and check the resulting empty state.
async function auditEmptyState(page, meta) {
  if (!meta.route.endsWith("/projects")) return;
  const search = page.getByRole("searchbox", { name: "Search projects" });
  if (!await search.isVisible().catch(() => false)) return;
  await search.fill("a11y-no-matching-project-9173");
  const empty = page.locator(".empty:visible").first();
  if (await empty.count()) await auditAxe(page, meta, "empty-search");
}

// Each browser profile has a fresh in-memory demo. Pick the role, then audit every seeded and linked route.
async function runVariant(browser, roleName, role, themeName, theme, viewportName, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: theme.colorScheme, reducedMotion: "reduce", hasTouch: viewportName === "phone" });
  await context.addInitScript(({ style, mode }) => {
    localStorage.setItem("neon1.style", style);
    localStorage.setItem("neon1.mode", mode);
    localStorage.setItem("neon1.theme.shared", "1");
    localStorage.setItem("neon1.motion", "off");
  }, theme);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => failures.push({ type: "page-error", role: roleName, theme: themeName, viewport: viewportName, message: String(error).slice(0, 300) }));
  const first = `${BASE}/1NEON/demo/`;
  await page.goto(first, { waitUntil: "domcontentloaded" });
  const picker = page.getByRole("button", { name: new RegExp(role.name, "i") });
  await picker.waitFor({ state: "visible", timeout: 20000 });
  await auditAxe(page, { route: "/1NEON/demo/ (person picker)", role: roleName, theme: themeName, viewport: viewportName }, "person-picker");
  await picker.click();
  await page.locator(".shell").waitFor({ state: "visible", timeout: 20000 });
  const welcome = page.getByRole("dialog", { name: /welcome to 1neon/i });
  await welcome.waitFor({ state: "visible", timeout: 3000 });
  const reducedMotion = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches && localStorage.getItem("neon1.motion") === "off");
  if (!reducedMotion) failures.push({ type: "reduced-motion-setting", role: roleName, theme: themeName, viewport: viewportName });
  await auditAxe(page, { route: "/1NEON/demo/ (welcome dialog)", role: roleName, theme: themeName, viewport: viewportName }, "welcome-dialog");
  await page.keyboard.press("Escape");
  if (await welcome.isVisible().catch(() => false)) failures.push({ type: "escape-dialog", route: "/1NEON/demo/ (welcome dialog)", role: roleName, theme: themeName, viewport: viewportName });

  const routes = new Set(REQUESTED_ROUTES.length ? REQUESTED_ROUTES : seedRoutes(role));
  if (!REQUESTED_ROUTES.length) routes.add("/1NEON/demo/route-that-does-not-exist");
  const visited = new Set();
  const queue = [...routes];
  let audited = 0;
  for (let index = 0; index < queue.length; index++) {
    if (queue.length > 80) throw new Error(`Route discovery exceeded its 80-address safety limit (${queue.length} queued)`);
    const route = queue[index];
    if (visited.has(route)) continue;
    visited.add(route);
    const meta = { route, role: roleName, theme: themeName, viewport: viewportName };
    const view = await openRoute(page, meta, route);
    if (!view.shell) {
      if (route.endsWith("/route-that-does-not-exist")) await auditAxe(page, meta, "route-not-found");
      continue;
    }
    const count = await auditAxe(page, meta, "route");
    audited++;
    const keyboard = await auditKeyboardAndTargets(page, meta);
    await auditOpenControls(page, meta);
    await auditFormError(page, meta);
    await auditEmptyState(page, meta);
    if (roleName === "priya" && themeName === "sentinel-light" && viewportName === "desktop") await auditReflow(page, meta);
    results.push({ ...meta, title: view.title, axeRules: count, keyboardTargets: keyboard });
    for (const linked of REQUESTED_ROUTES.length ? [] : await linkedRoutes(page)) if (!visited.has(linked) && !routes.has(linked)) {
      routes.add(linked);
      queue.push(linked);
    }
    if (process.env.A11Y_VERBOSE && audited % 5 === 0) console.log(`  ${roleName} · ${themeName} · ${viewportName}: ${audited}/${queue.length} routes`);
  }
  console.log(`${roleName} · ${themeName} · ${viewportName}: ${audited} portal routes, ${visited.size} distinct addresses`);
  await context.close();
}

// The standalone runner stops on any new axe or manual finding and writes a private JSON evidence file.
const browser = await chromium.launch({ headless: true });
for (const [roleName, role] of ROLES_SELECTED) for (const [themeName, theme] of THEMES_SELECTED) for (const [viewportName, viewport] of VIEWPORTS_SELECTED) {
  try { await runVariant(browser, roleName, role, themeName, theme, viewportName, viewport); }
  catch (error) { failures.push({ type: "harness-error", role: roleName, theme: themeName, viewport: viewportName, message: String(error?.stack ?? error).slice(0, 1000) }); }
}
await browser.close();
server.close();

function manualKey(item) {
  const route = (item.route ?? "").replace(/\/o\/[^/]+/g, "/o/:org").replace(/\/projects\/(?!new(?:\/|$))[^/]+/g, "/projects/:project").replace(/\/invoices\/[^/]+/g, "/invoices/:invoice");
  if (item.type === "target-size-under-24") return `${item.type}|${route}|${(item.targets ?? []).map((target) => target.selector.replace(/#item-[A-Za-z0-9_-]+/g, "#item-*")).sort().join(",")}`;
  if (item.type === "focus-indicator") return `${item.type}|${route}|${(item.elements ?? []).map((element) => element.id || element.name || element.tag).join(",")}`;
  return `${item.type}|${route}`;
}
const baseline = new Map(BASELINE.findings.map((entry) => [entry.key, entry]));
const current = [...findings.entries()].map(([key, item]) => ({ key, ...item, reason: baseline.get(key)?.reason ?? "" }));
const newFindings = current.filter((item) => !baseline.has(item.key));
const manualBaseline = new Map((BASELINE.manualFindings ?? []).map((entry) => [entry.key, entry]));
const currentManual = failures.map((item) => {
  const key = manualKey(item);
  return { key, ...item, reason: manualBaseline.get(key)?.reason ?? "" };
});
const newManualFailures = currentManual.filter((item) => !manualBaseline.has(item.key));
const resolved = [...baseline.keys()].filter((key) => !findings.has(key));
const evidence = { generatedAt: new Date().toISOString(), routes: results, observedStates, axeFindings: current, newAxeFindings: newFindings, manualFailures: currentManual, newManualFailures, resolvedBaselineKeys: resolved, routeErrors };
await import("node:fs/promises").then(({ mkdir, writeFile }) => mkdir(EVIDENCE_DIR, { recursive: true }).then(() => writeFile(join(EVIDENCE_DIR, "portal.json"), `${JSON.stringify(evidence, null, 2)}\n`)));
console.log(`Axe: ${current.length} finding instances, ${newFindings.length} new; manual: ${currentManual.length} instances, ${newManualFailures.length} new; route errors: ${routeErrors.length}`);
if (newFindings.length || newManualFailures.length || routeErrors.length) process.exitCode = 1;
