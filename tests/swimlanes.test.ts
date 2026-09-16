import { describe, expect, it } from "vitest";
import type { BasesEntry, BasesEntryGroup } from "obsidian";
import { buildLanes } from "../src/swimlanes";

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
