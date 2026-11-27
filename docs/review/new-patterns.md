# New patterns to review before the next release

New UI semantics added on dev since v0.29.0, for one review before prod. Each names where it lives; the rules are in neon1-site `docs/design/patterns.md` and this repo's `docs/DESIGN.md`. Strike a line once it's reviewed.

## Added 2026-11-27 (1NEON polish round)

1. **Words for a screen**: window, section, section area, card, card head, card group (site `patterns.md`).
2. **Card size bounds content**: a Home card keeps its set size and scrolls inside, head held at the top, fade at the bottom edge until the end; at either end the swipe moves the page. A card not yet placed fits its content up to its tallest preset. Replaces "a card is never shorter than its content". (`Workspace.tsx`, `.tile-body`)
3. **Sideways scroll for long lines**: Coming up's lists keep each name on one line and scroll sideways with the date held. (`.cal .ag-group`)
4. **Card head rule**: title (and description, `.card-top`) over a rule that runs edge to edge; inner rules stay inset; a list under the head starts on the head's rule. Dialogs take the same head. (`app.css`)
5. **One arrow, one size**: `Arr` at `--arr-fs` (the landing's code folds) for disclosures, pagers, dropdowns, card open/close (northeast/southwest), and Pages' back. The outbound arrow stays separate. Dropdown arrows had been stretched by the browser's padding; iPhone selects now draw the same polygon. (`ui.tsx`, `app.css`)
6. **Action button**: record controls that were link-styled text are `Act`: icon, then its name on the first press, then it acts; one open at a time; danger turns red. Converted: People (Resend, Suspend, Recommission, Ask to recommission, Deactivate / Cancel invitation, Reactivate), Bell's Mark all read, upload Cancel and Retry, Try again, Check again, profile Retry, project aside (Edit people, Archive, Restore, Run as a Workbench), Add item, lens board Start / Mark done, Readiness edits, Settings' Where, See what changed, Get started's tour, Guide and New project Remove, suspension banner. (`Act.tsx`)
7. **Action dialogs**: a major action's second press opens its own dialog: who, what happens and what stays, its choices (access level on reactivate, banner message on suspend), and a stop with the reason (last admin). (`MemberActs.tsx`)
8. **What stays text**: in-sentence actions ("confirm it's you", "message me") and sign-in steps ("Use a different email", "Back to sign-in").
9. **Control padding tokens**: `--ctl-px`, `--ctl-px-sm`, `--ctl-inset`; segmented switch inset equal on every side; on touch the switch and its segment make 44px.
10. **Highlight fades**: background, text, and border ease over `--t-hover` (200ms) on hover and on a finger's press (`:active` enabled on iPhone).
11. **Free board panning**: on a phone the board scrolls both ways inside itself, no taller than the section area, no column snapping.
12. **Checkboxes on touch**: 22px box in a 44px target.
13. **Finished per week**: a week with nothing finished shows a faint 0; every week's bar is the same width.
14. **Activity log**: Home's Recent activity, renamed, shows everything and scrolls inside.

## Open questions

- Chrome on Android locks a mostly sideways swipe to one axis on the board (its scroll rails); iPhone browsers pan freely. Taking over the gesture in script would remove the browser's own momentum.
- Settings' and Potentials' Suspend and Recommission are already real buttons; convert them to `Act` too for one look?
- "and N more" in Coming up, and a calendar day's Close (now an icon button), are disclosure and dismiss, not record actions; they stay single-press.
