/**
 * Tag values carry a leading hash, while the colours saved on a board are
 * keyed by the bare tag name.
 */
export function normaliseTagName(tag: string): string {
	return tag.trim().replace(/^#/, "");
}

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

/** Which text tone stays legible on a given background. */
export type TextTone = "light" | "dark";

export function parseHexColor(value: string): Rgb | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
	if (!match) return null;
	const digits = match[1];
	const hex =
		digits.length === 3
			? digits
					.split("")
					.map((c) => c + c)
					.join("")
			: digits;
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16),
	};
}

/** WCAG relative luminance, used to pick a legible text tone. */
export function relativeLuminance({ r, g, b }: Rgb): number {
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function channel(value: number): number {
	const srgb = value / 255;
	return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Picks the text tone with the better contrast ratio against the background.
 * Unparseable colours fall back to dark text, matching the default chip.
 */
export function textToneFor(background: string): TextTone {
	const rgb = parseHexColor(background);
	if (!rgb) return "dark";
	const luminance = relativeLuminance(rgb);
	const againstWhite = 1.05 / (luminance + 0.05);
	const againstBlack = (luminance + 0.05) / 0.05;
	return againstWhite >= againstBlack ? "light" : "dark";
}
