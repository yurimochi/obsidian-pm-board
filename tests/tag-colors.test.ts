import { describe, expect, it } from "vitest";
import { parseHexColor, relativeLuminance, textToneFor } from "../src/tag-colors";

describe("parseHexColor", () => {
	it("parses six-digit hex", () => {
		expect(parseHexColor("#3d64ff")).toEqual({ r: 0x3d, g: 0x64, b: 0xff });
	});

	it("expands three-digit shorthand", () => {
		expect(parseHexColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
	});

	it("tolerates a missing hash and surrounding space", () => {
		expect(parseHexColor("  c4c4c4 ")).toEqual({ r: 0xc4, g: 0xc4, b: 0xc4 });
	});

	it("rejects anything that is not a hex colour", () => {
		expect(parseHexColor("rebeccapurple")).toBeNull();
		expect(parseHexColor("#12345")).toBeNull();
		expect(parseHexColor("")).toBeNull();
	});
});

describe("relativeLuminance", () => {
	it("spans the full range between black and white", () => {
		expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
		expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
	});
});

describe("textToneFor", () => {
	it("puts light text on dark chips", () => {
		expect(textToneFor("#001ae0")).toBe("light");
		expect(textToneFor("#1a1a1a")).toBe("light");
	});

	it("puts dark text on bright chips", () => {
		expect(textToneFor("#fdcb17")).toBe("dark");
		expect(textToneFor("#c4c4c4")).toBe("dark");
	});

	it("falls back to dark text for an unusable colour", () => {
		expect(textToneFor("not a colour")).toBe("dark");
	});
});
