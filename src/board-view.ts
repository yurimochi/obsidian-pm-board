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
	groupByPropertyOf,
	lookupColumn,
	NO_VALUE_COLLAPSE_KEY,
	readBoardConfig,
} from "./board-config";
import { renderCard } from "./card";
import { groupKeyOf, sortGroups } from "./column-order";
import { BOARD_VIEW_TYPE } from "./constants";
import { coerceGroupValue, frontmatterKeyOf } from "./frontmatter";
import { resolveOpenTarget } from "./open-behavior";
import {
	adjustIndexForRemoval,
	compareOrderKeys,
	insertionIndexAt,
	planInsertion,
	sanitiseOrderKey,
} from "./order";

export class BoardView extends BasesView {
	type = BOARD_VIEW_TYPE;

	private boardEl: HTMLElement | null = null;
	private draggedPath: string | null = null;
	private readonly renderContext: RenderContext = { hoverPopover: null };

	constructor(
		controller: QueryController,
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

		const headerEl = columnEl.createDiv({ cls: "pmb-column-header" });
		headerEl.createSpan({ cls: "pmb-column-title", text: key ?? NO_VALUE_COLLAPSE_KEY });
		headerEl.createSpan({
			cls: "pmb-column-count",
			text:
				limit === null ? String(group.entries.length) : `${group.entries.length}/${limit}`,
		});

		if (collapsed) return;

		const cardsEl = columnEl.createDiv({ cls: "pmb-cards" });
		for (const entry of this.orderedEntries(group, config.orderProperty)) {
			this.renderDraggableCard(cardsEl, entry, config, properties);
		}
		this.registerDropTarget(cardsEl, key);
	}

	private renderDraggableCard(
		cardsEl: HTMLElement,
		entry: BasesEntry,
		config: BoardConfig,
		properties: BasesPropertyId[],
	): void {
		const cardEl = renderCard(cardsEl, entry, config, properties, this.renderContext);
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

	private registerDropTarget(cardsEl: HTMLElement, columnKey: string | null): void {
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
			void this.moveCard(path, columnKey, index);
		});
	}

	private async moveCard(
		path: string,
		columnKey: string | null,
		dropIndex: number,
	): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return;

		const config = readBoardConfig(this.config);
		const groupProperty = groupByPropertyOf(this.config);
		const frontmatterKey = groupProperty ? frontmatterKeyOf(groupProperty) : null;
		if (!frontmatterKey) {
			new Notice("This board groups by a computed property, so its cards cannot be moved.");
			return;
		}

		const group = this.data.groupedData.find((entry) => groupKeyOf(entry) === columnKey);
		const ordered = group ? this.orderedEntries(group, config.orderProperty) : [];
		const movedFrom = ordered.findIndex((entry) => entry.file.path === path);
		const neighbours = ordered.filter((entry) => entry.file.path !== path);

		const plan = planInsertion(
			neighbours.map((entry) => this.orderKeyOf(entry, config.orderProperty)),
			adjustIndexForRemoval(dropIndex, movedFrom),
		);
		const value = coerceGroupValue(columnKey, this.rawValue(neighbours[0], frontmatterKey));

		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: Record<string, unknown>) => {
				if (value === null) delete frontmatter[frontmatterKey];
				else frontmatter[frontmatterKey] = value;
				frontmatter[config.orderProperty] = plan.insertKey;
			},
		);

		for (const [position, healedKey] of plan.healed.entries()) {
			if (healedKey === null) continue;
			await this.app.fileManager.processFrontMatter(
				neighbours[position].file,
				(frontmatter: Record<string, unknown>) => {
					frontmatter[config.orderProperty] = healedKey;
				},
			);
		}
	}

	/**
	 * Manual order overrides the query's own sort, so cards stay where they were
	 * dropped rather than jumping back on the next refresh.
	 */
	private orderedEntries(group: BasesEntryGroup, orderProperty: string): BasesEntry[] {
		return [...group.entries].sort((a, b) =>
			compareOrderKeys(this.orderKeyOf(a, orderProperty), this.orderKeyOf(b, orderProperty)),
		);
	}

	private orderKeyOf(entry: BasesEntry, orderProperty: string): string | null {
		return sanitiseOrderKey(this.rawValue(entry, orderProperty));
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
