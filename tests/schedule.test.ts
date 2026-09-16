import { describe, expect, it } from "vitest";
import { addDays, isoDate, nextWeekStart } from "../src/schedule";

// Dates are built with the local-time constructor (not an ISO string), so
// these stay correct under any CI runner's timezone; addDays/nextWeekStart
// operate in local time, and mixing that with a UTC-anchored fixture is
// exactly the kind of off-by-one that bit the first draft of this suite.
const local = (year: number, month: number, day: number): Date => new Date(year, month - 1, day);

describe("isoDate", () => {
	it("formats a date as YYYY-MM-DD", () => {
		expect(isoDate(new Date(Date.UTC(2026, 8, 16, 12)))).toBe("2026-09-16");
	});
});

describe("addDays", () => {
	it("moves forward by the given number of days", () => {
		const result = addDays(local(2026, 9, 16), 1);
		expect(result.getDate()).toBe(17);
	});

	it("crosses a month boundary", () => {
		const result = addDays(local(2026, 9, 30), 1);
		expect(result.getMonth()).toBe(9); // October, 0-indexed
		expect(result.getDate()).toBe(1);
	});

	it("does not mutate the input", () => {
		const original = local(2026, 9, 16);
		addDays(original, 5);
		expect(original.getDate()).toBe(16);
	});
});

describe("nextWeekStart", () => {
	const weekdays = [
		["Monday", local(2026, 9, 14)],
		["Tuesday", local(2026, 9, 15)],
		["Wednesday", local(2026, 9, 16)],
		["Thursday", local(2026, 9, 17)],
		["Friday", local(2026, 9, 18)],
		["Saturday", local(2026, 9, 19)],
		["Sunday", local(2026, 9, 20)],
	] as const;

	it.each(weekdays)("from a %s, lands on a Monday", (_name, date) => {
		expect(nextWeekStart(date).getDay()).toBe(1);
	});

	it.each(weekdays)("from a %s, is strictly in the future", (_name, date) => {
		expect(nextWeekStart(date).getTime()).toBeGreaterThan(date.getTime());
	});

	it.each(weekdays)("from a %s, is within the next 7 days", (_name, date) => {
		const days = (nextWeekStart(date).getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
		expect(days).toBeGreaterThan(0);
		expect(days).toBeLessThanOrEqual(7);
	});

	it("skips a full week when the date is already a Monday", () => {
		const monday = local(2026, 9, 14);
		expect(nextWeekStart(monday).getDate()).toBe(21);
	});
});
