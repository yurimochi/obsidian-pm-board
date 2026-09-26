import { App, Modal, Notice, setIcon, TFile } from "obsidian";
import { BoardConfig } from "./board-config";
import {
	drawIcon,
	renderDatePicker,
	renderPriorityPicker,
	renderProjectPicker,
	renderTagPicker,
} from "./task-detail-pickers";
import { TaskProperties } from "./task-properties";

type RowName = "project" | "date" | "tags" | "priority";

/**
 * Mobile-only floating task sheet, from its own design handoff: a grouped
 * property card (title, project, date, priority, tags) plus a description
 * field (the note's body). Each property row opens a bottom sheet — the
 * same pickers the desktop panel's pills open, adapted to touch, so an
 * edit on one platform behaves exactly like the other's. The "..." header
 * button opens the note itself, the same as a long-press card menu's Open,
 * for anything this sheet doesn't cover (arbitrary frontmatter, the native
 * Properties widget, the rest of the note's content).
 */
export class TaskDetailSheet extends Modal {
	private readonly props: TaskProperties;
	private descriptionEl!: HTMLTextAreaElement;
	private groupEl!: HTMLElement;
	private title = "";
	private originalDescription = "";
	/** Set only while the description is focused, so it can be torn down again on blur. */
	private keyboardListener: (() => void) | null = null;
	/** The one property sheet currently open, if any. */
	private openRow: { name: RowName; scrimEl: HTMLElement; sheetEl: HTMLElement } | null = null;

	constructor(
		app: App,
		private readonly file: TFile,
		config: BoardConfig,
		/** Called once the sheet has fully closed. */
		private readonly onDismiss?: () => void,
		/** Dates (YYYY-MM-DD) holding a task on the board, dotted in the date sheet's calendar. */
		private readonly taskDates: Set<string> = new Set(),
	) {
		super(app);
		this.props = new TaskProperties(app, file, config);
		this.modalEl.addClass("pmb-task-detail", "pmb-task-sheet");
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.originalDescription = await this.props.load();
		this.title = this.file.basename;

		this.renderHeader();
		this.groupEl = this.contentEl.createDiv({ cls: "pmb-ts-group" });
		this.renderGroup();
		this.renderDescription();
	}

	onClose(): void {
		this.closeSheet();
		this.clearKeyboardOffset();
		this.contentEl.empty();
		this.onDismiss?.();
	}

	/** A bottom sheet open counts as Obsidian's own modal Escape/backdrop-close target first. */
	close(): void {
		if (this.openRow) {
			this.closeSheet();
			return;
		}
		super.close();
	}

	private renderHeader(): void {
		const headerEl = this.contentEl.createDiv({ cls: "pmb-ts-header" });

		const moreEl = headerEl.createSpan({ cls: "pmb-ts-icon-btn" });
		setIcon(moreEl, "lucide-more-horizontal");
		moreEl.addEventListener("click", () => {
			this.close();
			void this.app.workspace.getLeaf(false).openFile(this.file);
		});

		const closeEl = headerEl.createSpan({ cls: "pmb-ts-icon-btn" });
		setIcon(closeEl, "lucide-x");
		closeEl.addEventListener("click", () => this.close());
	}

	private renderDescription(): void {
		this.descriptionEl = this.contentEl.createEl("textarea", { cls: "pmb-td-description" });
		this.descriptionEl.value = this.originalDescription;
		this.descriptionEl.placeholder = "Add a description...";
		this.descriptionEl.addEventListener("focus", () => this.avoidKeyboard());
		this.descriptionEl.addEventListener("blur", () => {
			void this.commitDescription();
			this.clearKeyboardOffset();
		});
	}

	/**
	 * The description sits low in a sheet that can already run to 85% of the
	 * viewport, and the on-screen keyboard can cover it entirely; Obsidian's
	 * modal doesn't reposition for that on its own. `visualViewport` reports
	 * the space the keyboard actually leaves, so the sheet is capped to that
	 * instead of its usual max-height, and the field is scrolled into what's
	 * left, while focused.
	 */
	private avoidKeyboard(): void {
		const viewport = window.visualViewport;
		if (!viewport) return;
		const reposition = (): void => {
			this.modalEl.style.setProperty(
				"max-height",
				`${Math.max(200, viewport.height - 32)}px`,
			);
			this.descriptionEl.scrollIntoView({ block: "center", behavior: "smooth" });
		};
		this.clearKeyboardOffset();
		viewport.addEventListener("resize", reposition);
		this.keyboardListener = reposition;
		// The keyboard's own show animation hasn't resolved by the time focus fires.
		window.setTimeout(reposition, 300);
	}

	private clearKeyboardOffset(): void {
		if (this.keyboardListener) {
			window.visualViewport?.removeEventListener("resize", this.keyboardListener);
			this.keyboardListener = null;
		}
		this.modalEl.style.removeProperty("max-height");
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
		drawIcon(rowEl.createSpan({ cls: "pmb-ts-row-icon" }), "folder", "pmb-td-muted-icon");
		rowEl.createSpan({ cls: "pmb-ts-row-value", text: value || "Project" });
		drawIcon(rowEl, "chevronRight", "pmb-td-chevron", "2");
		rowEl.addEventListener("click", () => this.openSheet("project"));
		return true;
	}

	private renderDueRow(): boolean {
		const value = this.props.due;

		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row" });
		rowEl.toggleClass("pmb-ts-row-empty", !value);
		drawIcon(
			rowEl.createSpan({ cls: "pmb-ts-row-icon" }),
			"calendar",
			value ? "pmb-td-accent" : "pmb-td-muted-icon",
		);
		const valueEl = rowEl.createSpan({ cls: "pmb-ts-row-value", text: value || "Date" });
		valueEl.toggleClass("pmb-td-pill-label-date", !!value);
		rowEl.addEventListener("click", () => this.openSheet("date"));

		if (value) {
			const clearEl = rowEl.createSpan({
				cls: "pmb-ts-row-clear",
				attr: { role: "button", "aria-label": "Clear date" },
			});
			drawIcon(clearEl, "close", "", "2");
			clearEl.addEventListener("click", (event: MouseEvent) => {
				event.stopPropagation();
				void this.props.setDue(null).then(() => this.renderGroup());
			});
		} else {
			drawIcon(rowEl, "chevronRight", "pmb-td-chevron", "2");
		}
		return true;
	}

	private renderPriorityRow(): boolean {
		if (!this.props.hasPriority) return false;
		const priority = this.props.priority;
		const tone = priority ? `pmb-td-priority-${priority.toLowerCase()}` : "pmb-td-muted-icon";

		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row" });
		rowEl.toggleClass("pmb-ts-row-empty", !priority);
		drawIcon(rowEl.createSpan({ cls: "pmb-ts-row-icon" }), "flag", tone);
		const valueEl = rowEl.createSpan({
			cls: "pmb-ts-row-value",
			text: priority ? `Priority ${priority.slice(1)}` : "Priority",
		});
		if (priority) valueEl.addClass("pmb-td-pill-label-priority", tone);
		drawIcon(rowEl, "chevronRight", "pmb-td-chevron", "2");
		rowEl.addEventListener("click", () => this.openSheet("priority"));
		return true;
	}

	private renderTagsRow(): boolean {
		const rowEl = this.groupEl.createDiv({ cls: "pmb-ts-row pmb-ts-row-tags" });
		drawIcon(rowEl.createSpan({ cls: "pmb-ts-row-icon" }), "tag", "pmb-td-muted-icon");
		const wrapEl = rowEl.createDiv({ cls: "pmb-ts-tag-wrap" });

		const tags = this.props.tags;
		if (tags.length === 0) {
			wrapEl.createSpan({ cls: "pmb-ts-tag-empty", text: "Tags" });
		} else {
			for (const tag of tags) {
				const tagEl = wrapEl.createSpan({ cls: "pmb-ts-tag" });
				const color = this.props.tagColor(tag);
				if (color) tagEl.style.setProperty("--pmb-td-tag-color", color);
				tagEl.setText(tag);
			}
		}
		drawIcon(rowEl, "chevronRight", "pmb-td-chevron", "2");
		rowEl.addEventListener("click", () => this.openSheet("tags"));
		return true;
	}

	/** Opens the bottom sheet for one property row; only one is open at a time. */
	private openSheet(name: RowName): void {
		this.closeSheet();

		const scrimEl = this.modalEl.createDiv({ cls: "pmb-ts-scrim" });
		scrimEl.addEventListener("click", () => this.closeSheet());

		const sheetEl = this.modalEl.createDiv({ cls: "pmb-ts-sheet" });
		this.openRow = { name, scrimEl, sheetEl };

		sheetEl.createDiv({ cls: "pmb-ts-grabber-wrap" }).createSpan({ cls: "pmb-ts-grabber" });
		const bodyEl = sheetEl.createDiv({ cls: "pmb-ts-sheet-body" });

		const focusEl = this.renderSheetBody(name, bodyEl);
		focusEl?.focus();
	}

	private renderSheetBody(name: RowName, bodyEl: HTMLElement): HTMLElement | null {
		const done = (write: Promise<void>): void => {
			this.closeSheet();
			void write.then(() => this.renderGroup());
		};

		switch (name) {
			case "project":
				return renderProjectPicker(bodyEl, {
					projects: this.props.knownProjects(),
					current: this.props.project,
					onPick: (project) => done(this.props.setProject(project)),
				});
			case "date":
				return renderDatePicker(bodyEl, {
					current: this.props.due,
					taskDates: this.taskDates,
					onPick: (date) => done(this.props.setDue(date)),
				});
			case "tags":
				return renderTagPicker(bodyEl, {
					tags: this.props.knownTags(),
					selected: () => this.props.tags,
					colorOf: (tag) => this.props.tagColor(tag),
					onToggle: async (tag) => {
						await this.props.toggleTag(tag);
						this.renderGroup();
					},
				});
			case "priority":
				renderPriorityPicker(bodyEl, {
					current: this.props.priority,
					onPick: (priority) => done(this.props.setPriority(priority)),
				});
				return null;
		}
	}

	private closeSheet(): void {
		if (!this.openRow) return;
		this.openRow.scrimEl.detach();
		this.openRow.sheetEl.detach();
		this.openRow = null;
	}
}
