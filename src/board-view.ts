import { BasesEntry, BasesEntryGroup, BasesView, QueryController } from "obsidian";
import {
	BoardConfig,
	collapseKey,
	lookupColumn,
	NO_VALUE_COLLAPSE_KEY,
	readBoardConfig,
} from "./board-config";
import { groupKeyOf, sortGroups } from "./column-order";
import { BOARD_VIEW_TYPE } from "./constants";

export class BoardView extends BasesView {
	type = BOARD_VIEW_TYPE;

	private boardEl: HTMLElement | null = null;

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
		this.boardEl.empty();
		for (const group of sortGroups(this.data.groupedData, config.boardColumns)) {
			this.renderColumn(this.boardEl, group, config);
		}
	}

	private renderColumn(parentEl: HTMLElement, group: BasesEntryGroup, config: BoardConfig): void {
		const key = groupKeyOf(group);
		const collapsed = config.collapsedColumns.has(collapseKey(key));

		const columnEl = parentEl.createDiv({ cls: "pmb-column" });
		columnEl.toggleClass("pmb-column-collapsed", collapsed);

		const limit = lookupColumn(config.wipLimits, key);
		const overLimit = limit !== null && group.entries.length > limit;
		columnEl.toggleClass("pmb-column-over-limit", overLimit);

		const headerEl = columnEl.createDiv({ cls: "pmb-column-header" });
		headerEl.createSpan({ cls: "pmb-column-title", text: key ?? NO_VALUE_COLLAPSE_KEY });
		headerEl.createSpan({
			cls: "pmb-column-count",
			text:
				limit === null ? String(group.entries.length) : `${group.entries.length}/${limit}`,
		});

		if (collapsed) return;

		const cardsEl = columnEl.createDiv({ cls: "pmb-cards" });
		for (const entry of group.entries) {
			this.renderCard(cardsEl, entry);
		}
	}

	private renderCard(parentEl: HTMLElement, entry: BasesEntry): void {
		const cardEl = parentEl.createDiv({ cls: "pmb-card" });
		cardEl.createDiv({ cls: "pmb-card-title", text: entry.file.basename });
	}
}
