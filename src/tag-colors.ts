/**
 * Tag values carry a leading hash, while the colours saved on a board are
 * keyed by the bare tag name.
 */
export function normaliseTagName(tag: string): string {
	return tag.trim().replace(/^#/, "");
}
