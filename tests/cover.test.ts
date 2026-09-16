import { describe, expect, it } from "vitest";
import { parseCoverReference } from "../src/cover";

describe("parseCoverReference", () => {
	it("reads a wikilink", () => {
		expect(parseCoverReference("[[image.png]]")).toEqual({
			kind: "link",
			linkpath: "image.png",
		});
		expect(parseCoverReference("![[folder/image.png]]")).toEqual({
			kind: "link",
			linkpath: "folder/image.png",
		});
	});

	it("drops the display text and subpath of a wikilink", () => {
		expect(parseCoverReference("[[image.png|300]]")).toEqual({
			kind: "link",
			linkpath: "image.png",
		});
	});

	it("reads a markdown image link", () => {
		expect(parseCoverReference("![cover](assets/a.png)")).toEqual({
			kind: "link",
			linkpath: "assets/a.png",
		});
	});

	it("reads a bare vault path", () => {
		expect(parseCoverReference("assets/a.png")).toEqual({
			kind: "link",
			linkpath: "assets/a.png",
		});
	});

	it("reads a web url", () => {
		expect(parseCoverReference("https://example.com/a.png")).toEqual({
			kind: "url",
			url: "https://example.com/a.png",
		});
		expect(parseCoverReference("http://example.com/a.png")).toEqual({
			kind: "url",
			url: "http://example.com/a.png",
		});
	});

	it("refuses schemes that could execute, however they are wrapped", () => {
		for (const hostile of [
			"javascript:alert(1)",
			"JavaScript:alert(1)",
			"data:text/html;base64,PHNjcmlwdD4=",
			"vbscript:msgbox(1)",
			"file:///etc/passwd",
			"[[javascript:alert(1)]]",
			"![x](javascript:alert(1))",
		]) {
			expect(parseCoverReference(hostile)).toBeNull();
		}
	});

	it("ignores values that name nothing", () => {
		expect(parseCoverReference("")).toBeNull();
		expect(parseCoverReference("   ")).toBeNull();
		expect(parseCoverReference(null)).toBeNull();
		expect(parseCoverReference(42)).toBeNull();
		expect(parseCoverReference("[[]]")).toBeNull();
	});
});
