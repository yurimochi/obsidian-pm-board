import { App, Modal, Notice, setIcon, TFile } from "obsidian";
import { BoardConfig } from "./board-config";
import { TaskProperties } from "./task-properties";

/**
 * Desktop-only floating task editor: title, a free-text description, and a
 * toolbar of property pills (project, due date, tags, priority), per the
 * design handoff. Edits write straight to frontmatter/the file body via
 * `TaskProperties`, the same logic the mobile task-detail sheet uses, so the
 * redraw that follows comes from the vault's own change events rather than
 * anything this modal has to trigger itself.
 */
export class TaskDetailModal extends Modal {
	private readonly props: TaskProperties;
	private titleInputEl!: HTMLInputElement;
	private descriptionEl!: HTMLTextAreaElement;
	private toolbarLeftEl!: HTMLElement;
	private originalTitle = "";
	private originalDescription = "";

	constructor(
		app: App,
		private readonly file: TFile,
		config: BoardConfig,
		/** Called once the modal has fully closed. */
		private readonly onDismiss?: () => void,
	) {
		super(app);
		this.props = new TaskProperties(app, file, config);
		this.modalEl.addClass("pmb-task-detail");
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.originalDescription = await this.props.load();
		this.originalTitle = this.file.basename;

		this.renderTitle();
		this.renderDescription();
		this.renderToolbar();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onDismiss?.();
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

	private renderToolbar(): void {
		this.toolbarLeftEl = this.contentEl.createDiv({ cls: "pmb-td-toolbar" });
		this.renderToolbarLeft();
	}

	private renderToolbarLeft(): void {
		this.toolbarLeftEl.empty();

		this.renderProjectPill();
		this.renderDuePill();
		this.renderTagsPill();
		this.renderPriorityPill();
	}

	private renderProjectPill(): void {
		if (!this.props.hasProject) return;
		const value = this.props.project;

		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		pillEl.toggleClass("pmb-td-pill-empty", !value);
		setIcon(pillEl.createSpan({ cls: "pmb-td-pill-icon" }), "lucide-folder");
		pillEl.createSpan({ cls: "pmb-td-pill-label", text: value || "Project" });
		pillEl.addEventListener("click", () => {
			void this.props.promptProject().then((changed) => {
				if (changed) this.renderToolbarLeft();
			});
		});
	}

	private renderDuePill(): void {
		const value = this.props.due;

		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		pillEl.toggleClass("pmb-td-pill-empty", !value);
		const iconEl = pillEl.createSpan({ cls: "pmb-td-pill-icon" });
		iconEl.toggleClass("pmb-td-pill-icon-accent", !!value);
		setIcon(iconEl, "lucide-calendar");
		const labelEl = pillEl.createSpan({ cls: "pmb-td-pill-label", text: value || "Due" });
		labelEl.toggleClass("pmb-td-pill-label-accent", !!value);
		labelEl.addEventListener("click", () => {
			void this.props.promptDue().then((changed) => {
				if (changed) this.renderToolbarLeft();
			});
		});

		if (!value) return;
		const clearEl = pillEl.createSpan({ cls: "pmb-td-pill-clear" });
		setIcon(clearEl, "lucide-x");
		clearEl.addEventListener("click", (event: MouseEvent) => {
			event.stopPropagation();
			void this.props.clearDue().then(() => this.renderToolbarLeft());
		});
	}

	private renderTagsPill(): void {
		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		setIcon(pillEl.createSpan({ cls: "pmb-td-pill-icon" }), "lucide-tags");
		pillEl.createSpan({ cls: "pmb-td-pill-label", text: "Tags" });
		pillEl.addEventListener("click", () => {
			void this.props.editTags().then((changed) => {
				if (changed) this.renderToolbarLeft();
			});
		});

		for (const tag of this.props.tags) {
			const tagEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-tag" });
			const color = this.props.tagColor(tag);
			if (color) tagEl.style.setProperty("--pmb-td-tag-color", color);
			tagEl.createSpan({ text: tag });
		}
	}

	private renderPriorityPill(): void {
		if (!this.props.hasPriority) return;
		const priority = this.props.priority;

		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		pillEl.toggleClass("pmb-td-pill-empty", !priority);
		if (priority) {
			pillEl.style.setProperty(
				"--pmb-td-priority-color",
				`var(--pmb-td-priority-${priority.toLowerCase()})`,
			);
		}
		const iconEl = pillEl.createSpan({ cls: "pmb-td-pill-icon" });
		iconEl.toggleClass("pmb-td-pill-icon-priority", !!priority);
		setIcon(iconEl, "lucide-flag");
		const labelEl = pillEl.createSpan({
			cls: "pmb-td-pill-label",
			text: priority ?? "Priority",
		});
		labelEl.toggleClass("pmb-td-pill-label-priority", !!priority);
		pillEl.addEventListener("click", (event: MouseEvent) => {
			this.props.showPriorityMenu(event, () => this.renderToolbarLeft());
		});
	}
}
