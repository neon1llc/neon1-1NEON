# Design

1NEON inherits its design from neon1.tech. The parent, `neon1-site/docs/DESIGN.md`, defines the type scale (`--fs-xs` to `--fs-3xl`), the spacing scale (`--sp-0` to `--sp-7`), `.helper`, the arrow, folds, and motion, all in `shared/neon1.css`, which 1NEON loads before its own styles.

`apps/web/src/styles/app.css` adds only what belongs to the portal, built on those steps:

- `--fs-title`: the page title, 22 to 30px.
- `--fs-input`: the size of a text field, one step, and 16px on a touch screen so iOS never zooms the page.
- The menu, rail, and top bar (rows that shorten with the window's height, so the open menu fits without scrolling), cards, the board, and forms.

A component here overrides a step only where it must, with a comment saying why. The same two rules hold as in the parent: helper, caption, and meta text never exceed 13px, and a card or section title is never below 15px. `layout-contract.test.ts` fails when this stylesheet defines a base step of its own, uses a step that does not exist, or writes a text size as a number.
