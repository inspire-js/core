import Inspire from "../../inspire.js";
import { $$ } from "../../util.js";

export const hasCSS = true;

/**
 * `data-steps="N"` gives an element N steps. The element gets `data-step` (the current
 * step, absent at 0) and `data-step-all` (every step reached, e.g. "0 1 2"). Descendants
 * with `data-step="N"`, `data-step-min="N"` or `data-step-max="N"` get
 * `data-step-state="future|current|past"` relative to their closest stepped ancestor.
 */
Inspire.items.register({
	name: "data-steps",
	selector: "[data-steps]",
	items: element => Array.from({ length: +element.dataset.steps || 0 }, () => ({})),

	apply (element, items) {
		let step = items.filter(item => item.state !== "future").length;

		if (step > 0) {
			element.dataset.step = step;
		}
		else {
			delete element.dataset.step;
		}

		element.dataset.stepAll = Array.from({ length: step + 1 }, (_, i) => i).join(" ");

		for (let child of $$("[data-step], [data-step-min], [data-step-max]", element)) {
			if (
				child.hasAttribute("data-steps") ||
				child.parentElement.closest("[data-steps]") !== element
			) {
				continue;
			}

			let min = child.dataset.stepMin ?? child.dataset.step ?? 0;
			let max = child.dataset.stepMax ?? child.dataset.step ?? Infinity;
			child.dataset.stepState = step < min ? "future" : step > max ? "past" : "current";
		}
	},
});
