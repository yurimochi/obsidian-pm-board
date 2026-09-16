/**
 * Tag values carry a leading hash, while the colours saved on a board are
 * keyed by the bare tag name.
 */
export function normaliseTagName(tag: string): string {
	return tag.trim().replace(/^#/, "");
}

/**
 * A tag list from frontmatter (an array, or a comma-separated string, which
 * Obsidian also accepts) or from the edit-tags prompt's own comma-separated
 * input; either way, normalised and deduplicated.
 */
export function parseTagList(raw: unknown): string[] {
	const items = Array.isArray(raw)
		? raw.filter((item): item is string => typeof item === "string")
		: typeof raw === "string"
			? raw.split(",")
			: [];

	const seen = new Set<string>();
	const tags: string[] = [];
	for (const item of items) {
		const name = normaliseTagName(item);
		if (name && !seen.has(name)) {
			seen.add(name);
			tags.push(name);
		}
	}
	return tags;
}
