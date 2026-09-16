import type { BasesEntryGroup } from "obsidian";
import { orderKey } from "./board-config";

/**
 * The group's key as text, or null for the group with no value.
 *
 * A group can report having a key whose value still renders empty. That counts
 * as the no-value column: the two settings that name it disagree (an empty
 * string in the column order, a label in the collapsed set), so collapsing it
 * only works if both spellings start from the same null.
 */
export function groupKeyOf(group: BasesEntryGroup): string | null {
	if (!group.hasKey() || !group.key) return null;
	const text = group.key.toString().trim();
	return text.length > 0 ? text : null;
}

/**
 * Applies the user's saved column order. Groups missing from that order keep
 * their query order and follow the ordered ones, so a newly introduced column
 * shows up instead of silently disappearing.
 */
export function sortGroups(
	groups: BasesEntryGroup[],
	boardColumns: string[] | null,
): BasesEntryGroup[] {
	if (!boardColumns) return groups;
	const rank = new Map(boardColumns.map((key, index) => [key, index]));
	const rankOf = (group: BasesEntryGroup) =>
		rank.get(orderKey(groupKeyOf(group))) ?? Number.MAX_SAFE_INTEGER;
	return [...groups].sort((a, b) => rankOf(a) - rankOf(b));
}
