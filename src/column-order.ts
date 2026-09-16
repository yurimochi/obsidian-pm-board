import type { BasesEntryGroup } from "obsidian";
import { orderKey } from "./board-config";

/** The group's key as text, or null for the group with no value. */
export function groupKeyOf(group: BasesEntryGroup): string | null {
	return group.hasKey() && group.key ? group.key.toString() : null;
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
