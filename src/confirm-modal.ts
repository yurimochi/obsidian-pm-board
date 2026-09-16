import { App, Modal } from "obsidian";

export interface ConfirmOptions {
	title: string;
	message: string;
	cta?: string;
}

/** A yes/no confirmation for a destructive action; the public API has no built-in confirm(). */
export class ConfirmModal extends Modal {
	private resolveValue: ((value: boolean) => void) | null = null;

	private constructor(
		app: App,
		private readonly options: ConfirmOptions,
	) {
		super(app);
	}

	static confirm(app: App, options: ConfirmOptions): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConfirmModal(app, options);
			modal.resolveValue = resolve;
			modal.open();
		});
	}

	onOpen(): void {
		this.setTitle(this.options.title);
		this.contentEl.createEl("p", { text: this.options.message });

		const buttonsEl = this.contentEl.createDiv({ cls: "pmb-prompt-buttons" });
		const cancelEl = buttonsEl.createEl("button", { text: "Cancel" });
		cancelEl.addEventListener("click", () => this.close());

		const confirmEl = buttonsEl.createEl("button", {
			cls: "mod-warning",
			text: this.options.cta ?? "Confirm",
		});
		confirmEl.addEventListener("click", () => this.settle(true));
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolveValue?.(false);
		this.resolveValue = null;
	}

	private settle(value: boolean): void {
		this.resolveValue?.(value);
		this.resolveValue = null;
		this.close();
	}
}
