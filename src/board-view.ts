import {
	BasesEntry,
	BasesPropertyId,
	BasesView,
	DateValue,
	Keymap,
	ListValue,
	Menu,
	moment,
	normalizePath,
	Notice,
	Platform,
	QueryController,
	RenderContext,
	setIcon,
	TFile,
} from "obsidian";
import {
	BoardConfig,
	collapseKey,
	DEFAULT_ORDER_PROPERTY,
	groupByPropertyOf,
	LEGACY_ORDER_PROPERTY,
	lookupColumn,
	NO_VALUE_COLLAPSE_KEY,
	readBoardConfig,
	removeColumnSettings,
	renameColumnKey,
	setColumnMapValue,
	setColumnOrder,
	setListFilter,
} from "./board-config";
import { cardTitle, renderCard, valuesOf } from "./card";
import { CardDetailModal } from "./card-detail-modal";
import { groupKeyOf, sortGroups } from "./column-order";
import { ConfirmModal } from "./confirm-modal";
import { BOARD_VIEW_TYPE } from "./constants";
import { parseCoverReference } from "./cover";
import { coerceGroupValue, frontmatterKeyOf } from "./frontmatter";
import {
	BoardPosition,
	BoardShape,
	dropIndexFor,
	focusTarget,
	keyAction,
	moveTarget,
} from "./keyboard";
import { OpenModifiers, resolveOpenTarget } from "./open-behavior";
import {
	adjustIndexForRemoval,
	autoScrollDirection,
	columnInsertionIndexAt,
	insertionIndexAt,
	planInsertion,
	reorderIndexFor,
	resolveOrderKey,
	sortByOrderKey,
} from "./order";
import { PromptModal } from "./prompt-modal";
import { addDays, isoDate, nextWeekStart } from "./schedule";
import { buildLanes, filterLanes, Lane, LaneColumn } from "./swimlanes";
import { applyPlaceholders, joinPath, uniqueName } from "./template";
import { parseTagList } from "./tag-colors";

/** How long a still touch is held before it counts as a long press, opening the card menu. */
const TOUCH_LONG_PRESS_MS = 450;
/** How far a touch can move before a pending long press is read as a drag instead. */
const TOUCH_MOVE_THRESHOLD_PX = 10;
/** How close to a lane's horizontal edge a drag has to get to auto-scroll it. */
const TOUCH_EDGE_SCROLL_ZONE_PX = 48;
/** Auto-scroll speed, in pixels per animation frame. */
const TOUCH_EDGE_SCROLL_SPEED_PX = 14;

/** State for a card being moved by touch: a still hold opens the menu, a drag moves the card. */
interface TouchDragState {
	pointerId: number;
	entry: BasesEntry;
	config: BoardConfig;
	at: BoardPosition;
	cardEl: HTMLElement;
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	longPressTimer: number;
	/** The long press already fired (the menu is open, or about to be); the touch is spent. */
	menuShown: boolean;
	dragging: boolean;
	ghostEl: HTMLElement | null;
	grabOffsetX: number;
	grabOffsetY: number;
	dropEl: HTMLElement | null;
	scrollEl: HTMLElement | null;
	scrollDir: -1 | 0 | 1;
	scrollRafId: number | null;
}

export class BoardView extends BasesView {
	type = BOARD_VIEW_TYPE;

	private boardEl: HTMLElement | null = null;
	private liveEl: HTMLElement | null = null;
	private draggedPath: string | null = null;
	/** Index of the column being dragged into a new position; -1 while none is. */
	private draggedColumnIndex = -1;
	/** The touch gesture in progress on a card, mobile only; null between touches. */
	private touchDrag: TouchDragState | null = null;
	/** Whether the board's groupBy property is a date, which cannot be renamed. */
	private dateGrouped = false;
	/** Whether the view has a Bases Sort by set, which then owns card order within a column. */
	private sortActive = false;
	private lanes: Lane[] = [];
	/** Card to focus once the board has redrawn after a keyboard move. */
	private pendingFocus: string | null = null;
	/** Card that currently holds the board's single tab stop. */
	private activePath: string | null = null;
	private readonly renderContext: RenderContext = { hoverPopover: null };

	constructor(
		private readonly controller: QueryController,
		private readonly containerEl: HTMLElement,
	) {
		super(controller);
	}

	onload(): void {
		this.boardEl = this.containerEl.createDiv({ cls: "pmb-board" });
		// Lives outside the board so redrawing the cards cannot wipe it.
		this.liveEl = this.containerEl.createDiv({ cls: "pmb-live" });
		this.liveEl.setAttribute("aria-live", "polite");
		this.liveEl.setAttribute("aria-atomic", "true");

		this.registerDomEvent(this.boardEl, "focusin", (event) => {
			const card = (event.target as HTMLElement).closest<HTMLElement>(".pmb-card");
			if (!card?.dataset.path) return;
			this.activePath = card.dataset.path;
			this.updateTabStops();
		});
	}

	onunload(): void {
		this.boardEl?.detach();
		this.liveEl?.detach();
		this.boardEl = null;
		this.liveEl = null;
	}

	onDataUpdated(): void {
		if (!this.boardEl) return;
		const config = readBoardConfig(this.config);
		const properties = this.config.getOrder();
		const laneProperty = config.swimlaneProperty;

		const groups = sortGroups(this.data.groupedData, config.boardColumns);
		// A date's canonical value isn't something a user can meaningfully type
		// in as a new column name, so rename and drag-reorder are both off.
		this.dateGrouped = groups.some((group) => group.hasKey() && group.key instanceof DateValue);
		// Bases presorts query results per its own Sort by; while one is set,
		// that stays the order shown and manual reordering is off, rather than
		// the two silently fighting over the same axis.
		this.sortActive = this.config.getSort().length > 0;

		let lanes = buildLanes(
			groups,
			groupKeyOf,
			laneProperty ? (entry) => textValueOf(entry, laneProperty) : null,
		);

		// The candidate properties and their values both come from every entry
		// the query returned, not the (possibly already filtered) lanes, so
		// narrowing the filter never shrinks what it can be widened back to.
		// Candidates come from every property the dataset has, not just the
		// ones toggled visible on the board: a property can hold a real list
		// worth filtering by without being one of the chips shown on a card.
		const allEntries = this.data.data;
		const candidateProperties = [...new Set([...properties, ...this.allProperties])];
		const filterableProperties = listProperties(candidateProperties, allEntries);
		// TEMPORARY: diagnosing why no property is being detected as a list on
		// a real vault where one clearly should be. Safe to remove once fixed.
		console.debug("PM-Board list filter diagnostics", {
			visibleProperties: properties,
			allProperties: this.allProperties,
			entryCount: allEntries.length,
			filterableProperties,
			sample: candidateProperties.map((property) => {
				const first = allEntries.find((entry) => entry.getValue(property));
				const value = first?.getValue(property);
				return {
					property,
					constructorName: value?.constructor?.name ?? null,
					isListValue: value instanceof ListValue,
					text: value?.toString() ?? null,
				};
			}),
		});
		if (config.listFilterProperty && config.listFilterValue) {
			const property = config.listFilterProperty;
			const value = config.listFilterValue;
			lanes = filterLanes(lanes, (entry) => matchesListFilter(entry, property, value));
		}

		this.lanes = lanes;
		this.boardEl.empty();
		this.boardEl.toggleClass("pmb-board-laned", lanes.length > 1 || laneProperty !== null);
		if (filterableProperties.length > 0) {
			this.renderListFilter(this.boardEl, config, filterableProperties, allEntries);
		}
		lanes.forEach((lane, laneIndex) => {
			this.renderLane(this.boardEl as HTMLElement, lane, config, properties, laneIndex);
		});
		this.updateTabStops();
		this.restoreFocus();
	}

	/**
	 * The board's own header: pick a list-valued property, then one of its
	 * values, to show only the cards carrying it. Both come from every entry
	 * the query returned, so the choices on offer don't shrink once a filter
	 * is already narrowing what's on screen. Buttons that open a Menu, the
	 * same as every other control on the board, rather than a bare `<select>`.
	 */
	private renderListFilter(
		parentEl: HTMLElement,
		config: BoardConfig,
		properties: BasesPropertyId[],
		entries: BasesEntry[],
	): void {
		const filterEl = parentEl.createDiv({ cls: "pmb-filter" });

		const propertyBtn = this.filterButton(
			filterEl,
			config.listFilterProperty
				? this.config.getDisplayName(config.listFilterProperty)
				: "Filter",
		);
		this.registerDomEvent(propertyBtn, "click", (event) => {
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle("No filter")
					.setChecked(config.listFilterProperty === null)
					.onClick(() => {
						setListFilter(this.config, null, null);
						if (!this.notifyConfigChanged()) this.onDataUpdated();
					}),
			);
			menu.addSeparator();
			for (const property of properties) {
				menu.addItem((item) =>
					item
						.setTitle(this.config.getDisplayName(property))
						.setChecked(property === config.listFilterProperty)
						.onClick(() => {
							setListFilter(this.config, property, null);
							if (!this.notifyConfigChanged()) this.onDataUpdated();
						}),
				);
			}
			menu.showAtMouseEvent(event);
		});

		if (!config.listFilterProperty) return;
		const property = config.listFilterProperty;

		const valueBtn = this.filterButton(filterEl, config.listFilterValue ?? "All values");
		this.registerDomEvent(valueBtn, "click", (event) => {
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle("All values")
					.setChecked(config.listFilterValue === null)
					.onClick(() => {
						setListFilter(this.config, property, null);
						if (!this.notifyConfigChanged()) this.onDataUpdated();
					}),
			);
			menu.addSeparator();
			for (const value of distinctListValues(entries, property)) {
				menu.addItem((item) =>
					item
						.setTitle(value)
						.setChecked(value === config.listFilterValue)
						.onClick(() => {
							setListFilter(this.config, property, value);
							if (!this.notifyConfigChanged()) this.onDataUpdated();
						}),
				);
			}
			menu.showAtMouseEvent(event);
		});
	}

	private filterButton(parentEl: HTMLElement, label: string): HTMLButtonElement {
		const btn = parentEl.createEl("button", { cls: "pmb-filter-button" });
		btn.createSpan({ text: label });
		setIcon(btn.createSpan({ cls: "pmb-filter-chevron" }), "lucide-chevron-down");
		return btn;
	}

	/**
	 * The board is one tab stop, not one per card: tabbing through a column of
	 * twenty is nobody's idea of keyboard support, and the arrow keys are what
	 * move between cards once inside.
	 */
	private updateTabStops(): void {
		const cards = Array.from(this.boardEl?.querySelectorAll<HTMLElement>(".pmb-card") ?? []);
		const active =
			cards.find((card) => card.dataset.path === this.activePath) ?? cards[0] ?? null;
		for (const card of cards) {
			card.tabIndex = card === active ? 0 : -1;
		}
	}

	/**
	 * A move rewrites notes, which redraws the board and destroys the element
	 * that had focus. Without this the card would move and focus would fall back
	 * to the document, stranding anyone working from the keyboard.
	 */
	private restoreFocus(): void {
		const path = this.pendingFocus;
		this.pendingFocus = null;
		if (!path) return;
		this.cardElementFor(path)?.focus();
	}

	private cardElementFor(path: string): HTMLElement | null {
		return (
			this.boardEl?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`) ?? null
		);
	}

	private renderLane(
		parentEl: HTMLElement,
		lane: Lane,
		config: BoardConfig,
		properties: BasesPropertyId[],
		laneIndex: number,
	): void {
		const laneEl = parentEl.createDiv({ cls: "pmb-lane" });
		if (config.swimlaneProperty) {
			laneEl.createDiv({
				cls: "pmb-lane-title",
				text: lane.key ?? NO_VALUE_COLLAPSE_KEY,
			});
		}

		const columnsEl = laneEl.createDiv({ cls: "pmb-lane-columns" });
		lane.columns.forEach((column, columnIndex) => {
			this.renderColumn(columnsEl, column, config, properties, lane.key, {
				lane: laneIndex,
				column: columnIndex,
			});
		});
		this.registerColumnDropTarget(columnsEl);
	}

	private renderColumn(
		parentEl: HTMLElement,
		column: LaneColumn,
		config: BoardConfig,
		properties: BasesPropertyId[],
		laneKey: string | null,
		at: { lane: number; column: number },
	): void {
		const key = column.key;
		const collapsed = config.collapsedColumns.has(collapseKey(key));
		const limit = lookupColumn(config.wipLimits, key);
		const color = lookupColumn(config.columnColors, key);

		const columnEl = parentEl.createDiv({ cls: "pmb-column" });
		columnEl.setAttribute("role", "group");
		columnEl.setAttribute("aria-label", key ?? NO_VALUE_COLLAPSE_KEY);
		columnEl.toggleClass("pmb-column-collapsed", collapsed);
		columnEl.toggleClass(
			"pmb-column-over-limit",
			limit !== null && column.entries.length > limit,
		);
		columnEl.toggleClass("pmb-column-colored", color !== null);
		if (color) columnEl.style.setProperty("--pmb-column-color", color);

		const ordered = this.displayOrder(column.entries, config.orderProperty);

		this.renderColumnHeader(
			columnEl,
			column,
			ordered,
			config,
			laneKey,
			collapsed,
			limit,
			at.column,
		);

		if (collapsed) return;

		const cardsEl = columnEl.createDiv({ cls: "pmb-cards" });
		cardsEl.setAttribute("role", "list");
		// A touch drag hit-tests elements under the finger, which only gives it
		// the DOM node; these place it back at a lane and column.
		cardsEl.dataset.lane = String(at.lane);
		cardsEl.dataset.column = String(at.column);
		ordered.forEach((entry, index) => {
			this.renderDraggableCard(cardsEl, entry, config, properties, {
				...at,
				index,
			});
		});
		this.registerDropTarget(cardsEl, key, ordered, laneKey);
	}

	private renderColumnHeader(
		columnEl: HTMLElement,
		column: LaneColumn,
		ordered: BasesEntry[],
		config: BoardConfig,
		laneKey: string | null,
		collapsed: boolean,
		limit: number | null,
		columnIndex: number,
	): void {
		const key = column.key;
		const headerEl = columnEl.createDiv({ cls: "pmb-column-header" });

		if (!this.dateGrouped) {
			const handleEl = headerEl.createSpan({ cls: "pmb-column-drag-handle" });
			setIcon(handleEl, "lucide-grip-vertical");
			handleEl.setAttribute("aria-hidden", "true");
			handleEl.setAttribute("tabindex", "-1");
			handleEl.draggable = true;
			this.registerDomEvent(handleEl, "dragstart", (event) => {
				this.draggedColumnIndex = columnIndex;
				columnEl.addClass("pmb-column-dragging");
				event.dataTransfer?.setData("text/plain", key ?? "");
				if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
			});
			this.registerDomEvent(handleEl, "dragend", () => {
				this.draggedColumnIndex = -1;
				columnEl.removeClass("pmb-column-dragging");
			});
		}

		const toggleEl = headerEl.createEl("button", { cls: "pmb-column-toggle" });
		toggleEl.setAttribute("aria-expanded", String(!collapsed));
		setIcon(
			toggleEl.createSpan({ cls: "pmb-column-chevron" }),
			collapsed ? "lucide-chevron-right" : "lucide-chevron-down",
		);
		toggleEl.createSpan({ cls: "pmb-column-title", text: key ?? NO_VALUE_COLLAPSE_KEY });
		toggleEl.createSpan({
			cls: "pmb-column-count",
			text:
				limit === null
					? String(column.entries.length)
					: `${column.entries.length}/${limit}`,
		});
		this.registerDomEvent(toggleEl, "click", () => this.toggleColumn(key, collapsed));

		const actionsEl = headerEl.createDiv({ cls: "pmb-column-actions" });
		const addEl = actionsEl.createEl("button", { cls: "pmb-column-add" });
		addEl.setAttribute("aria-label", "Add card");
		setIcon(addEl, "lucide-plus");
		this.registerDomEvent(addEl, "click", () =>
			this.report(this.addCard(key, config, ordered, laneKey), "Could not add the card."),
		);

		const menuEl = actionsEl.createEl("button", { cls: "pmb-column-menu" });
		menuEl.setAttribute("aria-label", "Column options");
		setIcon(menuEl, "lucide-more-horizontal");
		this.registerDomEvent(menuEl, "click", (event) =>
			this.showColumnMenu(event, column, config),
		);
	}

	private renderDraggableCard(
		cardsEl: HTMLElement,
		entry: BasesEntry,
		config: BoardConfig,
		properties: BasesPropertyId[],
		at: BoardPosition,
	): void {
		const { cardEl, checkboxProperty } = renderCard(
			cardsEl,
			entry,
			config,
			properties,
			this.renderContext,
			(target) => this.coverSrcOf(target, config),
		);
		cardEl.draggable = true;
		cardEl.tabIndex = -1;
		cardEl.dataset.path = entry.file.path;
		cardEl.setAttribute("role", "listitem");
		cardEl.setAttribute("aria-label", this.cardLabel(entry, config, at));

		if (checkboxProperty) {
			const checkboxEl = cardEl.querySelector<HTMLElement>(".pmb-card-checkbox");
			// Not given its own tab stop: the board is one tab stop per card,
			// and a second focusable target per card would defeat that.
			if (checkboxEl) {
				this.registerDomEvent(checkboxEl, "click", (event) => {
					// The card itself opens the note on click; the checkbox
					// stands on its own, and must not also trigger that.
					event.stopPropagation();
					this.report(
						this.toggleCheckbox(entry, checkboxProperty),
						"Could not update the checkbox.",
					);
				});
			}
		}

		this.registerDomEvent(cardEl, "keydown", (event) =>
			this.onCardKey(event, entry, config, at),
		);
		this.registerDomEvent(cardEl, "contextmenu", (event) => {
			event.preventDefault();
			// On mobile the touch handlers below own opening the menu, holding a
			// still finger themselves rather than trusting the browser's own
			// long-press gesture, which can't tell a hold from the start of a drag.
			if (Platform.isMobile) return;
			this.showCardMenu({ x: event.clientX, y: event.clientY }, entry, config, at, cardEl);
		});
		this.registerDomEvent(cardEl, "click", (event) =>
			this.openEntry(entry, config, {
				mod: Keymap.isModEvent(event) !== false,
				alt: event.altKey,
			}),
		);
		this.registerDomEvent(cardEl, "dragstart", (event) => {
			this.draggedPath = entry.file.path;
			cardEl.addClass("pmb-card-dragging");
			event.dataTransfer?.setData("text/plain", entry.file.path);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		});
		this.registerDomEvent(cardEl, "dragend", () => {
			this.draggedPath = null;
			cardEl.removeClass("pmb-card-dragging");
		});

		if (Platform.isMobile) {
			this.registerDomEvent(cardEl, "touchstart", (event) =>
				this.onCardTouchStart(event, entry, config, at, cardEl),
			);
			this.registerDomEvent(cardEl, "touchmove", (event) => this.onCardTouchMove(event), {
				passive: false,
			});
			this.registerDomEvent(cardEl, "touchend", (event) => this.onCardTouchEnd(event));
			this.registerDomEvent(cardEl, "touchcancel", () => this.cancelCardTouch());
		}
	}

	/**
	 * Starts tracking a touch on a card. What it turns into is decided as the
	 * touch continues: held still, it opens the card menu (`onTouchLongPress`);
	 * moved past the threshold first, it becomes a drag (`startTouchDrag`).
	 */
	private onCardTouchStart(
		event: TouchEvent,
		entry: BasesEntry,
		config: BoardConfig,
		at: BoardPosition,
		cardEl: HTMLElement,
	): void {
		// A second finger touching down mid-gesture is not a pinch this board
		// supports; leave the first touch's gesture alone rather than confuse it.
		if (this.touchDrag || event.touches.length !== 1) return;
		const touch = event.touches[0];
		const rect = cardEl.getBoundingClientRect();

		this.touchDrag = {
			pointerId: touch.identifier,
			entry,
			config,
			at,
			cardEl,
			startX: touch.clientX,
			startY: touch.clientY,
			lastX: touch.clientX,
			lastY: touch.clientY,
			longPressTimer: window.setTimeout(() => this.onTouchLongPress(), TOUCH_LONG_PRESS_MS),
			menuShown: false,
			dragging: false,
			ghostEl: null,
			grabOffsetX: touch.clientX - rect.left,
			grabOffsetY: touch.clientY - rect.top,
			dropEl: null,
			scrollEl: null,
			scrollDir: 0,
			scrollRafId: null,
		};
	}

	/** The touch has been held still for the long-press duration: open the card menu. */
	private onTouchLongPress(): void {
		const state = this.touchDrag;
		if (!state || state.dragging) return;
		state.menuShown = true;
		this.showCardMenu(
			{ x: state.lastX, y: state.lastY },
			state.entry,
			state.config,
			state.at,
			state.cardEl,
		);
	}

	private onCardTouchMove(event: TouchEvent): void {
		const state = this.touchDrag;
		if (!state || state.menuShown) return;
		const touch = touchWithId(event.touches, state.pointerId);
		if (!touch) return;
		state.lastX = touch.clientX;
		state.lastY = touch.clientY;

		if (!state.dragging) {
			const dx = touch.clientX - state.startX;
			const dy = touch.clientY - state.startY;
			if (Math.hypot(dx, dy) < TOUCH_MOVE_THRESHOLD_PX) return;
			// Movement beat the hold: this is a drag, not a long press.
			window.clearTimeout(state.longPressTimer);
			this.startTouchDrag(state);
		}

		// Now that it's a drag, take over from whatever the browser would
		// otherwise do with this touch (scrolling the column, most likely).
		event.preventDefault();
		this.positionGhost(state);
		this.updateTouchDropTarget(state);
		this.updateAutoScroll(state);
	}

	private onCardTouchEnd(event: TouchEvent): void {
		const state = this.touchDrag;
		if (!state) return;
		window.clearTimeout(state.longPressTimer);
		if (state.dragging) {
			event.preventDefault();
			this.finishTouchDrag(state);
		}
		this.teardownTouchDrag(state);
		this.touchDrag = null;
	}

	/** A cancelled touch (an incoming call, a system gesture) drops the card where it started. */
	private cancelCardTouch(): void {
		const state = this.touchDrag;
		if (!state) return;
		window.clearTimeout(state.longPressTimer);
		this.teardownTouchDrag(state);
		this.touchDrag = null;
	}

	private startTouchDrag(state: TouchDragState): void {
		state.dragging = true;
		state.cardEl.addClass("pmb-card-dragging");

		const ghost = state.cardEl.cloneNode(true) as HTMLElement;
		ghost.addClass("pmb-card-ghost");
		ghost.style.width = `${state.cardEl.getBoundingClientRect().width}px`;
		document.body.appendChild(ghost);
		state.ghostEl = ghost;

		// Runs for the whole drag rather than only while a scroll is wanted: a
		// still finger near an edge still needs the column sliding underneath
		// it re-checked as the drop target every frame, scrolling or not.
		this.runAutoScrollLoop(state);
	}

	private positionGhost(state: TouchDragState): void {
		if (!state.ghostEl) return;
		const left = state.lastX - state.grabOffsetX;
		const top = state.lastY - state.grabOffsetY;
		state.ghostEl.style.transform = `translate(${left}px, ${top}px)`;
	}

	/** Highlights whichever column's card list currently sits under the finger. */
	private updateTouchDropTarget(state: TouchDragState): void {
		const el =
			document
				.elementFromPoint(state.lastX, state.lastY)
				?.closest<HTMLElement>(".pmb-cards") ?? null;
		if (el === state.dropEl) return;
		state.dropEl?.removeClass("pmb-cards-drop-target");
		el?.addClass("pmb-cards-drop-target");
		state.dropEl = el;
	}

	/** Re-reads which way, if any, the lane under the finger should auto-scroll. */
	private updateAutoScroll(state: TouchDragState): void {
		const scrollEl =
			document
				.elementFromPoint(state.lastX, state.lastY)
				?.closest<HTMLElement>(".pmb-lane-columns") ?? null;
		const rect = scrollEl?.getBoundingClientRect();
		state.scrollEl = scrollEl;
		state.scrollDir = rect
			? autoScrollDirection(rect, state.lastX, TOUCH_EDGE_SCROLL_ZONE_PX)
			: 0;
	}

	/**
	 * One loop for the whole drag, not started and stopped per edge crossing:
	 * a stationary finger's own screen position never changes, so only this
	 * per-frame loop notices the column sliding out from under it.
	 */
	private runAutoScrollLoop(state: TouchDragState): void {
		const step = () => {
			if (state !== this.touchDrag || !state.dragging) {
				state.scrollRafId = null;
				return;
			}
			if (state.scrollEl && state.scrollDir !== 0) {
				state.scrollEl.scrollLeft += state.scrollDir * TOUCH_EDGE_SCROLL_SPEED_PX;
				this.updateTouchDropTarget(state);
			}
			state.scrollRafId = window.requestAnimationFrame(step);
		};
		state.scrollRafId = window.requestAnimationFrame(step);
	}

	private finishTouchDrag(state: TouchDragState): void {
		const dropEl = state.dropEl;
		if (!dropEl) return;
		const laneIndex = Number(dropEl.dataset.lane);
		const columnIndex = Number(dropEl.dataset.column);
		const column = this.lanes[laneIndex]?.columns[columnIndex];
		if (!column) return;

		const ordered = this.displayOrder(column.entries, state.config.orderProperty);
		const index = insertionIndexAt(cardBounds(dropEl), state.lastY);
		this.report(
			this.moveCard(
				state.entry.file.path,
				column.key,
				index,
				ordered,
				this.lanes[laneIndex].key,
			),
			"Could not move the card.",
		);
	}

	private teardownTouchDrag(state: TouchDragState): void {
		if (state.scrollRafId !== null) window.cancelAnimationFrame(state.scrollRafId);
		state.dropEl?.removeClass("pmb-cards-drop-target");
		state.cardEl.removeClass("pmb-card-dragging");
		state.ghostEl?.remove();
	}

	private registerDropTarget(
		cardsEl: HTMLElement,
		columnKey: string | null,
		columnEntries: BasesEntry[],
		laneKey: string | null,
	): void {
		this.registerDomEvent(cardsEl, "dragover", (event) => {
			if (!this.draggedPath) return;
			// Only a cancelled dragover marks the element as a valid drop target.
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			cardsEl.addClass("pmb-cards-drop-target");
		});
		this.registerDomEvent(cardsEl, "dragleave", () => {
			cardsEl.removeClass("pmb-cards-drop-target");
		});
		this.registerDomEvent(cardsEl, "drop", (event) => {
			cardsEl.removeClass("pmb-cards-drop-target");
			const path = this.draggedPath;
			if (!path) return;
			event.preventDefault();
			const index = insertionIndexAt(cardBounds(cardsEl), event.clientY);
			this.report(
				this.moveCard(path, columnKey, index, columnEntries, laneKey),
				"Could not move the card.",
			);
		});
	}

	private registerColumnDropTarget(columnsEl: HTMLElement): void {
		this.registerDomEvent(columnsEl, "dragover", (event) => {
			if (this.draggedColumnIndex === -1) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			columnsEl.addClass("pmb-lane-columns-drop-target");
		});
		this.registerDomEvent(columnsEl, "dragleave", () => {
			columnsEl.removeClass("pmb-lane-columns-drop-target");
		});
		this.registerDomEvent(columnsEl, "drop", (event) => {
			columnsEl.removeClass("pmb-lane-columns-drop-target");
			const movedFrom = this.draggedColumnIndex;
			if (movedFrom === -1) return;
			event.preventDefault();
			const target = columnInsertionIndexAt(columnBounds(columnsEl), event.clientX);
			this.moveColumn(movedFrom, reorderIndexFor(target, movedFrom));
		});
	}

	/** Every lane shares the same columns in the same order, so any one names the board-wide order. */
	private moveColumn(fromIndex: number, toIndex: number): void {
		const order = this.lanes[0]?.columns.map((c) => c.key) ?? [];
		if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= order.length) return;
		const next = [...order];
		const [moved] = next.splice(fromIndex, 1);
		next.splice(toIndex, 0, moved);
		setColumnOrder(this.config, next);
		if (!this.notifyConfigChanged()) this.onDataUpdated();
	}

	private showColumnMenu(event: MouseEvent, column: LaneColumn, config: BoardConfig): void {
		const menu = new Menu();
		const key = column.key;
		const groupProperty = groupByPropertyOf(this.config);
		// A lane only holds its own slice of a column; rename and delete are
		// about the column as a whole, so they need every lane's share of it.
		const allEntries = this.entriesForColumn(key);

		if (!this.dateGrouped) {
			menu.addItem((item) =>
				item
					.setTitle("Rename column")
					.setIcon("lucide-pencil")
					.onClick(() =>
						this.report(
							this.renameColumn(key, allEntries, groupProperty),
							"Could not rename the column.",
						),
					),
			);
		}

		menu.addItem((item) =>
			item
				.setTitle("Change color")
				.setIcon("lucide-palette")
				.onClick(() =>
					this.report(
						this.changeColumnColor(key, config),
						"Could not change the column's color.",
					),
				),
		);

		menu.addItem((item) =>
			item
				.setTitle("Set WIP limit")
				.setIcon("lucide-gauge")
				.onClick(() =>
					this.report(
						this.setColumnWipLimit(key, config),
						"Could not set the WIP limit.",
					),
				),
		);

		menu.addSeparator();
		const count = allEntries.length;
		menu.addItem((item) =>
			item
				.setTitle(`Delete column (${count} card${count === 1 ? "" : "s"} will remain)`)
				.setIcon("lucide-trash-2")
				.onClick(() =>
					this.report(
						this.deleteColumn(key, allEntries, groupProperty),
						"Could not delete the column.",
					),
				),
		);

		menu.showAtMouseEvent(event);
	}

	/** A column's cards across every lane, since renaming or deleting it is not about one swimlane's slice. */
	private entriesForColumn(key: string | null): BasesEntry[] {
		return this.lanes.flatMap((lane) => lane.columns.find((c) => c.key === key)?.entries ?? []);
	}

	/**
	 * Renaming writes the new value to every card's frontmatter, since a
	 * column is just a value of the grouped property, not a setting of its
	 * own. Its stored WIP limit, colour, collapse state and manual order
	 * position all follow it to the new key.
	 */
	private async renameColumn(
		key: string | null,
		entries: BasesEntry[],
		groupProperty: string | null,
	): Promise<void> {
		const frontmatterKey = this.writableGroupKey(groupProperty, "renamed");
		if (!frontmatterKey) return;

		const next = await PromptModal.prompt(this.app, {
			title: "Rename column",
			initialValue: key ?? "",
			placeholder: "Column name",
		});
		if (next === null || next === "" || next === (key ?? "")) return;

		const value = coerceGroupValue(next, this.rawValue(entries[0], frontmatterKey));
		for (const entry of entries) {
			await this.writeFrontMatter(entry.file.path, (frontmatter) =>
				assign(frontmatter, frontmatterKey, value),
			);
		}
		renameColumnKey(this.config, key, next);
		if (!this.notifyConfigChanged()) this.onDataUpdated();
	}

	private async changeColumnColor(key: string | null, config: BoardConfig): Promise<void> {
		const current = lookupColumn(config.columnColors, key);
		const next = await PromptModal.prompt(this.app, {
			title: "Change color",
			initialValue: current ?? "#3d64ff",
			inputType: "color",
			showClear: true,
			clearLabel: "Remove color",
		});
		if (next === null) return;
		setColumnMapValue(this.config, "columnColors", key, next === "" ? null : next);
		if (!this.notifyConfigChanged()) this.onDataUpdated();
	}

	private async setColumnWipLimit(key: string | null, config: BoardConfig): Promise<void> {
		const current = lookupColumn(config.wipLimits, key);
		const next = await PromptModal.prompt(this.app, {
			title: "Set WIP limit",
			initialValue: current !== null ? String(current) : "",
			placeholder: "No limit",
			inputType: "number",
		});
		if (next === null) return;
		if (next === "") {
			setColumnMapValue(this.config, "wipLimits", key, null);
		} else {
			const parsed = Number(next);
			if (!Number.isInteger(parsed) || parsed < 0) {
				new Notice("WIP limit must be a whole number, zero or more.");
				return;
			}
			setColumnMapValue(this.config, "wipLimits", key, parsed);
		}
		if (!this.notifyConfigChanged()) this.onDataUpdated();
	}

	/** Deleting a column clears the grouped property on its cards; it does not delete the notes. */
	private async deleteColumn(
		key: string | null,
		entries: BasesEntry[],
		groupProperty: string | null,
	): Promise<void> {
		const frontmatterKey = this.writableGroupKey(groupProperty, "updated");
		if (!frontmatterKey) return;

		for (const entry of entries) {
			await this.writeFrontMatter(entry.file.path, (frontmatter) => {
				delete frontmatter[frontmatterKey];
			});
		}
		removeColumnSettings(this.config, key);
		if (!this.notifyConfigChanged()) this.onDataUpdated();
	}

	/** The frontmatter key backing the board's columns, or null (with a Notice) when cards cannot be written to. */
	private writableGroupKey(groupProperty: string | null, verb: string): string | null {
		if (!groupProperty) {
			new Notice("Could not tell which property this board groups by.");
			return null;
		}
		const frontmatterKey = frontmatterKeyOf(groupProperty);
		if (!frontmatterKey) {
			new Notice(
				`Cards cannot be ${verb}: this board groups by ${groupProperty}, which is computed.`,
			);
			return null;
		}
		return frontmatterKey;
	}

	/**
	 * Card actions are started from event handlers, where a rejected promise
	 * would otherwise be swallowed and the board would simply not change.
	 */
	private report(task: Promise<void>, message: string): void {
		task.catch((error: unknown) => {
			console.error(message, error);
			new Notice(message);
		});
	}

	/**
	 * What to write so a card belongs to the lane it was dropped in. Without
	 * this a card crossing lanes would take its column change and snap back to
	 * the lane it came from, since the lane is just another property.
	 */
	private laneWrite(
		config: BoardConfig,
		laneKey: string | null,
		sample: BasesEntry | undefined,
	): { key: string; value: unknown } | null {
		if (!config.swimlaneProperty) return null;
		const key = frontmatterKeyOf(config.swimlaneProperty);
		if (!key) return null;
		return { key, value: coerceGroupValue(laneKey, this.rawValue(sample, key)) };
	}

	private coverSrcOf(entry: BasesEntry, config: BoardConfig): string | null {
		if (!config.coverProperty) return null;
		const reference = parseCoverReference(entry.getValue(config.coverProperty)?.toString());
		if (!reference) return null;
		if (reference.kind === "url") return reference.url;

		const file = this.app.metadataCache.getFirstLinkpathDest(
			reference.linkpath,
			entry.file.path,
		);
		return file ? this.app.vault.getResourcePath(file) : null;
	}

	/**
	 * Creates a note already belonging to the column it was added from, so it
	 * does not land outside the board's own filter and vanish.
	 */
	private async addCard(
		columnKey: string | null,
		config: BoardConfig,
		columnEntries: BasesEntry[],
		laneKey: string | null,
	): Promise<void> {
		const groupProperty = groupByPropertyOf(this.config);
		const frontmatterKey = groupProperty ? frontmatterKeyOf(groupProperty) : null;

		const ordered = sortByOrderKey(columnEntries, (entry) =>
			this.orderKeyOf(entry, config.orderProperty),
		);
		const plan = planInsertion(
			ordered.map((entry) => this.orderKeyOf(entry, config.orderProperty)),
			config.newCardsToTop ? 0 : ordered.length,
		);
		const sample = frontmatterKey ? this.rawValue(ordered[0], frontmatterKey) : undefined;
		const value = coerceGroupValue(columnKey, sample);

		await this.applyHealedKeys(plan.healed, ordered, config.orderProperty);

		const lane = this.laneWrite(config, laneKey, ordered[0]);
		const folder = await this.newCardFolder(config);
		const template = await this.loadTemplate(config.newItemTemplate);
		const name = uniqueName(
			"Untitled",
			(candidate) =>
				this.app.vault.getAbstractFileByPath(joinPath(folder, `${candidate}.md`)) !== null,
		);

		// The template is written whole, frontmatter block included, so the host
		// parses those properties itself. Merging them by hand meant reading
		// them back out of the metadata cache and trusting its shape.
		const content = template
			? applyPlaceholders(template, { title: name, now: new Date(), format: formatDate })
			: "";
		const file = await this.app.vault.create(joinPath(folder, `${name}.md`), content);

		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: Record<string, unknown>) => {
				// The template's own properties are already here; these go over
				// the top, so nothing can place the card outside the column it
				// was added from.
				Object.assign(frontmatter, config.newItemProperties);
				if (frontmatterKey && value !== null) frontmatter[frontmatterKey] = value;
				if (lane) assign(frontmatter, lane.key, lane.value);
				frontmatter[config.orderProperty] = plan.insertKey;
			},
		);

		await this.openFile(file, config);
	}

	/** Opens a file the same way a click on a card does, honouring Card Detail. */
	private async openFile(
		file: TFile,
		config: BoardConfig,
		modifiers: OpenModifiers = { mod: false, alt: false },
	): Promise<void> {
		const target = resolveOpenTarget(config.cardOpenBehavior, modifiers);
		if (target === "modal") {
			new CardDetailModal(this.app, file).open();
			return;
		}
		await this.app.workspace.getLeaf(target).openFile(file);
	}

	/**
	 * Where a new card is filed. A board naming its own folder gets it created
	 * on demand, so a board can be configured before the folder exists;
	 * otherwise the vault's own preference for new notes decides.
	 */
	private async newCardFolder(config: BoardConfig): Promise<string> {
		if (!config.newItemFolder) {
			return this.app.fileManager.getNewFileParent(this.currentSourcePath()).path;
		}
		const folder = normalizePath(config.newItemFolder);
		if (!this.app.vault.getAbstractFileByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}
		return folder;
	}

	private currentSourcePath(): string {
		return this.data.data[0]?.file.path ?? "";
	}

	/** The template's full text, or null when the board names no usable one. */
	private async loadTemplate(path: string | null): Promise<string | null> {
		if (!path) return null;
		const file = this.app.vault.getFileByPath(normalizePath(path));
		if (!file) {
			new Notice(`Template not found: ${path}`);
			return null;
		}
		return this.app.vault.cachedRead(file);
	}

	/** Collapsed state lives in the board file, so it survives reopening. */
	private toggleColumn(key: string | null, collapsed: boolean): void {
		const storageKey = collapseKey(key);
		const next: Record<string, true> = {};
		for (const existing of readBoardConfig(this.config).collapsedColumns) {
			if (existing !== storageKey) next[existing] = true;
		}
		if (!collapsed) next[storageKey] = true;

		this.config.set("collapsedColumns", Object.keys(next).length > 0 ? next : null);
		// The host redraws once it has taken the change; do it here only if not.
		if (!this.notifyConfigChanged()) this.onDataUpdated();
	}

	/**
	 * Storing a value only updates the config held in memory. The host has to be
	 * told before it writes the board file, and that call is not part of the
	 * typed surface, so it is looked up rather than assumed to exist: without it
	 * a collapsed column still toggles, it just forgets on reopen.
	 */
	private notifyConfigChanged(): boolean {
		const controller = this.controller as unknown as { onConfigChanged?: unknown };
		if (typeof controller.onConfigChanged !== "function") return false;
		(controller.onConfigChanged as () => void).call(this.controller);
		return true;
	}

	private async moveCard(
		path: string,
		columnKey: string | null,
		dropIndex: number,
		columnEntries: BasesEntry[],
		laneKey: string | null,
	): Promise<void> {
		const config = readBoardConfig(this.config);
		const groupProperty = groupByPropertyOf(this.config);
		if (!groupProperty) {
			const groupBy = (this.config as unknown as Record<string, unknown>).groupBy;
			console.error("PM-Board could not read the group-by property.", {
				groupBy,
				groupByKeys: groupBy && typeof groupBy === "object" ? Object.keys(groupBy) : null,
				config: this.config,
			});
			new Notice("Could not tell which property this board groups by. See the console.");
			return;
		}

		const frontmatterKey = frontmatterKeyOf(groupProperty);
		if (!frontmatterKey) {
			new Notice(
				`Cards cannot be moved: this board groups by ${groupProperty}, which is computed.`,
			);
			return;
		}

		const ordered = sortByOrderKey(columnEntries, (entry) =>
			this.orderKeyOf(entry, config.orderProperty),
		);
		const movedFrom = ordered.findIndex((entry) => entry.file.path === path);

		// Reordering within the same column is the one thing that fights
		// Sort by; moving to a different column does not, so only that case
		// is blocked. There is no documented way to clear Sort by from here,
		// so this asks for it to be cleared from the Bases toolbar instead.
		if (this.sortActive && movedFrom !== -1) {
			new Notice(
				"Manual order is off while Sort by is set. Clear Sort by from the Bases toolbar to reorder by hand.",
			);
			return;
		}

		const neighbours = ordered.filter((entry) => entry.file.path !== path);

		const plan = planInsertion(
			neighbours.map((entry) => this.orderKeyOf(entry, config.orderProperty)),
			adjustIndexForRemoval(dropIndex, movedFrom),
		);
		const value = coerceGroupValue(columnKey, this.rawValue(neighbours[0], frontmatterKey));

		await this.applyHealedKeys(plan.healed, neighbours, config.orderProperty);

		const lane = this.laneWrite(config, laneKey, ordered[0]);

		await this.writeFrontMatter(path, (frontmatter) => {
			if (value === null) delete frontmatter[frontmatterKey];
			else frontmatter[frontmatterKey] = value;
			if (lane) assign(frontmatter, lane.key, lane.value);
			frontmatter[config.orderProperty] = plan.insertKey;
		});
	}

	private async applyHealedKeys(
		healed: (string | null)[],
		entries: BasesEntry[],
		orderProperty: string,
	): Promise<void> {
		for (const [position, key] of healed.entries()) {
			const entry = entries[position];
			if (key === null || !entry) continue;
			await this.writeFrontMatter(entry.file.path, (frontmatter) => {
				frontmatter[orderProperty] = key;
			});
		}
	}

	/**
	 * `Value.renderTo` only draws a value; it has no write-back of its own, so
	 * the card's checkbox needs its own toggle. The current value is read from
	 * live frontmatter at write time rather than the entry snapshot the card
	 * was rendered from, so a rapid double click cannot race itself back to
	 * the value it started at.
	 */
	private async toggleCheckbox(entry: BasesEntry, property: BasesPropertyId): Promise<void> {
		const key = frontmatterKeyOf(property);
		if (!key) return;
		await this.writeFrontMatter(entry.file.path, (frontmatter) => {
			frontmatter[key] = frontmatter[key] !== true;
		});
	}

	/**
	 * Query results are replaced as the vault changes and the file objects they
	 * carry go stale with them, so the file is looked up again by path rather
	 * than written through the reference a render happened to capture.
	 */
	private async writeFrontMatter(
		path: string,
		edit: (frontmatter: Record<string, unknown>) => void,
	): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) throw new Error(`PM-Board: no file at ${path}`);
		await this.app.fileManager.processFrontMatter(file, edit);
	}

	/**
	 * Manual order overrides the query's own sort so a dropped card stays put
	 * on the next refresh, but only while no Sort by is set; see displayOrder.
	 */
	private orderKeyOf(entry: BasesEntry, orderProperty: string): string | null {
		return resolveOrderKey(
			this.rawValue(entry, orderProperty),
			this.rawValue(entry, LEGACY_ORDER_PROPERTY),
			orderProperty === DEFAULT_ORDER_PROPERTY,
		);
	}

	/**
	 * A column's cards in the order actually shown. While Sort by is set,
	 * that is Bases' own presorted order, taken as given rather than
	 * re-sorted by the manual order underneath it; otherwise it's the manual
	 * order, same as always.
	 */
	private displayOrder(entries: BasesEntry[], orderProperty: string): BasesEntry[] {
		return this.sortActive
			? entries
			: sortByOrderKey(entries, (entry) => this.orderKeyOf(entry, orderProperty));
	}

	private rawValue(entry: BasesEntry | undefined, property: string): unknown {
		if (!entry) return undefined;
		return this.app.metadataCache.getFileCache(entry.file)?.frontmatter?.[property];
	}

	private openEntry(entry: BasesEntry, config: BoardConfig, modifiers: OpenModifiers): void {
		void this.openFile(entry.file, config, modifiers);
	}

	/**
	 * Arrows walk the board; holding the modifier carries the card along, with
	 * shift reserved for the lane axis so the two never collide.
	 */
	private onCardKey(
		event: KeyboardEvent,
		entry: BasesEntry,
		config: BoardConfig,
		at: BoardPosition,
	): void {
		const action = keyAction({
			key: event.key,
			mod: event.ctrlKey || event.metaKey,
			shift: event.shiftKey,
		});
		if (!action) return;
		event.preventDefault();

		if (action.kind === "open") {
			this.openEntry(entry, config, { mod: false, alt: false });
			return;
		}

		if (action.kind === "focus") {
			const target = focusTarget(this.shape(), at, action.direction);
			const path = target ? this.pathAt(target) : null;
			if (path) this.cardElementFor(path)?.focus();
			return;
		}

		const target = moveTarget(this.shape(), at, action.direction);
		if (!target) return;
		this.report(this.moveToPosition(entry, config, target), "Could not move the card.");
	}

	private showCardMenu(
		position: { x: number; y: number },
		entry: BasesEntry,
		config: BoardConfig,
		at: BoardPosition,
		cardEl: HTMLElement,
	): void {
		const menu = new Menu();
		const lane = this.lanes[at.lane];
		const column = lane.columns[at.column];
		const groupProperty = groupByPropertyOf(this.config);
		const scheduleKey = groupProperty ? frontmatterKeyOf(groupProperty) : null;

		menu.addItem((item) =>
			item
				.setTitle("Edit tags")
				.setIcon("lucide-tags")
				.onClick(() => this.report(this.editTags(entry), "Could not edit tags.")),
		);
		menu.addItem((item) =>
			item
				.setTitle("Open")
				.setIcon("lucide-file")
				.onClick(() => this.openEntry(entry, config, { mod: false, alt: false })),
		);
		menu.addItem((item) =>
			item
				.setTitle("Open in new tab")
				.setIcon("lucide-file-plus")
				.onClick(() => this.openEntry(entry, config, { mod: true, alt: false })),
		);
		menu.addItem((item) =>
			item
				.setTitle("Open to the side")
				.setIcon("lucide-separator-vertical")
				.onClick(() => this.openEntry(entry, config, { mod: true, alt: true })),
		);

		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Rename")
				.setIcon("lucide-pencil")
				.onClick(() => this.startRename(cardEl, entry)),
		);
		menu.addItem((item) =>
			item
				.setTitle("Duplicate")
				.setIcon("lucide-copy")
				.onClick(() =>
					this.report(
						this.duplicateCard(entry, config, at),
						"Could not duplicate the card.",
					),
				),
		);

		if (this.dateGrouped && scheduleKey) {
			const now = new Date();
			const currentKey = column?.key ?? null;
			const candidates: [string, Date][] = [
				["Schedule today", now],
				["Schedule tomorrow", addDays(now, 1)],
				["Schedule next week", nextWeekStart(now)],
			];
			const targets = candidates.filter(([, date]) => isoDate(date) !== currentKey);

			if (targets.length > 0) {
				menu.addSeparator();
				for (const [title, date] of targets) {
					menu.addItem((item) =>
						item
							.setTitle(title)
							.setIcon("lucide-calendar")
							.onClick(() =>
								this.report(
									this.scheduleCard(entry, scheduleKey, date),
									"Could not reschedule the card.",
								),
							),
					);
				}
			}
		}

		menu.addSeparator();
		menu.addItem((item) => item.setIsLabel(true).setTitle("Move to column"));
		lane.columns.forEach((col, index) => {
			menu.addItem((item) =>
				item
					.setTitle(col.key ?? NO_VALUE_COLLAPSE_KEY)
					.setChecked(index === at.column)
					.onClick(() => {
						if (index === at.column) return;
						this.moveTo(entry, config, {
							lane: at.lane,
							column: index,
							index: col.entries.length,
						});
					}),
			);
		});

		if (config.swimlaneProperty && this.lanes.length > 1) {
			menu.addSeparator();
			menu.addItem((item) => item.setIsLabel(true).setTitle("Move to lane"));
			this.lanes.forEach((target, index) => {
				const size = target.columns[at.column]?.entries.length ?? 0;
				menu.addItem((item) =>
					item
						.setTitle(target.key ?? NO_VALUE_COLLAPSE_KEY)
						.setChecked(index === at.lane)
						.onClick(() => {
							if (index === at.lane) return;
							this.moveTo(entry, config, {
								lane: index,
								column: at.column,
								index: size,
							});
						}),
				);
			});
		}

		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Delete")
				.setIcon("lucide-trash-2")
				.onClick(() => this.report(this.deleteCard(entry), "Could not delete the card.")),
		);

		menu.showAtPosition(position);
	}

	private async editTags(entry: BasesEntry): Promise<void> {
		const current = parseTagList(this.rawValue(entry, "tags"));
		const next = await PromptModal.prompt(this.app, {
			title: "Edit tags",
			initialValue: current.join(", "),
			placeholder: "task, bug, ...",
		});
		if (next === null) return;

		const tags = parseTagList(next);
		await this.writeFrontMatter(entry.file.path, (frontmatter) => {
			if (tags.length > 0) frontmatter.tags = tags;
			else delete frontmatter.tags;
		});
	}

	/**
	 * Edits the title in place on the card rather than through a popup, since
	 * that is what was asked for. Renames the file itself, the same as
	 * Obsidian's own Rename: any property standing in as the card's display
	 * title is untouched, matching how the rest of the board treats a card's
	 * identity as its file rather than whatever property happens to label it.
	 */
	private startRename(cardEl: HTMLElement, entry: BasesEntry): void {
		const titleEl = cardEl.querySelector<HTMLElement>(".pmb-card-title");
		if (!titleEl) return;
		const original = entry.file.basename;
		titleEl.empty();

		const inputEl = titleEl.createEl("input", { cls: "pmb-card-title-input" });
		inputEl.type = "text";
		inputEl.value = original;

		let settled = false;
		const finish = (commit: boolean): void => {
			if (settled) return;
			settled = true;
			const next = inputEl.value.trim();
			if (!commit || !next || next === original) {
				this.onDataUpdated();
				return;
			}
			// A successful rename redraws through the vault's own rename event;
			// a failed one (a name collision, say) has to redraw here, or the
			// input is left showing with nothing left able to submit it.
			this.renameCardFile(entry, next).catch((error: unknown) => {
				console.error("Could not rename the card.", error);
				new Notice("Could not rename the card.");
				this.onDataUpdated();
			});
		};

		this.registerDomEvent(inputEl, "click", (event) => event.stopPropagation());
		this.registerDomEvent(inputEl, "keydown", (event) => {
			event.stopPropagation();
			if (event.key === "Enter") {
				event.preventDefault();
				finish(true);
			} else if (event.key === "Escape") {
				event.preventDefault();
				finish(false);
			}
		});
		this.registerDomEvent(inputEl, "blur", () => finish(true));

		inputEl.focus();
		inputEl.select();
	}

	private async renameCardFile(entry: BasesEntry, newName: string): Promise<void> {
		const folder = entry.file.parent?.path ?? "";
		await this.app.fileManager.renameFile(entry.file, joinPath(folder, `${newName}.md`));
	}

	/** Inserts the copy right after the original in its own column, rather than leaving it with a tied order key. */
	private async duplicateCard(
		entry: BasesEntry,
		config: BoardConfig,
		at: BoardPosition,
	): Promise<void> {
		const folder = entry.file.parent?.path ?? "";
		const base = entry.file.basename.replace(/-\d+$/, "");
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(joinPath(folder, `${base}-${suffix}.md`))) {
			suffix++;
		}
		const copy = await this.app.vault.copy(
			entry.file,
			joinPath(folder, `${base}-${suffix}.md`),
		);

		const column = this.lanes[at.lane]?.columns[at.column];
		if (!column) return;
		const ordered = sortByOrderKey(column.entries, (e) =>
			this.orderKeyOf(e, config.orderProperty),
		);
		const originalIndex = ordered.findIndex((e) => e.file.path === entry.file.path);
		const plan = planInsertion(
			ordered.map((e) => this.orderKeyOf(e, config.orderProperty)),
			originalIndex === -1 ? ordered.length : originalIndex + 1,
		);
		await this.applyHealedKeys(plan.healed, ordered, config.orderProperty);
		await this.writeFrontMatter(copy.path, (frontmatter) => {
			frontmatter[config.orderProperty] = plan.insertKey;
		});
	}

	private async deleteCard(entry: BasesEntry): Promise<void> {
		const confirmed = await ConfirmModal.confirm(this.app, {
			title: "Delete card",
			message: `Delete "${entry.file.basename}"? The note goes to your configured trash, not permanently deleted.`,
			cta: "Delete",
		});
		if (!confirmed) return;
		await this.app.fileManager.trashFile(entry.file);
	}

	private async scheduleCard(
		entry: BasesEntry,
		frontmatterKey: string,
		date: Date,
	): Promise<void> {
		await this.writeFrontMatter(entry.file.path, (frontmatter) => {
			frontmatter[frontmatterKey] = isoDate(date);
		});
	}

	private moveTo(entry: BasesEntry, config: BoardConfig, to: BoardPosition): void {
		this.report(this.moveToPosition(entry, config, to), "Could not move the card.");
	}

	private async moveToPosition(
		entry: BasesEntry,
		config: BoardConfig,
		to: BoardPosition,
	): Promise<void> {
		const lane = this.lanes[to.lane];
		const column = lane.columns[to.column];
		const ordered = sortByOrderKey(column.entries, (target) =>
			this.orderKeyOf(target, config.orderProperty),
		);
		const movedFrom = ordered.findIndex((target) => target.file.path === entry.file.path);

		this.pendingFocus = entry.file.path;
		await this.moveCard(
			entry.file.path,
			column.key,
			dropIndexFor(to.index, movedFrom),
			column.entries,
			lane.key,
		);
		this.announce(
			`${cardTitle(entry, config)} moved to ${column.key ?? NO_VALUE_COLLAPSE_KEY}, position ${to.index + 1}`,
		);
	}

	/** How many cards sit in each column, with collapsed columns counting none. */
	private shape(): BoardShape {
		const config = readBoardConfig(this.config);
		return this.lanes.map((lane) =>
			lane.columns.map((column) =>
				config.collapsedColumns.has(collapseKey(column.key)) ? 0 : column.entries.length,
			),
		);
	}

	private pathAt(position: BoardPosition): string | null {
		const column = this.lanes[position.lane]?.columns[position.column];
		if (!column) return null;
		const config = readBoardConfig(this.config);
		const ordered = this.displayOrder(column.entries, config.orderProperty);
		return ordered[position.index]?.file.path ?? null;
	}

	private cardLabel(entry: BasesEntry, config: BoardConfig, at: BoardPosition): string {
		const column = this.lanes[at.lane]?.columns[at.column];
		const total = column?.entries.length ?? 0;
		const where = column?.key ?? NO_VALUE_COLLAPSE_KEY;
		return `${cardTitle(entry, config)}, ${where}, ${at.index + 1} of ${total}`;
	}

	private announce(message: string): void {
		if (this.liveEl) this.liveEl.textContent = message;
	}
}

/**
 * The host re-exports moment as a namespace type, which TypeScript does not
 * treat as callable even though it is at runtime. The cast is kept here so it
 * appears once rather than at every call site.
 */
function formatDate(date: Date, pattern: string): string {
	const callable = moment as unknown as (value: Date) => { format: (p: string) => string };
	return callable(date).format(pattern);
}

/** Writes a property, or clears it when the target has no value. */
function assign(frontmatter: Record<string, unknown>, key: string, value: unknown): void {
	if (value === null) delete frontmatter[key];
	else frontmatter[key] = value;
}

/** A property's value as a lane label, or null when it is unset. */
function textValueOf(entry: BasesEntry, property: BasesPropertyId): string | null {
	const text = entry.getValue(property)?.toString().trim();
	return text ? text : null;
}

/** Properties, among the given ones, that hold a list value on at least one entry. */
function listProperties(properties: BasesPropertyId[], entries: BasesEntry[]): BasesPropertyId[] {
	return properties.filter((property) =>
		entries.some((entry) => entry.getValue(property) instanceof ListValue),
	);
}

/** Every distinct value of a list property across entries, sorted for a stable menu. */
function distinctListValues(entries: BasesEntry[], property: BasesPropertyId): string[] {
	const values = new Set<string>();
	for (const entry of entries) {
		const value = entry.getValue(property);
		if (!value) continue;
		for (const item of valuesOf(value)) values.add(item);
	}
	return [...values].sort((a, b) => a.localeCompare(b));
}

/** Whether an entry's list property carries the value the board is filtered to. */
function matchesListFilter(entry: BasesEntry, property: BasesPropertyId, value: string): boolean {
	const propValue = entry.getValue(property);
	return propValue ? valuesOf(propValue).includes(value) : false;
}

function cardBounds(cardsEl: HTMLElement): { top: number; height: number }[] {
	return Array.from(cardsEl.children).map((child) => {
		const rect = child.getBoundingClientRect();
		return { top: rect.top, height: rect.height };
	});
}

function columnBounds(columnsEl: HTMLElement): { left: number; width: number }[] {
	return Array.from(columnsEl.children).map((child) => {
		const rect = child.getBoundingClientRect();
		return { left: rect.left, width: rect.width };
	});
}

/** The touch in a list matching a given identifier, or null once it has lifted. */
function touchWithId(touches: TouchList, id: number): Touch | null {
	for (let index = 0; index < touches.length; index++) {
		if (touches[index].identifier === id) return touches[index];
	}
	return null;
}
