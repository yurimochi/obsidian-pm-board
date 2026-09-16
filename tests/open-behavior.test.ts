import { describe, expect, it } from "vitest";
import { resolveOpenTarget } from "../src/open-behavior";

const plain = { mod: false, alt: false };
const mod = { mod: true, alt: false };
const modAlt = { mod: true, alt: true };
const alt = { mod: false, alt: true };

describe("resolveOpenTarget", () => {
	it("opens in the active pane by default", () => {
		expect(resolveOpenTarget("active", plain)).toBe(false);
	});

	it("honours the board's configured behaviour", () => {
		expect(resolveOpenTarget("tab", plain)).toBe("tab");
		expect(resolveOpenTarget("split", plain)).toBe("split");
	});

	it("lets modifiers override the configured behaviour", () => {
		expect(resolveOpenTarget("active", mod)).toBe("tab");
		expect(resolveOpenTarget("split", mod)).toBe("tab");
		expect(resolveOpenTarget("tab", modAlt)).toBe("split");
	});

	it("ignores alt on its own, which is reserved for selection", () => {
		expect(resolveOpenTarget("active", alt)).toBe(false);
		expect(resolveOpenTarget("tab", alt)).toBe("tab");
	});

	it("falls back to the active pane for the not-yet-built modal behaviour", () => {
		expect(resolveOpenTarget("modal", plain)).toBe(false);
	});
});
