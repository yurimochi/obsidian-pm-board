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
