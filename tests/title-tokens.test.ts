import { describe, expect, it } from "vitest";
import {
	activeQuery,
	extractReferences,
	findTokens,
	matchSuggestions,
	resolveName,
	toReference,
} from "../src/title-tokens";

const both = ["#", "@"] as const;

describe("findTokens", () => {
	it("finds references anywhere in the text", () => {
		const tokens = findTokens("#work Buy milk @home and @urgent", both);
		expect(tokens.map((t) => [t.trigger, t.name])).toEqual([
			["#", "work"],
			["@", "home"],
			["@", "urgent"],
		]);
	});

	it("ignores a trigger that does not start a word", () => {
		expect(findTokens("C# notes for me@example.com", both)).toEqual([]);
	});

	it("ignores a trigger that is disabled", () => {
		expect(findTokens("#work @home", ["@"]).map((t) => t.name)).toEqual(["home"]);
	});
});

describe("activeQuery", () => {
	it("reads what is typed after the trigger up to the caret", () => {
		const text = "Buy #wo";
		expect(activeQuery(text, text.length, both)).toMatchObject({
			trigger: "#",
			query: "wo",
			start: 4,
		});
	});

	it("covers the rest of the word so a pick replaces it", () => {
		expect(activeQuery("#work later", 3, both)).toMatchObject({
			query: "wo",
			start: 0,
			end: 5,
		});
	});

	it("is null outside a reference", () => {
		expect(activeQuery("Buy milk", 8, both)).toBeNull();
		expect(activeQuery("#work done", 10, both)).toBeNull();
	});
});

describe("matchSuggestions", () => {
	const items = ["Website", "Mobile app", "Web-design"];

	it("lists everything for an empty query", () => {
		expect(matchSuggestions(items, "")).toEqual(items);
	});

	it("puts prefix matches before contains matches, ignoring case and spaces", () => {
		expect(matchSuggestions(items, "web")).toEqual(["Website", "Web-design"]);
		expect(matchSuggestions(items, "app")).toEqual(["Mobile app"]);
		expect(matchSuggestions(items, "mobile-a")).toEqual(["Mobile app"]);
	});
});

describe("references", () => {
	it("writes spaces as hyphens and resolves them back", () => {
		expect(toReference("Mobile app")).toBe("Mobile-app");
		expect(resolveName("mobile-app", ["Mobile app"])).toBe("Mobile app");
		expect(resolveName("brand-new", ["Mobile app"])).toBe("brand-new");
	});
});

describe("extractReferences", () => {
	it("strips references from the title and returns them", () => {
		expect(extractReferences("Buy #home milk @errand @urgent now", both)).toEqual({
			title: "Buy milk now",
			project: "home",
			tags: ["errand", "urgent"],
		});
	});

	it("keeps the last project and dedupes tags", () => {
		const result = extractReferences("#a #b @x @x", both);
		expect(result).toEqual({ title: "", project: "b", tags: ["x"] });
	});

	it("leaves disabled triggers in the title", () => {
		expect(extractReferences("Fix #12 @bug", ["@"])).toEqual({
			title: "Fix #12",
			project: null,
			tags: ["bug"],
		});
	});
});
