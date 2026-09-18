import type { BasesEntry, BasesEntryGroup } from "obsidian";

export interface LaneColumn {
	key: string | null;
	entries: BasesEntry[];
}

export interface Lane {
	key: string | null;
	columns: LaneColumn[];
}

/**
 * Splits the board's columns across a second grouping axis.
 *
 * Every lane carries the same columns, empty ones included, so the stacks stay
 * in step down the board and a column means the same thing in every lane.
 * Lanes appear in the order the query first yields them, which keeps them
 * following the user's own sort; the lane for entries with no value goes last,
 * matching how an unset value sorts everywhere else on the board.
 */
export function buildLanes(
	groups: BasesEntryGroup[],
	columnKeyOf: (group: BasesEntryGroup) => string | null,
	laneKeyOf: ((entry: BasesEntry) => string | null) | null,
): Lane[] {
	const columns = groups.map((group) => ({
		key: columnKeyOf(group),
		entries: group.entries,
	}));

	if (!laneKeyOf) return [{ key: null, columns }];

	const laneKeys: (string | null)[] = [];
	let hasUnset = false;
	for (const column of columns) {
		for (const entry of column.entries) {
			const key = laneKeyOf(entry);
			if (key === null) hasUnset = true;
			else if (!laneKeys.includes(key)) laneKeys.push(key);
		}
	}
	if (hasUnset) laneKeys.push(null);
	if (laneKeys.length === 0) return [{ key: null, columns }];

	return laneKeys.map((laneKey) => ({
		key: laneKey,
		columns: columns.map((column) => ({
			key: column.key,
			entries: column.entries.filter((entry) => laneKeyOf(entry) === laneKey),
		})),
	}));
}

/** The synthetic column every column keyed before today is merged into. */
export const OVERDUE_COLUMN_KEY = "Overdue";

/**
 * Collapses every column dated strictly before `today`, in each lane, into a
 * single leading Overdue column; today's, future, and the no-value column are
 * left as they are, in their existing order. A lane with nothing overdue
 * keeps none of this, the same as any other column with no cards in it.
 */
export function mergeOverdueColumns(lanes: Lane[], today: string): Lane[] {
	return lanes.map((lane) => {
		const overdue: BasesEntry[] = [];
		const rest: LaneColumn[] = [];
		for (const column of lane.columns) {
			if (column.key !== null && column.key < today) overdue.push(...column.entries);
			else rest.push(column);
		}
		if (overdue.length === 0) return { key: lane.key, columns: rest };
		return {
			key: lane.key,
			columns: [{ key: OVERDUE_COLUMN_KEY, entries: overdue }, ...rest],
		};
	});
}
