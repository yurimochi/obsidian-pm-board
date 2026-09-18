# PM-Board

Project management board views for [Obsidian Bases](https://obsidian.md).

PM-Board registers a board view type for Bases, turning any Base into a
kanban-style board whose columns come from the Base's own `groupBy`
configuration. Cards are your notes; moving a card writes the change straight
back to the note's frontmatter.

> **Status: early development (0.1.0).** Everything on the roadmap below is
> built, but only the pointer-driven paths have been exercised in a running
> vault. See **Known gaps** before relying on the rest.

## Design goals

These are the things PM-Board sets out to do differently:

- **Configured through Bases, not through hand-edited YAML.** Options are
  declared via the Bases view registration API, so they appear in the normal
  Bases toolbar alongside every other view setting.
- **Swimlanes.** Group on a second axis to get a grid of lanes and columns
  rather than a single row of columns.
- **Keyboard-first.** Every card move is reachable without a pointer, with
  proper focus handling and ARIA semantics.
- **Works on mobile.** A layout that survives a phone screen, and a way to move
  a card that does not depend on dragging.

## Roadmap

- [x] Board view registered against the Bases API; columns from `groupedData`
- [x] Drag and drop between columns, writing to frontmatter
- [x] Manual card ordering
- [x] Card property chips and tags
- [x] Card cover images
- [x] Adding cards from a column
- [x] Swimlanes (two-axis grouping)
- [x] Keyboard-driven card moves and ARIA semantics
- [x] Moving cards without a pointer or a drag
- [x] Mobile layout
- [x] Column header: add, rename, recolor, WIP limit, delete, drag to reorder
- [x] Touch dragging on mobile: a still hold opens the card menu, a moving one drags the card
- [x] Filter the board to one value of a list property (tags included): the
      property from the view's own settings, the value from a button in the
      board's own header
- [ ] Projects: a way to group cards by a property, above individual boards
- [ ] Move board settings into the plugin's own settings tab, instead of
      hand-edited `.base` YAML
- [ ] Experience polish:
      - Better tag colour editing than a raw hex prompt
      - Smoother scrolling on mobile's horizontal column strip
      - Touch drag-to-reorder for columns (cards already have it; the header's
        grip handle is still pointer-only)
      - Touch dragging a card feels held back by the card menu itself: on a
        phone the menu is its own modal-like overlay, and something about it
        loading gets in the way of the drag, confirmed in a real vault. Kept
        as-is for now; needs a proper look at why the two interfere

## Swimlanes

Set `swimlaneProperty` on the view to group on a second axis. The board then
splits into horizontal lanes, one per value of that property, each carrying the
full set of columns so a column means the same thing in every lane. Dragging a
card between lanes writes the lane's value to the note, the same way moving it
between columns writes the column's.

```yaml
views:
  - type: pm-board
    name: Delivery
    groupBy:
      property: status
    swimlaneProperty: note.team
```

Lanes follow the order the query yields them, and cards with no value for the
property collect in a final lane. A WIP limit applies to each lane's stack
rather than to the column as a whole.

## Filtering

**Filter by list property**, next to Card Detail in the view's own settings,
names a property (`tags` included) to filter the board on. Once set, a button
appears in the board's own header listing every distinct value that property
holds across the board; choosing one hides every card that doesn't carry it,
in every lane and column, leaving the rest of the board otherwise unchanged.
The button reads "All values" to show everything again.

The property lives in the view's settings because Bases can offer a plain
property picker there; the value can't, since listing a property's own values
needs the query's actual entries, which only reach the board itself — so that
part is a button in the board's own header instead, the same Menu control
used everywhere else on the board.

Both the property and the chosen value are written to the board's own
settings, the same as a collapsed column or a WIP limit, so the filter is
still applied the next time the board opens.

## Keyboard

Cards are focusable, so the board is reachable by tabbing into it.

| Keys | Effect |
| --- | --- |
| Arrow keys | Move focus between cards; sideways skips empty columns, vertical carries on into the next lane |
| Ctrl/Cmd + Arrow | Move the focused card between columns or up and down its own column |
| Ctrl/Cmd + Shift + Up/Down | Move the focused card to the lane above or below |
| Enter | Open the card's note |

A move redraws the board, and focus follows the card rather than falling back
to the document. Each move is announced to screen readers with the card's new
column and position.

## Touch and mobile

Cards drag on mobile too, just not with HTML5 drag and drop, which touch
devices don't fire: a still hold opens the card's context menu (the same one
described below), while a hold that starts moving instead drags the card,
following the finger, within its column or into another one. Dragging near
the left or right edge of the screen auto-scrolls the lane sideways to reach
a column further off. This is entirely separate from the desktop experience,
which keeps its own native drag and right-click menu untouched.

On a narrow screen a column nearly fills the width and the board is swiped
sideways between columns, so a column is readable rather than half visible.
Each lane's row of columns keeps a fixed height and scrolls sideways on its
own; scrolling to see more cards happens inside a column, not by scrolling
the page — the same whether swimlanes are on or not. At wider sizes a laned
board is still left to grow with its content instead.

## Card menu

Right-click (or long-press) a card for:

- **Edit tags** writes a comma-separated list to the note's frontmatter
  `tags`. Inline `#tags` in the note body are read for the card's tag chips
  but not touched here.
- **Open**, **Open in new tab**, **Open to the side** — the same three
  targets a plain click, Ctrl/Cmd-click and Ctrl/Cmd-Alt-click reach.
- **Rename** edits the title in place on the card; Enter or clicking away
  saves, Escape cancels. Renames the file itself, the same as Obsidian's own
  Rename — a property standing in as the card's display title is untouched.
- **Duplicate** copies the note into `Name-2.md`, `Name-3.md`, and so on,
  inserted right after the original in its own column.
- **Schedule today / tomorrow / next week** write today's, tomorrow's, or
  next Monday's date to the property the board groups by. Only appear when
  that property holds dates, and only for the ones that would not just put
  the card back in the column it's already in.
- **Move to column** / **Move to lane** — unchanged from before; still the
  only way to move a card without a pointer.
- **Delete** moves the note to your configured trash, after a confirmation
  that names the file.

## New cards

Cards added from a column are created by the plugin rather than by the host's
new-note flow, so the board controls where they land and what they contain.

```yaml
views:
  - type: pm-board
    name: Delivery
    newItemFolder: Tasks
    newItemTemplate: Templates/task.md
    newItemProperties:
      team: frontend
```

- **`newItemFolder`** files new cards here, creating the folder if it does not
  exist yet. Without it, the vault's own preference for new notes applies.
- **`newItemTemplate`** supplies the new card's body and properties.
  `{{title}}`, `{{date}}`, `{{time}}` and their `{{date:FORMAT}}` variants are
  filled in, matching the core Templates plugin.
- **`newItemProperties`** are merged over the template's.

The board's own values are written last: the column's value, the lane's value
when swimlanes are on, and the order key. A template or a default cannot
displace a card from the column it was added from.

Once created, the new card opens the same way clicking an existing one does,
following the board's **Card Detail** setting.

## Columns

A column's header carries more than its name and count:

- **The grip handle** drags the column to reorder it, when the board groups
  by anything other than a date. A date's own order already comes from the
  date; there is nothing to drag it into.
- **+** adds a card straight to that column, collapsed or not.
- **⋯** opens a menu:
  - **Rename column** writes the new value to every card currently in the
    column — a column is just a value of the grouped property, not a
    setting of its own. Hidden for a date-grouped board, since a date has
    no name to give it.
  - **Change color** sets an accent stripe on the column's header.
  - **Set WIP limit** does what setting `wipLimits` by hand always did, now
    from the column itself. Leave the field empty to remove the limit.
  - **Delete column** clears the grouped property on every card in the
    column; the column disappears because nothing has that value anymore,
    but the notes themselves are otherwise untouched. The item's own label
    states how many cards that affects.

A column's WIP limit, colour, collapsed state and place in the manual order
all follow it when it is renamed, rather than resetting.

## Card detail

**Card Detail**, in the view's configuration, sets what a plain click on a
card does:

| Setting | Effect |
| --- | --- |
| Active pane / tab | Replaces the tab the board is in (default) |
| Floating modal | Opens the note, live and editable, in a modal over the board |
| Split to the right | Opens the note in a new pane beside the board |
| New tab | Opens the note in a new tab |

Modifier keys always win over the setting, matching the rest of Obsidian:
Ctrl/Cmd-click opens a new tab, and Ctrl/Cmd-Alt-click opens a split.

The floating modal hosts a live, editable pane, properties widget included,
the same as opening the note anywhere else. It builds a `WorkspaceSplit` and
a `WorkspaceLeaf` outside the normal workspace tree, which the public API
does not document a way to do; the wiring and the CSS that sizes it both
adapt the technique the
[Hover Editor](https://github.com/nothingislost/obsidian-hover-editor)
community plugin uses for its own floating panes, an unrelated project used
here only as a reference for this one undocumented mechanism, not for any
part of the board itself. If the leaf cannot be built, the modal falls back
to a rendered, read-only preview with an **Open note** button instead.

## Known gaps

- **Keyboard support is unverified.** The navigation and move logic is covered
  by tests, but the wiring between a keypress and the board has not been
  exercised in a running vault. Treat it as unfinished.
- **The card's checkbox has no keyboard access.** It is not given its own tab
  stop, since the board is deliberately one tab stop per card; there is no
  keyboard path to toggle it yet.
- **Touch dragging a card is rough around the edges.** Confirmed in a real
  vault: the still-hold-opens-the-menu half works, but dragging feels held
  back by the menu itself — on a phone it's its own modal-like overlay, and
  something about it loading interferes with the drag already in progress.
  Left as-is for now; see the roadmap's Experience polish bucket.
- **Column drag-to-reorder has no touch or keyboard alternative.** Unlike
  moving a card, there is no menu fallback yet; on a touch device or from
  the keyboard, a column's order can still be set by hand through
  `boardColumns`.
- **Filtering by a list property is unverified in a vault.** Which cards a
  chosen value hides is covered by tests through `filterLanes`, but the
  property setting and the value button itself — appearing, listing the
  right values, writing the choice back, restoring it on reopen — have not
  been exercised outside those tests. An earlier attempt at this put both
  the property and the value in the board's own header; the property picker
  never rendered there for reasons that resisted diagnosis even with console
  logging, which is why it now goes through the view's own settings instead.
- **Sort by taking over card order is unverified in a vault.** The wiring
  is small (`getSort().length > 0` gates a couple of code paths), but
  `getSort()`'s exact behavior — whether it reflects a change immediately,
  what a multi-property sort or a formula property does here — has not
  been exercised outside what the typed API documents.
- **Persisting a collapsed column relies on an undocumented call.** The typed
  API offers no way to tell the host that a view's stored settings changed, so
  the plugin looks one up on the query controller at runtime. It is never
  assumed to exist: without it a column still collapses, it just forgets on
  reopen.
- **The floating card detail's live leaf relies on undocumented APIs.** It
  builds a `WorkspaceSplit` and `WorkspaceLeaf` outside the normal workspace
  tree, the same way the Hover Editor plugin does for its own popovers.
  Verified working in a vault, but as with anything past the public API, an
  Obsidian update could change the internals it depends on; the read-only
  preview is the fallback if it ever stops mounting.

## Card order

Dragging a card writes its position to a `card_order` property on the note, so
a card stays where you dropped it. Set `orderProperty` on the view to use a
different property name.

A board arriving from another plugin that stored order under `kanban_order` is
read as a fallback, so its manual order survives the move; each drag rewrites
the card onto `card_order`.

**Sort by**, set from the Base's own toolbar, takes over the order within a
column whenever it's set: cards show in the query's own presorted order
rather than by `card_order`, and reordering within a column — by drag or by
keyboard — is turned off, with a Notice explaining why, so the two never
fight over the same thing. Moving a card to a *different* column still
works; only same-column reordering is affected. There is no documented way
to clear Sort by from the board itself, so that Notice points at the Base's
own toolbar. `card_order` itself is left untouched while Sort by is active —
nothing is rewritten to match it — so clearing Sort by later returns to
whatever manual order was last set, not a jump to something new.

## Requirements

Obsidian 1.10.2 or later, with Bases enabled.

## Development

```bash
npm ci          # install exactly what the lockfile pins
npm run dev     # watch build
npm run lint
npm run build
```

Use `npm ci` rather than `npm install`: the checked-in lockfile is what the
build is verified against, and re-resolving it can produce a toolchain that
accepts code a contributor's will reject.

The shipped code is typechecked on its own (`tsconfig.json`, `src` only) and
the tests on a second config that adds them. This is deliberate: the test
dependencies pull in type declarations that reference newer standard
libraries, which quietly widens what the compiler accepts. Checking `src`
alone holds it to the language level the project actually declares, so code
that only builds because a test dependency was installed cannot ship.

To test in a vault, copy `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/pm-board/`.

## License

[MIT](LICENSE)
