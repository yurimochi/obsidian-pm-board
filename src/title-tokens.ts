/**
 * `#project` and `@tag` references typed inside a task's title. They are
 * only ever used to set the task's project and tags: once the title is
 * saved they are stripped out of it.
 */

export type TriggerChar = "#" | "@";

export interface TitleToken {
	trigger: TriggerChar;
	/** The text after the trigger character. */
	name: string;
	/** Index of the trigger character. */
	start: number;
	/** Index just past the token's last character. */
	end: number;
}

export interface ActiveQuery {
	trigger: TriggerChar;
	/** What has been typed after the trigger character, up to the caret. */
	query: string;
	/** Index of the trigger character. */
	start: number;
	/** End of the word the caret is in, so a pick replaces all of it. */
	end: number;
}

/**
 * A token is a trigger character that starts the text or follows
 * whitespace (so "C#" and "me@example.com" are left alone), followed by at
 * least one non-space character.
 */
export function findTokens(text: string, triggers: readonly TriggerChar[]): TitleToken[] {
	const tokens: TitleToken[] = [];
	const pattern = /(^|\s)([#@])(\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const trigger = match[2] as TriggerChar;
		if (!triggers.includes(trigger)) continue;
		const start = match.index + match[1].length;
		tokens.push({ trigger, name: match[3], start, end: start + 1 + match[3].length });
	}
	return tokens;
}

/** The reference being typed at the caret, if the caret sits in one. */
export function activeQuery(
	text: string,
	caret: number,
	triggers: readonly TriggerChar[],
): ActiveQuery | null {
	let start = caret;
	while (start > 0 && !/\s/.test(text[start - 1])) start--;
	const trigger = text[start] as TriggerChar | undefined;
	if (!trigger || (trigger !== "#" && trigger !== "@") || !triggers.includes(trigger))
		return null;
	let end = caret;
	while (end < text.length && !/\s/.test(text[end])) end++;
	return { trigger, query: text.slice(start + 1, caret), start, end };
}

/** Case-, space- and hyphen-insensitive comparison key. */
function keyOf(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "-");
}

/** How a picked name is written into the title: spaces would end the reference early. */
export function toReference(name: string): string {
	return name.trim().replace(/\s+/g, "-");
}

/** Names starting with the query first, then those merely containing it. */
export function matchSuggestions(items: readonly string[], query: string, limit = 8): string[] {
	const needle = keyOf(query);
	if (!needle) return items.slice(0, limit);
	const starts: string[] = [];
	const contains: string[] = [];
	for (const item of items) {
		const key = keyOf(item);
		if (key.startsWith(needle)) starts.push(item);
		else if (key.includes(needle)) contains.push(item);
	}
	return [...starts, ...contains].slice(0, limit);
}

/** The known name a typed reference stands for, else the reference as typed. */
export function resolveName(reference: string, known: readonly string[]): string {
	const key = keyOf(reference);
	return known.find((name) => keyOf(name) === key) ?? reference;
}

export interface ExtractedReferences {
	/** The title with every reference removed and its spacing tidied. */
	title: string;
	/** The last `#` reference, or null. A task has a single project. */
	project: string | null;
	/** Every `@` reference, deduplicated, in order. */
	tags: string[];
}

export function extractReferences(
	text: string,
	triggers: readonly TriggerChar[],
): ExtractedReferences {
	const tokens = findTokens(text, triggers);
	let title = "";
	let cursor = 0;
	for (const token of tokens) {
		title += text.slice(cursor, token.start);
		cursor = token.end;
	}
	title += text.slice(cursor);

	const projects = tokens.filter((token) => token.trigger === "#");
	const tags: string[] = [];
	for (const token of tokens) {
		if (token.trigger === "@" && !tags.includes(token.name)) tags.push(token.name);
	}
	return {
		title: title.replace(/\s+/g, " ").trim(),
		project: projects.length > 0 ? projects[projects.length - 1].name : null,
		tags,
	};
}
