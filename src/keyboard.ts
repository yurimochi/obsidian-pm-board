export interface KeyChord {
	key: string;
	/** Ctrl on Windows and Linux, Cmd on macOS. */
	mod: boolean;
	shift: boolean;
}

export type KeyAction =
	| { kind: "open" }
	| { kind: "focus"; direction: FocusDirection }
	| { kind: "move"; direction: MoveDirection };

const ARROWS: Record<string, FocusDirection> = {
	ArrowLeft: "left",
	ArrowRight: "right",
	ArrowUp: "up",
	ArrowDown: "down",
};

/**
 * What a keypress on a focused card means.
 *
 * Shift only reaches the lane axis together with the modifier, so a bare
 * shifted arrow stays free for a future selection gesture rather than quietly
 * moving a card.
 */
export function keyAction(chord: KeyChord): KeyAction | null {
	if (chord.key === "Enter") return { kind: "open" };

	const direction = ARROWS[chord.key];
	if (!direction) return null;

	if (!chord.mod) return chord.shift ? null : { kind: "focus", direction };

	if (chord.shift) {
		if (direction === "up") return { kind: "move", direction: "laneUp" };
		if (direction === "down") return { kind: "move", direction: "laneDown" };
		return null;
	}
	return { kind: "move", direction };
}

/** How many cards each column holds, per lane: shape[lane][column]. */
export type BoardShape = number[][];

export interface BoardPosition {
	lane: number;
	column: number;
	index: number;
}

export type FocusDirection = "left" | "right" | "up" | "down";

/** Moving a card sideways stays in its lane; crossing lanes is its own step. */
export type MoveDirection = FocusDirection | "laneUp" | "laneDown";

/**
 * Where focus lands next.
 *
 * Sideways focus skips empty columns, since there is nothing in them to land
 * on, and vertical focus carries on into the neighbouring lane at a column's
 * edge so every card on the board is reachable by arrowing.
 */
export function focusTarget(
	shape: BoardShape,
	from: BoardPosition,
	direction: FocusDirection,
): BoardPosition | null {
	if (!isWithin(shape, from)) return null;

	if (direction === "left" || direction === "right") {
		const step = direction === "left" ? -1 : 1;
		for (let column = from.column + step; column >= 0; column += step) {
			const size = shape[from.lane]?.[column];
			if (size === undefined) return null;
			if (size > 0) {
				return { lane: from.lane, column, index: Math.min(from.index, size - 1) };
			}
		}
		return null;
	}

	const step = direction === "up" ? -1 : 1;
	const next = from.index + step;
	if (next >= 0 && next < shape[from.lane][from.column]) {
		return { ...from, index: next };
	}
	return firstCardInLane(shape, from.lane + step, from.column, direction === "up");
}

function firstCardInLane(
	shape: BoardShape,
	lane: number,
	column: number,
	fromBottom: boolean,
): BoardPosition | null {
	for (
		let current = lane;
		current >= 0 && current < shape.length;
		current += fromBottom ? -1 : 1
	) {
		const size = shape[current]?.[column] ?? 0;
		if (size > 0) return { lane: current, column, index: fromBottom ? size - 1 : 0 };
	}
	return null;
}

/**
 * Where a card lands when moved.
 *
 * Unlike focus, an empty column is a valid destination, and the card keeps as
 * much of its vertical position as the destination has room for.
 */
export function moveTarget(
	shape: BoardShape,
	from: BoardPosition,
	direction: MoveDirection,
): BoardPosition | null {
	if (!isWithin(shape, from)) return null;

	switch (direction) {
		case "up":
		case "down": {
			const index = from.index + (direction === "up" ? -1 : 1);
			const size = shape[from.lane][from.column];
			return index >= 0 && index < size ? { ...from, index } : null;
		}
		case "left":
		case "right": {
			const column = from.column + (direction === "left" ? -1 : 1);
			const size = shape[from.lane]?.[column];
			if (size === undefined) return null;
			return { lane: from.lane, column, index: Math.min(from.index, size) };
		}
		case "laneUp":
		case "laneDown": {
			const lane = from.lane + (direction === "laneUp" ? -1 : 1);
			const size = shape[lane]?.[from.column];
			if (size === undefined) return null;
			return { lane, column: from.column, index: Math.min(from.index, size) };
		}
	}
}

/**
 * Converts a final resting position into the insertion index a drop produces.
 *
 * A drop is measured against the column as rendered, with the moving card
 * still in it, while a keyboard move names the position the card ends up in.
 * The two differ by one once the card has passed its own old place.
 */
export function dropIndexFor(targetIndex: number, movedFrom: number): number {
	return movedFrom !== -1 && targetIndex >= movedFrom ? targetIndex + 1 : targetIndex;
}

function isWithin(shape: BoardShape, position: BoardPosition): boolean {
	const size = shape[position.lane]?.[position.column];
	return size !== undefined && position.index >= 0 && position.index < size;
}
