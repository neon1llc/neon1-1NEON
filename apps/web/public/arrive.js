// apps/web/public/arrive.js - Runs before the first paint. neon1.tech's pages cross-fade into the next
// page (@view-transition in shared/neon1.css, which this app loads too), so arriving from the site is
// the browser's one fade and nothing here adds another. It's a plain script because the page's CSP
// allows only same-origin scripts, never inline ones.


// The app's bundle failing to load (offline, blocked, or a stale page after a deploy) would leave a
// blank screen, so the shell's plain fallback message is shown instead. Script errors don't bubble,
// so this listens in the capture phase
addEventListener("error", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLScriptElement || el instanceof HTMLLinkElement) || !/\/1NEON\/assets\//.test(el.src || el.href || "")) return;
  const msg = document.getElementById("boot-failed");
  if (msg) msg.hidden = false;
}, true);


// Set the public look before paint, using the same mode migration as the site and lib/style.ts
try {
  const style = localStorage.getItem("neon1.style");
  const sentinel = style === "sentinel" || style === "business";
  const old = localStorage.getItem(sentinel ? "neon1.theme.business" : "neon1.theme");
  const mode = localStorage.getItem("neon1.mode");
  const dark = mode === "dark" || (mode !== "light" && ["matrix", "lamp", "plugged", "desert-of-the-real"].includes(old));
  if (sentinel) document.documentElement.setAttribute("data-style", "sentinel");
  document.documentElement.setAttribute("data-theme", dark ? "matrix" : "awake");
} catch { /* storage blocked: the app sets its look once it loads */ }
