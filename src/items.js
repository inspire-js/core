import { $$ } from "./util.js";

/**
 * @typedef {"future" | "current" | "past"} State
 *
 * @typedef {object} Descriptor One item, as returned by an item type's `items()`
 * @property {Element} [element] Defaults to the element `items()` was called with
 * @property {number | null} [index] Ordering key; `0` means "with the slide" (step 0)
 * @property {boolean} [transient] Active only while current, instead of from its step on
 * @property {string} [key] Identifies the item among its element's items of the same type,
 *   so state survives re-collection. Defaults to its ordinal.
 *
 * @typedef {object} Env
 * @property {number} which The current step
 * @property {Element} slide
 * @property {Element[]} current Elements of the current items
 *
 * @typedef {object} ItemType One syntax for declaring items
 * @property {string} name
 * @property {string} [selector] Elements that produce items (the slide too, if it matches)
 * @property {(element: Element) => Descriptor[]} [items] Descriptors for one matched element,
 *   or for the whole slide when there is no `selector`. Defaults to one item per element.
 * @property {(element: Element, items: Item[], env: Env) => void} apply Reflect the state of
 *   an element's items on the DOM. Called only when one of them changed state.
 */

export class Item {
	/** @type {State | undefined} */
	state;

	constructor (type, descriptor) {
		Object.assign(this, descriptor);
		this.type = type;
		this.index ??= null;
		this.transient ??= false;
	}

	get active () {
		return this.transient ? this.state === "current" : this.state !== "future";
	}
}

export class ItemChangeEvent extends Event {
	constructor (item) {
		super("itemchange", { bubbles: true });
		this.item = item;
	}

	get state () {
		return this.item.state;
	}

	get active () {
		return this.item.active;
	}
}

/** @type {ItemType[]} */
export const types = [];

/** Items of the current slide, in step order */
export let all = [];

/** Number of steps in the current slide */
export let count = 0;

/** The slide whose items are tracked */
export let slide = null;

let which = 0;
let observer;

// Last collection per slide, so a revisited slide seeds from its rewound items
const memory = new WeakMap();

export function register (type) {
	types.push(type);

	if (slide) {
		refresh();
	}

	return type;
}

function collect () {
	let ret = [];

	for (let type of types) {
		let descriptors = [];

		try {
			if (type.selector) {
				let elements = $$(type.selector, slide);

				if (slide.matches(type.selector)) {
					elements.push(slide);
				}

				for (let element of elements) {
					for (let d of type.items?.(element) ?? [{}]) {
						descriptors.push({ element, ...d });
					}
				}
			}
			else {
				for (let d of type.items?.(slide) ?? []) {
					descriptors.push({ element: slide, ...d });
				}
			}
		}
		catch (e) {
			console.error(`[Inspire] Item type "${type.name}" failed to collect items:`, e);
		}

		let ordinals = new Map();

		for (let d of descriptors) {
			let item = new Item(type, d);
			item.ordinal = ordinals.get(item.element) ?? 0;
			ordinals.set(item.element, item.ordinal + 1);
			item.key ??= "#" + item.ordinal;
			ret.push(item);
		}
	}

	return ret;
}

function documentOrder (a, b) {
	if (a === b) {
		return 0;
	}

	return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

// Step 0 first; unindexed items sort as 0, except the slide's own, which come last
function sortKey (item) {
	if (item.index === 0) {
		return -Infinity;
	}

	if (item.index === null) {
		return item.element === slide ? Infinity : 0;
	}

	return item.index;
}

function compare (a, b) {
	let ka = sortKey(a);
	let kb = sortKey(b);

	return (
		(ka < kb ? -1 : ka > kb ? 1 : 0) ||
		documentOrder(a.element, b.element) ||
		(a.type.name < b.type.name ? -1 : a.type.name > b.type.name ? 1 : 0) ||
		a.ordinal - b.ordinal
	);
}

// Items sharing an explicit index share a step; everything else gets its own
function assignSteps () {
	count = 0;
	let previous;

	for (let item of all) {
		if (item.index === 0) {
			item.step = 0;
			continue;
		}

		if (item.index === null || item.index !== previous) {
			count++;
		}

		item.step = count;
		previous = item.index;
	}
}

/**
 * (Re)collect the items of a slide. Items that were already tracked keep their state.
 * @param {Element} [newSlide] Defaults to the tracked slide
 */
export function update (newSlide = slide) {
	slide = newSlide;

	let seeds = new Map();

	for (let item of memory.get(slide) ?? []) {
		seeds.set(item.element, seeds.get(item.element) ?? new Map());
		seeds.get(item.element).set(item.type.name + "/" + item.key, item.state);
	}

	all = collect().sort(compare);
	assignSteps();

	for (let item of all) {
		item.state = seeds.get(item.element)?.get(item.type.name + "/" + item.key);
	}

	memory.set(slide, all);

	document.documentElement.style.setProperty("--total-items", count);
	document.documentElement.classList.toggle("has-items", all.length > 0);

	observer ??= new MutationObserver(refresh);
	observer.observe(slide, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["class"],
	});
}

function stateAt (item, which) {
	if (item.step === 0) {
		return "past";
	}

	return item.step > which ? "future" : item.step === which ? "current" : "past";
}

/**
 * Apply new states: call each type once per element whose items changed, then notify.
 * @param {(item: Item) => State} stateOf
 */
function transition (stateOf) {
	let next = new Map(all.map(item => [item, stateOf(item)]));
	let current = all.filter(item => next.get(item) === "current");

	// Nesting: a past item whose element contains a current one is current too
	for (let item of all) {
		if (
			next.get(item) === "past" &&
			item.step > 0 &&
			current.some(c => c.element !== item.element && item.element.contains(c.element))
		) {
			next.set(item, "current");
		}
	}

	let env = {
		which,
		slide,
		current: all.filter(item => next.get(item) === "current").map(item => item.element),
	};

	// Group by type, then element, preserving step order
	let groups = new Map();

	for (let item of all) {
		let key = item.type.name;
		let byElement = groups.get(key) ?? groups.set(key, new Map()).get(key);
		let group =
			byElement.get(item.element) ?? byElement.set(item.element, []).get(item.element);
		group.push(item);
	}

	for (let [name, byElement] of groups) {
		for (let [element, items] of byElement) {
			let changed = items.filter(item => next.get(item) !== item.state);

			if (!changed.length) {
				continue;
			}

			for (let item of items) {
				item.state = next.get(item);
			}

			if (element.isConnected) {
				try {
					items[0].type.apply(element, items, env);
				}
				catch (e) {
					console.error(`[Inspire] Item type "${name}" failed to apply:`, element, e);
				}
			}

			for (let item of changed) {
				element.dispatchEvent(new ItemChangeEvent(item));
			}
		}
	}

	// Our own class writes are not worth a re-collection, but anything a listener inserted is
	if (observer?.takeRecords().some(record => record.type === "childList")) {
		refresh();
	}
}

/**
 * Go to a step of the tracked slide
 * @param {number} step Clamped to [0, max]
 * @param {number} [max] Defaults to the step count
 * @returns {number} The step actually gone to
 */
export function goto (step, max = count) {
	which = Math.max(0, Math.min(step, max));

	if (all.length) {
		document.documentElement.style.setProperty("--items-done", which);
	}
	else {
		document.documentElement.style.removeProperty("--items-done");
	}

	transition(item => stateAt(item, which));

	return which;
}

/** Re-collect after a DOM change and re-apply the current step */
export function refresh () {
	if (slide) {
		update();
		goto(which);
	}
}

/** Reset every item of the tracked slide to future and stop tracking it */
export function rewind () {
	if (!slide) {
		return;
	}

	observer?.disconnect();
	transition(() => "future");
	observer?.takeRecords();
	slide = null;
	all = [];
	count = 0;
}
