import {
	BasesEntry,
	BasesEntryGroup,
	BasesPropertyId,
	BasesView,
	Keymap,
	Notice,
	QueryController,
	RenderContext,
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
} from "./board-config";
import { renderCard } from "./card";
import { groupKeyOf, sortGroups } from "./column-order";
import { BOARD_VIEW_TYPE } from "./constants";
import { parseCoverReference } from "./cover";
import { coerceGroupValue, frontmatterKeyOf } from "./frontmatter";
import { resolveOpenTarget } from "./open-behavior";
import {
	adjustIndexForRemoval,
	insertionIndexAt,
	planInsertion,
	resolveOrderKey,
	sortByOrderKey,
} from "./order";

export class BoardView extends BasesView {
	type = BOARD_VIEW_TYPE;

	private boardEl: HTMLElement | null = null;
	private draggedPath: string | null = null;
	private readonly renderContext: RenderContext = { hoverPopover: null };

	constructor(
		private readonly controller: QueryController,
		private readonly containerEl: HTMLElement,
	) {
		super(controller);
	}

	onload(): void {
		this.boardEl = this.containerEl.createDiv({ cls: "pmb-board" });
	}

	onunload(): void {
		this.boardEl?.detach();
		this.boardEl = null;
	}

	onDataUpdated(): void {
		if (!this.boardEl) return;
		const config = readBoardConfig(this.config);
		const properties = this.config.getOrder();
		this.boardEl.empty();
		for (const group of sortGroups(this.data.groupedData, config.boardColumns)) {
			this.renderColumn(this.boardEl, group, config, properties);
		}
	}

	private renderColumn(
		parentEl: HTMLElement,
		group: BasesEntryGroup,
		config: BoardConfig,
		properties: BasesPropertyId[],
	): void {
		const key = groupKeyOf(group);
		const collapsed = config.collapsedColumns.has(collapseKey(key));
		const limit = lookupColumn(config.wipLimits, key);

		const columnEl = parentEl.createDiv({ cls: "pmb-column" });
		columnEl.toggleClass("pmb-column-collapsed", collapsed);
		columnEl.toggleClass(
			"pmb-column-over-limit",
			limit !== null && group.entries.length > limit,
		);

		const headerEl = columnEl.createEl("button", { cls: "pmb-column-header" });
		headerEl.setAttribute("aria-expanded", String(!collapsed));
		headerEl.createSpan({ cls: "pmb-column-title", text: key ?? NO_VALUE_COLLAPSE_KEY });
		headerEl.createSpan({
			cls: "pmb-column-count",
			text:
				limit === null ? String(group.entries.length) : `${group.entries.length}/${limit}`,
		});
		this.registerDomEvent(headerEl, "click", () => this.toggleColumn(key, collapsed));

		if (collapsed) return;

		const ordered = sortByOrderKey(group.entries, (entry) =>
			this.orderKeyOf(entry, config.orderProperty),
		);

		const cardsEl = columnEl.createDiv({ cls: "pmb-cards" });
		for (const entry of ordered) {
			this.renderDraggableCard(cardsEl, entry, config, properties);
		}
		this.registerDropTarget(cardsEl, key, ordered);

		const addEl = columnEl.createEl("button", { cls: "pmb-add-card", text: "Add card" });
		this.registerDomEvent(addEl, "click", () => void this.addCard(key, config, ordered));
	}

	private renderDraggableCard(
		cardsEl: HTMLElement,
		entry: BasesEntry,
		config: BoardConfig,
		properties: BasesPropertyId[],
	): void {
		const cardEl = renderCard(
			cardsEl,
			entry,
			config,
			properties,
			this.renderContext,
			(target) => this.coverSrcOf(target, config),
		);
		cardEl.draggable = true;

		this.registerDomEvent(cardEl, "click", (event) => this.openEntry(entry, event, config));
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
	}

	private registerDropTarget(
		cardsEl: HTMLElement,
		columnKey: string | null,
		columnEntries: BasesEntry[],
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
			void this.moveCard(path, columnKey, index, columnEntries);
		});
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

		// Renumber first: creating a note hands off to the host's new-note flow,
		// and anything queued after that call is at the mercy of when, or
		// whether, it comes back. The keys below belong to notes that already
		// exist, so writing them now leaves the column consistent either way.
		await this.applyHealedKeys(plan.healed, ordered, config.orderProperty);

		await this.createFileForView(undefined, (frontmatter: Record<string, unknown>) => {
			// The board's own bookkeeping wins over configured defaults, so a
			// default cannot place the new card outside the column it came from.
			Object.assign(frontmatter, config.newItemProperties);
			if (frontmatterKey && value !== null) frontmatter[frontmatterKey] = value;
			frontmatter[config.orderProperty] = plan.insertKey;
		});
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
	): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return;

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
		const neighbours = ordered.filter((entry) => entry.file.path !== path);

		const plan = planInsertion(
			neighbours.map((entry) => this.orderKeyOf(entry, config.orderProperty)),
			adjustIndexForRemoval(dropIndex, movedFrom),
		);
		const value = coerceGroupValue(columnKey, this.rawValue(neighbours[0], frontmatterKey));

		await this.applyHealedKeys(plan.healed, neighbours, config.orderProperty);

		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: Record<string, unknown>) => {
				if (value === null) delete frontmatter[frontmatterKey];
				else frontmatter[frontmatterKey] = value;
				frontmatter[config.orderProperty] = plan.insertKey;
			},
		);
	}

	private async applyHealedKeys(
		healed: (string | null)[],
		entries: BasesEntry[],
		orderProperty: string,
	): Promise<void> {
		for (const [position, key] of healed.entries()) {
			const entry = entries[position];
			if (key === null || !entry) continue;
			await this.app.fileManager.processFrontMatter(
				entry.file,
				(frontmatter: Record<string, unknown>) => {
					frontmatter[orderProperty] = key;
				},
			);
		}
	}

	/**
	 * Manual order overrides the query's own sort, so a card stays where it was
	 * dropped rather than jumping back on the next refresh.
	 */
	private orderKeyOf(entry: BasesEntry, orderProperty: string): string | null {
		return resolveOrderKey(
			this.rawValue(entry, orderProperty),
			this.rawValue(entry, LEGACY_ORDER_PROPERTY),
			orderProperty === DEFAULT_ORDER_PROPERTY,
		);
	}

	private rawValue(entry: BasesEntry | undefined, property: string): unknown {
		if (!entry) return undefined;
		return this.app.metadataCache.getFileCache(entry.file)?.frontmatter?.[property];
	}

	private openEntry(entry: BasesEntry, event: MouseEvent, config: BoardConfig): void {
		const target = resolveOpenTarget(config.cardOpenBehavior, {
			mod: Keymap.isModEvent(event) !== false,
			alt: event.altKey,
		});
		void this.app.workspace.getLeaf(target).openFile(entry.file);
	}
}

function cardBounds(cardsEl: HTMLElement): { top: number; height: number }[] {
	return Array.from(cardsEl.children).map((child) => {
		const rect = child.getBoundingClientRect();
		return { top: rect.top, height: rect.height };
	});
}
