import { describe, expect, it } from "vitest";
import { priorityOf } from "../src/priority";

describe("priorityOf", () => {
	it("accepts the four expected labels", () => {
		expect(priorityOf("P1")).toBe("P1");
		expect(priorityOf("P2")).toBe("P2");
		expect(priorityOf("P3")).toBe("P3");
		expect(priorityOf("P4")).toBe("P4");
	});

	it("is case-insensitive", () => {
		expect(priorityOf("p1")).toBe("P1");
		expect(priorityOf("p4")).toBe("P4");
	});

	it("accepts a bare digit 1-4", () => {
		expect(priorityOf("1")).toBe("P1");
		expect(priorityOf("4")).toBe("P4");
	});

	it("rejects anything else", () => {
		expect(priorityOf("P5")).toBeNull();
		expect(priorityOf("High")).toBeNull();
		expect(priorityOf("5")).toBeNull();
		expect(priorityOf("0")).toBeNull();
	});

	it("treats an absent value as no priority", () => {
		expect(priorityOf(null)).toBeNull();
		expect(priorityOf(undefined)).toBeNull();
		expect(priorityOf("")).toBeNull();
	});
});
