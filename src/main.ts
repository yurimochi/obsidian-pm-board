import { Notice, Plugin } from "obsidian";
import { DEFAULT_PRIORITY_PROPERTY, DEFAULT_PROJECT_PROPERTY } from "./board-config";
import { BoardView } from "./board-view";
import { BOARD_VIEW_TYPE } from "./constants";

export default class PmBoardPlugin extends Plugin {
	onload(): void {
		const registered = this.registerBasesView(BOARD_VIEW_TYPE, {
			name: "Board",
			icon: "layout-grid",
			factory: (controller, containerEl) => new BoardView(controller, containerEl),
			options: () => [
				{
					key: "cardOpenBehavior",
					type: "dropdown",
					displayName: "Card Detail",
					default: "active",
					options: {
						active: "Active pane / tab",
						modal: "Floating modal",
						split: "Split to the right",
						tab: "New tab",
					},
				},
				{
					key: "newItemTemplate",
					type: "file",
					displayName: "New card template",
					placeholder: "Templates/Task.md",
					filter: (file) => file.extension === "md",
				},
				{
					key: "newItemFolder",
					type: "folder",
					displayName: "New card folder",
					placeholder: "Vault default",
				},
				{
					key: "projectProperty",
					type: "property",
					displayName: "Project",
					default: DEFAULT_PROJECT_PROPERTY,
				},
				{
					key: "priorityProperty",
					type: "property",
					displayName: "Priority",
					default: DEFAULT_PRIORITY_PROPERTY,
				},
			],
		});

		// Registration fails silently when Bases is off, leaving the view type
		// missing from the selector with nothing to explain why.
		if (!registered) {
			new Notice("Bases must be enabled for the board view to appear.");
		}
	}
}
