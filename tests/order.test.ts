import { describe, expect, it } from "vitest";
import {
	adjustIndexForRemoval,
	compareOrderKeys,
	insertionIndexAt,
	insertKeyAt,
	keyBetween,
	sanitiseOrderKey,
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
