import {
	BasesEntry,
	BasesEntryGroup,
	BasesView,
	Keymap,
	QueryController,
	RenderContext,
} from "obsidian";
import {
	BoardConfig,
	collapseKey,
	lookupColumn,
	NO_VALUE_COLLAPSE_KEY,
	readBoardConfig,
} from "./board-config";
import { renderCard } from "./card";
import { groupKeyOf, sortGroups } from "./column-order";
import { BOARD_VIEW_TYPE } from "./constants";
import { resolveOpenTarget } from "./open-behavior";

export class BoardView extends BasesView {
	type = BOARD_VIEW_TYPE;

	private boardEl: HTMLElement | null = null;
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
		properties: ReturnType<typeof this.config.getOrder>,
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
		for (const entry of group.entries) {
			const cardEl = renderCard(cardsEl, entry, config, properties, this.renderContext);
			this.registerDomEvent(cardEl, "click", (event) => this.openEntry(entry, event, config));
		}
	}

	private openEntry(entry: BasesEntry, event: MouseEvent, config: BoardConfig): void {
		const target = resolveOpenTarget(config.cardOpenBehavior, {
			mod: Keymap.isModEvent(event) !== false,
			alt: event.altKey,
		});
		void this.app.workspace.getLeaf(target).openFile(entry.file);
	}
}
