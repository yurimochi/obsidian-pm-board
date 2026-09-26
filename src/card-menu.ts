import { Platform } from "obsidian";
import { PriorityLabel } from "./priority";

/**
 * The menu's own icons, drawn from the design handoff's SVGs rather than
 * Obsidian's icon set, so they match it regardless of the bundled Lucide
 * version (the handoff's calendar with today's date in it has no Lucide
 * equivalent at all).
 */
export type MenuIcon =
	"edit" | "today" | "tomorrow" | "next-week" | "more" | "delete" | PriorityLabel;

/** A shortcut the card itself answers to, shown as a hint and also accepted while the menu is open. */
export type MenuShortcut = "E" | "Backspace";

export interface MenuItemOptions {
	label: string;
	icon?: MenuIcon;
	shortcut?: MenuShortcut;
	/** Drawn in the accent red, for a destructive action. */
	warning?: boolean;
	/** Set to show a tick; left undefined for an item that isn't a choice. */
	checked?: boolean;
	onClick: () => void;
}

export interface MenuCellOptions {
	/** Tooltip and accessible name; the cell itself shows only its icon. */
	title: string;
	icon: MenuIcon;
	/** Set on a grid of mutually exclusive choices (priority) to mark the current one. */
	active?: boolean;
	onClick: () => void;
}

/**
 * The card's right-click (or long-press) menu, from the design handoff: a
 * glass panel at the pointer with plain rows plus icon grids for date and
 * priority. Obsidian's own Menu can't render a grid, and becomes a native
 * OS menu altogether when "native menus" is on, so this is its own element.
 *
 * It lives on the document body rather than inside the board, so it carries
 * its own light/dark palette (see styles.css) the same way the task-detail
 * floatings do. A transparent full-window overlay behind it takes the click
 * that closes it, so that click can't also open whatever card sat under it.
 */
export class CardMenu {
	/** Called once the menu is gone, however it closed. */
	onClose: (() => void) | null = null;

	private readonly overlayEl: HTMLElement;
	private readonly menuEl: HTMLElement;
	private readonly shortcuts = new Map<MenuShortcut, () => void>();
	private returnFocusEl: HTMLElement | null = null;
	private closed = false;
	private readonly onResize = (): void => this.close();

	constructor(private readonly doc: Document) {
		this.overlayEl = createDiv({ cls: "pmb-menu-overlay" });
		this.menuEl = createDiv({ cls: "pmb-menu", attr: { role: "menu", tabindex: "-1" } });

		this.overlayEl.addEventListener("click", () => this.close());
		this.overlayEl.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.close();
		});
		this.menuEl.addEventListener("contextmenu", (event) => event.preventDefault());
		this.menuEl.addEventListener("keydown", (event) => this.onKey(event));
	}

	addItem(options: MenuItemOptions): this {
		const itemEl = this.menuEl.createDiv({
			cls: "pmb-menu-item",
			attr: {
				role: options.checked === undefined ? "menuitem" : "menuitemcheckbox",
				tabindex: "-1",
			},
		});
		if (options.checked !== undefined) itemEl.setAttr("aria-checked", String(options.checked));
		itemEl.toggleClass("pmb-menu-item-warning", !!options.warning);
		if (options.icon) drawIcon(itemEl, options.icon);
		itemEl.createSpan({ cls: "pmb-menu-item-label", text: options.label });
		if (options.checked) itemEl.createSpan({ cls: "pmb-menu-item-check", text: "✓" });
		if (options.shortcut) {
			renderShortcut(itemEl, options.shortcut);
			this.shortcuts.set(options.shortcut, () => this.activate(options.onClick));
		}
		itemEl.addEventListener("click", () => this.activate(options.onClick));
		return this;
	}

	/** A titled row of icon-only choices, four to a row. */
	addGrid(title: string, cells: MenuCellOptions[]): this {
		const sectionEl = this.menuEl.createDiv({ cls: "pmb-menu-section" });
		sectionEl.createSpan({ cls: "pmb-menu-section-title", text: title });
		const gridEl = sectionEl.createDiv({
			cls: "pmb-menu-grid",
			attr: { role: "group", "aria-label": title },
		});
		for (const cell of cells) {
			const cellEl = gridEl.createDiv({
				cls: "pmb-menu-cell",
				attr: {
					role: cell.active === undefined ? "menuitem" : "menuitemradio",
					tabindex: "-1",
					title: cell.title,
					"aria-label": cell.title,
				},
			});
			if (cell.active !== undefined) cellEl.setAttr("aria-checked", String(cell.active));
			cellEl.toggleClass("pmb-menu-cell-active", !!cell.active);
			drawIcon(cellEl, cell.icon);
			cellEl.addEventListener("click", () => this.activate(cell.onClick));
		}
		return this;
	}

	/** A non-interactive heading over the rows that follow it. */
	addLabel(text: string): this {
		this.menuEl.createDiv({ cls: "pmb-menu-label", text });
		return this;
	}

	addSeparator(): this {
		this.menuEl.createDiv({ cls: "pmb-menu-separator", attr: { role: "separator" } });
		return this;
	}

	/**
	 * Opens at the pointer, nudged back inside the window when it would spill
	 * off an edge. `returnFocusEl` gets focus back if the menu is dismissed
	 * with Escape, so keyboard use carries on from the card it started on.
	 */
	showAt(position: { x: number; y: number }, returnFocusEl?: HTMLElement): void {
		this.returnFocusEl = returnFocusEl ?? null;
		this.doc.body.append(this.overlayEl, this.menuEl);

		const win = this.doc.defaultView ?? window;
		const margin = 8;
		const { width, height } = this.menuEl.getBoundingClientRect();
		const left = Math.max(margin, Math.min(position.x, win.innerWidth - width - margin));
		const top = Math.max(margin, Math.min(position.y, win.innerHeight - height - margin));
		this.menuEl.setCssStyles({ left: `${left}px`, top: `${top}px` });

		win.addEventListener("resize", this.onResize);
		this.menuEl.focus({ preventScroll: true });
	}

	close(restoreFocus = false): void {
		if (this.closed) return;
		this.closed = true;
		(this.doc.defaultView ?? window).removeEventListener("resize", this.onResize);
		this.overlayEl.detach();
		this.menuEl.detach();
		if (restoreFocus) this.returnFocusEl?.focus();
		this.onClose?.();
	}

	/** Closes first, so an action that moves focus (rename's input, a modal) keeps it. */
	private activate(action: () => void): void {
		this.close();
		action();
	}

	private onKey(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			event.preventDefault();
			this.close(true);
			return;
		}

		if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
			const shortcut: MenuShortcut | null =
				event.key.toLowerCase() === "e"
					? "E"
					: event.key === "Backspace" || event.key === "Delete"
						? "Backspace"
						: null;
			const run = shortcut ? this.shortcuts.get(shortcut) : undefined;
			if (run) {
				event.preventDefault();
				run();
			}
			return;
		}

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const items = Array.from(
				this.menuEl.querySelectorAll<HTMLElement>(".pmb-menu-item, .pmb-menu-cell"),
			);
			if (items.length === 0) return;
			const current = items.indexOf(this.doc.activeElement as HTMLElement);
			const step = event.key === "ArrowDown" ? 1 : -1;
			const next =
				current === -1
					? step === 1
						? 0
						: items.length - 1
					: (current + step + items.length) % items.length;
			items[next].focus();
			return;
		}

		if (event.key === "Enter" || event.key === " ") {
			const focused = this.doc.activeElement;
			if (
				focused instanceof HTMLElement &&
				this.menuEl.contains(focused) &&
				focused !== this.menuEl
			) {
				event.preventDefault();
				focused.click();
			}
		}
	}
}

function renderShortcut(parentEl: HTMLElement, shortcut: MenuShortcut): void {
	// A keyboard hint means nothing on a touch screen.
	if (Platform.isMobile) return;
	const hintEl = parentEl.createSpan({ cls: "pmb-menu-item-hint" });
	hintEl.createSpan({ text: Platform.isMacOS ? "⌘" : "Ctrl+" });
	if (shortcut === "E") {
		hintEl.createSpan({ text: "E" });
		return;
	}
	// The handoff's delete-key glyph (⌫), drawn rather than typed so it
	// matches the menu's other strokes instead of the font's own.
	const svg = hintEl.createSvg("svg", {
		cls: "pmb-menu-key-glyph",
		attr: {
			viewBox: "0 0 24 20",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "1.8",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		},
	});
	svg.createSvg("path", { attr: { d: "M8 2h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8l-6-8z" } });
	svg.createSvg("path", { attr: { d: "M11 7l6 6M17 7l-6 6" } });
}

function drawIcon(parentEl: HTMLElement, icon: MenuIcon): void {
	const iconEl = parentEl.createSpan({
		cls: `pmb-menu-icon pmb-menu-icon-${icon.toLowerCase()}`,
	});
	if (icon === "more") {
		for (let i = 0; i < 3; i++) iconEl.createSpan({ cls: "pmb-menu-more-dot" });
		return;
	}

	const svg = iconEl.createSvg("svg", {
		attr: {
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "1.6",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		},
	});
	const path = (d: string): void => {
		svg.createSvg("path", { attr: { d } });
	};
	const calendarFrame = (): void => {
		svg.createSvg("rect", { attr: { x: "3", y: "3", width: "18", height: "18", rx: "2" } });
		path("M7 7h10");
	};

	switch (icon) {
		case "edit":
			path("M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z");
			path("M12 21h9");
			return;
		case "today":
			calendarFrame();
			svg.createSvg("text", {
				cls: "pmb-menu-icon-day",
				attr: { x: "12", y: "18", "text-anchor": "middle" },
			}).textContent = String(new Date().getDate());
			return;
		case "tomorrow":
			svg.createSvg("circle", { attr: { cx: "12", cy: "12", r: "4" } });
			path(
				"M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
			);
			return;
		case "next-week":
			calendarFrame();
			path("M8 14h8M13 11l3 3-3 3");
			return;
		case "delete":
			path("M4 6h16");
			path("M9 6V4h6v2");
			path("M6 6l1 14h10l1-14");
			path("M10 10v7M14 10v7");
			return;
		default:
			// A priority flag: pole, then the flag itself, which CSS fills for
			// P1-P3 and leaves as an outline for P4.
			path("M5 21V4");
			svg.createSvg("path", {
				cls: "pmb-menu-flag",
				attr: { d: "M5 4c4-2 7 2 14 0v10c-7 2-10-2-14 0z" },
			});
	}
}
