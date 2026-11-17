import {
	activeQuery,
	ActiveQuery,
	findTokens,
	matchSuggestions,
	toReference,
	TriggerChar,
} from "./title-tokens";

export interface TitleFieldOptions {
	value: string;
	placeholder: string;
	/** Known names offered after each trigger character; a missing one disables that trigger. */
	sources: Partial<Record<TriggerChar, () => string[]>>;
}

export interface TitleField {
	inputEl: HTMLInputElement;
	/** Redraws the coloured references after the value was set from code. */
	refresh(): void;
}

/**
 * The task title input. Typing `#` or `@` opens an autocomplete of known
 * projects or tags, and every such reference is drawn in colour: the input's
 * own text is transparent and a mirror layer behind it paints the same text
 * with the references highlighted.
 */
export function renderTitleField(parentEl: HTMLElement, options: TitleFieldOptions): TitleField {
	const triggers = (Object.keys(options.sources) as TriggerChar[]).filter(
		(trigger) => options.sources[trigger],
	);

	const wrapEl = parentEl.createDiv({ cls: "pmb-td-title-wrap" });
	const mirrorEl = wrapEl.createDiv({
		cls: "pmb-td-title-mirror",
		attr: { "aria-hidden": "true" },
	});
	const mirrorTextEl = mirrorEl.createSpan({ cls: "pmb-td-title-mirror-text" });
	const inputEl = wrapEl.createEl("input", { cls: "pmb-td-title", type: "text" });
	inputEl.value = options.value;
	inputEl.placeholder = options.placeholder;

	let popoverEl: HTMLElement | null = null;
	let query: ActiveQuery | null = null;
	let suggestions: string[] = [];
	let selected = 0;

	const refresh = (): void => {
		mirrorTextEl.empty();
		const text = inputEl.value;
		let cursor = 0;
		for (const token of findTokens(text, triggers)) {
			if (token.start > cursor) mirrorTextEl.appendText(text.slice(cursor, token.start));
			mirrorTextEl.createSpan({
				cls:
					token.trigger === "#"
						? "pmb-td-ref pmb-td-ref-project"
						: "pmb-td-ref pmb-td-ref-tag",
				text: text.slice(token.start, token.end),
			});
			cursor = token.end;
		}
		mirrorTextEl.appendText(text.slice(cursor));
		mirrorTextEl.setCssStyles({ transform: `translateX(${-inputEl.scrollLeft}px)` });
	};

	const closePopover = (): void => {
		popoverEl?.detach();
		popoverEl = null;
		query = null;
		suggestions = [];
	};

	const renderPopover = (): void => {
		if (!popoverEl || suggestions.length === 0) return;
		popoverEl.empty();
		suggestions.forEach((name, index) => {
			const itemEl = popoverEl!.createDiv({
				cls: "pmb-td-suggest-item",
				text: (query?.trigger ?? "#") + toReference(name),
			});
			itemEl.toggleClass("pmb-td-suggest-active", index === selected);
			// Pressing keeps the input focused, so picking never fires its blur-save.
			itemEl.addEventListener("mousedown", (event) => {
				event.preventDefault();
				pick(name);
			});
		});
	};

	const update = (): void => {
		refresh();
		const found = activeQuery(inputEl.value, inputEl.selectionStart ?? 0, triggers);
		const source = found ? options.sources[found.trigger] : undefined;
		const matches = found && source ? matchSuggestions(source(), found.query) : [];
		if (!found || matches.length === 0) {
			closePopover();
			return;
		}
		if (!query || query.trigger !== found.trigger || query.start !== found.start) selected = 0;
		query = found;
		suggestions = matches;
		selected = Math.min(selected, matches.length - 1);
		popoverEl ??= wrapEl.createDiv({ cls: "pmb-td-suggest" });
		renderPopover();
	};

	const pick = (name: string): void => {
		if (!query) return;
		const { trigger, start, end } = query;
		const text = inputEl.value;
		const insert = `${trigger}${toReference(name)} `;
		inputEl.value = text.slice(0, start) + insert + text.slice(end).replace(/^\s+/, "");
		const caret = start + insert.length;
		inputEl.setSelectionRange(caret, caret);
		closePopover();
		refresh();
	};

	inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
		if (!popoverEl || suggestions.length === 0) return;
		const swallow = (): void => {
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		switch (event.key) {
			case "ArrowDown":
				swallow();
				selected = (selected + 1) % suggestions.length;
				renderPopover();
				break;
			case "ArrowUp":
				swallow();
				selected = (selected - 1 + suggestions.length) % suggestions.length;
				renderPopover();
				break;
			case "Enter":
			case "Tab":
				swallow();
				pick(suggestions[selected]);
				break;
			case "Escape":
				swallow();
				closePopover();
				break;
		}
	});

	inputEl.addEventListener("input", update);
	inputEl.addEventListener("click", update);
	inputEl.addEventListener("keyup", (event: KeyboardEvent) => {
		if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) update();
	});
	inputEl.addEventListener("scroll", refresh);
	inputEl.addEventListener("blur", closePopover);

	refresh();
	return { inputEl, refresh };
}
