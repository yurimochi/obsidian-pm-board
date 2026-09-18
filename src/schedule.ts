/**
 * ISO date (YYYY-MM-DD) for a moment, matching the format the board's own
 * date-keyed columns are read in.
 */
export function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
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

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_ABBR = [
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
