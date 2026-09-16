import { describe, expect, it } from "vitest";
import { normaliseTagName } from "../src/tag-colors";

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
