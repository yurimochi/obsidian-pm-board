import {
	BasesEntry,
	BasesPropertyId,
	BooleanValue,
	ListValue,
	RenderContext,
	setIcon,
	Value,
} from "obsidian";
import { BoardConfig } from "./board-config";
import { PriorityLabel, priorityOf } from "./priority";
import { normaliseTagName } from "./tag-colors";

const TAGS_PROPERTY = "file.tags";

export interface RenderedCard {
	cardEl: HTMLElement;
	/** The property backing the checkbox, or null when the card has none. */
	checkboxProperty: BasesPropertyId | null;
}

interface CardParts {
	tags: string[];
	chips: Value[];
	checkbox: Value | null;
	checkboxProperty: BasesPropertyId | null;
	project: string | null;
	priority: PriorityLabel | null;
}

/** Splits an entry's visible properties into the pieces a card renders. */
function collectCardParts(
	entry: BasesEntry,
	config: BoardConfig,
	properties: BasesPropertyId[],
): CardParts {
	const tags: string[] = [];
	const chips: Value[] = [];
	// The first checkbox-valued property found stands in for the card, the
	// way a status circle does elsewhere; the rest still render as chips.
	let checkbox: Value | null = null;
	let checkboxProperty: BasesPropertyId | null = null;
	for (const propId of properties) {
		if (propId === config.cardTitleProperty) continue;
		// Project and priority get their own row above, not a generic chip.
		if (propId === config.projectProperty) continue;
		if (propId === config.priorityProperty) continue;
		const value = entry.getValue(propId);
		if (!value) continue;
		if (propId === TAGS_PROPERTY) tags.push(...valuesOf(value).map(normaliseTagName));
		else if (!checkbox && value instanceof BooleanValue) {
			checkbox = value;
			checkboxProperty = propId;
		} else chips.push(value);
	}

	const project = config.projectProperty
		? (entry.getValue(config.projectProperty)?.toString().trim() ?? null)
		: null;
	const priority = config.priorityProperty
		? priorityOf(entry.getValue(config.priorityProperty)?.toString().trim())
		: null;

	return { tags, chips, checkbox, checkboxProperty, project, priority };
}

export function renderCard(
	parentEl: HTMLElement,
	entry: BasesEntry,
	config: BoardConfig,
	properties: BasesPropertyId[],
	ctx: RenderContext,
	resolveCover?: (entry: BasesEntry) => string | null,
	/** The Overdue column's own date, shown since the column no longer names one. */
	dueDateText?: string | null,
	/** Whether this card sits in the Overdue column, colouring its status ring. */
	isOverdue?: boolean,
): RenderedCard {
	const cardEl = parentEl.createDiv({ cls: "pmb-card" });

	const coverSrc = resolveCover?.(entry) ?? null;
	if (coverSrc) {
		const coverEl = cardEl.createEl("img", { cls: "pmb-card-cover" });
		coverEl.src = coverSrc;
		coverEl.alt = "";
		coverEl.loading = "lazy";
	}

	const { tags, chips, checkbox, checkboxProperty, project, priority } = collectCardParts(
		entry,
		config,
		properties,
	);

	if (project || priority) {
		const topEl = cardEl.createDiv({ cls: "pmb-card-top" });
		if (project) renderProject(topEl, project);
		if (priority) renderPriorityBadge(topEl, priority);
	}

	const mainEl = cardEl.createDiv({ cls: "pmb-card-main" });
	renderStatus(mainEl, checkbox, !!isOverdue);
	mainEl.createDiv({ cls: "pmb-card-title", text: cardTitle(entry, config) });

	if (chips.length > 0 || tags.length > 0) {
		const metaEl = cardEl.createDiv({ cls: "pmb-card-meta" });
		if (tags.length > 0) renderTags(metaEl, tags, config);
		if (chips.length > 0) renderChips(metaEl, chips, ctx);
	}

	if (isOverdue && dueDateText) {
		const dateEl = cardEl.createDiv({ cls: "pmb-card-date" });
		setIcon(dateEl.createSpan({ cls: "pmb-card-date-icon" }), "lucide-calendar");
		dateEl.createSpan({ text: dueDateText });
	}

	return { cardEl, checkboxProperty };
}

/** The card's status ring, doubling as a checkbox when a boolean property backs it. */
function renderStatus(parentEl: HTMLElement, checkbox: Value | null, isOverdue: boolean): void {
	const statusEl = parentEl.createDiv({ cls: "pmb-card-status" });
	statusEl.toggleClass("pmb-status-overdue", isOverdue);
	if (checkbox) {
		statusEl.addClass("pmb-status-checkbox");
		// role="checkbox" collides with Obsidian's own native checkbox
		// styling for that role, drawing a second ring over ours.
		statusEl.setAttribute("role", "button");
		statusEl.setAttribute("aria-pressed", String(checkbox.isTruthy()));
		statusEl.toggleClass("pmb-status-checked", checkbox.isTruthy());
	}
}

export function cardTitle(entry: BasesEntry, config: BoardConfig): string {
	if (config.cardTitleProperty) {
		const configured = entry.getValue(config.cardTitleProperty)?.toString().trim();
		if (configured) return configured;
	}
	return entry.file.basename;
}

function renderProject(parentEl: HTMLElement, project: string): void {
	const projectEl = parentEl.createSpan({ cls: "pmb-card-project" });
	setIcon(projectEl.createSpan({ cls: "pmb-card-project-icon" }), "lucide-folder");
	projectEl.createSpan({ text: project });
}

function renderPriorityBadge(parentEl: HTMLElement, priority: PriorityLabel): void {
	const badgeEl = parentEl.createSpan({ cls: "pmb-card-priority", text: priority });
	badgeEl.style.setProperty(
		"--pmb-priority-color",
		`var(--pmb-priority-${priority.toLowerCase()})`,
	);
}

function renderTags(parentEl: HTMLElement, tags: string[], config: BoardConfig): void {
	for (const tag of tags) {
		if (!tag) continue;
		const tagEl = parentEl.createSpan({ cls: "pmb-tag" });
		const color = config.tagColors.get(tag);
		if (color) tagEl.style.setProperty("--pmb-tag-color", color);
		setIcon(tagEl.createSpan({ cls: "pmb-tag-icon" }), "lucide-tag");
		tagEl.createSpan({ text: tag });
	}
}

function renderChips(parentEl: HTMLElement, values: Value[], ctx: RenderContext): void {
	for (const value of values) {
		value.renderTo(parentEl.createSpan({ cls: "pmb-chip" }), ctx);
	}
}

/** Flattens a list value into its elements; other values yield themselves. */
export function valuesOf(value: Value): string[] {
	if (!(value instanceof ListValue)) {
		const text = value.toString().trim();
		return text ? [text] : [];
	}
	const items: string[] = [];
	for (let index = 0; index < value.length(); index++) {
		const text = value.get(index).toString().trim();
		if (text) items.push(text);
	}
	return items;
}
