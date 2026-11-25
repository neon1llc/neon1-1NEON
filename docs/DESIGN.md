# Design

1NEON inherits its design from neon1.tech. The one design source is `neon1-site/docs/DESIGN.md` and the pages beside it in `neon1-site/docs/design/`: tokens, looks, links, components, patterns, copy, the review checklist, and the test matrix. Read those first. This page lists only what the portal adds. `shared/neon1.css` is loaded before this app's styles.

`apps/web/src/styles/app.css` adds, built on the parent's steps:

- `--fs-title`: the page title, 22 to 30px.
- `--fs-input`: the size of a text field, one step, and 16px on a touch screen so iOS never zooms the page.
- On a desktop (1200px and wider, with a mouse) the root is 106.6667%, so `--fs-md` reads as 16px and every step and rem space grows with it. It is the only change to the root size.
- Shape and status: `--r` 14 for cards, `--r-sm` 10 for controls, and `--red`, `--amber`, `--ok` for status in both looks.
- Layer greens `--l1` to `--l4`, each at least 4.5:1 against its badge text, for Needs, Execute, Observe, Normalize.
- The shell: side rail, a 53px mini rail on a phone, sticky top bar, and a phone bottom tab bar. Rows shorten with the window's height so the open menu fits without scrolling. Neo docks beside the rail (`.n1chat-right`).
- Cards, the board, and forms.

The look is `data-style` (sentinel, or absent for Matrix), `data-theme` (`awake`, `matrix`, or `device`), and `data-look`, painted by `lib/themepaint.ts` from the saved choice.

A component here overrides a step only where it must, with a comment saying why. `layout-contract.test.ts` fails when this stylesheet defines a base step of its own, uses a step that does not exist, or writes a text size as a number.

The wordmark (`Wm`, neon1.tech's `.wm` rule) is for branding only: the public bar's logo, the menu's neon1.tech link, and letterheads. Everywhere else "neon1" is plain text at the text's size.
