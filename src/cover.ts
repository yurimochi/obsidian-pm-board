/** A cover image reference, once it is known to be safe to resolve. */
export type CoverReference = { kind: "link"; linkpath: string } | { kind: "url"; url: string };

const WIKILINK = /^!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/;
const MARKDOWN_LINK = /^!?\[[^\]]*\]\(([^)]+)\)$/;

/**
 * Reads a cover property into something renderable.
 *
 * The result reaches an image element's source, so only http and https pass:
 * a property is ordinary note content, and schemes like `javascript:` would
 * otherwise run whatever a note author put there.
 */
export function parseCoverReference(raw: unknown): CoverReference | null {
	if (typeof raw !== "string") return null;
	const value = raw.trim();
	if (!value) return null;

	const wikilink = WIKILINK.exec(value);
	if (wikilink) return linkOrNull(wikilink[1]);

	const markdown = MARKDOWN_LINK.exec(value);
	if (markdown) return fromText(markdown[1]);

	return fromText(value);
}

function fromText(value: string): CoverReference | null {
	const text = value.trim();
	if (!text) return null;
	return isWebUrl(text) ? { kind: "url", url: text } : linkOrNull(text);
}

function linkOrNull(linkpath: string): CoverReference | null {
	const path = linkpath.trim();
	return path && isVaultPath(path) ? { kind: "link", linkpath: path } : null;
}

function isWebUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * A vault path carries no scheme and no leftover link syntax. Malformed link
 * text would otherwise fall through to here still wrapped in its brackets and
 * carrying whatever scheme it held, so both are rejected anywhere in the value
 * rather than only at the start.
 */
function isVaultPath(value: string): boolean {
	return !/[[\]]/.test(value) && !/[a-z][a-z0-9+.-]*:/i.test(value);
}
