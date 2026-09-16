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

Dragging uses HTML5 drag and drop, which touch devices do not fire. Rather
than reimplement dragging for touch, every move is also available from the
card's context menu, which Obsidian raises on a long press: it lists the
board's columns, and its lanes when swimlanes are on, alongside the open
actions.

On a narrow screen a column nearly fills the width and the board is swiped
sideways between columns, so a column is readable rather than half visible.

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

## Card detail

**Card Detail**, in the view's configuration, sets what a plain click on a
card does:

| Setting | Effect |
| --- | --- |
| Active pane / tab | Replaces the tab the board is in (default) |
| Floating modal | Opens a preview of the note in a modal over the board |
| Split to the right | Opens the note in a new pane beside the board |
| New tab | Opens the note in a new tab |

Modifier keys always win over the setting, matching the rest of Obsidian:
Ctrl/Cmd-click opens a new tab, and Ctrl/Cmd-Alt-click opens a split.

The floating modal hosts a live, editable pane, properties widget included,
the same as opening the note anywhere else. It does this by building a
`WorkspaceSplit` and a `WorkspaceLeaf` outside the normal workspace tree,
which the public API does not document a way to do; a first attempt at a
bare, parentless leaf mounted with no error but rendered nothing, because it
had no root or container to measure against; the leaf also needs a height
carried down to it by hand, since it sits outside the DOM tree Obsidian's
own CSS assumes. The working wiring and the CSS that sizes it both adapt the
technique the [Hover Editor](https://github.com/nothingislost/obsidian-hover-editor)
community plugin uses for its own floating panes, an unrelated project used
here only as a reference for this one undocumented mechanism, not for any
part of the board itself. If the leaf cannot be built, the modal falls back
to a rendered, read-only preview with an **Open note** button instead.

## Known gaps

- **Keyboard support is unverified.** The navigation and move logic is covered
  by tests, but the wiring between a keypress and the board has not been
  exercised in a running vault. Treat it as unfinished.
- **Touch dragging is not implemented**, deliberately; use the card menu.
- **Persisting a collapsed column relies on an undocumented call.** The typed
  API offers no way to tell the host that a view's stored settings changed, so
  the plugin looks one up on the query controller at runtime. It is never
  assumed to exist: without it a column still collapses, it just forgets on
  reopen.
- **The floating card detail's live leaf is unverified in a vault.** It
  builds a `WorkspaceSplit` and `WorkspaceLeaf` the same undocumented way,
  and while the wiring is adapted from a technique proven in another widely
  used plugin, it has not been exercised here in a running vault. It should
  fall back to the read-only preview rather than break the board if it
  cannot mount; that fallback path is also unverified.

## Card order

Dragging a card writes its position to a `card_order` property on the note, and
that order overrides the Base's own **Sort by** within each column, so a card
stays where you dropped it. Set `orderProperty` on the view to use a different
property name.

A board arriving from another plugin that stored order under `kanban_order` is
read as a fallback, so its manual order survives the move; each drag rewrites
the card onto `card_order`.

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
