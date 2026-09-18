import { describe, expect, it } from "vitest";
import type { BasesEntry, BasesEntryGroup } from "obsidian";
import { buildLanes, filterLanes, Lane, mergeOverdueColumns, OVERDUE_COLUMN_KEY } from "../src/swimlanes";

/** An entry identified by name, carrying the value the lane axis groups on. */
function entry(name: string, lane: string | null): BasesEntry {
	return { name, lane } as unknown as BasesEntry;
}

function group(key: string | null, entries: BasesEntry[]): BasesEntryGroup {
	return { key, entries } as unknown as BasesEntryGroup;
}

const columnKeyOf = (g: BasesEntryGroup) => (g as unknown as { key: string | null }).key;
const laneKeyOf = (e: BasesEntry) => (e as unknown as { lane: string | null }).lane;
const names = (entries: BasesEntry[]) =>
	entries.map((e) => (e as unknown as { name: string }).name);

describe("buildLanes", () => {
	it("returns a single unnamed lane when there is no lane axis", () => {
		const groups = [group("Todo", [entry("a", "x")]), group("Done", [])];
		const lanes = buildLanes(groups, columnKeyOf, null);

		expect(lanes).toHaveLength(1);
		expect(lanes[0].key).toBeNull();
		expect(lanes[0].columns.map((c) => c.key)).toEqual(["Todo", "Done"]);
	});

	it("splits entries across lanes, keeping every column in each", () => {
		const groups = [
			group("Todo", [entry("a", "team-1"), entry("b", "team-2")]),
			group("Done", [entry("c", "team-1")]),
		];
		const lanes = buildLanes(groups, columnKeyOf, laneKeyOf);

		expect(lanes.map((lane) => lane.key)).toEqual(["team-1", "team-2"]);
		expect(lanes[0].columns.map((c) => names(c.entries))).toEqual([["a"], ["c"]]);
		expect(lanes[1].columns.map((c) => names(c.entries))).toEqual([["b"], []]);
	});

	it("keeps the columns aligned across lanes", () => {
		const groups = [group("Todo", [entry("a", "x")]), group("Doing", []), group("Done", [])];
		const lanes = buildLanes(groups, columnKeyOf, laneKeyOf);

		for (const lane of lanes) {
			expect(lane.columns.map((c) => c.key)).toEqual(["Todo", "Doing", "Done"]);
		}
	});

	it("orders lanes by first appearance in the query", () => {
		const groups = [
			group("Todo", [entry("a", "second"), entry("b", "first")]),
			group("Done", [entry("c", "third")]),
		];
		expect(buildLanes(groups, columnKeyOf, laneKeyOf).map((l) => l.key)).toEqual([
			"second",
			"first",
			"third",
		]);
	});

	it("puts the lane for entries with no value last", () => {
		const groups = [
			group("Todo", [entry("a", null), entry("b", "team-1")]),
			group("Done", [entry("c", "team-2")]),
		];
		expect(buildLanes(groups, columnKeyOf, laneKeyOf).map((l) => l.key)).toEqual([
			"team-1",
			"team-2",
			null,
		]);
	});

	it("does not repeat a lane that appears in several columns", () => {
		const groups = [
			group("Todo", [entry("a", "team-1")]),
			group("Doing", [entry("b", "team-1")]),
			group("Done", [entry("c", "team-1")]),
		];
		expect(buildLanes(groups, columnKeyOf, laneKeyOf).map((l) => l.key)).toEqual(["team-1"]);
	});

	it("falls back to one lane when the board has no entries at all", () => {
		const groups = [group("Todo", []), group("Done", [])];
		const lanes = buildLanes(groups, columnKeyOf, laneKeyOf);

		expect(lanes).toHaveLength(1);
		expect(lanes[0].key).toBeNull();
		expect(lanes[0].columns.map((c) => c.key)).toEqual(["Todo", "Done"]);
	});

	it("places every entry in exactly one lane", () => {
		const groups = [
			group("Todo", [entry("a", "x"), entry("b", null), entry("c", "y")]),
			group("Done", [entry("d", "x")]),
		];
		const placed = buildLanes(groups, columnKeyOf, laneKeyOf)
			.flatMap((lane) => lane.columns.flatMap((column) => names(column.entries)))
			.sort();

		expect(placed).toEqual(["a", "b", "c", "d"]);
	});
});

describe("filterLanes", () => {
	function lanes(): Lane[] {
		return [
			{
				key: "team-1",
				columns: [
					{ key: "Todo", entries: [entry("a", "team-1"), entry("b", "team-1")] },
					{ key: "Done", entries: [] },
				],
			},
			{
				key: "team-2",
				columns: [
					{ key: "Todo", entries: [entry("c", "team-2")] },
					{ key: "Done", entries: [] },
				],
			},
		];
	}

	it("keeps only the entries the predicate accepts", () => {
		const kept = new Set(["a", "c"]);
		const filtered = filterLanes(lanes(), (e) => kept.has((e as unknown as { name: string }).name));

		expect(filtered[0].columns.map((c) => names(c.entries))).toEqual([["a"], []]);
		expect(filtered[1].columns.map((c) => names(c.entries))).toEqual([["c"], []]);
	});

	it("keeps every lane and column even when everything is filtered out", () => {
		const filtered = filterLanes(lanes(), () => false);

		expect(filtered.map((l) => l.key)).toEqual(["team-1", "team-2"]);
		expect(filtered.every((l) => l.columns.every((c) => c.entries.length === 0))).toBe(true);
	});

	it("does not mutate the input", () => {
		const original = lanes();
		filterLanes(original, () => false);
		expect(original[0].columns[0].entries).toHaveLength(2);
	});
});

describe("mergeOverdueColumns", () => {
	const today = "2026-09-17";

	it("merges every column dated before today into one, in front of the rest", () => {
		const lanes: Lane[] = [
			{
				key: null,
				columns: [
					{ key: "2026-09-15", entries: [entry("a", null)] },
					{ key: "2026-09-16", entries: [entry("b", null)] },
					{ key: "2026-09-17", entries: [entry("c", null)] },
					{ key: "2026-09-18", entries: [entry("d", null)] },
				],
			},
		];

		const merged = mergeOverdueColumns(lanes, today);

		expect(merged[0].columns.map((c) => c.key)).toEqual([
			OVERDUE_COLUMN_KEY,
			"2026-09-17",
			"2026-09-18",
		]);
		expect(names(merged[0].columns[0].entries)).toEqual(["a", "b"]);
	});

	it("leaves the no-value column alone", () => {
		const lanes: Lane[] = [
			{
				key: null,
				columns: [
					{ key: "2026-09-15", entries: [entry("a", null)] },
					{ key: null, entries: [entry("b", null)] },
				],
			},
		];

		const merged = mergeOverdueColumns(lanes, today);

		expect(merged[0].columns.map((c) => c.key)).toEqual([OVERDUE_COLUMN_KEY, null]);
		expect(names(merged[0].columns[1].entries)).toEqual(["b"]);
	});

	it("adds no Overdue column when nothing is before today", () => {
		const lanes: Lane[] = [
			{ key: null, columns: [{ key: "2026-09-17", entries: [entry("a", null)] }] },
		];

		const merged = mergeOverdueColumns(lanes, today);

		expect(merged[0].columns.map((c) => c.key)).toEqual(["2026-09-17"]);
	});

	it("merges independently per lane", () => {
		const lanes: Lane[] = [
			{ key: "team-1", columns: [{ key: "2026-09-01", entries: [entry("a", null)] }] },
			{ key: "team-2", columns: [{ key: "2026-09-17", entries: [entry("b", null)] }] },
		];

		const merged = mergeOverdueColumns(lanes, today);

		expect(merged[0].columns.map((c) => c.key)).toEqual([OVERDUE_COLUMN_KEY]);
		expect(merged[1].columns.map((c) => c.key)).toEqual(["2026-09-17"]);
	});
});
