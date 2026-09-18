import { BasesPropertyId, BasesViewConfig } from "obsidian";

/**
 * Keys used for the group with no value. Existing board `.base` files spell it
 * differently per setting: `collapsedColumns` keys the empty group by a label,
 * while `boardColumns` uses an empty string. Both spellings must round-trip.
 */
export const NO_VALUE_COLLAPSE_KEY = "(No value)";
const NO_VALUE_ORDER_KEY = "";

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
	/** Column key to work-in-progress limit. */
	wipLimits: Map<string, number>;
	/** Column key to header accent colour, hex. */
	columnColors: Map<string, string>;
	/** Property used as the card heading instead of the filename. */
	cardTitleProperty: BasesPropertyId | null;
	/** Property holding the card's cover image. */
	coverProperty: BasesPropertyId | null;
	/** Second grouping axis; splits the board into horizontal lanes. */
	swimlaneProperty: BasesPropertyId | null;
	/** Property holding the manual drag order. */
	orderProperty: string;
	/** List-valued property the board filters cards to one value of; null shows everything. */
	listFilterProperty: BasesPropertyId | null;
	/** The value being filtered to within listFilterProperty. */
	listFilterValue: string | null;
	/** Property holding a card's project, shown as a chip on the card. */
	projectProperty: BasesPropertyId | null;
	/** Property holding a card's priority; expected to hold P1-P4. */
	priorityProperty: BasesPropertyId | null;
}

export const DEFAULT_ORDER_PROPERTY = "card_order";

/**
 * Order property written by other board plugins. Read as a fallback so a board
 * arriving from one keeps its manual order; every drop rewrites onto the
 * property above, so a note carries the old one only until it next moves.
 */
export const LEGACY_ORDER_PROPERTY = "kanban_order";

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
		wipLimits: readNumberMap(config, "wipLimits"),
		columnColors: readStringMap(config, "columnColors"),
		cardTitleProperty: config.getAsPropertyId("cardTitleProperty"),
		coverProperty: config.getAsPropertyId("coverProperty"),
		swimlaneProperty: config.getAsPropertyId("swimlaneProperty"),
		orderProperty: readString(config, "orderProperty") ?? DEFAULT_ORDER_PROPERTY,
		listFilterProperty: config.getAsPropertyId("listFilterProperty"),
		listFilterValue: readString(config, "listFilterValue"),
		projectProperty: config.getAsPropertyId("projectProperty"),
		priorityProperty: config.getAsPropertyId("priorityProperty"),
	};
}

/**
 * Sets which list property and value the board filters cards to. Changing the
 * property clears the value with it, since a value from the old property has
 * nothing to mean against the new one.
 */
export function setListFilter(
	config: BasesViewConfig,
	property: BasesPropertyId | null,
	value: string | null,
): void {
	config.set("listFilterProperty", property);
	config.set("listFilterValue", property ? value : null);
}

/**
 * The property the board groups by. Bases stores it as an object alongside a
 * sort direction, but a bare property name is also valid.
 */
/**
 * Grouping belongs to the query rather than to a view's own settings, so it
 * sits on the config object as a field and does not come back from the
 * settings lookup that serves every other board setting.
 */
export function groupByPropertyOf(config: BasesViewConfig): string | null {
	const fromField = readPropertyName((config as unknown as Record<string, unknown>).groupBy);
	if (fromField) return fromField;

	const asPropertyId = config.getAsPropertyId("groupBy");
	if (asPropertyId) return asPropertyId;

	return readPropertyName(config.get("groupBy"));
}

/** Accepts the shapes a group-by setting is known to take. */
function readPropertyName(value: unknown): string | null {
	if (typeof value === "string") return value || null;
	if (typeof value !== "object" || value === null) return null;

	const holder = value as Record<string, unknown>;
	const property = holder.property ?? holder.prop ?? holder.name ?? holder.id;

	if (typeof property === "string") return property || null;
	if (typeof property === "object" && property !== null) {
		const nested = property as Record<string, unknown>;
		for (const candidate of [nested.name, nested.id, nested.property]) {
			if (typeof candidate === "string" && candidate) return candidate;
		}
		return asText(property);
	}
	return asText(value);
}

/** A property object may carry its own id in toString, but never a plain one. */
function asText(value: object): string | null {
	const own = (value as { toString?: unknown }).toString;
	if (typeof own !== "function" || own === Object.prototype.toString) return null;
	const text: unknown = own.call(value);
	return typeof text === "string" && text ? text : null;
}

/** The key a group is stored under in `collapsedColumns`. */
export function collapseKey(groupKey: string | null): string {
	return groupKey ?? NO_VALUE_COLLAPSE_KEY;
}

/** The key a group is stored under in `boardColumns`. */
export function orderKey(groupKey: string | null): string {
	return groupKey ?? NO_VALUE_ORDER_KEY;
}

/**
 * Looks a column up in a settings map, tolerating both spellings of the
 * no-value key. Date-keyed columns are looked up by their text form; whether
 * the host hands those keys back as ISO text still needs checking in a vault.
 */
export function lookupColumn<T>(map: Map<string, T>, groupKey: string | null): T | null {
	return map.get(collapseKey(groupKey)) ?? map.get(orderKey(groupKey)) ?? null;
}

export type ColumnMapSetting = "wipLimits" | "columnColors";

/** Sets or clears one column's entry in a per-column map setting (WIP limits, colours). */
export function setColumnMapValue(
	config: BasesViewConfig,
	setting: ColumnMapSetting,
	groupKey: string | null,
	value: string | number | null,
): void {
	const raw = readRawMap(config, setting);
	const key = collapseKey(groupKey);
	if (value === null) delete raw[key];
	else raw[key] = value;
	config.set(setting, Object.keys(raw).length > 0 ? raw : null);
}

/** Overwrites the board's saved column order, used once a drag reorders the columns themselves. */
export function setColumnOrder(config: BasesViewConfig, order: (string | null)[]): void {
	config.set("boardColumns", order.map(orderKey));
}

/** Removes a column from every per-column setting, once its cards have moved elsewhere. */
export function removeColumnSettings(config: BasesViewConfig, groupKey: string | null): void {
	setColumnMapValue(config, "wipLimits", groupKey, null);
	setColumnMapValue(config, "columnColors", groupKey, null);
	removeMapEntry(config, "collapsedColumns", collapseKey(groupKey));
	removeFromOrder(config, groupKey);
}

/**
 * Re-keys a column's stored settings after a rename, so its WIP limit, colour,
 * collapse state and place in the manual order all follow the new value
 * instead of silently applying to whatever next takes the old one.
 */
export function renameColumnKey(config: BasesViewConfig, from: string | null, to: string): void {
	renameMapEntry(config, "wipLimits", collapseKey(from), collapseKey(to));
	renameMapEntry(config, "columnColors", collapseKey(from), collapseKey(to));
	renameMapEntry(config, "collapsedColumns", collapseKey(from), collapseKey(to));
	renameInOrder(config, from, to);
}

function readRawMap(config: BasesViewConfig, key: string): Record<string, unknown> {
	const value = config.get(key);
	return isPlainObject(value) ? { ...value } : {};
}

function removeMapEntry(config: BasesViewConfig, setting: string, key: string): void {
	const raw = readRawMap(config, setting);
	if (!(key in raw)) return;
	delete raw[key];
	config.set(setting, Object.keys(raw).length > 0 ? raw : null);
}

function renameMapEntry(config: BasesViewConfig, setting: string, from: string, to: string): void {
	const raw = readRawMap(config, setting);
	if (!(from in raw)) return;
	const value = raw[from];
	delete raw[from];
	raw[to] = value;
	config.set(setting, raw);
}

function removeFromOrder(config: BasesViewConfig, groupKey: string | null): void {
	const order = readStringArray(config, "boardColumns");
	if (!order) return;
	const next = order.filter((key) => key !== orderKey(groupKey));
	config.set("boardColumns", next.length > 0 ? next : null);
}

function renameInOrder(config: BasesViewConfig, from: string | null, to: string): void {
	const order = readStringArray(config, "boardColumns");
	if (!order) return;
	const fromKey = orderKey(from);
	config.set(
		"boardColumns",
		order.map((key) => (key === fromKey ? orderKey(to) : key)),
	);
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

/**
 * Map keys are normalised because YAML resolves an unquoted key like
 * `2026-09-15` to a date, which would otherwise stringify to a form no column
 * key ever matches.
 */
function readNumberMap(config: BasesViewConfig, key: string): Map<string, number> {
	const value = config.get(key);
	if (!isPlainObject(value)) return new Map();
	const result = new Map<string, number>();
	for (const [k, v] of Object.entries(value)) {
		if (Number.isInteger(v) && (v as number) >= 0) {
			result.set(normaliseMapKey(k), v as number);
		}
	}
	return result;
}

/** Matches the way a JS Date stringifies, e.g. "Tue Sep 15 2026 00:00:00 ...". */
const JS_DATE_KEY = /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} /;

/**
 * Object keys are always strings, so a date-valued YAML key arrives already
 * stringified. Recover the ISO form the rest of the board keys columns by.
 */
function normaliseMapKey(key: string): string {
	if (!JS_DATE_KEY.test(key)) return key;
	const parsed = new Date(key);
	return Number.isNaN(parsed.getTime()) ? key : parsed.toISOString().slice(0, 10);
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
