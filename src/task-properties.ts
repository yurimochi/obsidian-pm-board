import { App, getAllTags, Notice, parseYaml, TFile } from "obsidian";
import { BoardConfig } from "./board-config";
import { HIDDEN_TAG } from "./card";
import { frontmatterKeyOf, resolveLink, shapedLike } from "./frontmatter";
import { PriorityLabel, priorityOf, priorityWriteValue } from "./priority";
import { normaliseTagName, parseTagList } from "./tag-colors";

/** Fixed, like `tags`: not a per-board configurable property. */
export const DUE_PROPERTY = "due";

/**
 * A frontmatter value as display text: a wikilink resolves to its display
 * name (see `resolveLink`); a single-item list is unwrapped, matching how
 * a property picker sometimes stores even a single value as a list; a bare
 * YAML date (`due: 2026-09-28`), which parses as a Date at UTC midnight,
 * reads back as that YYYY-MM-DD; anything else that isn't already
 * text-shaped reads as "".
 */
export function textOf(value: unknown): string {
	// Array.isArray narrows to any[], not unknown[], hence the cast.
	const scalar = Array.isArray(value) ? (value as unknown[])[0] : value;
	if (scalar instanceof Date) {
		return Number.isNaN(scalar.getTime()) ? "" : scalar.toISOString().slice(0, 10);
	}
	if (typeof scalar !== "string" && typeof scalar !== "number") return "";
	return resolveLink(String(scalar).trim());
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
		return frontmatterKeyOf(this.config.projectProperty);
	}

	private get priorityKey(): string | null {
		return frontmatterKeyOf(this.config.priorityProperty);
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

	/**
	 * Every project any note in the vault names under the project property,
	 * sorted, for the project picker's list — links resolved to their note's
	 * name, list values flattened.
	 */
	knownProjects(): string[] {
		const key = this.projectKey;
		if (!key) return [];
		const names = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const value: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[key];
			for (const item of Array.isArray(value) ? (value as unknown[]) : [value]) {
				if (typeof item !== "string" && typeof item !== "number") continue;
				const name = resolveLink(String(item).trim());
				if (name) names.add(name);
			}
		}
		const current = this.project;
		if (current) names.add(current);
		return [...names].sort((a, b) => a.localeCompare(b));
	}

	/**
	 * Every tag used anywhere in the vault (frontmatter or inline) plus this
	 * note's own, sorted, for the tag picker — minus the boilerplate tag
	 * every card carries, which the picker never offers to remove.
	 */
	knownTags(): string[] {
		const tags = new Set<string>(this.tags);
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			for (const tag of (cache ? getAllTags(cache) : null) ?? []) {
				const name = normaliseTagName(tag);
				if (name && name.toLowerCase() !== HIDDEN_TAG) tags.add(name);
			}
		}
		return [...tags].sort((a, b) => a.localeCompare(b));
	}

	/**
	 * The property's current value on this note, else on any note in the
	 * vault, so a write can match the shape the vault already uses for it.
	 */
	private sampleOf(key: string): unknown {
		const own = this.frontmatter[key];
		if (own !== undefined && own !== null && own !== "") return own;
		for (const file of this.app.vault.getMarkdownFiles()) {
			const value: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[key];
			if (value !== undefined && value !== null && value !== "") return value;
		}
		return undefined;
	}

	/** Sets or (with null) clears the project, in the shape other notes store it in. */
	async setProject(name: string | null): Promise<void> {
		const key = this.projectKey;
		if (!key) return;
		const value = name ? shapedLike(name, this.sampleOf(key)) : null;
		await this.write((frontmatter) => {
			if (value !== null) frontmatter[key] = value;
			else delete frontmatter[key];
		});
		if (value !== null) this.frontmatter[key] = value;
		else delete this.frontmatter[key];
	}

	/** Sets or (with null) clears the due date, as YYYY-MM-DD. */
	async setDue(date: string | null): Promise<void> {
		await this.write((frontmatter) => {
			if (date) frontmatter[DUE_PROPERTY] = date;
			else delete frontmatter[DUE_PROPERTY];
		});
		if (date) this.frontmatter[DUE_PROPERTY] = date;
		else delete this.frontmatter[DUE_PROPERTY];
	}

	/**
	 * Adds a tag the note doesn't have, or removes one it does. Works on the
	 * full list, the hidden boilerplate tag included, so that one survives.
	 */
	async toggleTag(tag: string): Promise<void> {
		const name = normaliseTagName(tag).replace(/\s+/g, "-");
		if (!name) return;
		const current = parseTagList(this.frontmatter.tags);
		const next = current.includes(name)
			? current.filter((existing) => existing !== name)
			: [...current, name];
		await this.write((frontmatter) => {
			if (next.length > 0) frontmatter.tags = next;
			else delete frontmatter.tags;
		});
		this.frontmatter.tags = next;
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

	/**
	 * Sets or (with null) clears the priority, written in the form the vault
	 * already uses (see priorityWriteValue) so a Sort by on it keeps working.
	 */
	async setPriority(label: PriorityLabel | null): Promise<void> {
		const key = this.priorityKey;
		if (!key) return;
		const value = label ? priorityWriteValue(label, [this.sampleOf(key)]) : null;
		await this.write((frontmatter) => {
			if (value !== null) frontmatter[key] = value;
			else delete frontmatter[key];
		});
		if (value !== null) this.frontmatter[key] = value;
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
