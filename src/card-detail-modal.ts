import {
	App,
	Component,
	MarkdownRenderer,
	Modal,
	TFile,
	Workspace,
	WorkspaceLeaf,
	WorkspaceSplit,
} from "obsidian";

/**
 * `WorkspaceSplit` has no public constructor, and a split built this way has
 * no parent, so its inherited `getRoot`/`getContainer` would walk into
 * nothing. Both are public methods, so they can be overridden on the
 * instance to point at the real workspace's own root instead. This mirrors
 * how the Hover Editor community plugin hosts a live leaf outside the
 * normal workspace tree; unlike a bare, parentless `WorkspaceLeaf`, this
 * wiring gives the leaf a real place to measure and mount into.
 */
type SplitConstructor = new (
	workspace: Workspace,
	direction: "horizontal" | "vertical",
) => WorkspaceSplit;

interface AttachableSplit extends WorkspaceSplit {
	containerEl: HTMLElement;
}

/** Shows a card's note in a modal, live and editable when possible. */
export class CardDetailModal extends Modal {
	private readonly renderer = new Component();
	private leaf: WorkspaceLeaf | null = null;

	constructor(
		app: App,
		private readonly file: TFile,
		/** Called once the modal has fully closed, its leaf detached and all. */
		private readonly onDismiss?: () => void,
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
			this.detachLeaf();
			this.contentEl.empty();
			await this.openReadOnlyPreview();
		}
	}

	onClose(): void {
		this.detachLeaf();
		this.renderer.unload();
		this.contentEl.empty();
		this.onDismiss?.();
	}

	private async openLiveLeaf(): Promise<void> {
		const workspace = this.app.workspace;
		const Split = WorkspaceSplit as unknown as SplitConstructor;
		const rootSplit = new Split(workspace, "vertical") as AttachableSplit;
		rootSplit.getRoot = () => workspace.rootSplit;
		rootSplit.getContainer = () => workspace.rootSplit;

		this.modalEl.addClass("pmb-card-detail-live");
		this.contentEl.appendChild(rootSplit.containerEl);

		// createLeafInParent otherwise makes the new leaf active, stealing
		// focus from whatever the user had open behind the modal.
		const restoreActiveLeaf = this.suppressSetActiveLeaf();
		let leaf: WorkspaceLeaf;
		try {
			leaf = workspace.createLeafInParent(rootSplit, 0);
		} finally {
			restoreActiveLeaf();
		}
		this.leaf = leaf;
		await leaf.openFile(this.file, { active: true });
	}

	private suppressSetActiveLeaf(): () => void {
		const workspace = this.app.workspace;
		const original = workspace.setActiveLeaf.bind(workspace);
		workspace.setActiveLeaf = () => {
			/* suppressed while the modal's leaf attaches */
		};
		return () => {
			workspace.setActiveLeaf = original;
		};
	}

	private detachLeaf(): void {
		this.leaf?.detach();
		this.leaf = null;
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
