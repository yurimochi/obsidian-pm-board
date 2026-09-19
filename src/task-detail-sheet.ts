import { App, Modal, setIcon, TFile } from "obsidian";
import { BoardConfig } from "./board-config";
import { TaskProperties } from "./task-properties";

/**
 * Mobile-only floating task sheet: a read-mostly, tap-to-edit summary of a
 * card's properties (project, due date, tags, priority), per the design
 * handoff. The note's own body isn't shown here — unlike the desktop
 * floating, this design has no description field, matching the original
 * screen's fields exactly. The full note is still one tap away, either via
 * a long-press card menu's Open, or another Card Detail setting.
 */
export class TaskDetailSheet extends Modal {
	private readonly props: TaskProperties;
	private groupEl!: HTMLElement;
	private title = "";

	constructor(
		app: App,
		private readonly file: TFile,
		config: BoardConfig,
		/** Called once the sheet has fully closed. */
		private readonly onDismiss?: () => void,
	) {
		super(app);
		this.props = new TaskProperties(app, file, config);
		this.modalEl.addClass("pmb-task-detail");
		this.modalEl.addClass("pmb-task-sheet");
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		await this.props.load();
		this.title = this.file.basename;

		this.renderHandle();
		this.renderHeader();
		this.groupEl = this.contentEl.createDiv({ cls: "pmb-ts-group" });
		this.renderGroup();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onDismiss?.();
	}

	private renderHandle(): void {
		const wrapEl = this.contentEl.createDiv({ cls: "pmb-ts-handle-wrap" });
		wrapEl.createDiv({ cls: "pmb-ts-handle" });
	}

	private renderHeader(): void {
		const headerEl = this.contentEl.createDiv({ cls: "pmb-ts-header" });

		const closeEl = headerEl.createSpan({ cls: "pmb-ts-icon-btn" });
		setIcon(closeEl, "lucide-x");
		closeEl.addEventListener("click", () => this.close());

		// A placeholder for a future menu, same as the design handoff: no
		// defined action yet.
		const moreEl = headerEl.createSpan({ cls: "pmb-ts-icon-btn" });
		setIcon(moreEl, "lucide-more-horizontal");
	}

	private renderGroup(): void {
		this.groupEl.empty();
		const rows = [
			() => this.renderTitleRow(),
			() => this.renderProjectRow(),
			() => this.renderDueRow(),
			() => this.renderPriorityRow(),
			() => this.renderTagsRow(),
		];

		let rendered = false;
		for (const row of rows) {
			if (rendered) this.groupEl.createDiv({ cls: "pmb-ts-divider" });
			if (row()) rendered = true;
		}
	}

	/** Each row returns whether it actually rendered, so dividers land only between rows that exist. */
	private renderTitleRow(): boolean {
		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row pmb-ts-row-title" });
		const ringEl = rowEl.createSpan({ cls: "pmb-ts-ring" });
		ringEl.toggleClass("pmb-ts-ring-overdue", this.isOverdue());
		rowEl.createSpan({ cls: "pmb-ts-title-text", text: this.title });
		return true;
	}

	/** Today or later reads as not overdue; an unparseable or absent due date reads the same way. */
	private isOverdue(): boolean {
		const due = this.props.due;
		if (!due) return false;
		const date = new Date(due);
		if (Number.isNaN(date.getTime())) return false;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return date.getTime() < today.getTime();
	}

	private renderProjectRow(): boolean {
		if (!this.props.hasProject) return false;
		const value = this.props.project;

		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row" });
		rowEl.toggleClass("pmb-ts-row-empty", !value);
		setIcon(rowEl.createSpan({ cls: "pmb-ts-row-icon" }), "lucide-folder");
		rowEl.createSpan({ cls: "pmb-ts-row-value", text: value || "Project" });
		rowEl.addEventListener("click", () => {
			void this.props.promptProject().then((changed) => {
				if (changed) this.renderGroup();
			});
		});
		return true;
	}

	private renderDueRow(): boolean {
		const value = this.props.due;
		if (!value) return false;

		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row pmb-ts-row-accent" });
		setIcon(rowEl.createSpan({ cls: "pmb-ts-row-icon" }), "lucide-calendar");
		rowEl.createSpan({ cls: "pmb-ts-row-value", text: value });
		rowEl.addEventListener("click", () => {
			void this.props.promptDue().then((changed) => {
				if (changed) this.renderGroup();
			});
		});
		return true;
	}

	private renderPriorityRow(): boolean {
		if (!this.props.hasPriority) return false;
		const priority = this.props.priority;
		if (!priority) return false;

		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row" });
		rowEl.style.setProperty(
			"--pmb-td-priority-color",
			`var(--pmb-td-priority-${priority.toLowerCase()})`,
		);
		setIcon(
			rowEl.createSpan({ cls: "pmb-ts-row-icon pmb-ts-row-icon-priority" }),
			"lucide-flag",
		);
		rowEl.createSpan({
			cls: "pmb-ts-row-value pmb-ts-row-value-priority",
			text: `Priority ${priority.slice(1)}`,
		});
		rowEl.addEventListener("click", (event: MouseEvent) => {
			this.props.showPriorityMenu(event, () => this.renderGroup());
		});
		return true;
	}

	private renderTagsRow(): boolean {
		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row pmb-ts-row-tags" });
		setIcon(rowEl.createSpan({ cls: "pmb-ts-row-icon" }), "lucide-tags");
		const wrapEl = rowEl.createDiv({ cls: "pmb-ts-tag-wrap" });

		const tags = this.props.tags;
		if (tags.length === 0) {
			wrapEl.createSpan({ cls: "pmb-ts-tag-empty", text: "No tags" });
		} else {
			for (const tag of tags) {
				const tagEl = wrapEl.createSpan({ cls: "pmb-ts-tag" });
				const color = this.props.tagColor(tag);
				if (color) tagEl.style.setProperty("--pmb-td-tag-color", color);
				tagEl.setText(tag);
			}
		}
		rowEl.addEventListener("click", () => {
			void this.props.editTags().then((changed) => {
				if (changed) this.renderGroup();
			});
		});
		return true;
	}
}
