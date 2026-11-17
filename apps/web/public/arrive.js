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


// The business style (neon1.tech's landing switch, the same localStorage keys) is set before the first paint too, so a lamp (dark) page
// never flashes light and an alert page never flashes the stylized black. The app then keeps it (components/Shell.tsx applyTheme)
try {
  if (localStorage.getItem("neon1.style") === "business") {
    const saved = localStorage.getItem("neon1.theme.business");
    const dark = saved === "lamp" || (saved !== "alert" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-style", "business");
    document.documentElement.setAttribute("data-theme", dark ? "matrix" : "awake");
  }
} catch { /* storage blocked: the app sets its own look once it loads */ }
