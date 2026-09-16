import { describe, expect, it } from "vitest";
import { normaliseTagName, parseTagList } from "../src/tag-colors";

describe("normaliseTagName", () => {
	it("strips a leading hash", () => {
		expect(normaliseTagName("#project")).toBe("project");
	});

	it("trims surrounding whitespace", () => {
		expect(normaliseTagName("  task  ")).toBe("task");
	});

	it("passes a tag with no hash through unchanged", () => {
		expect(normaliseTagName("bug")).toBe("bug");
	});
});

describe("parseTagList", () => {
	it("normalises each entry of an array", () => {
		expect(parseTagList(["#task", " bug ", "#feature"])).toEqual(["task", "bug", "feature"]);
	});

	it("splits a comma-separated string", () => {
		expect(parseTagList("task, bug,  #feature")).toEqual(["task", "bug", "feature"]);
	});

	it("drops empty entries", () => {
		expect(parseTagList("task,,  ,bug")).toEqual(["task", "bug"]);
	});

	it("deduplicates", () => {
		expect(parseTagList("task, #task, TASK")).toEqual(["task", "TASK"]);
	});

	it("returns an empty list for anything else", () => {
		expect(parseTagList(undefined)).toEqual([]);
		expect(parseTagList(null)).toEqual([]);
		expect(parseTagList(42)).toEqual([]);
		expect(parseTagList([1, "task", null])).toEqual(["task"]);
	});
});
