import { BasesPropertyId, BasesViewConfig } from "obsidian";

/**
 * Keys used for the group with no value. Existing board `.base` files spell it
 * differently per setting: `collapsedColumns` keys the empty group by a label,
 * while `boardColumns` uses an empty string. Both spellings must round-trip.
 */
export const NO_VALUE_COLLAPSE_KEY = "(No value)";
export const NO_VALUE_ORDER_KEY = "";

export type CardOpenBehavior = "active" | "tab" | "split" | "modal";

const CARD_OPEN_BEHAVIORS: readonly CardOpenBehavior[] = ["active", "tab", "split", "modal"];

export interface BoardConfig {
	/** Folder new cards are created in, relative to the vault root. */
	newItemFolder: string | null;
	/** Note used as the starting point for new cards. */
	newItemTemplate: string | null;
	/** Frontmatter merged into every new card. */
	newItemProperties: Record<string, unknown>;
	/** What a plain click on a card does. */
	cardOpenBehavior: CardOpenBehavior;
	/** Whether new cards are prepended rather than appended. */
	newCardsToTop: boolean;
	/** Column keys the user has collapsed. */
	collapsedColumns: Set<string>;
	/** Explicit column order; null means "derive from the query". */
	boardColumns: string[] | null;
	/** Tag name to hex colour. */
	tagColors: Map<string, string>;
	/** Property used as the card heading instead of the filename. */
	cardTitleProperty: BasesPropertyId | null;
	/** Property holding the card's cover image. */
	coverProperty: BasesPropertyId | null;
	/** Property holding the manual drag order. */
	orderProperty: string;
}

export const DEFAULT_ORDER_PROPERTY = "kanban_order";

export function readBoardConfig(config: BasesViewConfig): BoardConfig {
	return {
		newItemFolder: readString(config, "newItemFolder"),
		newItemTemplate: readString(config, "newItemTemplate"),
		newItemProperties: readRecord(config, "newItemProperties"),
		cardOpenBehavior: readCardOpenBehavior(config),
		newCardsToTop: readBoolean(config, "newCardsToTop"),
		collapsedColumns: readTruthyKeys(config, "collapsedColumns"),
		boardColumns: readStringArray(config, "boardColumns"),
		tagColors: readStringMap(config, "tagColors"),
		cardTitleProperty: config.getAsPropertyId("cardTitleProperty"),
		coverProperty: config.getAsPropertyId("coverProperty"),
		orderProperty: readString(config, "orderProperty") ?? DEFAULT_ORDER_PROPERTY,
	};
}

/** The key a group is stored under in `collapsedColumns`. */
export function collapseKey(groupKey: string | null): string {
	return groupKey ?? NO_VALUE_COLLAPSE_KEY;
}

/** The key a group is stored under in `boardColumns`. */
export function orderKey(groupKey: string | null): string {
	return groupKey ?? NO_VALUE_ORDER_KEY;
}

function readString(config: BasesViewConfig, key: string): string | null {
	const value = config.get(key);
	return typeof value === "string" && value.length > 0 ? value : null;
}

function readBoolean(config: BasesViewConfig, key: string): boolean {
	return config.get(key) === true;
}

function readCardOpenBehavior(config: BasesViewConfig): CardOpenBehavior {
	const value = config.get("cardOpenBehavior");
	return CARD_OPEN_BEHAVIORS.includes(value as CardOpenBehavior)
		? (value as CardOpenBehavior)
		: "active";
}

function readRecord(config: BasesViewConfig, key: string): Record<string, unknown> {
	const value = config.get(key);
	if (!isPlainObject(value)) return {};
	return { ...value };
}

/** Collects the keys of an object map whose values are truthy. */
function readTruthyKeys(config: BasesViewConfig, key: string): Set<string> {
	const value = config.get(key);
	if (!isPlainObject(value)) return new Set();
	return new Set(Object.keys(value).filter((k) => value[k] === true));
}

function readStringMap(config: BasesViewConfig, key: string): Map<string, string> {
	const value = config.get(key);
	if (!isPlainObject(value)) return new Map();
	const result = new Map<string, string>();
	for (const [k, v] of Object.entries(value)) {
		if (typeof v === "string") result.set(k, v);
	}
	return result;
}

/**
 * Entries are normalised to strings because YAML parses unquoted values like
 * `2026-09-12` as dates and bare `true` as a boolean, while column keys are
 * always compared as text.
 */
function readStringArray(config: BasesViewConfig, key: string): string[] | null {
	const value = config.get(key);
	if (!Array.isArray(value)) return null;
	return value.map(normaliseColumnKey).filter((entry): entry is string => entry !== null);
}

/** Returns null for values that cannot name a column, so they are dropped. */
function normaliseColumnKey(value: unknown): string | null {
	if (value === null || value === undefined) return NO_VALUE_ORDER_KEY;
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
