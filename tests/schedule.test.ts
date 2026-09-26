import { describe, expect, it } from "vitest";
import {
	addDays,
	columnDateLabel,
	dayMonthLabel,
	isoDate,
	longDateLabel,
	monthCells,
	nextWeekendStart,
	nextWeekStart,
	parseIsoDate,
	parseTypedDate,
	weekdayDateLabel,
} from "../src/schedule";

// Dates are built with the local-time constructor (not an ISO string), so
// these stay correct under any CI runner's timezone; addDays/nextWeekStart
// operate in local time, and mixing that with a UTC-anchored fixture is
// exactly the kind of off-by-one that bit the first draft of this suite.
const local = (year: number, month: number, day: number): Date => new Date(year, month - 1, day);

describe("isoDate", () => {
	it("formats a date as YYYY-MM-DD", () => {
		expect(isoDate(new Date(Date.UTC(2026, 8, 16, 12)))).toBe("2026-09-16");
	});

	it("reads the local calendar day, not UTC's, late in the evening", () => {
		expect(isoDate(new Date(2026, 8, 16, 23, 30))).toBe("2026-09-16");
		expect(isoDate(new Date(2026, 8, 16, 0, 5))).toBe("2026-09-16");
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

describe("columnDateLabel", () => {
	// UTC-anchored throughout (the function reads its input the same way
	// isoDate produces it), so no local-time fixture is needed here.
	const today = "2026-09-17";
	const tomorrow = "2026-09-18";

	it("labels today", () => {
		expect(columnDateLabel("2026-09-17", today, tomorrow)).toBe("17 Sep • Today • Thu");
	});

	it("labels tomorrow", () => {
		expect(columnDateLabel("2026-09-18", today, tomorrow)).toBe("18 Sep • Tomorrow • Fri");
	});

	it("labels any other date with just its weekday", () => {
		expect(columnDateLabel("2026-09-20", today, tomorrow)).toBe("20 Sep • Sun");
	});

	it("pads a single-digit day", () => {
		expect(columnDateLabel("2026-09-01", today, tomorrow)).toBe("01 Sep • Tue");
	});

	it("crosses a year boundary", () => {
		expect(columnDateLabel("2026-01-01", today, tomorrow)).toBe("01 Jan • Thu");
	});
});

describe("dayMonthLabel", () => {
	it("formats a date without a leading zero on the day", () => {
		expect(dayMonthLabel("2026-09-09")).toBe("9 Sep");
	});

	it("does not pad a two-digit day either", () => {
		expect(dayMonthLabel("2026-09-14")).toBe("14 Sep");
	});

	it("returns the raw text unchanged when it doesn't parse as a date", () => {
		expect(dayMonthLabel("not-a-date")).toBe("not-a-date");
	});
});

describe("parseIsoDate", () => {
	it("reads a date at local midnight", () => {
		expect(parseIsoDate("2026-09-28")).toEqual(local(2026, 9, 28));
		expect(parseIsoDate("2026-09-28T10:00:00")).toEqual(local(2026, 9, 28));
	});

	it("rejects anything else", () => {
		expect(parseIsoDate("28 Sep")).toBeNull();
		expect(parseIsoDate("2026-02-30")).toBeNull();
	});
});

describe("nextWeekendStart", () => {
	it("lands on the next Saturday", () => {
		expect(nextWeekendStart(local(2026, 9, 26 - 2))).toEqual(local(2026, 9, 26)); // Thu -> Sat
		expect(nextWeekendStart(local(2026, 9, 25))).toEqual(local(2026, 9, 26)); // Fri -> Sat
		expect(nextWeekendStart(local(2026, 9, 26))).toEqual(local(2026, 10, 3)); // Sat -> next Sat
	});
});

describe("date labels", () => {
	it("formats the picker's field and hints", () => {
		expect(longDateLabel(local(2026, 9, 28))).toBe("28 Sep 2026");
		expect(weekdayDateLabel(local(2026, 9, 28))).toBe("Mon 28 Sep");
	});
});

describe("monthCells", () => {
	it("pads to the month's first weekday, Sunday first", () => {
		const cells = monthCells(2026, 8); // September 2026 starts on a Tuesday
		expect(cells.slice(0, 2)).toEqual([null, null]);
		expect(cells[2]).toEqual(local(2026, 9, 1));
		expect(cells.filter((cell) => cell !== null)).toHaveLength(30);
	});
});

describe("parseTypedDate", () => {
	const today = local(2026, 9, 26);

	it("reads ISO dates", () => {
		expect(parseTypedDate("2026-10-03", today)).toEqual(local(2026, 10, 3));
	});

	it("reads day and month names, in English or Portuguese", () => {
		expect(parseTypedDate("3 Oct", today)).toEqual(local(2026, 10, 3));
		expect(parseTypedDate("Oct 3", today)).toEqual(local(2026, 10, 3));
		expect(parseTypedDate("3 out 2027", today)).toEqual(local(2027, 10, 3));
		expect(parseTypedDate("3 de outubro", today)).toEqual(local(2026, 10, 3));
		expect(parseTypedDate("28 Sep 2026", today)).toEqual(local(2026, 9, 28));
	});

	it("reads numeric dates day first", () => {
		expect(parseTypedDate("3/10", today)).toEqual(local(2026, 10, 3));
		expect(parseTypedDate("03/10/2027", today)).toEqual(local(2027, 10, 3));
	});

	it("reads relative words", () => {
		expect(parseTypedDate("today", today)).toEqual(today);
		expect(parseTypedDate("amanhã", today)).toEqual(local(2026, 9, 27));
	});

	it("rejects what isn't a date", () => {
		expect(parseTypedDate("", today)).toBeNull();
		expect(parseTypedDate("soon", today)).toBeNull();
		expect(parseTypedDate("31/2", today)).toBeNull();
		expect(parseTypedDate("3 Foo", today)).toBeNull();
	});
});
