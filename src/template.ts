export interface PlaceholderContext {
	title: string;
	now: Date;
	/** Formats a date with a moment-style pattern. */
	format: (date: Date, pattern: string) => string;
}

const PLACEHOLDER = /\{\{(title|date|time)(?::([^}]*))?\}\}/g;

const DEFAULT_DATE = "YYYY-MM-DD";
const DEFAULT_TIME = "HH:mm";

/**
 * Fills in the placeholders a template may carry, matching the set Obsidian's
 * own Templates plugin understands so a template written for it still works.
 * Anything else in the text is left alone, since a note is free to contain
 * braces of its own.
 */
export function applyPlaceholders(text: string, ctx: PlaceholderContext): string {
	return text.replace(PLACEHOLDER, (_match, name: string, pattern?: string) => {
		if (name === "title") return ctx.title;
		const fallback = name === "date" ? DEFAULT_DATE : DEFAULT_TIME;
		return ctx.format(ctx.now, pattern?.trim() || fallback);
	});
}

/**
 * A name no sibling is using yet, counting up the way Obsidian names untitled
 * notes.
 */
export function uniqueName(base: string, taken: (name: string) => boolean): string {
	if (!taken(base)) return base;
	for (let suffix = 1; ; suffix++) {
		const candidate = `${base} ${suffix}`;
		if (!taken(candidate)) return candidate;
	}
}

/** Joins a folder and a file name, tolerating the vault root. */
export function joinPath(folder: string, name: string): string {
	const trimmed = folder.replace(/\/+$/, "");
	return trimmed ? `${trimmed}/${name}` : name;
}
