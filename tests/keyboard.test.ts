import { describe, expect, it } from "vitest";
import { BoardShape, dropIndexFor, focusTarget, moveTarget } from "../src/keyboard";
import { adjustIndexForRemoval } from "../src/order";

/** One lane: three columns holding 2, 0 and 3 cards. */
const oneLane: BoardShape = [[2, 0, 3]];

/** Two lanes of three columns. */
const twoLanes: BoardShape = [
	[2, 1, 0],
	[1, 0, 2],
];

describe("focusTarget", () => {
	it("steps through a column", () => {
		expect(focusTarget(oneLane, { lane: 0, column: 2, index: 0 }, "down")).toEqual({
			lane: 0,
			column: 2,
			index: 1,
		});
		expect(focusTarget(oneLane, { lane: 0, column: 2, index: 1 }, "up")).toEqual({
			lane: 0,
			column: 2,
			index: 0,
		});
	});

	it("stops at the ends of a single-lane board", () => {
		expect(focusTarget(oneLane, { lane: 0, column: 0, index: 0 }, "up")).toBeNull();
		expect(focusTarget(oneLane, { lane: 0, column: 0, index: 1 }, "down")).toBeNull();
	});

	it("skips empty columns when moving sideways", () => {
		expect(focusTarget(oneLane, { lane: 0, column: 0, index: 0 }, "right")).toEqual({
			lane: 0,
			column: 2,
			index: 0,
		});
	});

	it("clamps to the last card of a shorter column", () => {
		expect(focusTarget(oneLane, { lane: 0, column: 2, index: 2 }, "left")).toEqual({
			lane: 0,
			column: 0,
			index: 1,
		});
	});

	it("returns null when there is nothing to the side", () => {
		expect(focusTarget(oneLane, { lane: 0, column: 0, index: 0 }, "left")).toBeNull();
		expect(focusTarget(oneLane, { lane: 0, column: 2, index: 0 }, "right")).toBeNull();
	});

	it("carries on into the next lane at a column's edge", () => {
		expect(focusTarget(twoLanes, { lane: 0, column: 0, index: 1 }, "down")).toEqual({
			lane: 1,
			column: 0,
			index: 0,
		});
		expect(focusTarget(twoLanes, { lane: 1, column: 0, index: 0 }, "up")).toEqual({
			lane: 0,
			column: 0,
			index: 1,
		});
	});

	it("skips a lane whose column is empty", () => {
		const threeLanes: BoardShape = [[1], [0], [1]];
		expect(focusTarget(threeLanes, { lane: 0, column: 0, index: 0 }, "down")).toEqual({
			lane: 2,
			column: 0,
			index: 0,
		});
	});

	it("refuses a position that is not on the board", () => {
		expect(focusTarget(oneLane, { lane: 0, column: 1, index: 0 }, "down")).toBeNull();
		expect(focusTarget(oneLane, { lane: 9, column: 0, index: 0 }, "down")).toBeNull();
	});
});

describe("dropIndexFor", () => {
	it("round-trips with the adjustment a drop applies", () => {
		for (const movedFrom of [-1, 0, 1, 2]) {
			for (const target of [0, 1, 2, 3]) {
				expect(adjustIndexForRemoval(dropIndexFor(target, movedFrom), movedFrom)).toBe(
					target,
				);
			}
		}
	});

	it("leaves a card arriving from another column alone", () => {
		expect(dropIndexFor(2, -1)).toBe(2);
	});

	it("shifts once the card has passed its own place", () => {
		expect(dropIndexFor(2, 1)).toBe(3);
		expect(dropIndexFor(0, 1)).toBe(0);
	});
});

describe("moveTarget", () => {
	it("reorders within a column", () => {
		expect(moveTarget(oneLane, { lane: 0, column: 2, index: 1 }, "up")).toEqual({
			lane: 0,
			column: 2,
			index: 0,
		});
		expect(moveTarget(oneLane, { lane: 0, column: 2, index: 1 }, "down")).toEqual({
			lane: 0,
			column: 2,
			index: 2,
		});
	});

	it("will not push a card past the ends of its column", () => {
		expect(moveTarget(oneLane, { lane: 0, column: 2, index: 0 }, "up")).toBeNull();
		expect(moveTarget(oneLane, { lane: 0, column: 2, index: 2 }, "down")).toBeNull();
	});

	it("moves into an empty column, unlike focus", () => {
		expect(moveTarget(oneLane, { lane: 0, column: 0, index: 0 }, "right")).toEqual({
			lane: 0,
			column: 1,
			index: 0,
		});
	});

	it("appends when the destination is shorter", () => {
		expect(moveTarget(oneLane, { lane: 0, column: 2, index: 2 }, "left")).toEqual({
			lane: 0,
			column: 1,
			index: 0,
		});
	});

	it("keeps the vertical position where the destination has room", () => {
		const board: BoardShape = [[3, 3]];
		expect(moveTarget(board, { lane: 0, column: 0, index: 1 }, "right")).toEqual({
			lane: 0,
			column: 1,
			index: 1,
		});
	});

	it("stops at the edges of the board", () => {
		expect(moveTarget(oneLane, { lane: 0, column: 0, index: 0 }, "left")).toBeNull();
		expect(moveTarget(oneLane, { lane: 0, column: 2, index: 0 }, "right")).toBeNull();
	});

	it("crosses lanes as its own step", () => {
		expect(moveTarget(twoLanes, { lane: 0, column: 0, index: 0 }, "laneDown")).toEqual({
			lane: 1,
			column: 0,
			index: 0,
		});
		expect(moveTarget(twoLanes, { lane: 1, column: 2, index: 1 }, "laneUp")).toEqual({
			lane: 0,
			column: 2,
			index: 0,
		});
	});

	it("stops at the outermost lanes", () => {
		expect(moveTarget(twoLanes, { lane: 0, column: 0, index: 0 }, "laneUp")).toBeNull();
		expect(moveTarget(twoLanes, { lane: 1, column: 0, index: 0 }, "laneDown")).toBeNull();
	});

	it("refuses a position that is not on the board", () => {
		expect(moveTarget(oneLane, { lane: 0, column: 1, index: 0 }, "down")).toBeNull();
	});
});
