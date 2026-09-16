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
