import {
	BasesEntry,
	BasesPropertyId,
	BooleanValue,
	ListValue,
	RenderContext,
	Value,
} from "obsidian";
import { BoardConfig } from "./board-config";
import { normaliseTagName } from "./tag-colors";

const TAGS_PROPERTY = "file.tags";

export interface RenderedCard {
	cardEl: HTMLElement;
	/** The property backing the checkbox, or null when the card has none. */
	checkboxProperty: BasesPropertyId | null;
}

export function renderCard(
	parentEl: HTMLElement,
	entry: BasesEntry,
	config: BoardConfig,
	properties: BasesPropertyId[],
	ctx: RenderContext,
	resolveCover?: (entry: BasesEntry) => string | null,
): RenderedCard {
	const cardEl = parentEl.createDiv({ cls: "pmb-card" });

	const coverSrc = resolveCover?.(entry) ?? null;
	if (coverSrc) {
		const coverEl = cardEl.createEl("img", { cls: "pmb-card-cover" });
		coverEl.src = coverSrc;
		coverEl.alt = "";
		coverEl.loading = "lazy";
	}

	const tags: string[] = [];
	const chips: Value[] = [];
	// The first checkbox-valued property found stands in for the card, the
	// way a status circle does elsewhere; the rest still render as chips.
	let checkbox: Value | null = null;
	let checkboxProperty: BasesPropertyId | null = null;
	for (const propId of properties) {
		if (propId === config.cardTitleProperty) continue;
		const value = entry.getValue(propId);
		if (!value) continue;
		if (propId === TAGS_PROPERTY) tags.push(...valuesOf(value).map(normaliseTagName));
		else if (!checkbox && value instanceof BooleanValue) {
			checkbox = value;
			checkboxProperty = propId;
		} else chips.push(value);
	}

	const headerEl = cardEl.createDiv({ cls: "pmb-card-header" });
	if (checkbox) {
		const checkboxEl = headerEl.createSpan({ cls: "pmb-card-checkbox" });
		// role="checkbox" collides with Obsidian's own native checkbox
		// styling for that role, drawing a second ring over ours.
		checkboxEl.setAttribute("role", "button");
		checkboxEl.setAttribute("aria-pressed", String(checkbox.isTruthy()));
		checkboxEl.toggleClass("pmb-card-checkbox-checked", checkbox.isTruthy());
	}
	headerEl.createDiv({ cls: "pmb-card-title", text: cardTitle(entry, config) });

	if (chips.length > 0 || tags.length > 0) {
		const metaEl = cardEl.createDiv({ cls: "pmb-card-meta" });
		if (chips.length > 0) renderChips(metaEl, chips, ctx);
		if (tags.length > 0) renderTags(metaEl, tags, config);
	}

	cardEl.createDiv({ cls: "pmb-card-date", text: createdLabel(entry) });

	return { cardEl, checkboxProperty };
}

export function cardTitle(entry: BasesEntry, config: BoardConfig): string {
	if (config.cardTitleProperty) {
		const configured = entry.getValue(config.cardTitleProperty)?.toString().trim();
		if (configured) return configured;
	}
	return entry.file.basename;
}

function renderTags(parentEl: HTMLElement, tags: string[], config: BoardConfig): void {
	for (const tag of tags) {
		if (!tag) continue;
		const tagEl = parentEl.createSpan({ cls: "pmb-tag" });
		const color = config.tagColors.get(tag);
		if (color) {
			const dotEl = tagEl.createSpan({ cls: "pmb-tag-dot" });
			dotEl.style.setProperty("--pmb-tag-color", color);
		}
		tagEl.createSpan({ text: tag });
	}
}

function renderChips(parentEl: HTMLElement, values: Value[], ctx: RenderContext): void {
	for (const value of values) {
		value.renderTo(parentEl.createSpan({ cls: "pmb-chip" }), ctx);
	}
}

/** Flattens a list value into its elements; other values yield themselves. */
function valuesOf(value: Value): string[] {
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

const CREATED_DATE_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

function createdLabel(entry: BasesEntry): string {
	const date = new Intl.DateTimeFormat(undefined, CREATED_DATE_FORMAT).format(
		entry.file.stat.ctime,
	);
	return `Created ${date}`;
}
