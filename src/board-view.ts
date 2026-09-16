import { BasesEntry, BasesEntryGroup, BasesView, QueryController } from "obsidian";
import { BOARD_VIEW_TYPE, NO_VALUE_LABEL } from "./constants";

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
		this.boardEl.empty();
		for (const group of this.data.groupedData) {
			this.renderColumn(this.boardEl, group);
		}
	}

	private renderColumn(parentEl: HTMLElement, group: BasesEntryGroup): void {
		const columnEl = parentEl.createDiv({ cls: "pmb-column" });
		const headerEl = columnEl.createDiv({ cls: "pmb-column-header" });
		headerEl.createSpan({
			cls: "pmb-column-title",
			text: group.hasKey() ? String(group.key) : NO_VALUE_LABEL,
		});
		headerEl.createSpan({
			cls: "pmb-column-count",
			text: String(group.entries.length),
		});

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
