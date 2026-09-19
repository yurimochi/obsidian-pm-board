# PM-Board

Project management board views for [Obsidian Bases](https://obsidian.md).

PM-Board registers a board view type for Bases, turning any Base into a
kanban-style board whose columns come from the Base's own `groupBy`
configuration. Cards are your notes; moving a card writes the change straight
back to the note's frontmatter.

> **Status: early development (0.6.14).** Everything is built except what's
> still listed on the roadmap below, and most of it confirmed working in a
> running vault. See **Known gaps** for what hasn't been yet.

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

- [ ] Move board settings into the plugin's own settings tab, instead of
      hand-edited `.base` YAML
- [ ] Experience polish:
      - Better tag colour editing than a raw hex prompt
      - Touch drag-to-reorder for columns (cards already have it; the header's
        grip handle is still pointer-only)

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

A funnel icon in the board's own header opens a panel with two sections,
**Property** and **Filtering**, both collapsed to just their header row at
first. Clicking a header expands that section's own 200px scrollable list
— the other one collapses, an accordion — and Property's lists every
property the query has, tags included. Picking one narrows nothing yet on
its own, but collapses Property and expands Filtering in its place, listing
every distinct value that property holds across the board, "All" first.
Picking one of those hides every card that doesn't carry it, in every lane
and column, and closes the whole panel; "All" closes it too, showing
everything again. The panel also closes on an outside click.

In dark mode the trigger itself is a glassmorphic pill (a background blur
needs a non-flat background behind it to read, which the light palette
isn't); a small dot on its icon shows once a property and a specific value
(not "All") are both set. Its "⋯" is a static placeholder from the design
with no assigned action yet.

Both the property and the chosen value are written to the board's own
settings, the same as a collapsed column or a WIP limit, so the filter is
still applied the next time the board opens.

## Cards

A card leads with a status ring — a plain outline, or a fillable checkbox
when a boolean property is configured — followed by its title. Above that,
when configured, sits a project name and a priority badge; below, a row of
tag chips and any other visible properties. A card in the Overdue column
also carries its own date, since the column itself no longer names one.

The board's colours are fixed, not derived from the installed Obsidian
theme: a light and a dark palette baked into the plugin, switching with
Obsidian's own light/dark appearance setting rather than a community theme's
variables. Both task-detail floatings (see **Card detail** below) share
this same fixed palette; only the rename/tag-edit prompts still follow
Obsidian's native modal styling.

### Priority

Set `priorityProperty` on the view to show a coloured `P1`-`P4` badge on
each card. Accepts `P1`-`P4` case-insensitively, or the bare digit `1`-`4`;
anything else is treated as unset and shows no badge.

```yaml
views:
  - type: pm-board
    name: Delivery
    priorityProperty: priority
```

### Projects

Set `projectProperty` on the view to show a card's project as a folder icon
plus its text value, above the title. Purely a label — filter to one project
with the generic property filter above, using this same property.

```yaml
views:
  - type: pm-board
    name: Delivery
    projectProperty: project
```

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

There is no touch drag on mobile — dragging turned out to fight ordinary
scrolling too often to be worth it. A quick touch that moves right away, a
scroll or a swipe between columns, is left entirely to the browser; the
board only steps in once a touch has been held still long enough to count
as deliberate, and even then only to open the card's context menu (the same
one described below) once the finger lifts — not while it's still held
down. Moving a card on mobile goes through that menu's **Move to column** /
**Move to lane** instead. This is entirely separate from the desktop
experience, which keeps its own native drag and right-click menu untouched.

On a narrow screen a column sits centred with a slice of both the next and
previous column peeking in at the edges, and a swipe pages between columns
one at a time rather than free-scrolling. Each lane's row of columns keeps
a fixed height and scrolls sideways on its own; scrolling to see more cards
happens inside a column, not by scrolling the page — the same whether
swimlanes are on or not. At wider sizes a laned board is still left to grow
with its content instead.

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
- **Move to column** / **Move to lane** — the only way to move a card
  without a pointer, on the keyboard as well as on a touch device, which
  has no card drag of its own.
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
- **Clicking the header** collapses or expands a column, except on a
  date-grouped board: every column, Overdue included, stays expanded there,
  since collapsing one just hides cards from landing or leaving on their own.
- **+** adds a card straight to that column, collapsed or not. Overdue shows
  a **Reschedule** link in its place instead, matching the design; it is not
  wired to anything yet.
- **⋯** opens a menu for renaming, recolouring, a WIP limit, and deleting
  the column. Missing entirely on a date-grouped board — a date can't be
  renamed, and there's nowhere left for the other three once that one's
  gone, so the whole menu goes rather than trimming it item by item.

On a date-grouped board, a column's own date (Overdue and the no-value
column excepted, neither of which name one) reads as `17 Sep • Wed`, its
weekday swapped for "Today" or "Tomorrow" where either applies, rather than
the raw `2026-09-17` the property itself holds.

A column's WIP limit, colour, collapsed state and place in the manual order
all follow it when it is renamed, rather than resetting.

## Overdue

Grouping by a date property merges yesterday's column and every one before it
into a single leading **Overdue** column, per lane; today's and every future
date keep their own column, same as always. Since Overdue no longer names one
date, each of its cards carries its own instead, in place of the space a
regular card leaves blank there.

Overdue is worked out fresh from each card's own date on every redraw, not a
value stored anywhere, so a card can't be dragged, moved, or added straight
into it the way it could a real column — it leaves once its date does,
scheduling it forward the usual way (drag it to a later column, or use the
card menu's Schedule actions). Renaming, WIP limits, colour, and delete all
still work on it like any other column.

## Card detail

**Card Detail**, in the view's configuration, sets what a plain click on a
card does:

| Setting | Effect |
| --- | --- |
| Active pane / tab | Replaces the tab the board is in (default) |
| Floating modal | Opens a floating task editor over the board |
| Split to the right | Opens the note in a new pane beside the board |
| New tab | Opens the note in a new tab |

Modifier keys always win over the setting, matching the rest of Obsidian:
Ctrl/Cmd-click opens a new tab, and Ctrl/Cmd-Alt-click opens a split.

Both the desktop and mobile floatings read and write the same fields —
project, due (a fixed `due` frontmatter property, not one you configure),
tags, and priority — through shared logic (`TaskProperties`), so an edit
made on one platform's floating looks exactly like one made on the other's,
and both write straight to the note's frontmatter or body, the same as the
card's own context menu actions elsewhere on the board.

**On desktop**, it's a compact task editor built from a design handoff, not
the raw note: a fixed-height (450px) panel with a title, a description (the
note's body, minus its frontmatter, in a plain text field that fills the
remaining space), and a bottom toolbar of property pills — Project, Due,
Tags, and Priority — each editable in place. All four labels always show,
even with nothing set yet (shown muted until a value is picked), rather
than appearing only once a value exists. The panel has no close or submit
button of its own; Escape or clicking outside it, Obsidian's own modal
behaviour, is how it closes.

**On mobile**, it's a bottom-sheet-styled summary instead, from its own
design handoff: a drag handle and a close/more header above a grouped card
of property rows — title (with a status ring, coloured only once the `due`
date is in the past), Project, Due, Priority, and Tags, each row tappable
to edit the same way as the desktop panel's pills. Due and Priority rows
are left out entirely while unset, matching that design exactly (unlike
desktop's always-shown pills); there's no affordance in this sheet to add
either back once removed (the design doesn't specify one), so setting
either from scratch still means editing the note's frontmatter directly.
Unlike desktop, there is no description field here either — this design
doesn't have one, matching the original screen's own fields exactly. The
full note is still one tap away regardless, either through a long-press
card menu's **Open**, or another **Card Detail** setting.

## Known gaps

- **The visual redesign and priority/project badges are confirmed working
  in a real vault** after a few rounds of fixes: priority accepting a bare
  digit, the property filter narrowing instead of switching views, stray
  backgrounds behind the date column's title and the +/⋯ buttons (a host
  theme's own `button` styling winning over the fixed palette), and the
  "task" tag (present on every card in this vault) hidden from card chips.
  An earlier project picker in the header was removed after testing; use
  the generic property filter to narrow by project instead.
- **Overdue's Reschedule link has no action yet.** It's shown for visual
  parity with the design it's adapted from; clicking it does nothing.
- **Keyboard support is unverified.** The navigation and move logic is covered
  by tests, but the wiring between a keypress and the board has not been
  exercised in a running vault. Treat it as unfinished.
- **The card's checkbox has no keyboard access.** It is not given its own tab
  stop, since the board is deliberately one tab stop per card; there is no
  keyboard path to toggle it yet.
- **Touch drag was tried and removed.** It kept fighting ordinary scrolling
  and swiping between columns, even after a rework meant to fix that; moving
  a card on mobile now goes through the card menu's Move to column/lane
  instead, same as the keyboard does. The simplified long-press-to-menu
  gesture that replaced it is unverified in a real vault.
- **Column drag-to-reorder has no touch or keyboard alternative.** Unlike
  moving a card, there is no menu fallback yet; on a touch device or from
  the keyboard, a column's order can still be set by hand through
  `boardColumns`.
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
