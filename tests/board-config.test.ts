import { describe, expect, it } from "vitest";
import {
	collapseKey,
	groupByPropertyOf,
	DEFAULT_ORDER_PROPERTY,
	lookupColumn,
	orderKey,
	readBoardConfig,
	removeColumnSettings,
	renameColumnKey,
	setColumnMapValue,
	setColumnOrder,
	setListFilter,
} from "../src/board-config";

/** Minimal stand-in for BasesViewConfig backed by a plain object. */
function fakeConfig(raw: Record<string, unknown>) {
	return {
		get: (key: string) => raw[key],
		set: (key: string, value: unknown) => {
			raw[key] = value;
		},
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

	it("reads the list filter property and value", () => {
		const config = readBoardConfig(
			fakeConfig({ listFilterProperty: "note.tags", listFilterValue: "urgent" }),
		);
		expect(config.listFilterProperty).toBe("note.tags");
		expect(config.listFilterValue).toBe("urgent");
	});

	it("reads project and priority settings", () => {
		const config = readBoardConfig(
			fakeConfig({
				projectProperty: "note.project",
				priorityProperty: "note.priority",
			}),
		);
		expect(config.projectProperty).toBe("note.project");
		expect(config.priorityProperty).toBe("note.priority");
	});

	it("has no list filter by default", () => {
		const config = readBoardConfig(fakeConfig({}));
		expect(config.listFilterProperty).toBeNull();
		expect(config.listFilterValue).toBeNull();
	});
});

describe("setListFilter", () => {
	it("writes the property and value together", () => {
		const raw: Record<string, unknown> = {};
		setListFilter(fakeConfig(raw), "note.tags", "urgent");
		expect(raw.listFilterProperty).toBe("note.tags");
		expect(raw.listFilterValue).toBe("urgent");
	});

	it("clears the value along with the property", () => {
		const raw: Record<string, unknown> = {
			listFilterProperty: "note.tags",
			listFilterValue: "urgent",
		};
		setListFilter(fakeConfig(raw), null, null);
		expect(raw.listFilterProperty).toBeNull();
		expect(raw.listFilterValue).toBeNull();
	});

	it("drops a stale value when only the property changes", () => {
		const raw: Record<string, unknown> = {};
		setListFilter(fakeConfig(raw), "note.priority", null);
		expect(raw.listFilterProperty).toBe("note.priority");
		expect(raw.listFilterValue).toBeNull();
	});
});

/** A config whose groupBy sits on the object itself, as the host provides it. */
function fieldProperty(groupBy: unknown): string | null {
	return groupByPropertyOf({
		groupBy,
		get: () => undefined,
		getAsPropertyId: () => null,
	} as never);
}

describe("groupByPropertyOf", () => {
	it("reads groupBy off the config object itself", () => {
		expect(fieldProperty({ property: "due", direction: "ASC" })).toBe("due");
		expect(fieldProperty({ property: { type: "note", name: "due" } })).toBe("due");
		expect(fieldProperty("note.due")).toBe("note.due");
	});

	it("accepts a property object that stringifies to its own id", () => {
		expect(fieldProperty({ property: { toString: () => "note.due" } })).toBe("note.due");
	});

	it("ignores a field that names nothing", () => {
		expect(fieldProperty({ direction: "ASC" })).toBeNull();
		expect(fieldProperty(undefined)).toBeNull();
	});

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

describe("setColumnMapValue", () => {
	it("sets a column's entry, keyed the same way collapsedColumns is", () => {
		const raw: Record<string, unknown> = {};
		setColumnMapValue(fakeConfig(raw), "wipLimits", "Todo", 5);
		expect(raw.wipLimits).toEqual({ Todo: 5 });
	});

	it("uses the no-value spelling for a null column", () => {
		const raw: Record<string, unknown> = {};
		setColumnMapValue(fakeConfig(raw), "columnColors", null, "#3d64ff");
		expect(raw.columnColors).toEqual({ "(No value)": "#3d64ff" });
	});

	it("clears one entry without disturbing the others", () => {
		const raw: Record<string, unknown> = { wipLimits: { Todo: 5, Doing: 3 } };
		setColumnMapValue(fakeConfig(raw), "wipLimits", "Todo", null);
		expect(raw.wipLimits).toEqual({ Doing: 3 });
	});

	it("clears the setting entirely once its last entry is removed", () => {
		const raw: Record<string, unknown> = { wipLimits: { Todo: 5 } };
		setColumnMapValue(fakeConfig(raw), "wipLimits", "Todo", null);
		expect(raw.wipLimits).toBeNull();
	});
});

describe("setColumnOrder", () => {
	it("writes the order, translating the no-value column", () => {
		const raw: Record<string, unknown> = {};
		setColumnOrder(fakeConfig(raw), ["Todo", null, "Done"]);
		expect(raw.boardColumns).toEqual(["Todo", "", "Done"]);
	});
});

describe("removeColumnSettings", () => {
	it("removes a column from every per-column setting", () => {
		const raw: Record<string, unknown> = {
			wipLimits: { Todo: 5, Doing: 3 },
			columnColors: { Todo: "#3d64ff" },
			collapsedColumns: { Todo: true, Doing: true },
			boardColumns: ["Todo", "Doing", "Done"],
		};
		removeColumnSettings(fakeConfig(raw), "Todo");
		expect(raw.wipLimits).toEqual({ Doing: 3 });
		expect(raw.columnColors).toBeNull();
		expect(raw.collapsedColumns).toEqual({ Doing: true });
		expect(raw.boardColumns).toEqual(["Doing", "Done"]);
	});

	it("does nothing to settings the column never had", () => {
		const raw: Record<string, unknown> = { wipLimits: { Doing: 3 } };
		removeColumnSettings(fakeConfig(raw), "Todo");
		expect(raw.wipLimits).toEqual({ Doing: 3 });
	});
});

describe("renameColumnKey", () => {
	it("moves a column's entries to its new key", () => {
		const raw: Record<string, unknown> = {
			wipLimits: { Todo: 5 },
			columnColors: { Todo: "#3d64ff" },
			collapsedColumns: { Todo: true },
			boardColumns: ["Todo", "Doing"],
		};
		renameColumnKey(fakeConfig(raw), "Todo", "Backlog");
		expect(raw.wipLimits).toEqual({ Backlog: 5 });
		expect(raw.columnColors).toEqual({ Backlog: "#3d64ff" });
		expect(raw.collapsedColumns).toEqual({ Backlog: true });
		expect(raw.boardColumns).toEqual(["Backlog", "Doing"]);
	});

	it("renames the no-value column", () => {
		const raw: Record<string, unknown> = { boardColumns: ["", "Doing"] };
		renameColumnKey(fakeConfig(raw), null, "Unsorted");
		expect(raw.boardColumns).toEqual(["Unsorted", "Doing"]);
	});

	it("leaves settings alone for a column that had none", () => {
		const raw: Record<string, unknown> = { wipLimits: { Doing: 3 } };
		renameColumnKey(fakeConfig(raw), "Todo", "Backlog");
		expect(raw.wipLimits).toEqual({ Doing: 3 });
	});
});
