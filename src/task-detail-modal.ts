import { App, Menu, Modal, Notice, setIcon, TFile } from "obsidian";
import { BoardConfig } from "./board-config";
import { HIDDEN_TAG } from "./card";
import { frontmatterKeyOf } from "./frontmatter";
import { PRIORITY_LABELS, PriorityLabel, priorityOf } from "./priority";
import { parseTagList } from "./tag-colors";
import { PromptModal } from "./prompt-modal";

/** Fixed, like `tags`: not a per-board configurable property. */
const DUE_PROPERTY = "due";

/** A frontmatter value as display text, or "" for anything that isn't already text-shaped. */
function textOf(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

/**
 * Desktop-only floating task editor: title, a free-text description, and a
 * toolbar of property pills (project, due date, tags, priority), per the
 * design handoff. Edits write straight to frontmatter/the file body, the
 * same primitives the board's own card menu already uses, so the redraw
 * that follows comes from the vault's own change events rather than
 * anything this modal has to trigger itself.
 *
 * Replaces the live-leaf modal only on desktop; mobile keeps that one until
 * this floating gets its own mobile design.
 */
export class TaskDetailModal extends Modal {
	private titleInputEl!: HTMLInputElement;
	private descriptionEl!: HTMLTextAreaElement;
	private toolbarLeftEl!: HTMLElement;
	private frontmatter: Record<string, unknown> = {};
	private originalTitle = "";
	private originalDescription = "";
	private frontmatterEnd: number | null = null;

	constructor(
		app: App,
		private readonly file: TFile,
		private readonly config: BoardConfig,
		/** Called once the modal has fully closed. */
		private readonly onDismiss?: () => void,
	) {
		super(app);
		this.modalEl.addClass("pmb-task-detail");
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		const content = await this.app.vault.read(this.file);
		const cache = this.app.metadataCache.getFileCache(this.file);
		this.frontmatterEnd = cache?.frontmatterPosition?.end.offset ?? null;
		this.frontmatter = { ...(cache?.frontmatter ?? {}) };
		this.originalTitle = this.file.basename;
		this.originalDescription =
			this.frontmatterEnd === null
				? content.trim()
				: content.slice(this.frontmatterEnd).trim();

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
		const folder = this.file.parent?.path ?? "";
		try {
			await this.app.fileManager.renameFile(
				this.file,
				folder ? `${folder}/${next}.md` : `${next}.md`,
			);
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
			const content = await this.app.vault.read(this.file);
			const head =
				this.frontmatterEnd === null
					? ""
					: content.slice(0, this.frontmatterEnd).replace(/\s+$/, "");
			await this.app.vault.modify(this.file, head ? `${head}\n\n${next}\n` : `${next}\n`);
			this.originalDescription = next;
		} catch (error) {
			console.error("PM-Board: could not update the description.", error);
			new Notice("Could not update the description.");
		}
	}

	private renderToolbar(): void {
		const rowEl = this.contentEl.createDiv({ cls: "pmb-td-toolbar" });
		this.toolbarLeftEl = rowEl.createDiv({ cls: "pmb-td-toolbar-left" });
		this.renderToolbarLeft();

		const rightEl = rowEl.createDiv({ cls: "pmb-td-toolbar-right" });
		const closeEl = rightEl.createSpan({ cls: "pmb-td-icon-btn" });
		setIcon(closeEl, "lucide-x");
		closeEl.addEventListener("click", () => this.close());

		// No destination in the design handoff either; a visual placeholder only.
		const submitEl = rightEl.createSpan({ cls: "pmb-td-submit" });
		setIcon(submitEl, "lucide-arrow-up");
	}

	private renderToolbarLeft(): void {
		this.toolbarLeftEl.empty();

		const addEl = this.toolbarLeftEl.createSpan({ cls: "pmb-td-icon-btn" });
		setIcon(addEl, "lucide-plus");
		addEl.addEventListener("click", (event: MouseEvent) => this.showAddFieldMenu(event));

		if (this.config.projectProperty) this.renderProjectPill();
		this.renderDuePill();

		const tagsIconEl = this.toolbarLeftEl.createSpan({ cls: "pmb-td-icon-btn" });
		setIcon(tagsIconEl, "lucide-tags");
		tagsIconEl.addEventListener("click", () => void this.editTags());

		this.renderTagPills();

		if (this.config.priorityProperty) this.renderPriorityPill();
	}

	private renderProjectPill(): void {
		const key = frontmatterKeyOf(this.config.projectProperty as string);
		if (!key) return;
		const raw = this.frontmatter[key];
		const value = typeof raw === "string" ? raw.trim() : "";

		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		setIcon(pillEl.createSpan({ cls: "pmb-td-pill-icon" }), "lucide-folder");
		pillEl.createSpan({ cls: "pmb-td-pill-label", text: value || "Project" });
		pillEl.addEventListener("click", () => void this.promptProject(key, value));
	}

	private async promptProject(key: string, current: string): Promise<void> {
		const next = await PromptModal.prompt(this.app, {
			title: "Set project",
			initialValue: current,
			placeholder: "Project name",
			showClear: true,
		});
		if (next === null) return;
		await this.writeFrontmatter((frontmatter) => {
			if (next) frontmatter[key] = next;
			else delete frontmatter[key];
		});
		if (next) this.frontmatter[key] = next;
		else delete this.frontmatter[key];
		this.renderToolbarLeft();
	}

	private renderDuePill(): void {
		const value = textOf(this.frontmatter[DUE_PROPERTY]);
		if (!value) return;

		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill pmb-td-pill-accent" });
		setIcon(
			pillEl.createSpan({ cls: "pmb-td-pill-icon pmb-td-pill-icon-accent" }),
			"lucide-calendar",
		);
		const labelEl = pillEl.createSpan({
			cls: "pmb-td-pill-label pmb-td-pill-label-accent",
			text: value,
		});
		labelEl.addEventListener("click", () => void this.promptDue(value));
		const clearEl = pillEl.createSpan({ cls: "pmb-td-pill-clear" });
		setIcon(clearEl, "lucide-x");
		clearEl.addEventListener("click", (event: MouseEvent) => {
			event.stopPropagation();
			void this.clearDue();
		});
	}

	private async promptDue(current: string): Promise<void> {
		const next = await PromptModal.prompt(this.app, {
			title: "Set due date",
			initialValue: current,
			placeholder: "e.g. 2026-09-19",
		});
		if (!next) return;
		await this.writeFrontmatter((frontmatter) => {
			frontmatter[DUE_PROPERTY] = next;
		});
		this.frontmatter[DUE_PROPERTY] = next;
		this.renderToolbarLeft();
	}

	private async clearDue(): Promise<void> {
		await this.writeFrontmatter((frontmatter) => {
			delete frontmatter[DUE_PROPERTY];
		});
		delete this.frontmatter[DUE_PROPERTY];
		this.renderToolbarLeft();
	}

	private renderTagPills(): void {
		const tags = parseTagList(this.frontmatter.tags).filter(
			(tag) => tag.toLowerCase() !== HIDDEN_TAG,
		);
		for (const tag of tags) {
			const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-tag" });
			const color = this.config.tagColors.get(tag);
			if (color) pillEl.style.setProperty("--pmb-td-tag-color", color);
			pillEl.createSpan({ text: tag });
		}
	}

	private async editTags(): Promise<void> {
		const current = parseTagList(this.frontmatter.tags);
		const next = await PromptModal.prompt(this.app, {
			title: "Edit tags",
			initialValue: current.join(", "),
			placeholder: "task, bug, ...",
		});
		if (next === null) return;
		const tags = parseTagList(next);
		await this.writeFrontmatter((frontmatter) => {
			if (tags.length > 0) frontmatter.tags = tags;
			else delete frontmatter.tags;
		});
		this.frontmatter.tags = tags;
		this.renderToolbarLeft();
	}

	private renderPriorityPill(): void {
		const key = frontmatterKeyOf(this.config.priorityProperty as string);
		if (!key) return;
		const priority = this.priorityAt(key);
		if (!priority) return;

		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		pillEl.style.setProperty(
			"--pmb-td-priority-color",
			`var(--pmb-td-priority-${priority.toLowerCase()})`,
		);
		setIcon(
			pillEl.createSpan({ cls: "pmb-td-pill-icon pmb-td-pill-icon-priority" }),
			"lucide-flag",
		);
		pillEl.createSpan({ cls: "pmb-td-pill-label pmb-td-pill-label-priority", text: priority });
		pillEl.addEventListener("click", (event: MouseEvent) => this.showPriorityMenu(event, key));
	}

	private priorityAt(key: string): PriorityLabel | null {
		return priorityOf(textOf(this.frontmatter[key]));
	}

	private showPriorityMenu(event: MouseEvent, key: string): void {
		const menu = new Menu();
		for (const label of PRIORITY_LABELS) {
			menu.addItem((item) =>
				item
					.setTitle(label)
					.setChecked(this.priorityAt(key) === label)
					.onClick(() => void this.setPriority(key, label)),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Clear priority")
				.setIcon("lucide-x")
				.onClick(() => void this.setPriority(key, null)),
		);
		menu.showAtMouseEvent(event);
	}

	private async setPriority(key: string, label: PriorityLabel | null): Promise<void> {
		await this.writeFrontmatter((frontmatter) => {
			if (label) frontmatter[key] = label;
			else delete frontmatter[key];
		});
		if (label) this.frontmatter[key] = label;
		else delete this.frontmatter[key];
		this.renderToolbarLeft();
	}

	/**
	 * Due date and priority pills disappear entirely once unset, so this is
	 * the only way back in for either; project and tags keep their own
	 * always-present controls and don't need it.
	 */
	private showAddFieldMenu(event: MouseEvent): void {
		const dueSet = !!textOf(this.frontmatter[DUE_PROPERTY]);
		const priorityKey = this.config.priorityProperty
			? frontmatterKeyOf(this.config.priorityProperty)
			: null;
		const prioritySet = !!(priorityKey && this.priorityAt(priorityKey));

		const menu = new Menu();
		let hasItem = false;
		if (!dueSet) {
			hasItem = true;
			menu.addItem((item) =>
				item
					.setTitle("Set due date")
					.setIcon("lucide-calendar")
					.onClick(() => void this.promptDue("")),
			);
		}
		if (priorityKey && !prioritySet) {
			hasItem = true;
			const key = priorityKey;
			menu.addItem((item) =>
				item
					.setTitle("Set priority")
					.setIcon("lucide-flag")
					.onClick(() => this.showPriorityMenu(event, key)),
			);
		}
		if (!hasItem) return;
		menu.showAtMouseEvent(event);
	}

	private async writeFrontmatter(
		edit: (frontmatter: Record<string, unknown>) => void,
	): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(this.file, edit);
		} catch (error) {
			console.error("PM-Board: could not update the task.", error);
			new Notice("Could not update the task.");
		}
	}
}
