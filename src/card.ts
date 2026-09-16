import { BasesEntry, BasesPropertyId, ListValue, RenderContext, Value } from "obsidian";
import { BoardConfig } from "./board-config";
import { normaliseTagName, textToneFor } from "./tag-colors";

const TAGS_PROPERTY = "file.tags";

export function renderCard(
	parentEl: HTMLElement,
	entry: BasesEntry,
	config: BoardConfig,
	properties: BasesPropertyId[],
	ctx: RenderContext,
	resolveCover?: (entry: BasesEntry) => string | null,
): HTMLElement {
	const cardEl = parentEl.createDiv({ cls: "pmb-card" });

	const coverSrc = resolveCover?.(entry) ?? null;
	if (coverSrc) {
		const coverEl = cardEl.createEl("img", { cls: "pmb-card-cover" });
		coverEl.src = coverSrc;
		coverEl.alt = "";
		coverEl.loading = "lazy";
	}

	cardEl.createDiv({ cls: "pmb-card-title", text: cardTitle(entry, config) });

	const tags: string[] = [];
	const chips: Value[] = [];
	for (const propId of properties) {
		if (propId === config.cardTitleProperty) continue;
		const value = entry.getValue(propId);
		if (!value) continue;
		if (propId === TAGS_PROPERTY) tags.push(...valuesOf(value).map(normaliseTagName));
		else chips.push(value);
	}

	if (tags.length > 0) renderTags(cardEl, tags, config);
	if (chips.length > 0) renderChips(cardEl, chips, ctx);

	return cardEl;
}

export function cardTitle(entry: BasesEntry, config: BoardConfig): string {
	if (config.cardTitleProperty) {
		const configured = entry.getValue(config.cardTitleProperty)?.toString().trim();
		if (configured) return configured;
	}
	return entry.file.basename;
}

function renderTags(cardEl: HTMLElement, tags: string[], config: BoardConfig): void {
	const tagsEl = cardEl.createDiv({ cls: "pmb-card-tags" });
	for (const tag of tags) {
		if (!tag) continue;
		const tagEl = tagsEl.createSpan({ cls: "pmb-tag", text: tag });
		const color = config.tagColors.get(tag);
		if (!color) continue;
		tagEl.style.setProperty("--pmb-tag-color", color);
		tagEl.addClass("pmb-tag-colored", `pmb-tag-on-${textToneFor(color)}`);
	}
}

function renderChips(cardEl: HTMLElement, values: Value[], ctx: RenderContext): void {
	const chipsEl = cardEl.createDiv({ cls: "pmb-card-chips" });
	for (const value of values) {
		value.renderTo(chipsEl.createSpan({ cls: "pmb-chip" }), ctx);
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
