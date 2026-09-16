import { Plugin } from "obsidian";
import { BoardView } from "./board-view";
import { BOARD_VIEW_TYPE } from "./constants";

export default class PmBoardPlugin extends Plugin {
	onload(): void {
		this.registerBasesView(BOARD_VIEW_TYPE, {
			name: "Board",
			icon: "layout-grid",
			factory: (controller, containerEl) => new BoardView(controller, containerEl),
		});
	}
}
