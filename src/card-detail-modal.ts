import { App, Component, MarkdownRenderer, Modal, TFile } from "obsidian";

/** Shows a card's note as a rendered preview in a modal, over the board. */
export class CardDetailModal extends Modal {
	private readonly renderer = new Component();

	constructor(
		app: App,
		private readonly file: TFile,
	) {
		super(app);
		this.modalEl.addClass("pmb-card-detail");
		this.setTitle(file.basename);
	}

	async onOpen(): Promise<void> {
		this.renderer.load();

		const openButton = this.contentEl.createEl("button", {
			cls: "pmb-card-detail-open",
			text: "Open note",
		});
		openButton.addEventListener("click", () => {
			void this.app.workspace.getLeaf(false).openFile(this.file);
			this.close();
		});

		const previewEl = this.contentEl.createDiv({ cls: "markdown-preview-view" });
		const body = await this.bodyOf(this.file);
		await MarkdownRenderer.render(this.app, body, previewEl, this.file.path, this.renderer);
	}

	onClose(): void {
		this.renderer.unload();
		this.contentEl.empty();
	}

	/** Frontmatter renders as a stray rule outside the properties widget, so it is skipped here. */
	private async bodyOf(file: TFile): Promise<string> {
		const content = await this.app.vault.cachedRead(file);
		const end = this.app.metadataCache.getFileCache(file)?.frontmatterPosition?.end.offset;
		return end === undefined ? content : content.slice(end);
	}
}
