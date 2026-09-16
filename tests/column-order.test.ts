import { describe, expect, it } from "vitest";
import type { BasesEntryGroup } from "obsidian";
import { groupKeyOf, sortGroups } from "../src/column-order";

/** Stand-in for a BasesEntryGroup; `null` means the group has no key. */
function group(key: string | null): BasesEntryGroup {
	return {
		hasKey: () => key !== null,
		key: key === null ? undefined : { toString: () => key },
		entries: [],
	} as unknown as BasesEntryGroup;
}

const keysOf = (groups: BasesEntryGroup[]) => groups.map(groupKeyOf);

describe("groupKeyOf", () => {
	it("returns null for the group with no value", () => {
		expect(groupKeyOf(group(null))).toBeNull();
	});

	it("stringifies the group key", () => {
		expect(groupKeyOf(group("Todo"))).toBe("Todo");
	});

	it("treats a key that renders empty as no value", () => {
		expect(groupKeyOf(group(""))).toBeNull();
		expect(groupKeyOf(group("   "))).toBeNull();
	});
});

describe("sortGroups", () => {
	it("leaves query order untouched when no column order is saved", () => {
		const groups = [group("b"), group("a")];
		expect(sortGroups(groups, null)).toBe(groups);
	});

	it("applies the saved column order", () => {
		const groups = [group("Done"), group("Todo"), group("Doing")];
		expect(keysOf(sortGroups(groups, ["Todo", "Doing", "Done"]))).toEqual([
			"Todo",
			"Doing",
			"Done",
		]);
	});

	it("places the no-value group by its empty-string key", () => {
		const groups = [group("Todo"), group(null)];
		expect(keysOf(sortGroups(groups, ["", "Todo"]))).toEqual([null, "Todo"]);
	});

	it("keeps unknown columns visible, after the ordered ones", () => {
		const groups = [group("New"), group("Done"), group("Todo")];
		expect(keysOf(sortGroups(groups, ["Todo", "Done"]))).toEqual(["Todo", "Done", "New"]);
	});

	it("preserves query order among unknown columns", () => {
		const groups = [group("Z"), group("Y"), group("Todo")];
		expect(keysOf(sortGroups(groups, ["Todo"]))).toEqual(["Todo", "Z", "Y"]);
	});

	it("does not mutate the input", () => {
		const groups = [group("Done"), group("Todo")];
		sortGroups(groups, ["Todo", "Done"]);
		expect(keysOf(groups)).toEqual(["Done", "Todo"]);
	});
});
