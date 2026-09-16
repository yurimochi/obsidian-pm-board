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
