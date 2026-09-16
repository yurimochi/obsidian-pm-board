import type { PaneType } from "obsidian";
import type { CardOpenBehavior } from "./board-config";

export interface OpenModifiers {
	/** Ctrl on Windows and Linux, Cmd on macOS. */
	mod: boolean;
	alt: boolean;
}

/**
 * Where a card click should open its note. Modifiers follow Obsidian's own
 * conventions and win over the board's configured behaviour, so the shortcuts
 * users already know keep working on any board.
 *
 * Returns false for "open in the active pane", matching Workspace.getLeaf.
 * Returns "modal" for the board's own floating card detail, which has no
 * equivalent among Obsidian's built-in pane types.
 */
export function resolveOpenTarget(
	behavior: CardOpenBehavior,
	modifiers: OpenModifiers,
): PaneType | "modal" | false {
	if (modifiers.mod && modifiers.alt) return "split";
	if (modifiers.mod) return "tab";
	if (behavior === "tab") return "tab";
	if (behavior === "split") return "split";
	if (behavior === "modal") return "modal";
	return false;
}
