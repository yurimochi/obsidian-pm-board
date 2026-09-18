export const PRIORITY_LABELS = ["P1", "P2", "P3", "P4"] as const;
export type PriorityLabel = (typeof PRIORITY_LABELS)[number];

/** A priority property's value, if it's one of the four expected labels. */
export function priorityOf(text: string | null | undefined): PriorityLabel | null {
	if (!text) return null;
	const upper = text.toUpperCase();
	return (PRIORITY_LABELS as readonly string[]).includes(upper) ? (upper as PriorityLabel) : null;
}
