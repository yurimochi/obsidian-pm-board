import { App, Menu, Modal, Notice, parseYaml, setIcon, TFile } from "obsidian";
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

interface SplitContent {
	/** The raw frontmatter block, delimiters included, or "" when there is none. */
	head: string;
	frontmatter: Record<string, unknown>;
	/** Everything after the frontmatter block. */
	body: string;
}

/**
 * Parsed straight from freshly-read file content rather than
 * `metadataCache.getFileCache`, whose cache can still be stale for a note
 * only just created (e.g. right after this same view wrote its frontmatter)
 * — reading it here showed the raw `---\n...\n---` block dumped into the
 * description field, since a stale cache reports no frontmatter at all.
 */
function splitFrontmatter(content: string): SplitContent {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
	if (!match) return { head: "", frontmatter: {}, body: content };
	const parsed: unknown = parseYaml(match[1]);
	const frontmatter =
		typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	return { head: match[0], frontmatter, body: content.slice(match[0].length) };
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
		const { frontmatter, body } = splitFrontmatter(content);
		this.frontmatter = frontmatter;
		this.originalTitle = this.file.basename;
		this.originalDescription = body.trim();

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
			const { head } = splitFrontmatter(content);
			const cleanHead = head.replace(/\s+$/, "");
			await this.app.vault.modify(
				this.file,
				cleanHead ? `${cleanHead}\n\n${next}\n` : `${next}\n`,
			);
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
		const key = this.config.projectProperty
			? frontmatterKeyOf(this.config.projectProperty)
			: null;
		if (!key) return;
		const value = textOf(this.frontmatter[key]);

		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		pillEl.toggleClass("pmb-td-pill-empty", !value);
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

		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		pillEl.toggleClass("pmb-td-pill-empty", !value);
		const iconEl = pillEl.createSpan({ cls: "pmb-td-pill-icon" });
		iconEl.toggleClass("pmb-td-pill-icon-accent", !!value);
		setIcon(iconEl, "lucide-calendar");
		const labelEl = pillEl.createSpan({ cls: "pmb-td-pill-label", text: value || "Due" });
		labelEl.toggleClass("pmb-td-pill-label-accent", !!value);
		labelEl.addEventListener("click", () => void this.promptDue(value));

		if (!value) return;
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

	private renderTagsPill(): void {
		const pillEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-pill" });
		setIcon(pillEl.createSpan({ cls: "pmb-td-pill-icon" }), "lucide-tags");
		pillEl.createSpan({ cls: "pmb-td-pill-label", text: "Tags" });
		pillEl.addEventListener("click", () => void this.editTags());

		const tags = parseTagList(this.frontmatter.tags).filter(
			(tag) => tag.toLowerCase() !== HIDDEN_TAG,
		);
		for (const tag of tags) {
			const tagEl = this.toolbarLeftEl.createDiv({ cls: "pmb-td-tag" });
			const color = this.config.tagColors.get(tag);
			if (color) tagEl.style.setProperty("--pmb-td-tag-color", color);
			tagEl.createSpan({ text: tag });
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
		const key = this.config.priorityProperty
			? frontmatterKeyOf(this.config.priorityProperty)
			: null;
		if (!key) return;
		const priority = this.priorityAt(key);

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
