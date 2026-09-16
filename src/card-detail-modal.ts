import { App, Component, MarkdownRenderer, Modal, TFile, WorkspaceLeaf } from "obsidian";

/**
 * `WorkspaceLeaf` has no public constructor or `containerEl` in the
 * documented API; this mirrors the pattern several community plugins use to
 * host a live, editable pane (properties widget included) inside a modal.
 * Unverified: it either works fully in a given Obsidian version, or the
 * construction throws and `onOpen` falls back to the read-only preview.
 */
interface InternalLeaf extends WorkspaceLeaf {
	containerEl: HTMLElement;
}
type LeafConstructor = new (app: App) => InternalLeaf;

/** Shows a card's note in a modal, live and editable when possible. */
export class CardDetailModal extends Modal {
	private readonly renderer = new Component();
	private leaf: InternalLeaf | null = null;

	constructor(
		app: App,
		private readonly file: TFile,
	) {
		super(app);
		this.modalEl.addClass("pmb-card-detail");
	}

	async onOpen(): Promise<void> {
		try {
			await this.openLiveLeaf();
		} catch (error) {
			console.error(
				"PM-Board: could not open a live card detail, falling back to preview.",
				error,
			);
			this.leaf?.detach();
			this.leaf = null;
			this.contentEl.empty();
			await this.openReadOnlyPreview();
		}
	}

	onClose(): void {
		this.leaf?.detach();
		this.leaf = null;
		this.renderer.unload();
		this.contentEl.empty();
	}

	private async openLiveLeaf(): Promise<void> {
		const leaf = new (WorkspaceLeaf as unknown as LeafConstructor)(this.app);
		this.leaf = leaf;
		this.modalEl.addClass("pmb-card-detail-live");
		this.contentEl.appendChild(leaf.containerEl);
		await leaf.openFile(this.file, { active: true });
	}

	private async openReadOnlyPreview(): Promise<void> {
		this.setTitle(this.file.basename);
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

	/** Frontmatter renders as a stray rule outside the properties widget, so it is skipped here. */
	private async bodyOf(file: TFile): Promise<string> {
		const content = await this.app.vault.cachedRead(file);
		const end = this.app.metadataCache.getFileCache(file)?.frontmatterPosition?.end.offset;
		return end === undefined ? content : content.slice(end);
	}
}
