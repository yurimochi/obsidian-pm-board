import { describe, expect, it } from "vitest";
import { applyPlaceholders, joinPath, stripFrontmatter, uniqueName } from "../src/template";

/** Stands in for moment: echoes the pattern so substitution is observable. */
const ctx = {
	title: "My card",
	now: new Date("2026-09-16T14:30:00Z"),
	format: (_date: Date, pattern: string) => `<${pattern}>`,
};

describe("applyPlaceholders", () => {
	it("fills in the title", () => {
		expect(applyPlaceholders("# {{title}}", ctx)).toBe("# My card");
	});

	it("uses default patterns for bare date and time", () => {
		expect(applyPlaceholders("{{date}} {{time}}", ctx)).toBe("<YYYY-MM-DD> <HH:mm>");
	});

	it("passes an explicit pattern through", () => {
		expect(applyPlaceholders("{{date:DD/MM/YYYY}}", ctx)).toBe("<DD/MM/YYYY>");
		expect(applyPlaceholders("{{time:HH}}", ctx)).toBe("<HH>");
	});

	it("falls back when a pattern is empty", () => {
		expect(applyPlaceholders("{{date:}}", ctx)).toBe("<YYYY-MM-DD>");
		expect(applyPlaceholders("{{date:   }}", ctx)).toBe("<YYYY-MM-DD>");
	});

	it("replaces every occurrence", () => {
		expect(applyPlaceholders("{{title}} and {{title}}", ctx)).toBe("My card and My card");
	});

	it("leaves braces it does not recognise alone", () => {
		expect(applyPlaceholders("{{unknown}} {{ title }} {not a placeholder}", ctx)).toBe(
			"{{unknown}} {{ title }} {not a placeholder}",
		);
	});
});

describe("stripFrontmatter", () => {
	it("removes a leading block", () => {
		expect(stripFrontmatter("---\nstatus: Todo\n---\n# Body")).toBe("# Body");
	});

	it("handles carriage returns", () => {
		expect(stripFrontmatter("---\r\nstatus: Todo\r\n---\r\nBody")).toBe("Body");
	});

	it("handles a template that is only frontmatter", () => {
		expect(stripFrontmatter("---\nstatus: Todo\n---\n")).toBe("");
	});

	it("leaves a body with no frontmatter untouched", () => {
		expect(stripFrontmatter("# Body\n\nText")).toBe("# Body\n\nText");
	});

	it("keeps a rule that is not frontmatter", () => {
		expect(stripFrontmatter("# Title\n\n---\n\nAfter")).toBe("# Title\n\n---\n\nAfter");
	});

	it("stops at the first closing delimiter", () => {
		expect(stripFrontmatter("---\na: 1\n---\nBody\n---\nMore")).toBe("Body\n---\nMore");
	});
});

describe("uniqueName", () => {
	it("keeps the base name when it is free", () => {
		expect(uniqueName("Untitled", () => false)).toBe("Untitled");
	});

	it("counts up past names in use", () => {
		const used = new Set(["Untitled", "Untitled 1", "Untitled 2"]);
		expect(uniqueName("Untitled", (name) => used.has(name))).toBe("Untitled 3");
	});

	it("skips only the names actually taken", () => {
		const used = new Set(["Untitled"]);
		expect(uniqueName("Untitled", (name) => used.has(name))).toBe("Untitled 1");
	});
});

describe("joinPath", () => {
	it("joins a folder and a name", () => {
		expect(joinPath("Tasks/Tasks", "Untitled")).toBe("Tasks/Tasks/Untitled");
	});

	it("treats an empty folder as the vault root", () => {
		expect(joinPath("", "Untitled")).toBe("Untitled");
	});

	it("tolerates a trailing slash", () => {
		expect(joinPath("Tasks/", "Untitled")).toBe("Tasks/Untitled");
	});
});
