import { Notice, Plugin } from "obsidian";
import { BoardView } from "./board-view";
import { BOARD_VIEW_TYPE } from "./constants";

export default class PmBoardPlugin extends Plugin {
	onload(): void {
		const registered = this.registerBasesView(BOARD_VIEW_TYPE, {
			name: "Board",
			icon: "layout-grid",
			factory: (controller, containerEl) => new BoardView(controller, containerEl),
		});

		// Registration fails silently when Bases is off, leaving the view type
		// missing from the selector with nothing to explain why.
		if (!registered) {
			new Notice("PM-Board needs the Bases core plugin enabled to add its board view.");
		}
	}
}
