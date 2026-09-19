import { App, Menu, Notice, parseYaml, TFile } from "obsidian";
import { BoardConfig } from "./board-config";
import { HIDDEN_TAG } from "./card";
import { frontmatterKeyOf } from "./frontmatter";
import { PRIORITY_LABELS, PriorityLabel, priorityOf } from "./priority";
import { PromptModal } from "./prompt-modal";
import { parseTagList } from "./tag-colors";

/** Fixed, like `tags`: not a per-board configurable property. */
export const DUE_PROPERTY = "due";

/** A frontmatter value as display text, or "" for anything that isn't already text-shaped. */
export function textOf(value: unknown): string {
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
 * — reading it that way showed the raw `---\n...\n---` block dumped into the
 * description field, since a stale cache reports no frontmatter at all.
 */
export function splitFrontmatter(content: string): SplitContent {
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
 * Reads and edits the handful of frontmatter/body fields the task-detail
 * floatings show (project, due, tags, priority, description), shared so the
 * desktop and mobile floatings behave identically rather than each carrying
 * their own copy of the same frontmatter-editing logic.
 */
export class TaskProperties {
	frontmatter: Record<string, unknown> = {};

	constructor(
		private readonly app: App,
		private readonly file: TFile,
		private readonly config: BoardConfig,
	) {}

	/** Re-reads the file and returns its body (everything after frontmatter), trimmed. */
	async load(): Promise<string> {
		const content = await this.app.vault.read(this.file);
		const { frontmatter, body } = splitFrontmatter(content);
		this.frontmatter = frontmatter;
		return body.trim();
	}

	private get projectKey(): string | null {
		return this.config.projectProperty ? frontmatterKeyOf(this.config.projectProperty) : null;
	}

	private get priorityKey(): string | null {
		return this.config.priorityProperty ? frontmatterKeyOf(this.config.priorityProperty) : null;
	}

	get hasProject(): boolean {
		return this.projectKey !== null;
	}

	get hasPriority(): boolean {
		return this.priorityKey !== null;
	}

	get project(): string {
		const key = this.projectKey;
		return key ? textOf(this.frontmatter[key]) : "";
	}

	get due(): string {
		return textOf(this.frontmatter[DUE_PROPERTY]);
	}

	get priority(): PriorityLabel | null {
		const key = this.priorityKey;
		return key ? priorityOf(textOf(this.frontmatter[key])) : null;
	}

	get tags(): string[] {
		return parseTagList(this.frontmatter.tags).filter(
			(tag) => tag.toLowerCase() !== HIDDEN_TAG,
		);
	}

	tagColor(tag: string): string | undefined {
		return this.config.tagColors.get(tag);
	}

	/** Renames the file to `next`, keeping it in the same folder. */
	async renameTo(next: string): Promise<void> {
		const folder = this.file.parent?.path ?? "";
		await this.app.fileManager.renameFile(
			this.file,
			folder ? `${folder}/${next}.md` : `${next}.md`,
		);
	}

	/** Rewrites the note's body, preserving its frontmatter exactly as last read from disk. */
	async commitDescription(next: string): Promise<void> {
		const content = await this.app.vault.read(this.file);
		const { head } = splitFrontmatter(content);
		const cleanHead = head.replace(/\s+$/, "");
		await this.app.vault.modify(
			this.file,
			cleanHead ? `${cleanHead}\n\n${next}\n` : `${next}\n`,
		);
	}

	/** Prompts for a new project name; returns whether anything changed. */
	async promptProject(): Promise<boolean> {
		const key = this.projectKey;
		if (!key) return false;
		const next = await PromptModal.prompt(this.app, {
			title: "Set project",
			initialValue: this.project,
			placeholder: "Project name",
			showClear: true,
		});
		if (next === null) return false;
		await this.write((frontmatter) => {
			if (next) frontmatter[key] = next;
			else delete frontmatter[key];
		});
		if (next) this.frontmatter[key] = next;
		else delete this.frontmatter[key];
		return true;
	}

	/** Prompts for a new due date; returns whether anything changed. */
	async promptDue(): Promise<boolean> {
		const next = await PromptModal.prompt(this.app, {
			title: "Set due date",
			initialValue: this.due,
			placeholder: "e.g. 2026-09-19",
			showClear: true,
		});
		if (next === null) return false;
		await this.write((frontmatter) => {
			if (next) frontmatter[DUE_PROPERTY] = next;
			else delete frontmatter[DUE_PROPERTY];
		});
		if (next) this.frontmatter[DUE_PROPERTY] = next;
		else delete this.frontmatter[DUE_PROPERTY];
		return true;
	}

	async clearDue(): Promise<void> {
		await this.write((frontmatter) => {
			delete frontmatter[DUE_PROPERTY];
		});
		delete this.frontmatter[DUE_PROPERTY];
	}

	/** Prompts for a new comma-separated tag list; returns whether anything changed. */
	async editTags(): Promise<boolean> {
		const next = await PromptModal.prompt(this.app, {
			title: "Edit tags",
			initialValue: parseTagList(this.frontmatter.tags).join(", "),
			placeholder: "task, bug, ...",
		});
		if (next === null) return false;
		const tags = parseTagList(next);
		await this.write((frontmatter) => {
			if (tags.length > 0) frontmatter.tags = tags;
			else delete frontmatter.tags;
		});
		this.frontmatter.tags = tags;
		return true;
	}

	/** Shows a P1-P4 + clear menu at the event's position; calls `onChange` once a pick is committed. */
	showPriorityMenu(event: MouseEvent, onChange: () => void): void {
		const key = this.priorityKey;
		if (!key) return;
		const menu = new Menu();
		for (const label of PRIORITY_LABELS) {
			menu.addItem((item) =>
				item
					.setTitle(label)
					.setChecked(this.priority === label)
					.onClick(() => void this.setPriority(key, label).then(onChange)),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Clear priority")
				.setIcon("lucide-x")
				.onClick(() => void this.setPriority(key, null).then(onChange)),
		);
		menu.showAtMouseEvent(event);
	}

	private async setPriority(key: string, label: PriorityLabel | null): Promise<void> {
		await this.write((frontmatter) => {
			if (label) frontmatter[key] = label;
			else delete frontmatter[key];
		});
		if (label) this.frontmatter[key] = label;
		else delete this.frontmatter[key];
	}

	private async write(edit: (frontmatter: Record<string, unknown>) => void): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(this.file, edit);
		} catch (error) {
			console.error("PM-Board: could not update the task.", error);
			new Notice("Could not update the task.");
		}
	}
}
