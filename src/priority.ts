export const PRIORITY_LABELS = ["P1", "P2", "P3", "P4"] as const;
export type PriorityLabel = (typeof PRIORITY_LABELS)[number];

/**
 * A priority property's value, if it names one of the four expected levels.
 * Accepts "P1".."P4" case-insensitively, as well as the bare digit a
 * property can hold instead ("1".."4"), since a vault's own priority scale
 * is written either way.
 */
export function priorityOf(text: string | null | undefined): PriorityLabel | null {
	if (!text) return null;
	const upper = text.toUpperCase();
	if ((PRIORITY_LABELS as readonly string[]).includes(upper)) return upper as PriorityLabel;
	if (/^[1-4]$/.test(upper)) return `P${upper}` as PriorityLabel;
	return null;
}

/**
 * The frontmatter value to write for a priority, matching how the vault
 * already stores it: a bare number once existing notes hold `1`-`4`, since
 * mixing numbers with "P1"-style text would split a Sort by on the property
 * in two; the "P1" label otherwise, including when nothing is stored yet.
 */
export function priorityWriteValue(
	label: PriorityLabel,
	samples: unknown[],
): number | PriorityLabel {
	const sample = samples.find((value) => value !== null && value !== undefined && value !== "");
	const numeric =
		typeof sample === "number" || (typeof sample === "string" && /^[1-4]$/.test(sample.trim()));
	return numeric ? Number(label.slice(1)) : label;
}
