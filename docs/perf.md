# Sign-in performance on a slow phone

Measured 2026-11-09 with `scripts/perf-signin.cjs`: an emulated Pixel 7 on Slow 4G (150 ms round trip, 1.6 Mbps down, 0.75 Mbps up), CPU slowed 4x, cache off, five runs each, medians shown. It's headless Chromium, not a real handset, so treat times as relative.

"Ready" is when the email field takes typing. "Blocking" is main-thread time beyond 50 ms per long task.

| Build | Script bytes (transferred) | First paint | Ready | Blocking |
|---|---|---|---|---|
| Before route splitting (f96eba7^), local, uncompressed | 779 kB | 5.0 s | 5.4 s | 0.97 s |
| After route splitting, local, uncompressed | 679 kB | 4.5 s | 4.9 s | 0.91 s |
| Live at neon1.tech (compressed by CloudFront) | 213 kB | 2.2 s | 2.6 s | 1.0 s |

The two local runs are served the same way, so the difference is the code split alone: about 100 kB less script and half a second sooner to type.

What's left is React, the router, and zod, which every page needs. Splitting further would trade one download for several round trips on a slow link, so nothing more is planned unless a real phone shows a problem.

Budget: under 250 kB of transferred script and under 3 s to ready on this profile. Run the script before and after any change that adds a dependency to the first page.
