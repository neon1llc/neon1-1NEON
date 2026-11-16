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
