import { register } from "../../items.js";
import { $$, autoplay } from "../../util.js";

/**
 * The `delayed` vocabulary. One grammar for class tokens and attribute names:
 *   delayed(.modifier)*([index])?(:name)?
 * - `delayed`                        reveal the element at its step (classes future/current/past)
 * - `delayed:big`, `delayed[2]:big`  add class `big` from its step on
 * - `delayed:open="…"`               set attribute `open` from its step on
 * - `delayed:script="…"`             run code at its step
 * - `.transient` holds only while current; `.always` re-runs a script on every activation
 */

const TOKEN = /^delayed(?<modifiers>(?:\.[\w-]+)*)(?:\[(?<index>[^\]]*)\])?(?::(?<name>.+))?$/;
const STATES = ["future", "current", "past"];
const SELECTOR = ".delayed, .delayed-children > *, [class*='delayed']";
const XPATH = 'descendant-or-self::*[@*[starts-with(name(), "delayed")]]';

// Delaying these would change the items being parsed, or navigation itself
const RESERVED = /^(class|id|data-index|delayed)/;

// Attribute values before we touched them: element → name → value
const originals = new WeakMap();

// Compiled scripts and whether they ran: element → code → entry
const scripts = new WeakMap();

const scratch = document.createElement("div").style;

function parse (token) {
	let match = TOKEN.exec(token);

	if (!match) {
		return null;
	}

	let { modifiers = "", index, name } = match.groups;
	modifiers = modifiers.split(".").slice(1);

	return {
		name,
		index: index === undefined || index === "" || isNaN(index) ? null : Number(index),
		transient: modifiers.includes("transient"),
		always: modifiers.includes("always"),
	};
}

function remember (element, name) {
	let map = originals.get(element) ?? originals.set(element, new Map()).get(element);

	if (!map.has(name)) {
		map.set(name, element.getAttribute(name));
	}
}

function compile (element, code) {
	let map = scripts.get(element) ?? scripts.set(element, new Map()).get(element);

	if (!map.has(code)) {
		let fn = null;

		try {
			fn = new Function("item", code);
		}
		catch (e) {
			console.error("[Inspire] Cannot compile delayed:script", element, e);
		}

		map.set(code, { fn, ran: false, active: false });
	}

	return map.get(code);
}

// Descriptors for one element, in source order of its attributes and class tokens
function describe (element) {
	let ret = [];
	let reveal;

	for (let attr of element.getAttributeNames()) {
		if (attr === "class") {
			for (let token of element.classList) {
				let d = parse(token);

				if (!d) {
					continue;
				}

				if (d.name === undefined) {
					reveal ??= d;
				}
				else {
					ret.push({ kind: "class", key: `class:${d.name}:${d.index ?? ""}`, ...d });
				}
			}
		}
		else {
			let d = parse(attr);

			if (!d || d.name === undefined) {
				continue;
			}

			if (d.name === "script") {
				let code = element.getAttribute(attr) || element.textContent;
				compile(element, code);
				ret.push({ kind: "script", key: `script:${attr}`, code, ...d });
			}
			else if (RESERVED.test(d.name)) {
				console.warn(`[Inspire] Ignoring ${attr}: ${d.name} cannot be delayed`, element);
			}
			else {
				remember(element, d.name);
				let value = element.getAttribute(attr);
				ret.push({
					kind: "attribute",
					key: `attr:${d.name}:${d.index ?? ""}`,
					value,
					...d,
				});
			}
		}
	}

	if (!reveal && element.matches(".delayed-children > *")) {
		reveal = { index: null, transient: false };
	}

	if (reveal) {
		let index = Number(element.getAttribute("data-index"));

		ret.unshift({
			kind: "reveal",
			key: "reveal",
			index:
				reveal.index ??
				(element.hasAttribute("data-index") && !isNaN(index) ? index : null),
			transient: reveal.transient || element.classList.contains("transient"),
		});
	}

	return ret;
}

function items (slide) {
	let elements = new Set($$(SELECTOR, slide));

	if (slide.matches(SELECTOR)) {
		elements.add(slide);
	}

	let result = document.evaluate(
		XPATH,
		slide,
		null,
		XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
		null,
	);

	for (let i = 0; i < result.snapshotLength; i++) {
		elements.add(result.snapshotItem(i));
	}

	let ret = [];

	for (let element of elements) {
		for (let d of describe(element)) {
			ret.push({ element, ...d });
		}
	}

	return ret;
}

function declarations (cssText) {
	scratch.cssText = cssText ?? "";
	return [...scratch].map(p => [p, scratch.getPropertyValue(p), scratch.getPropertyPriority(p)]);
}

// Inline styles merge per property, so a delayed style doesn't wipe the static one
function applyStyle (element, group, winner) {
	let original = new Map(
		declarations(originals.get(element)?.get("style")).map(([p, ...v]) => [p, v]),
	);

	for (let item of group) {
		for (let [property] of declarations(item.value)) {
			let [value, priority] = original.get(property) ?? [];

			if (value === undefined) {
				element.style.removeProperty(property);
			}
			else {
				element.style.setProperty(property, value, priority);
			}
		}
	}

	for (let [property, value, priority] of declarations(winner?.value)) {
		element.style.setProperty(property, value, priority);
	}
}

function applyAttribute (element, name, group) {
	let winner = group.findLast(item => item.active);

	if (name === "style") {
		applyStyle(element, group, winner);
	}
	else if (winner) {
		element.setAttribute(name, winner.value);
	}
	else {
		let original = originals.get(element)?.get(name);

		if (original === null || original === undefined) {
			element.removeAttribute(name);
		}
		else {
			element.setAttribute(name, original);
		}
	}
}

// Runs on the edge where the item becomes active, once per element unless `.always`
function runScript (element, item) {
	let entry = compile(element, item.code);

	if (entry.active === item.active) {
		return;
	}

	entry.active = item.active;

	if (!item.active || !entry.fn || (entry.ran && !item.always)) {
		return;
	}

	entry.ran = true;

	try {
		entry.fn.call(element, item);
	}
	catch (e) {
		console.error("[Inspire] delayed:script failed", element, e);
	}
}

function apply (element, items) {
	for (let group of Map.groupBy(items, item => `${item.kind}:${item.name}`).values()) {
		let [{ kind, name }] = group;

		switch (kind) {
			case "reveal": {
				let item = group.at(-1);

				for (let state of STATES) {
					element.classList.toggle(state, item.state === state);
				}

				if (item.state === "current") {
					autoplay(element);
				}

				break;
			}
			case "class":
				element.classList.toggle(
					name,
					group.some(item => item.active),
				);
				break;
			case "attribute":
				applyAttribute(element, name, group);
				break;
			case "script":
				for (let item of group) {
					runScript(element, item);
				}
		}
	}
}

register({ name: "delayed", items, apply });
