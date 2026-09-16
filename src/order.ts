import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/** An order key usable as a bound, or null when the note has none. */
export function sanitiseOrderKey(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return null;
}

/**
 * Generates a key that sorts between two neighbours.
 *
 * The generator rejects malformed bounds by throwing, but accepts reversed
 * ones and returns a key that sorts outside them, so bounds are widened
 * progressively until one produces a usable key rather than trusted as given.
 */
export function keyBetween(before: string | null, after: string | null): string {
	const lower = sanitiseOrderKey(before);
	const upper = sanitiseOrderKey(after);
	const reversed = lower !== null && upper !== null && lower >= upper;
	const candidates: [string | null, string | null][] = reversed
		? [
				[lower, null],
				[null, null],
			]
		: [
				[lower, upper],
				[lower, null],
				[null, null],
			];

	for (const [a, b] of candidates) {
		try {
			return generateKeyBetween(a, b);
		} catch {
			continue;
		}
	}
	return generateKeyBetween(null, null);
}

/** Key for a card dropped at `index` among neighbours already in display order. */
export function insertKeyAt(neighbourKeys: (string | null)[], index: number): string {
	const at = Math.max(0, Math.min(index, neighbourKeys.length));
	return keyBetween(neighbourKeys[at - 1] ?? null, neighbourKeys[at] ?? null);
}

export interface OrderPlan {
	/** Key to write on the card being inserted. */
	insertKey: string;
	/**
	 * Replacement key per existing neighbour, in display order, or null where
	 * that neighbour can keep the key it already has.
	 */
	healed: (string | null)[];
}

/**
 * Works out the keys a drop implies.
 *
 * A column whose cards have no keys yet has no usable bounds: inserting a
 * single key anywhere in it would sort that card above every keyless one,
 * sending a card dropped at the bottom straight to the top. When any key is
 * missing the whole column is renumbered in its current display order, which
 * costs one write per card but only until the column has been ordered once.
 */
export function planInsertion(neighbourKeys: (string | null)[], index: number): OrderPlan {
	const at = Math.max(0, Math.min(index, neighbourKeys.length));
	if (neighbourKeys.every((key) => key !== null)) {
		return {
			insertKey: insertKeyAt(neighbourKeys, at),
			healed: neighbourKeys.map(() => null),
		};
	}
	const keys = generateNKeysBetween(null, null, neighbourKeys.length + 1);
	return {
		insertKey: keys[at],
		healed: keys.filter((_, position) => position !== at),
	};
}

/**
 * The order key for a card, falling back to the value under a legacy property.
 * The fallback applies only while the board uses the default property: once a
 * user names their own, an unrelated legacy value must not leak into it.
 */
export function resolveOrderKey(
	primary: unknown,
	legacy: unknown,
	usingDefaultProperty: boolean,
): string | null {
	const key = sanitiseOrderKey(primary);
	if (key !== null || !usingDefaultProperty) return key;
	return sanitiseOrderKey(legacy);
}

/** Sorts by order key, sinking cards that have none to the bottom. */
export function compareOrderKeys(a: string | null, b: string | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a < b ? -1 : 1;
}

/**
 * Drop indices are measured against the rendered column, which still contains
 * the card being moved. Removing it first shifts every later position down.
 */
export function adjustIndexForRemoval(index: number, removedIndex: number): number {
	return removedIndex !== -1 && index > removedIndex ? index - 1 : index;
}

/** The position a pointer at `clientY` should insert into. */
export function insertionIndexAt(
	cards: { top: number; height: number }[],
	clientY: number,
): number {
	for (let index = 0; index < cards.length; index++) {
		const { top, height } = cards[index];
		if (clientY < top + height / 2) return index;
	}
	return cards.length;
}
