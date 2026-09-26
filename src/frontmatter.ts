/**
 * The frontmatter key a Bases property writes to, or null when the property is
 * computed. `file.*` and `formula.*` properties are derived rather than stored,
 * so a board grouped by one of them cannot be reordered by writing notes.
 */
export function frontmatterKeyOf(property: string): string | null {
	const trimmed = property.trim();
	if (trimmed.startsWith("note.")) return trimmed.slice("note.".length) || null;
	if (trimmed.includes(".")) return null;
	return trimmed || null;
}

/**
 * A wikilink's display text — its alias if it has one, otherwise the
 * linked note's own name, dropping any heading/block reference — since a
 * property like project is commonly a link to the project's own note
 * rather than plain text, and showing the raw `[[...]]` syntax isn't the
 * "reference" a link property actually holds.
 */
export function resolveLink(raw: string): string {
	const match = /^\[\[([^\]]+)\]\]$/.exec(raw);
	if (!match) return raw;
	const [target, alias] = match[1].split("|");
	if (alias) return alias.trim();
	const withoutHeading = target.split("#")[0];
	return (withoutHeading.split("/").pop() || withoutHeading).trim();
}

/**
 * The value to write for a column, given the raw frontmatter value of a note
 * already in it. Column keys reach the board as text, so writing them back
 * blindly would turn a boolean or number property into a string and drop the
 * note out of its own board. The sample settles the type; without one (an empty
 * column) the text itself is the only evidence available.
 */
export function coerceGroupValue(columnKey: string | null, sample: unknown): unknown {
	if (columnKey === null) return null;

	if (typeof sample === "boolean") return columnKey === "true";
	if (typeof sample === "number") {
		const parsed = Number(columnKey);
		return Number.isFinite(parsed) ? parsed : columnKey;
	}
	if (typeof sample === "string") return columnKey;

	if (columnKey === "true" || columnKey === "false") return columnKey === "true";
	const parsed = Number(columnKey);
	return columnKey.trim() !== "" && Number.isFinite(parsed) ? parsed : columnKey;
}

/**
 * A single text value written in the shape existing notes already use for
 * the property: wrapped in a list when they hold one (a property picker
 * often stores even one project that way), and as a wikilink when they
 * link. `sample` is any existing value; with none, plain text is written.
 */
export function shapedLike(value: string, sample: unknown): unknown {
	const list = Array.isArray(sample);
	const scalar: unknown = list ? (sample as unknown[])[0] : sample;
	const linked = typeof scalar === "string" && /^\[\[.*\]\]$/.test(scalar.trim());
	const text = linked ? `[[${value}]]` : value;
	return list ? [text] : text;
}
