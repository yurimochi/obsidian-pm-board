# PM-Board

Project management board views for [Obsidian Bases](https://obsidian.md).

PM-Board registers a board view type for Bases, turning any Base into a
kanban-style board whose columns come from the Base's own `groupBy`
configuration. Cards are your notes; moving a card writes the change straight
back to the note's frontmatter.

> **Status: early development (0.6.23).** Everything is built except what's
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

On desktop, the trigger stays in view while scrolling the board
horizontally: `.pmb-board` is what actually scrolls sideways there (there's
no separate horizontal scroll container for the column row, unlike
mobile's own carousel), so the header sticks to the left edge of the
scrolled view instead of scrolling away with the columns.

## Cards

A card leads with a status ring — a plain outline, or a fillable checkbox
when a boolean property is configured — followed by its title. Above that
sits a header row: the card's project on the left and its priority badge on
the right, each shown only when the note has one; below, a row of
tag chips and any other visible properties, except `card_order` — the
manual drag order is bookkeeping, never shown as a chip even if a view's
own property list includes it. A card in the Overdue column also carries
its own date ("14 Sep", no padded day), since the column itself no longer
names one.

The board's colours are fixed, not derived from the installed Obsidian
theme: a light and a dark palette baked into the plugin, switching with
Obsidian's own light/dark appearance setting rather than a community theme's
variables. The font is fixed the same way — the design's own system font
stack, not the interface font picked in Obsidian's settings. Both
task-detail floatings (see **Card detail** below) share this same fixed
palette; only the card's own rename input and the column/WIP-limit prompts
still follow Obsidian's native modal styling.

### Priority

Each card shows a coloured `P1`-`P4` badge read from the `priority`
property, or from whichever property the view's **Priority** setting (or
`priorityProperty`) names instead. Accepts `P1`-`P4` case-insensitively, or
the bare digit `1`-`4`; anything else shows no badge, and stays on the card
as an ordinary chip if the property is one of the view's visible ones.

```yaml
views:
  - type: pm-board
    name: Delivery
    priorityProperty: priority
```

### Projects

Each card shows its project as a folder icon plus its text value, above the
title, read from the `project` property, or from whichever property the
view's **Project** setting (or `projectProperty`) names instead. A link
shows as its note's name, and a list shows every value. Purely a label —
filter to one project with the generic property filter above, using this
same property.

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
| Ctrl/Cmd + E | Edit the card — opens it the same way a plain click does |
| Ctrl/Cmd + Backspace (or Delete) | Delete the card, after a confirmation (Enter confirms) |

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
down. Moving a card on mobile goes through that menu instead: its **Date**
buttons on a board grouped by date, or **Move to column** / **Move to lane**
otherwise. This is entirely separate from the desktop
experience, which keeps its own native drag and right-click menu untouched.

On a narrow screen a column sits centred with a slice of both the next and
previous column peeking in at the edges, and a swipe pages between columns
one at a time rather than free-scrolling. Each lane's row of columns keeps
a fixed height and scrolls sideways on its own; scrolling to see more cards
happens inside a column, not by scrolling the page — the same whether
swimlanes are on or not. At wider sizes a laned board is still left to grow
with its content instead.

## Card menu

Right-click (or long-press) a card for the menu from the design handoff: a
glass panel at the pointer, kept inside the window, that closes on a click
outside it (without that click also reaching the board) or Escape. The
arrow keys walk its entries and Enter picks one.

- **Edit** (Ctrl/Cmd+E) opens the card the same way a plain click does,
  following the view's **Card Detail** setting.
- **Rename** edits the title in place on the card; Enter or clicking away
  saves, Escape cancels. Renames the file itself, the same as Obsidian's own
  Rename — a property standing in as the card's display title is untouched.
- **Duplicate** copies the note into `Name-2.md`, `Name-3.md`, and so on,
  inserted right after the original in its own column.
- **Date**: **Today**, **Tomorrow** and **Next week** (next Monday) write
  that date to the property the board groups by when it holds dates — moving
  the card to that column — or to the note's `due` otherwise. **More** (⋯)
  opens the card, to pick any other date there.
- **Priority**: four flags, P1 (red) through P4 (no colour), with the card's
  current one highlighted. Picking another sets it; picking the highlighted
  one clears it. Written in the form the board's notes already use — a bare
  `1`-`4` when they hold digits, `P1`-`P4` otherwise — so a Sort by on the
  property keeps working.
- **Move to column** / **Move to lane** — only on a board not grouped by
  date (where Today/Tomorrow/Next week don't move a card between columns),
  and for lanes only with swimlanes on. The way to move a card without a
  pointer on a touch device, which has no card drag of its own.
- **Delete** (Ctrl/Cmd+Backspace) moves the note to your configured trash,
  after a confirmation that names the file.

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

Both the template and the folder can also be picked in the view's own
settings (**New card template**, **New card folder**) instead of written by
hand. Without a template, a new card starts empty — so a board whose filters
rely on a property or tag the template would have added (a `task` tag, say)
won't show the card it just created.

- **`newItemFolder`** files new cards here, creating the folder if it does not
  exist yet. Without it, the vault's own preference for new notes applies.
- **`newItemTemplate`** supplies the new card's body and properties. A path
  (with or without `.md`) or a wikilink to the note both work.
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
card menu's Date buttons). Renaming, WIP limits, colour, and delete all
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
card's own context menu actions elsewhere on the board. A property held as
a wikilink (project being one commonly is) shows and reads back as its
alias or note name rather than the raw `[[...]]` text. Obsidian adds its
own close button to every Modal regardless of subclass; both floatings
hide it in favour of their own (the desktop panel's X, the mobile sheet's
header), which also close via Escape or clicking outside.

**On desktop**, it's a task editor from its own design handoff, not the raw
note: an 840px panel with a close button, a bordered title, a tall
description (the note's body, minus its frontmatter), and a row of property
pills — Project, Date, Tags and Priority — each opening its own picker above
it. One picker is open at a time; Escape or a click outside closes just the
picker, leaving the panel open.

- **Project**: a searchable list of every project any note in the vault
  names. Enter picks the first match; a name matching none can be created.
  Picking the current project again clears it. Written in the shape the
  vault already uses — a one-item list, or a link, when other notes do.
- **Date**: a field that takes a typed date ("3 Oct", "Oct 3", "3/10",
  "2026-10-03", "today"/"tomorrow", Portuguese month names too; empty +
  Enter clears), quick options — Today, Tomorrow, Next week (next Monday),
  Next weekend (next Saturday), No Date — and a three-month calendar that
  scrolls, with a dot under days that already have a task on the board.
  The pill's × clears the date.
- **Tags**: a searchable, multi-select list of every tag in the vault,
  staying open while tags are ticked on and off; a label matching none can
  be created. The `task` tag every card carries isn't offered, and is kept.
- **Priority**: Priority 1 to 4, the current one ticked; picking it again
  clears it. Written as a bare `1`-`4` when the vault's notes hold digits,
  `P1`-`P4` otherwise. The picker uses this handoff's own colours (P2
  amber, P3 blue), which differ from the board's badges.

**On mobile**, it's a bottom-sheet-styled summary instead, from its own
design handoff: a header ("..." opens the note itself in the active pane,
X closes), a grouped card of property rows — title (14px/700, with a
status ring coloured only once the `due` date is in the past), Project,
Date, Priority, and Tags, each tappable — and, below that, a separate
rounded description box (280px minimum height, its own surface distinct
from the property card's). The whole sheet is at least 450px tall,
growing past that for longer content, up to 85% of the viewport before it
scrolls internally. All rows always show, even unset (muted), rather than
the handoff's own omit-when-empty treatment, so every field stays
reachable from the sheet itself.

Tapping a row opens a bottom sheet from its own handoff — the same
pickers the desktop panel's pills open (see **Project**, **Date**,
**Tags**, **Priority** above), sized for touch: 44px+ targets, 16px
search fields (avoids iOS's zoom-on-focus), and a taller three-month
calendar. One sheet is open at a time; tapping its scrim or pressing
Escape closes just the sheet, leaving the rest of the floating open. The
Date row's own × (a 44px target) clears the date without opening the
sheet.

Focusing the description on mobile can put it behind the on-screen
keyboard, low in a sheet that already runs tall; Obsidian's modal doesn't
reposition for that on its own, so the sheet watches `visualViewport` for
the keyboard's own resize and caps its height to whatever space is left
above it while the field is focused, scrolling the field into that space.

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
  a card on mobile now goes through the card menu instead (its Date
  buttons, or Move to column/lane on a board not grouped by date). The simplified long-press-to-menu
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
