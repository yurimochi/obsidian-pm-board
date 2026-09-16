# PM-Board

Project management board views for [Obsidian Bases](https://obsidian.md).

PM-Board registers a board view type for Bases, turning any Base into a
kanban-style board whose columns come from the Base's own `groupBy`
configuration. Cards are your notes; moving a card writes the change straight
back to the note's frontmatter.

> **Status: early development (0.1.0).** Columns, cards and drag and drop
> work. Swimlanes and keyboard moves are not implemented yet — see the
> roadmap below.

## Design goals

These are the things PM-Board sets out to do differently:

- **Configured through Bases, not through hand-edited YAML.** Options are
  declared via the Bases view registration API, so they appear in the normal
  Bases toolbar alongside every other view setting.
- **Swimlanes.** Group on a second axis to get a grid of lanes and columns
  rather than a single row of columns.
- **Keyboard-first.** Every card move is reachable without a pointer, with
  proper focus handling and ARIA semantics.
- **Works on mobile.** Touch dragging and a layout that survives a phone
  screen.

## Roadmap

- [x] Board view registered against the Bases API; columns from `groupedData`
- [x] Drag and drop between columns, writing to frontmatter
- [x] Manual card ordering
- [x] Card property chips and tags
- [ ] Card cover images
- [ ] Swimlanes (two-axis grouping)
- [ ] Keyboard-driven card moves and ARIA semantics
- [ ] Touch support and mobile layout

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
npm install
npm run dev     # watch build
npm run lint
npm run build
```

To test in a vault, copy `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/pm-board/`.

## License

[MIT](LICENSE)
