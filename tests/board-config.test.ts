import { describe, expect, it } from "vitest";
import {
	collapseKey,
	groupByPropertyOf,
	DEFAULT_ORDER_PROPERTY,
	lookupColumn,
	orderKey,
	readBoardConfig,
} from "../src/board-config";

/** Minimal stand-in for BasesViewConfig backed by a plain object. */
function fakeConfig(raw: Record<string, unknown>) {
	return {
		get: (key: string) => raw[key],
		getAsPropertyId: (key: string) => (typeof raw[key] === "string" ? raw[key] : null),
	} as never;
}

/** Mirrors a real `.base` kanban view, including YAML's native date parsing. */
const realWorldView = {
	newItemFolder: "Tasks/Tasks",
	newItemTemplate: "Tasks/Template/Task Template.md",
	cardOpenBehavior: "modal",
	newCardsToTop: true,
	collapsedColumns: { "(No value)": true },
	boardColumns: ["", new Date("2026-09-12"), new Date("2026-09-13")],
	tagColors: { project: "#3d64ff", task: "#c4c4c4" },
};

describe("readBoardConfig", () => {
	it("reads a real-world kanban view", () => {
		const config = readBoardConfig(fakeConfig(realWorldView));

		expect(config.newItemFolder).toBe("Tasks/Tasks");
		expect(config.newItemTemplate).toBe("Tasks/Template/Task Template.md");
		expect(config.cardOpenBehavior).toBe("modal");
		expect(config.newCardsToTop).toBe(true);
		expect(config.collapsedColumns.has("(No value)")).toBe(true);
		expect(config.tagColors.get("project")).toBe("#3d64ff");
	});

	it("normalises YAML dates in boardColumns back to plain strings", () => {
		const config = readBoardConfig(fakeConfig(realWorldView));
		expect(config.boardColumns).toEqual(["", "2026-09-12", "2026-09-13"]);
	});

	it("falls back to safe defaults on an empty view", () => {
		const config = readBoardConfig(fakeConfig({}));

		expect(config.newItemFolder).toBeNull();
		expect(config.cardOpenBehavior).toBe("active");
		expect(config.newCardsToTop).toBe(false);
		expect(config.boardColumns).toBeNull();
		expect(config.collapsedColumns.size).toBe(0);
		expect(config.orderProperty).toBe(DEFAULT_ORDER_PROPERTY);
	});

	it("rejects malformed values instead of propagating them", () => {
		const config = readBoardConfig(
			fakeConfig({
				cardOpenBehavior: "teleport",
				collapsedColumns: ["not", "a", "map"],
				tagColors: { good: "#fff", bad: 42 },
				boardColumns: "not an array",
			}),
		);

		expect(config.cardOpenBehavior).toBe("active");
		expect(config.collapsedColumns.size).toBe(0);
		expect(config.boardColumns).toBeNull();
		expect(config.tagColors.get("good")).toBe("#fff");
		expect(config.tagColors.has("bad")).toBe(false);
	});

	it("drops boardColumns entries that cannot name a column", () => {
		const config = readBoardConfig(
			fakeConfig({
				boardColumns: ["Todo", { nested: true }, 7, false, null],
			}),
		);

		expect(config.boardColumns).toEqual(["Todo", "7", "false", ""]);
	});

	it("reads per-column WIP limits", () => {
		const config = readBoardConfig(fakeConfig({ wipLimits: { "2026-09-15": 5, Todo: 3 } }));
		expect(config.wipLimits.get("2026-09-15")).toBe(5);
		expect(config.wipLimits.get("Todo")).toBe(3);
	});

	it("recovers the ISO form of a date key that arrived stringified", () => {
		const config = readBoardConfig(
			fakeConfig({ wipLimits: { "Tue Sep 15 2026 00:00:00 GMT+0000": 5 } }),
		);
		expect(config.wipLimits.get("2026-09-15")).toBe(5);
	});

	it("ignores WIP limits that are not whole non-negative numbers", () => {
		const config = readBoardConfig(
			fakeConfig({ wipLimits: { a: 2.5, b: -1, c: "3", d: null, e: 0 } }),
		);
		expect([...config.wipLimits.keys()]).toEqual(["e"]);
	});

	it("only treats explicitly true columns as collapsed", () => {
		const config = readBoardConfig(
			fakeConfig({ collapsedColumns: { a: true, b: false, c: "true" } }),
		);
		expect([...config.collapsedColumns]).toEqual(["a"]);
	});
});

describe("groupByPropertyOf", () => {
	it("prefers the property id the host resolves", () => {
		expect(groupByPropertyOf(fakeConfig({ groupBy: "note.due" }))).toBe("note.due");
	});

	it("reads the object form stored in a .base file", () => {
		expect(
			groupByPropertyOf(fakeConfig({ groupBy: { property: "due", direction: "ASC" } })),
		).toBe("due");
	});

	it("reads a nested property object", () => {
		expect(groupByPropertyOf(fakeConfig({ groupBy: { property: { name: "due" } } }))).toBe(
			"due",
		);
	});

	it("returns null when nothing names a property", () => {
		expect(groupByPropertyOf(fakeConfig({}))).toBeNull();
		expect(groupByPropertyOf(fakeConfig({ groupBy: { direction: "ASC" } }))).toBeNull();
	});
});

describe("lookupColumn", () => {
	it("finds the no-value column under either spelling", () => {
		expect(lookupColumn(new Map([["(No value)", 1]]), null)).toBe(1);
		expect(lookupColumn(new Map([["", 2]]), null)).toBe(2);
	});

	it("finds a named column", () => {
		expect(lookupColumn(new Map([["Todo", 3]]), "Todo")).toBe(3);
	});

	it("returns null when the column has no entry", () => {
		expect(lookupColumn(new Map([["Todo", 3]]), "Done")).toBeNull();
	});
});

describe("no-value column keys", () => {
	it("uses a different spelling per setting", () => {
		expect(collapseKey(null)).toBe("(No value)");
		expect(orderKey(null)).toBe("");
	});

	it("passes real keys through unchanged", () => {
		expect(collapseKey("Todo")).toBe("Todo");
		expect(orderKey("Todo")).toBe("Todo");
	});
});
