import { PRIORITY_LABELS, PriorityLabel } from "./priority";
import {
	addDays,
	isoDate,
	longDateLabel,
	MONTH_ABBR,
	monthCells,
	nextWeekendStart,
	nextWeekStart,
	parseIsoDate,
	parseTypedDate,
	startOfDay,
	WEEKDAY_ABBR,
	weekdayDateLabel,
} from "./schedule";

/**
 * The desktop task-detail floating's property pickers, from its design
 * handoff: one popover per pill (project, date, tags, priority), each built
 * into the element the modal hands it. They only render and report picks;
 * writing the note and closing the popover are the modal's job.
 */

type Shape = [tag: "path" | "rect" | "circle", attr: Record<string, string>];

/** The handoff's own inline icons, stroked in currentColor so CSS colours them. */
const ICONS = {
	folder: [
		[
			"path",
			{ d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
		],
	],
	calendar: [
		["rect", { x: "3", y: "4", width: "18", height: "17", rx: "2" }],
		["path", { d: "M3 9.5h18M8 2v3M16 2v3" }],
	],
	tag: [
		[
			"path",
			{
				d: "M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z",
			},
		],
		["circle", { cx: "7", cy: "7", r: "1.5", fill: "currentColor", stroke: "none" }],
	],
	flag: [
		["path", { d: "M5 21V4" }],
		["path", { d: "M5 4c4-2 7 2 14 0v10c-7 2-10-2-14 0z", class: "pmb-td-flag" }],
	],
	check: [["path", { d: "M5 12l5 5L20 7" }]],
	close: [["path", { d: "M18 6L6 18M6 6l12 12" }]],
	plus: [["path", { d: "M12 5v14M5 12h14" }]],
	tomorrow: [
		["circle", { cx: "12", cy: "12", r: "4" }],
		[
			"path",
			{
				d: "M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
			},
		],
	],
	nextWeek: [
		["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }],
		["path", { d: "M7 12h9M13 9l3 3-3 3" }],
	],
	weekend: [
		["path", { d: "M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" }],
		[
			"path",
			{ d: "M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" },
		],
	],
	noDate: [
		["circle", { cx: "12", cy: "12", r: "9" }],
		["path", { d: "M8 16l8-8" }],
	],
	chevronLeft: [["path", { d: "M15 18l-6-6 6-6" }]],
	chevronRight: [["path", { d: "M9 18l6-6-6-6" }]],
} satisfies Record<string, Shape[]>;

export type TaskDetailIcon = keyof typeof ICONS;

export function drawIcon(
	parentEl: HTMLElement,
	icon: TaskDetailIcon,
	cls = "",
	strokeWidth = "1.8",
): HTMLElement {
	const iconEl = parentEl.createSpan({ cls: `pmb-td-icon pmb-td-icon-${icon} ${cls}`.trim() });
	const svg = iconEl.createSvg("svg", {
		attr: {
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": strokeWidth,
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		},
	});
	for (const [tag, attr] of ICONS[icon] as Shape[]) svg.createSvg(tag, { attr });
	return iconEl;
}

/** Today's calendar with the day of the month inside it; no shape set of its own. */
function drawTodayIcon(parentEl: HTMLElement, today: Date): void {
	const iconEl = parentEl.createSpan({ cls: "pmb-td-icon pmb-td-icon-today" });
	const svg = iconEl.createSvg("svg", {
		attr: {
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "1.6",
			"stroke-linejoin": "round",
		},
	});
	svg.createSvg("rect", { attr: { x: "3", y: "3", width: "18", height: "18", rx: "2" } });
	svg.createSvg("path", { attr: { d: "M6 7h12" } });
	svg.createSvg("text", {
		cls: "pmb-td-icon-day",
		attr: { x: "12", y: "18", "text-anchor": "middle" },
	}).textContent = String(today.getDate());
}

/** A search field and the list it filters, shared by the project and tag pickers. */
function searchList(
	parentEl: HTMLElement,
	placeholder: string,
	onQuery: (query: string) => void,
	onEnter: (query: string) => void,
): { inputEl: HTMLInputElement; listEl: HTMLElement } {
	const searchEl = parentEl.createDiv({ cls: "pmb-td-search" });
	const inputEl = searchEl.createEl("input", {
		cls: "pmb-td-search-input",
		attr: { type: "text", placeholder, spellcheck: "false" },
	});
	const listEl = parentEl.createDiv({ cls: "pmb-td-list" });
	inputEl.addEventListener("input", () => onQuery(inputEl.value));
	inputEl.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		onEnter(inputEl.value);
	});
	return { inputEl, listEl };
}

const matches = (label: string, query: string): boolean =>
	label.toLowerCase().includes(query.trim().toLowerCase());

export interface ProjectPickerOptions {
	projects: string[];
	current: string;
	/** A project name, or null to clear it (picking the current one again). */
	onPick: (name: string | null) => void;
}

/**
 * A searchable list of every project in the vault. Enter picks the first
 * match; a name matching none can be created. Picking the current project
 * again clears it, since the list has no separate "none".
 */
export function renderProjectPicker(
	el: HTMLElement,
	options: ProjectPickerOptions,
): HTMLInputElement {
	el.addClass("pmb-td-popover-project");
	const pick = (name: string): void => options.onPick(name === options.current ? null : name);

	const { inputEl, listEl } = searchList(
		el,
		"Type a project name",
		(query) => renderRows(query),
		(query) => {
			const first = options.projects.find((name) => matches(name, query));
			const typed = query.trim();
			if (first) pick(first);
			else if (typed) options.onPick(typed);
		},
	);

	const renderRows = (query: string): void => {
		listEl.empty();
		const shown = options.projects.filter((name) => matches(name, query));
		for (const name of shown) {
			const rowEl = listEl.createDiv({ cls: "pmb-td-row" });
			rowEl.toggleClass("pmb-td-row-current", name === options.current);
			drawIcon(rowEl.createSpan({ cls: "pmb-td-row-icon" }), "folder", "pmb-td-muted-icon");
			rowEl.createSpan({ cls: "pmb-td-row-label", text: name });
			if (name === options.current) drawIcon(rowEl, "check", "pmb-td-row-check", "2.6");
			rowEl.addEventListener("click", () => pick(name));
		}
		const typed = query.trim();
		const exact = options.projects.some((name) => name.toLowerCase() === typed.toLowerCase());
		if (typed && !exact) {
			const createEl = listEl.createDiv({ cls: "pmb-td-row pmb-td-row-create" });
			drawIcon(createEl.createSpan({ cls: "pmb-td-row-icon" }), "plus");
			createEl.createSpan({ cls: "pmb-td-row-label", text: `Create "${typed}"` });
			createEl.addEventListener("click", () => options.onPick(typed));
		} else if (shown.length === 0) {
			listEl.createDiv({ cls: "pmb-td-empty", text: "No projects found" });
		}
	};

	renderRows("");
	return inputEl;
}

export interface TagPickerOptions {
	tags: string[];
	selected: () => string[];
	colorOf: (tag: string) => string | undefined;
	/** Adds or removes a tag; resolves once written, so the list redraws its checkboxes. */
	onToggle: (tag: string) => Promise<void>;
}

/**
 * A searchable, multi-select list of every tag in the vault; stays open
 * while tags are ticked on and off. Enter toggles the first match, or
 * creates the typed label when nothing matches.
 */
export function renderTagPicker(el: HTMLElement, options: TagPickerOptions): HTMLInputElement {
	el.addClass("pmb-td-popover-tags");
	const known = [...options.tags];

	const toggle = async (tag: string): Promise<void> => {
		if (!known.includes(tag)) known.push(tag);
		await options.onToggle(tag);
		inputEl.value = "";
		renderRows("");
		inputEl.focus();
	};

	const { inputEl, listEl } = searchList(
		el,
		"Type a label",
		(query) => renderRows(query),
		(query) => {
			const typed = query.trim();
			if (!typed) return;
			void toggle(known.find((tag) => matches(tag, typed)) ?? typed);
		},
	);

	const renderRows = (query: string): void => {
		listEl.empty();
		const selected = options.selected();
		for (const tag of known.filter((candidate) => matches(candidate, query))) {
			const checked = selected.includes(tag);
			const rowEl = listEl.createDiv({ cls: "pmb-td-row" });
			const iconEl = drawIcon(rowEl, "tag", "pmb-td-tag-icon", "1.6");
			const color = options.colorOf(tag);
			if (color) iconEl.style.setProperty("--pmb-td-tag-color", color);
			rowEl.createSpan({ cls: "pmb-td-row-label", text: tag });
			const boxEl = rowEl.createSpan({ cls: "pmb-td-checkbox" });
			boxEl.toggleClass("pmb-td-checkbox-checked", checked);
			if (checked) drawIcon(boxEl, "check", "", "3");
			rowEl.addEventListener("click", () => void toggle(tag));
		}
		const typed = query.trim();
		if (typed && !known.some((tag) => tag.toLowerCase() === typed.toLowerCase())) {
			const createEl = listEl.createDiv({ cls: "pmb-td-row pmb-td-row-create" });
			drawIcon(createEl.createSpan({ cls: "pmb-td-row-icon" }), "plus");
			createEl.createSpan({ cls: "pmb-td-row-label", text: `Create "${typed}"` });
			createEl.addEventListener("click", () => void toggle(typed));
		}
	};

	renderRows("");
	return inputEl;
}

export interface PriorityPickerOptions {
	current: PriorityLabel | null;
	/** A priority, or null to clear it (picking the current one again). */
	onPick: (label: PriorityLabel | null) => void;
}

/** "Priority 1" to "Priority 4", flags filled except P4's outline, the current one ticked. */
export function renderPriorityPicker(el: HTMLElement, options: PriorityPickerOptions): void {
	el.addClass("pmb-td-popover-priority");
	for (const label of PRIORITY_LABELS) {
		const rowEl = el.createDiv({ cls: "pmb-td-row pmb-td-priority-row" });
		drawIcon(rowEl, "flag", `pmb-td-priority-${label.toLowerCase()}`, "1.6");
		rowEl.createSpan({ cls: "pmb-td-row-label", text: `Priority ${label.slice(1)}` });
		if (label === options.current) drawIcon(rowEl, "check", "pmb-td-row-check-accent", "2.6");
		rowEl.addEventListener("click", () =>
			options.onPick(label === options.current ? null : label),
		);
	}
}

export interface DatePickerOptions {
	/** The current date as YYYY-MM-DD, or "" for none. */
	current: string;
	/** Dates (YYYY-MM-DD) that already hold a task, marked with a dot. */
	taskDates: Set<string>;
	/** A date as YYYY-MM-DD, or null for "No Date". */
	onPick: (date: string | null) => void;
}

/**
 * A typed-date field, quick options (Today, Tomorrow, Next week, Next
 * weekend, No Date), and a scrolling three-month calendar.
 */
export function renderDatePicker(el: HTMLElement, options: DatePickerOptions): HTMLInputElement {
	el.addClass("pmb-td-popover-date");
	const today = startOfDay(new Date());
	const selected = parseIsoDate(options.current);
	const pick = (date: Date | null): void => options.onPick(date ? isoDate(date) : null);

	const fieldEl = el.createDiv({ cls: "pmb-td-date-field" });
	const inputEl = fieldEl.createEl("input", {
		cls: "pmb-td-date-input",
		attr: { type: "text", placeholder: "Type a date…", spellcheck: "false" },
	});
	inputEl.value = selected ? longDateLabel(selected) : "";
	inputEl.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		if (!inputEl.value.trim()) {
			pick(null);
			return;
		}
		const typed = parseTypedDate(inputEl.value, today);
		if (typed) pick(typed);
		else inputEl.addClass("pmb-td-date-input-invalid");
	});
	inputEl.addEventListener("input", () => inputEl.removeClass("pmb-td-date-input-invalid"));

	const quickEl = el.createDiv({ cls: "pmb-td-quick" });
	const quick = (
		label: string,
		hint: string,
		drawIconFor: (parent: HTMLElement) => void,
		date: Date | null,
	): void => {
		const rowEl = quickEl.createDiv({ cls: "pmb-td-quick-row" });
		drawIconFor(rowEl.createSpan({ cls: "pmb-td-quick-icon" }));
		rowEl.createSpan({ cls: "pmb-td-row-label", text: label });
		rowEl.createSpan({ cls: "pmb-td-quick-hint", text: hint });
		rowEl.addEventListener("click", () => pick(date));
	};
	const tomorrow = addDays(today, 1);
	const nextWeek = nextWeekStart(today);
	const nextWeekend = nextWeekendStart(today);
	quick("Today", WEEKDAY_ABBR[today.getDay()], (p) => drawTodayIcon(p, today), today);
	quick(
		"Tomorrow",
		WEEKDAY_ABBR[tomorrow.getDay()],
		(p) => drawIcon(p, "tomorrow", "", "1.6"),
		tomorrow,
	);
	quick(
		"Next week",
		weekdayDateLabel(nextWeek),
		(p) => drawIcon(p, "nextWeek", "", "1.6"),
		nextWeek,
	);
	quick(
		"Next weekend",
		weekdayDateLabel(nextWeekend),
		(p) => drawIcon(p, "weekend", "", "1.6"),
		nextWeekend,
	);
	quick("No Date", "", (p) => drawIcon(p, "noDate", "", "1.6"), null);

	const base = selected ?? today;
	let view = new Date(base.getFullYear(), base.getMonth(), 1);
	const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

	const headerEl = el.createDiv({ cls: "pmb-td-cal-header" });
	const titleRowEl = headerEl.createDiv({ cls: "pmb-td-cal-title-row" });
	const titleEl = titleRowEl.createSpan({ cls: "pmb-td-cal-title" });
	const navEl = titleRowEl.createDiv({ cls: "pmb-td-cal-nav" });
	const prevEl = navEl.createSpan({
		cls: "pmb-td-cal-nav-btn",
		attr: { "aria-label": "Previous month" },
	});
	drawIcon(prevEl, "chevronLeft", "", "2");
	const todayBtnEl = navEl.createSpan({
		cls: "pmb-td-cal-nav-btn",
		attr: { title: "Today", "aria-label": "Today" },
	});
	todayBtnEl.createSpan({ cls: "pmb-td-cal-today-dot" });
	const nextEl = navEl.createSpan({
		cls: "pmb-td-cal-nav-btn",
		attr: { "aria-label": "Next month" },
	});
	drawIcon(nextEl, "chevronRight", "", "2");
	const weekdaysEl = headerEl.createDiv({ cls: "pmb-td-cal-grid pmb-td-cal-weekdays" });
	for (const letter of ["S", "M", "T", "W", "T", "F", "S"])
		weekdaysEl.createSpan({ text: letter });

	const monthsEl = el.createDiv({ cls: "pmb-td-cal-months" });

	const renderCalendar = (): void => {
		titleEl.setText(`${MONTH_ABBR[view.getMonth()]} ${view.getFullYear()}`);
		const atCurrent = view.getTime() === currentMonth.getTime();
		prevEl.toggleClass("pmb-td-cal-nav-disabled", atCurrent);

		monthsEl.empty();
		for (let offset = 0; offset < 3; offset++) {
			const first = new Date(view.getFullYear(), view.getMonth() + offset, 1);
			const monthEl = monthsEl.createDiv({ cls: "pmb-td-cal-month" });
			if (offset > 0) {
				const sameYear = first.getFullYear() === view.getFullYear();
				monthEl.createSpan({
					cls: "pmb-td-cal-month-label",
					text: sameYear
						? MONTH_ABBR[first.getMonth()]
						: `${MONTH_ABBR[first.getMonth()]} ${first.getFullYear()}`,
				});
			}
			const gridEl = monthEl.createDiv({ cls: "pmb-td-cal-grid" });
			for (const day of monthCells(first.getFullYear(), first.getMonth())) {
				const cellEl = gridEl.createSpan({ cls: "pmb-td-cal-cell" });
				if (!day) continue;
				const key = isoDate(day);
				const dayEl = cellEl.createSpan({
					cls: "pmb-td-cal-day",
					text: String(day.getDate()),
				});
				dayEl.toggleClass("pmb-td-cal-day-past", day < today);
				dayEl.toggleClass("pmb-td-cal-day-today", day.getTime() === today.getTime());
				dayEl.toggleClass("pmb-td-cal-day-selected", key === options.current);
				const dotEl = cellEl.createSpan({ cls: "pmb-td-cal-dot" });
				dotEl.toggleClass("pmb-td-cal-dot-on", options.taskDates.has(key));
				cellEl.addClass("pmb-td-cal-cell-day");
				cellEl.addEventListener("click", () => pick(day));
			}
		}
		monthsEl.scrollTop = 0;
	};

	prevEl.addEventListener("click", () => {
		if (view.getTime() === currentMonth.getTime()) return;
		view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
		renderCalendar();
	});
	nextEl.addEventListener("click", () => {
		view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
		renderCalendar();
	});
	todayBtnEl.addEventListener("click", () => {
		view = new Date(currentMonth);
		renderCalendar();
	});

	renderCalendar();
	return inputEl;
}
