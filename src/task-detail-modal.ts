import { App, Modal, Notice, TFile } from "obsidian";
import { BoardConfig } from "./board-config";
import {
	drawIcon,
	renderDatePicker,
	renderPriorityPicker,
	renderProjectPicker,
	renderTagPicker,
} from "./task-detail-pickers";
import { TaskProperties } from "./task-properties";

type PickerName = "project" | "date" | "tags" | "priority";

interface Pill {
	wrapEl: HTMLElement;
	pillEl: HTMLElement;
}

/**
 * Desktop-only floating task editor, per its design handoff: a close button,
 * the title, a free-text description, and a row of property pills (project,
 * due date, tags, priority), each opening its own picker popover above it.
 * Edits write straight to frontmatter/the file body via `TaskProperties`,
 * the same logic the mobile task-detail sheet uses, so the redraw that
 * follows comes from the vault's own change events rather than anything
 * this modal has to trigger itself.
 */
export class TaskDetailModal extends Modal {
	private readonly props: TaskProperties;
	private titleInputEl!: HTMLInputElement;
	private descriptionEl!: HTMLTextAreaElement;
	private originalTitle = "";
	private originalDescription = "";
	private readonly pills = new Map<PickerName, Pill>();
	/** The one picker currently open, if any. */
	private openPicker: { name: PickerName; popoverEl: HTMLElement } | null = null;
	/**
	 * Set when a pointer goes down outside the modal while a picker is open:
	 * that press only closes the picker, so the click that follows it must
	 * not also reach the modal's backdrop and close the whole floating.
	 */
	private swallowClick = false;

	constructor(
		app: App,
		private readonly file: TFile,
		config: BoardConfig,
		/** Called once the modal has fully closed. */
		private readonly onDismiss?: () => void,
		/** Dates (YYYY-MM-DD) holding a task on the board, dotted in the calendar. */
		private readonly taskDates: Set<string> = new Set(),
	) {
		super(app);
		this.props = new TaskProperties(app, file, config);
		this.modalEl.addClass("pmb-task-detail", "pmb-td-desktop");
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.originalDescription = await this.props.load();
		this.originalTitle = this.file.basename;

		this.renderCloseButton();
		this.renderTitle();
		this.renderDescription();
		this.renderToolbar();

		const doc = this.modalEl.doc;
		doc.addEventListener("pointerdown", this.onPointerDown, true);
		doc.addEventListener("click", this.onClickCapture, true);
	}

	onClose(): void {
		const doc = this.modalEl.doc;
		doc.removeEventListener("pointerdown", this.onPointerDown, true);
		doc.removeEventListener("click", this.onClickCapture, true);
		this.contentEl.empty();
		this.onDismiss?.();
	}

	/** Escape (and anything else that asks the modal to close) closes an open picker first. */
	close(): void {
		if (this.openPicker) {
			this.closePicker();
			return;
		}
		super.close();
	}

	private readonly onPointerDown = (event: PointerEvent): void => {
		if (!this.openPicker) return;
		const target = event.target as Node;
		const pill = this.pills.get(this.openPicker.name);
		// The picker itself, and its own pill (whose click toggles it), are inside.
		if (this.openPicker.popoverEl.contains(target) || pill?.pillEl.contains(target)) return;
		this.closePicker();
		if (!this.modalEl.contains(target)) this.swallowClick = true;
	};

	private readonly onClickCapture = (event: MouseEvent): void => {
		if (!this.swallowClick) return;
		this.swallowClick = false;
		event.preventDefault();
		event.stopPropagation();
	};

	private renderCloseButton(): void {
		const closeEl = this.contentEl.createDiv({
			cls: "pmb-td-close",
			attr: { role: "button", "aria-label": "Close" },
		});
		drawIcon(closeEl, "close", "", "2");
		closeEl.addEventListener("click", () => this.close());
	}

	private renderTitle(): void {
		this.titleInputEl = this.contentEl.createEl("input", { cls: "pmb-td-title", type: "text" });
		this.titleInputEl.value = this.originalTitle;
		this.titleInputEl.placeholder = "Task name";
		this.titleInputEl.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				this.titleInputEl.blur();
			} else if (event.key === "Escape") {
				event.preventDefault();
				this.titleInputEl.value = this.originalTitle;
				this.titleInputEl.blur();
			}
		});
		this.titleInputEl.addEventListener("blur", () => void this.commitTitle());
	}

	private async commitTitle(): Promise<void> {
		const next = this.titleInputEl.value.trim();
		if (!next || next === this.originalTitle) {
			this.titleInputEl.value = this.originalTitle;
			return;
		}
		try {
			await this.props.renameTo(next);
			this.originalTitle = next;
		} catch (error) {
			console.error("PM-Board: could not rename the card.", error);
			new Notice("Could not rename the card.");
			this.titleInputEl.value = this.originalTitle;
		}
	}

	private renderDescription(): void {
		this.descriptionEl = this.contentEl.createEl("textarea", { cls: "pmb-td-description" });
		this.descriptionEl.value = this.originalDescription;
		this.descriptionEl.placeholder = "Add a description...";
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

	private renderToolbar(): void {
		const toolbarEl = this.contentEl.createDiv({ cls: "pmb-td-toolbar" });
		const names: PickerName[] = ["project", "date", "tags", "priority"];
		for (const name of names) {
			if (name === "project" && !this.props.hasProject) continue;
			if (name === "priority" && !this.props.hasPriority) continue;
			const wrapEl = toolbarEl.createDiv({ cls: "pmb-td-pill-wrap" });
			const pillEl = wrapEl.createDiv({ cls: "pmb-td-pill", attr: { role: "button" } });
			pillEl.addEventListener("click", () => this.togglePicker(name));
			this.pills.set(name, { wrapEl, pillEl });
			this.renderPill(name);
		}
	}

	/** Redraws one pill's own content; its open picker, a sibling, is left alone. */
	private renderPill(name: PickerName): void {
		const pill = this.pills.get(name);
		if (!pill) return;
		const { pillEl } = pill;
		pillEl.empty();
		pillEl.toggleClass("pmb-td-pill-active", this.openPicker?.name === name);

		const label = (text: string, empty: boolean, cls = ""): HTMLElement => {
			pillEl.toggleClass("pmb-td-pill-empty", empty);
			return pillEl.createSpan({ cls: `pmb-td-pill-label ${cls}`.trim(), text });
		};

		switch (name) {
			case "project": {
				const project = this.props.project;
				drawIcon(pillEl, "folder", "pmb-td-muted-icon");
				label(project || "Project", !project);
				return;
			}
			case "date": {
				const due = this.props.due;
				drawIcon(pillEl, "calendar", due ? "pmb-td-accent" : "pmb-td-muted-icon");
				label(due || "Date", !due, due ? "pmb-td-pill-label-date" : "");
				if (!due) return;
				const clearEl = pillEl.createSpan({
					cls: "pmb-td-pill-clear",
					attr: { role: "button", "aria-label": "Clear date" },
				});
				drawIcon(clearEl, "close", "", "2");
				clearEl.addEventListener("click", (event) => {
					event.stopPropagation();
					this.closePicker();
					void this.props.setDue(null).then(() => this.renderPill("date"));
				});
				return;
			}
			case "tags": {
				const tags = this.props.tags;
				drawIcon(pillEl, "tag", "pmb-td-muted-icon");
				label(
					tags.length > 0 ? tags.join(", ") : "Tags",
					tags.length === 0,
					"pmb-td-pill-label-tags",
				);
				return;
			}
			case "priority": {
				const priority = this.props.priority;
				const tone = priority ? `pmb-td-priority-${priority.toLowerCase()}` : "";
				drawIcon(pillEl, "flag", priority ? tone : "pmb-td-muted-icon");
				label(
					priority ?? "Priority",
					!priority,
					priority ? `pmb-td-pill-label-priority ${tone}` : "",
				);
				return;
			}
		}
	}

	private togglePicker(name: PickerName): void {
		const wasOpen = this.openPicker?.name === name;
		this.closePicker();
		if (wasOpen) return;

		const pill = this.pills.get(name);
		if (!pill) return;
		const popoverEl = pill.wrapEl.createDiv({ cls: "pmb-td-popover" });
		this.openPicker = { name, popoverEl };
		pill.pillEl.addClass("pmb-td-pill-active");

		const focusEl = this.renderPicker(name, popoverEl);
		this.keepInsideWindow(popoverEl);
		focusEl?.focus();
	}

	private renderPicker(name: PickerName, popoverEl: HTMLElement): HTMLElement | null {
		const done = (write: Promise<void>): void => {
			this.closePicker();
			void write.then(() => this.renderPill(name));
		};

		switch (name) {
			case "project":
				return renderProjectPicker(popoverEl, {
					projects: this.props.knownProjects(),
					current: this.props.project,
					onPick: (project) => done(this.props.setProject(project)),
				});
			case "date":
				return renderDatePicker(popoverEl, {
					current: this.props.due,
					taskDates: this.taskDates,
					onPick: (date) => done(this.props.setDue(date)),
				});
			case "tags":
				return renderTagPicker(popoverEl, {
					tags: this.props.knownTags(),
					selected: () => this.props.tags,
					colorOf: (tag) => this.props.tagColor(tag),
					onToggle: async (tag) => {
						await this.props.toggleTag(tag);
						this.renderPill("tags");
					},
				});
			case "priority":
				renderPriorityPicker(popoverEl, {
					current: this.props.priority,
					onPick: (priority) => done(this.props.setPriority(priority)),
				});
				return null;
		}
	}

	/** Shifts a popover left when opening at its pill would run it off the window's right edge. */
	private keepInsideWindow(popoverEl: HTMLElement): void {
		const win = this.modalEl.win;
		const overflow = popoverEl.getBoundingClientRect().right - (win.innerWidth - 8);
		if (overflow > 0) popoverEl.setCssStyles({ left: `${-overflow}px` });
	}

	private closePicker(): void {
		if (!this.openPicker) return;
		this.pills.get(this.openPicker.name)?.pillEl.removeClass("pmb-td-pill-active");
		this.openPicker.popoverEl.detach();
		this.openPicker = null;
	}
}
