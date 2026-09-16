import { describe, expect, it } from "vitest";
import {
	adjustIndexForRemoval,
	columnInsertionIndexAt,
	compareOrderKeys,
	insertionIndexAt,
	insertKeyAt,
	keyBetween,
	planInsertion,
	reorderIndexFor,
	resolveOrderKey,
	sanitiseOrderKey,
	sortByOrderKey,
} from "../src/order";

describe("sanitiseOrderKey", () => {
	it("keeps a usable key", () => {
		expect(sanitiseOrderKey("a0")).toBe("a0");
		expect(sanitiseOrderKey("  a0 ")).toBe("a0");
	});

	it("accepts a numeric key written by hand", () => {
		expect(sanitiseOrderKey(3)).toBe("3");
	});

	it("rejects anything that cannot bound a range", () => {
		expect(sanitiseOrderKey("")).toBeNull();
		expect(sanitiseOrderKey("   ")).toBeNull();
		expect(sanitiseOrderKey(undefined)).toBeNull();
		expect(sanitiseOrderKey(null)).toBeNull();
		expect(sanitiseOrderKey(Number.NaN)).toBeNull();
		expect(sanitiseOrderKey({})).toBeNull();
	});
});

describe("keyBetween", () => {
	it("orders strictly between its bounds", () => {
		const key = keyBetween("a0", "a1");
		expect(key > "a0").toBe(true);
		expect(key < "a1").toBe(true);
	});

	it("appends after a lower bound", () => {
		expect(keyBetween("a0", null) > "a0").toBe(true);
	});

	it("prepends before an upper bound", () => {
		expect(keyBetween(null, "a0") < "a0").toBe(true);
	});

	it("survives a malformed bound instead of throwing", () => {
		expect(() => keyBetween("not a key", "a0")).not.toThrow();
		expect(keyBetween("not a key", "a0")).toBeTruthy();
		expect(() => keyBetween("", "")).not.toThrow();
	});

	it("does not trust reversed bounds", () => {
		const key = keyBetween("a1", "a0");
		expect(key > "a1").toBe(true);
	});
});

describe("insertKeyAt", () => {
	it("generates a first key for an empty column", () => {
		expect(insertKeyAt([], 0)).toBeTruthy();
	});

	it("places a card at the top", () => {
		expect(insertKeyAt(["a1", "a2"], 0) < "a1").toBe(true);
	});

	it("places a card in the middle", () => {
		const key = insertKeyAt(["a1", "a3"], 1);
		expect(key > "a1" && key < "a3").toBe(true);
	});

	it("places a card at the bottom", () => {
		expect(insertKeyAt(["a1", "a2"], 2) > "a2").toBe(true);
	});

	it("clamps an index beyond the column", () => {
		expect(insertKeyAt(["a1"], 99) > "a1").toBe(true);
		expect(insertKeyAt(["a1"], -5) < "a1").toBe(true);
	});

	it("works around neighbours that have no key yet", () => {
		expect(() => insertKeyAt([null, null], 1)).not.toThrow();
	});
});

describe("planInsertion", () => {
	it("inserts without touching neighbours when every key is present", () => {
		const plan = planInsertion(["a1", "a2"], 1);
		expect(plan.healed).toEqual([null, null]);
		expect(plan.insertKey > "a1" && plan.insertKey < "a2").toBe(true);
	});

	it("renumbers the column when a neighbour has no key", () => {
		const plan = planInsertion([null, null], 2);
		expect(plan.healed.every((key) => key !== null)).toBe(true);
		expect(plan.healed).toHaveLength(2);
	});

	it("keeps a card dropped at the bottom at the bottom", () => {
		const plan = planInsertion([null, null, null], 3);
		const healed = plan.healed as string[];
		expect(healed.every((key) => key < plan.insertKey)).toBe(true);
	});

	it("keeps a card dropped at the top at the top", () => {
		const plan = planInsertion([null, null, null], 0);
		const healed = plan.healed as string[];
		expect(healed.every((key) => key > plan.insertKey)).toBe(true);
	});

	it("keeps a card dropped in the middle in the middle", () => {
		const plan = planInsertion([null, null, null], 1);
		const healed = plan.healed as string[];
		expect(healed[0] < plan.insertKey).toBe(true);
		expect(healed[1] > plan.insertKey).toBe(true);
	});

	it("handles the first card of an empty column", () => {
		const plan = planInsertion([], 0);
		expect(plan.insertKey).toBeTruthy();
		expect(plan.healed).toEqual([]);
	});

	it("renumbers when only some keys are missing", () => {
		const plan = planInsertion(["a1", null], 1);
		expect(plan.healed.every((key) => key !== null)).toBe(true);
	});
});

describe("resolveOrderKey", () => {
	it("prefers the current property", () => {
		expect(resolveOrderKey("a2", "a1", true)).toBe("a2");
	});

	it("falls back to the legacy property while on the default", () => {
		expect(resolveOrderKey(undefined, "a1", true)).toBe("a1");
		expect(resolveOrderKey("", "a1", true)).toBe("a1");
	});

	it("ignores the legacy property once the board names its own", () => {
		expect(resolveOrderKey(undefined, "a1", false)).toBeNull();
	});

	it("returns null when neither property has a usable key", () => {
		expect(resolveOrderKey(undefined, undefined, true)).toBeNull();
	});
});

describe("compareOrderKeys", () => {
	it("sorts keys lexicographically", () => {
		expect(["a2", "a1", "a3"].sort(compareOrderKeys)).toEqual(["a1", "a2", "a3"]);
	});

	it("sinks cards with no key to the bottom", () => {
		expect(["a2", null, "a1"].sort(compareOrderKeys)).toEqual(["a1", "a2", null]);
	});

	it("treats two missing keys as equal", () => {
		expect(compareOrderKeys(null, null)).toBe(0);
	});
});

describe("sortByOrderKey", () => {
	const keyOf = (entry: { key: string | null }) => entry.key;

	it("orders by key and sinks unkeyed cards", () => {
		const entries = [{ key: "a2" }, { key: null }, { key: "a1" }];
		expect(sortByOrderKey(entries, keyOf).map(keyOf)).toEqual(["a1", "a2", null]);
	});

	it("reads keys at call time, so a rewrite is reflected", () => {
		const entries = [{ key: "a2" }, { key: "a1" }];
		expect(sortByOrderKey(entries, keyOf).map(keyOf)).toEqual(["a1", "a2"]);
		entries[0].key = "a0";
		expect(sortByOrderKey(entries, keyOf).map(keyOf)).toEqual(["a0", "a1"]);
	});

	it("does not mutate the input", () => {
		const entries = [{ key: "a2" }, { key: "a1" }];
		sortByOrderKey(entries, keyOf);
		expect(entries.map(keyOf)).toEqual(["a2", "a1"]);
	});
});

describe("adjustIndexForRemoval", () => {
	it("shifts positions after the removed card", () => {
		expect(adjustIndexForRemoval(3, 1)).toBe(2);
	});

	it("leaves positions before the removed card alone", () => {
		expect(adjustIndexForRemoval(1, 3)).toBe(1);
		expect(adjustIndexForRemoval(1, 1)).toBe(1);
	});

	it("leaves the index alone when the card came from elsewhere", () => {
		expect(adjustIndexForRemoval(3, -1)).toBe(3);
	});
});

describe("insertionIndexAt", () => {
	const cards = [
		{ top: 0, height: 100 },
		{ top: 100, height: 100 },
		{ top: 200, height: 100 },
	];

	it("inserts above a card while over its upper half", () => {
		expect(insertionIndexAt(cards, 10)).toBe(0);
		expect(insertionIndexAt(cards, 120)).toBe(1);
	});

	it("inserts below a card once past its midpoint", () => {
		expect(insertionIndexAt(cards, 60)).toBe(1);
		expect(insertionIndexAt(cards, 260)).toBe(3);
	});

	it("appends when below every card", () => {
		expect(insertionIndexAt(cards, 9999)).toBe(3);
	});

	it("returns the first position for an empty column", () => {
		expect(insertionIndexAt([], 50)).toBe(0);
	});
});

describe("columnInsertionIndexAt", () => {
	const columns = [
		{ left: 0, width: 200 },
		{ left: 200, width: 200 },
		{ left: 400, width: 200 },
	];

	it("inserts before a column while over its left half", () => {
		expect(columnInsertionIndexAt(columns, 20)).toBe(0);
		expect(columnInsertionIndexAt(columns, 240)).toBe(1);
	});

	it("inserts after a column once past its midpoint", () => {
		expect(columnInsertionIndexAt(columns, 120)).toBe(1);
		expect(columnInsertionIndexAt(columns, 520)).toBe(3);
	});

	it("appends when to the right of every column", () => {
		expect(columnInsertionIndexAt(columns, 9999)).toBe(3);
	});

	it("returns the first position for an empty row", () => {
		expect(columnInsertionIndexAt([], 50)).toBe(0);
	});
});

describe("reorderIndexFor", () => {
	it("leaves the target alone when the column came from later in the row", () => {
		expect(reorderIndexFor(1, 3)).toBe(1);
	});

	it("shifts left once the moved column's own slot is removed", () => {
		expect(reorderIndexFor(3, 1)).toBe(2);
	});

	it("is a no-op when the column would land back where it started", () => {
		expect(reorderIndexFor(1, 1)).toBe(1);
	});
});
