import { describe, expect, it } from "vitest";
import { coerceGroupValue, frontmatterKeyOf } from "../src/frontmatter";

describe("frontmatterKeyOf", () => {
	it("strips the note prefix", () => {
		expect(frontmatterKeyOf("note.status")).toBe("status");
	});

	it("accepts a bare property name", () => {
		expect(frontmatterKeyOf("due")).toBe("due");
	});

	it("keeps dots inside a note property name", () => {
		expect(frontmatterKeyOf("note.my.nested")).toBe("my.nested");
	});

	it("refuses computed properties, which cannot be written", () => {
		expect(frontmatterKeyOf("file.folder")).toBeNull();
		expect(frontmatterKeyOf("file.name")).toBeNull();
		expect(frontmatterKeyOf("formula.Untitled")).toBeNull();
	});

	it("refuses an empty property", () => {
		expect(frontmatterKeyOf("")).toBeNull();
		expect(frontmatterKeyOf("note.")).toBeNull();
	});
});

describe("coerceGroupValue", () => {
	it("clears the property for the no-value column", () => {
		expect(coerceGroupValue(null, "anything")).toBeNull();
	});

	it("matches the type of a note already in the column", () => {
		expect(coerceGroupValue("true", false)).toBe(true);
		expect(coerceGroupValue("false", true)).toBe(false);
		expect(coerceGroupValue("3", 7)).toBe(3);
		expect(coerceGroupValue("2026-09-15", "2026-09-12")).toBe("2026-09-15");
	});

	it("keeps text when a numeric column holds an unparseable key", () => {
		expect(coerceGroupValue("none", 7)).toBe("none");
	});

	it("keeps a numeric-looking key as text when the column proves it is text", () => {
		expect(coerceGroupValue("1", "2")).toBe("1");
	});

	it("infers from the key itself when the column is empty", () => {
		expect(coerceGroupValue("true", undefined)).toBe(true);
		expect(coerceGroupValue("5", undefined)).toBe(5);
		expect(coerceGroupValue("Todo", undefined)).toBe("Todo");
		expect(coerceGroupValue("2026-09-15", undefined)).toBe("2026-09-15");
	});
});
