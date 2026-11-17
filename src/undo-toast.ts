/** How long the Undo button stays available after a task is completed. */
export const UNDO_SECONDS = 30;

export interface UndoToast {
	/** Removes the toast and stops its countdown, without running undo. */
	dismiss(): void;
}

export interface UndoToastOptions {
	message: string;
	seconds?: number;
	/** Called once when Undo is clicked. */
	onUndo: () => void;
}

let current: UndoToast | null = null;

/**
 * A small toast in the bottom-left corner with an Undo button and a
 * countdown. Undo runs `onUndo`; running out of time just removes the toast,
 * leaving the change in place. Only one is shown at a time: a newer one
 * replaces the older, whose change then simply stays.
 */
export function showUndoToast(options: UndoToastOptions): UndoToast {
	current?.dismiss();

	const seconds = options.seconds ?? UNDO_SECONDS;
	const toastEl = activeDocument.body.createDiv({
		cls: "pmb-undo-toast",
		attr: { role: "status" },
	});
	toastEl.createSpan({ cls: "pmb-undo-message", text: options.message });
	const buttonEl = toastEl.createEl("button", { cls: "pmb-undo-button" });
	buttonEl.createSpan({ text: "Undo" });
	const countEl = buttonEl.createSpan({ cls: "pmb-undo-count" });

	let remaining = seconds;
	countEl.setText(`${remaining}s`);
	const timer = window.setInterval(() => {
		remaining -= 1;
		if (remaining <= 0) toast.dismiss();
		else countEl.setText(`${remaining}s`);
	}, 1000);

	const toast: UndoToast = {
		dismiss: () => {
			window.clearInterval(timer);
			toastEl.detach();
			if (current === toast) current = null;
		},
	};
	buttonEl.addEventListener("click", () => {
		toast.dismiss();
		options.onUndo();
	});

	current = toast;
	return toast;
}
