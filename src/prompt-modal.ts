import { App, Modal } from "obsidian";

export interface PromptOptions {
	title: string;
	initialValue?: string;
	placeholder?: string;
	inputType?: "text" | "number" | "color";
	cta?: string;
	/** Adds a button that resolves with "", distinct from cancelling (null). */
	showClear?: boolean;
	clearLabel?: string;
}

/**
 * A single-field prompt, since the public API has no equivalent of a native
 * `prompt()`. Resolves the trimmed value on save, `""` on clear, and `null`
 * on cancel or dismissal, so callers can tell "no change" from "remove it".
 */
export class PromptModal extends Modal {
	private resolveValue: ((value: string | null) => void) | null = null;

	private constructor(
		app: App,
		private readonly options: PromptOptions,
	) {
		super(app);
	}

	static prompt(app: App, options: PromptOptions): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new PromptModal(app, options);
			modal.resolveValue = resolve;
			modal.open();
		});
	}

	onOpen(): void {
		this.setTitle(this.options.title);

		const inputEl = this.contentEl.createEl("input", {
			cls: "pmb-prompt-input",
			type: this.options.inputType ?? "text",
		});
		inputEl.value = this.options.initialValue ?? "";
		if (this.options.placeholder) inputEl.placeholder = this.options.placeholder;
		inputEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			this.settle(inputEl.value);
		});

		const buttonsEl = this.contentEl.createDiv({ cls: "pmb-prompt-buttons" });
		if (this.options.showClear) {
			const clearEl = buttonsEl.createEl("button", {
				text: this.options.clearLabel ?? "Remove",
			});
			clearEl.addEventListener("click", () => this.settle(""));
		}
		const cancelEl = buttonsEl.createEl("button", { text: "Cancel" });
		cancelEl.addEventListener("click", () => this.close());

		const saveEl = buttonsEl.createEl("button", {
			cls: "mod-cta",
			text: this.options.cta ?? "Save",
		});
		saveEl.addEventListener("click", () => this.settle(inputEl.value));

		inputEl.focus();
		inputEl.select();
	}

	onClose(): void {
		this.contentEl.empty();
		// Dismissed without an explicit save or clear; settle() already
		// resolved and cleared this for those two paths.
		this.resolveValue?.(null);
		this.resolveValue = null;
	}

	private settle(value: string): void {
		this.resolveValue?.(value.trim());
		this.resolveValue = null;
		this.close();
	}
}
