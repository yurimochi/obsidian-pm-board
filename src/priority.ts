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
