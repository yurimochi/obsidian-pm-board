/**
 * ISO date (YYYY-MM-DD) for a moment, matching the format the board's own
 * date-keyed columns are read in. Read in local time: "today" is the user's
 * own calendar day, not UTC's, which is already tomorrow by evening anywhere
 * west of Greenwich.
 */
export function isoDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight for a YYYY-MM-DD string (a longer ISO timestamp's own date part), or null. */
export function parseIsoDate(text: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text.trim());
	if (!match) return null;
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return date.getMonth() === Number(match[2]) - 1 ? date : null;
}

/** The same calendar day at local midnight. */
export function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

/**
 * The next Monday strictly after `date`, per the ISO week (Monday-first).
 * Never returns `date` itself, even when `date` is already a Monday.
 */
export function nextWeekStart(date: Date): Date {
	const daysUntilNextMonday = (8 - date.getDay()) % 7 || 7;
	return addDays(date, daysUntilNextMonday);
}

/**
 * The next Saturday strictly after `date` — "next weekend". From a Friday
 * that's tomorrow; from a Saturday, a week out.
 */
export function nextWeekendStart(date: Date): Date {
	const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
	return addDays(date, daysUntilSaturday);
}

export const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_ABBR = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/**
 * "14 Sep" (no leading zero on the day) from an ISO-ish date string, for an
 * Overdue card's own date row — its own design, distinct from the padded
 * "01 Sep" a column header uses. The raw text itself stands in for anything
 * that doesn't parse as a date, rather than showing nothing.
 */
export function dayMonthLabel(dateText: string): string {
	const date = new Date(dateText);
	if (Number.isNaN(date.getTime())) return dateText;
	return `${date.getUTCDate()} ${MONTH_ABBR[date.getUTCMonth()]}`;
}

/**
 * A date column's header label: "17 Sep • Wed", swapping the weekday for
 * "Today" or "Tomorrow" when the column matches one. `today` and `tomorrow`
 * are taken as given rather than derived from `columnDate` here, since
 * deriving "tomorrow" from an ISO date through `addDays` would read it back
 * with local getters against a value `isoDate` parsed as UTC midnight — the
 * two don't agree once the caller's own local time is behind UTC.
 */
export function columnDateLabel(columnDate: string, today: string, tomorrow: string): string {
	const date = new Date(columnDate);
	const day = String(date.getUTCDate()).padStart(2, "0");
	const dayMonth = `${day} ${MONTH_ABBR[date.getUTCMonth()]}`;
	const weekday = WEEKDAY_ABBR[date.getUTCDay()];

	if (columnDate === today) return `${dayMonth} • Today • ${weekday}`;
	if (columnDate === tomorrow) return `${dayMonth} • Tomorrow • ${weekday}`;
	return `${dayMonth} • ${weekday}`;
}

/** "28 Sep 2026", the date picker's own text field format. */
export function longDateLabel(date: Date): string {
	return `${date.getDate()} ${MONTH_ABBR[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Mon 28 Sep", a quick date option's hint. */
export function weekdayDateLabel(date: Date): string {
	return `${WEEKDAY_ABBR[date.getDay()]} ${date.getDate()} ${MONTH_ABBR[date.getMonth()]}`;
}

/**
 * A month's calendar grid, Sunday first: one null per blank before the 1st,
 * then each day of the month at local midnight.
 */
export function monthCells(year: number, month: number): (Date | null)[] {
	const first = new Date(year, month, 1);
	const count = new Date(year, month + 1, 0).getDate();
	const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
	for (let day = 1; day <= count; day++) cells.push(new Date(year, month, day));
	return cells;
}

/** Month names a typed date may use: English, plus Portuguese where it differs. */
const MONTH_NAMES: Record<string, number> = {
	jan: 0,
	feb: 1,
	fev: 1,
	mar: 2,
	apr: 3,
	abr: 3,
	may: 4,
	mai: 4,
	jun: 5,
	jul: 6,
	aug: 7,
	ago: 7,
	sep: 8,
	set: 8,
	oct: 9,
	out: 9,
	nov: 10,
	dec: 11,
	dez: 11,
};

/**
 * A date typed into the date picker's field, or null when it doesn't read as
 * one. Accepts "2026-10-03", "3 Oct" / "Oct 3" (either with a year),
 * day-first "3/10" or "3/10/2026", and "today" / "tomorrow" ("hoje" /
 * "amanhã" too). A date with no year is this year's.
 */
export function parseTypedDate(raw: string, today: Date): Date | null {
	const text = raw.trim().toLowerCase();
	if (!text) return null;
	if (text === "today" || text === "hoje") return startOfDay(today);
	if (text === "tomorrow" || text === "amanhã" || text === "amanha") {
		return addDays(startOfDay(today), 1);
	}

	const iso = parseIsoDate(text);
	if (iso) return iso;

	const build = (day: number, month: number, year?: number): Date | null => {
		const date = new Date(year ?? today.getFullYear(), month, day);
		return date.getMonth() === month && date.getDate() === day ? date : null;
	};
	const yearOf = (text?: string): number | undefined => {
		if (!text) return undefined;
		const year = Number(text);
		return text.length === 2 ? 2000 + year : year;
	};

	const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
	if (numeric) return build(Number(numeric[1]), Number(numeric[2]) - 1, yearOf(numeric[3]));

	const dayFirst = /^(\d{1,2})(?:\s+de)?\s+([a-zç]+)\.?(?:\s+(?:de\s+)?(\d{4}))?$/.exec(text);
	if (dayFirst) {
		const month = MONTH_NAMES[dayFirst[2].slice(0, 3)];
		return month === undefined ? null : build(Number(dayFirst[1]), month, yearOf(dayFirst[3]));
	}

	const monthFirst = /^([a-zç]+)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(text);
	if (monthFirst) {
		const month = MONTH_NAMES[monthFirst[1].slice(0, 3)];
		return month === undefined
			? null
			: build(Number(monthFirst[2]), month, yearOf(monthFirst[3]));
	}
	return null;
}
