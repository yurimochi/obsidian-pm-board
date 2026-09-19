import { App, Modal, Notice, setIcon, TFile } from "obsidian";
import { BoardConfig } from "./board-config";
import { TaskProperties } from "./task-properties";

/**
 * Mobile-only floating task sheet: a tap-to-edit summary of a card's
 * properties (project, due date, tags, priority), per the design handoff,
 * plus a description field (the note's body) for parity with the desktop
 * floating. The "..." header button opens the note itself, the same as a
 * long-press card menu's Open, for anything this sheet doesn't cover
 * (arbitrary frontmatter, the native Properties widget, the rest of the
 * note's content).
 */
export class TaskDetailSheet extends Modal {
	private readonly props: TaskProperties;
	private descriptionEl!: HTMLTextAreaElement;
	private groupEl!: HTMLElement;
	private title = "";
	private originalDescription = "";

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
		this.originalDescription = await this.props.load();
		this.title = this.file.basename;

		this.renderHandle();
		this.renderHeader();
		this.renderDescription();
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

		const moreEl = headerEl.createSpan({ cls: "pmb-ts-icon-btn" });
		setIcon(moreEl, "lucide-more-horizontal");
		moreEl.addEventListener("click", () => {
			this.close();
			void this.app.workspace.getLeaf(false).openFile(this.file);
		});
	}

	private renderDescription(): void {
		this.descriptionEl = this.contentEl.createEl("textarea", { cls: "pmb-td-description" });
		this.descriptionEl.value = this.originalDescription;
		this.descriptionEl.placeholder = "Add a description…";
		this.descriptionEl.addEventListener("blur", () => void this.commitDescription());
	}

	private async commitDescription(): Promise<void> {
		const next = this.descriptionEl.value.trim();
		if (next === this.originalDescription) return;
		try {
			await this.props.commitDescription(next);
			this.originalDescription = next;
		} catch (error) {
			console.error("PM-Board: could not update the description.", error);
			new Notice("Could not update the description.");
		}
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

		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row" });
		rowEl.toggleClass("pmb-ts-row-accent", !!value);
		rowEl.toggleClass("pmb-ts-row-empty", !value);
		setIcon(rowEl.createSpan({ cls: "pmb-ts-row-icon" }), "lucide-calendar");
		rowEl.createSpan({ cls: "pmb-ts-row-value", text: value || "Due" });
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

		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row" });
		rowEl.toggleClass("pmb-ts-row-empty", !priority);
		if (priority) {
			rowEl.style.setProperty(
				"--pmb-td-priority-color",
				`var(--pmb-td-priority-${priority.toLowerCase()})`,
			);
		}
		const iconEl = rowEl.createSpan({ cls: "pmb-ts-row-icon" });
		iconEl.toggleClass("pmb-ts-row-icon-priority", !!priority);
		setIcon(iconEl, "lucide-flag");
		const valueEl = rowEl.createSpan({ cls: "pmb-ts-row-value" });
		valueEl.toggleClass("pmb-ts-row-value-priority", !!priority);
		valueEl.setText(priority ? `Priority ${priority.slice(1)}` : "Priority");
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
