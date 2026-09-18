import { App, Modal } from "obsidian";

/**
 * A searchable, single-select project list, used for the header's project
 * filter since Obsidian's Menu component cannot embed a text input. Resolves
 * the chosen project, null for "All projects" (clearing the filter), or
 * undefined if dismissed without picking either.
 */
export class ProjectPickerModal extends Modal {
	private resolveValue: ((value: string | null | undefined) => void) | null = null;
	private query = "";
	private listEl!: HTMLElement;

	private constructor(
		app: App,
		private readonly projects: string[],
		private readonly current: string | null,
	) {
		super(app);
	}

	static pick(
		app: App,
		projects: string[],
		current: string | null,
	): Promise<string | null | undefined> {
		return new Promise((resolve) => {
			const modal = new ProjectPickerModal(app, projects, current);
			modal.resolveValue = resolve;
			modal.open();
		});
	}

	onOpen(): void {
		this.setTitle("Filter by project");

		const inputEl = this.contentEl.createEl("input", {
			cls: "pmb-prompt-input",
			type: "text",
			placeholder: "Search projects…",
		});
		inputEl.addEventListener("input", () => {
			this.query = inputEl.value;
			this.renderList();
		});
		inputEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			const first = this.matches()[0];
			if (first !== undefined) this.settle(first);
		});

		this.listEl = this.contentEl.createDiv({ cls: "pmb-project-picker-list" });
		this.renderList();

		inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		// Dismissed without picking; settle() already resolved and cleared
		// this for an explicit pick or the "All projects" clear.
		this.resolveValue?.(undefined);
		this.resolveValue = null;
	}

	private matches(): string[] {
		const query = this.query.trim().toLowerCase();
		if (!query) return this.projects;
		return this.projects.filter((project) => project.toLowerCase().includes(query));
	}

	private renderList(): void {
		this.listEl.empty();

		const allEl = this.listEl.createDiv({ cls: "pmb-project-picker-item" });
		allEl.toggleClass("pmb-project-picker-item-active", this.current === null);
		allEl.setText("All projects");
		allEl.addEventListener("click", () => this.settle(null));

		const matches = this.matches();
		for (const project of matches) {
			const itemEl = this.listEl.createDiv({ cls: "pmb-project-picker-item" });
			itemEl.toggleClass("pmb-project-picker-item-active", project === this.current);
			itemEl.setText(project);
			itemEl.addEventListener("click", () => this.settle(project));
		}

		if (this.query.trim() && matches.length === 0) {
			this.listEl.createDiv({
				cls: "pmb-project-picker-empty",
				text: "No matching projects.",
			});
		}
	}

	private settle(value: string | null): void {
		this.resolveValue?.(value);
		this.resolveValue = null;
		this.close();
	}
}
