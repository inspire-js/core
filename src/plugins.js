import * as util from "./util.js";

/**
 * Plugin registry. Each entry is:
 *   id -> { test: selector, base: URL the plugin's files resolve against }
 * Carrying `base` per entry lets plugins live anywhere — including separate repos.
 * Core pre-registers its own bundled plugins below; plugin packages (e.g.
 * @inspirejs/plugins) import the registry and write their entries in too.
 */
const coreBase = new URL("./", import.meta.url);
const builtinPlugins = new URL("./plugins/", import.meta.url);
export const registry = {
	autosize: { test: "*", base: builtinPlugins },
	"data-steps": { test: "[data-steps]", base: builtinPlugins },
};

export let loaded = {};

export const TIMEOUT = 4000;

// Load a single plugin by id. `def` defaults to its registry entry.
// Its stylesheet, if any, sits next to its module as plugin.css.
export function load (id, def = registry[id]) {
	if (loaded[id]) {
		return loaded[id];
	}

	// A base ending in "/" is a collection the plugin lives in, as <base>/<id>/plugin.js.
	// Anything else — a package's entry point, say — is the plugin's own module.
	let pluginURL = new URL(def.base ?? coreBase);

	if (pluginURL.pathname.endsWith("/")) {
		pluginURL = new URL(`${id}/plugin.js`, pluginURL);
	}

	let noCSS = document.querySelector(`.no-css-${id}, .no-${id}-css, .${id}-no-css`);

	let plugin = (loaded[id] = {});
	plugin.loading = pluginURL;
	plugin.loadedJS = import(pluginURL).then(module => (plugin.module = module));
	plugin.loaded = plugin.loadedJS.then(module => {
		if (!noCSS && module.hasCSS) {
			let pluginCSS = new URL("plugin.css", pluginURL);
			plugin.loading = pluginCSS;
			let link = util.create.in(document.head, `<link rel="stylesheet" href="${pluginCSS}" id="plugin-css-${id}">`);
			return new Promise((res, rej) => {
				link.onload = e => res(module);
				link.onerror = rej;
			});
		}

		return module;
	});
	// Resolves to the JS module, but only after CSS has also loaded
	plugin.loaded = util.defer(plugin.loaded);
	plugin.module = plugin.loaded;
	plugin.done = plugin.loaded.finally(_ => {
		plugin.loading = "";
	});

	return plugin;
}

let requested;

/**
 * The ids the deck named in its HTML, and — as a side effect — where any of them live:
 *   <body data-load-plugins="markdown: @inspirejs/markdown, mine: ./plugins/mine.js, presenter">
 * Naming a plugin loads it whether or not its selector matches — with a module, from
 * there instead of wherever a plugin package registered it.
 *
 * HTML is parsed before any module runs, which is what makes this work whatever the
 * deck's import graph looks like — configuring the registry from JS races setup().
 */
function deckPlugins () {
	if (requested) {
		return requested;
	}

	requested = new Set();
	let config = document.body.getAttribute("data-load-plugins");

	// Each id, optionally followed by ": <module>". Ids are separated by commas or
	// whitespace; a module runs to the next comma, so it can be an absolute URL.
	for (let [, id, module] of config?.matchAll(/([^\s,:]+)(?::\s*([^,]+))?/g) ?? []) {
		module = module?.trim();

		if (module) {
			try {
				// Bare specifiers resolve through the import map, everything else against the document.
				// NOTE resolved from the core's scope, so a *scoped* import map entry won't be picked up.
				let base = /^(\.{0,2}\/|[a-z][a-z\d+.-]*:)/i.test(module)
					? new URL(module, document.baseURI)
					: new URL(import.meta.resolve(module));

				(registry[id] ??= {}).base = base;
			}
			catch (e) {
				// An unmapped specifier or an invalid URL must not take the whole deck down
				console.warn(`Ignoring data-load-plugins entry "${id}: ${module}": ${e.message}`);
				continue;
			}
		}
		else if (!registry[id]) {
			console.warn(
				`Unknown plugin "${id}" in data-load-plugins. Add "${id}: <module>" to say where it lives.`,
			);
			continue;
		}

		requested.add(id);
	}

	return requested;
}

// Load every plugin the deck asked for, plus every one whose selector matches.
export function loadAll (plugins = registry) {
	let requested = deckPlugins();

	let ret = [];

	for (let id in plugins) {
		let def = plugins[id];

		if (typeof def === "string") {
			def = { test: def };
		}

		let doLoad = requested.has(id) || (def.test && document.querySelector(def.test));
		let dontLoad = document.body.matches(`.no-${id}, .no-plugins`);

		if (doLoad && !dontLoad) {
			let plugin = load(id, def);
			plugin.loaded.catch(e => console.error(`Plugin ${id} error:`, e));
			setTimeout(_ => plugin.loaded.reject("Timed out"), TIMEOUT);
			ret.push(plugin.loaded);
		}
	}

	return ret;
}

// Add plugins to the registry at runtime and load any that match now.
// `base` is applied to entries that don't carry their own.
export function register (plugins, base) {
	let added = {};

	for (let id in plugins) {
		let def = plugins[id];
		def = typeof def === "string" ? { test: def } : { ...def };

		if (base && !def.base) {
			def.base = base;
		}

		added[id] = registry[id] = def;
	}

	loadAll(added);
}
