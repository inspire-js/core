import * as util from "./util.js";

/**
 * Plugin registry. Core ships it empty; plugin packages (e.g. @inspirejs/plugins)
 * import it and write their entries in. Each entry is:
 *   id -> { test: selector, base: URL the plugin's files resolve against }
 * Carrying `base` per entry lets plugins live anywhere — including separate repos.
 */
export const registry = {};

export let loaded = {};

export const TIMEOUT = 4000;

// Load a single plugin by id. `def` defaults to its registry entry.
// Plugin files (plugin.js / plugin.css) are resolved against `def.base`.
export function load (id, def = registry[id]) {
	if (loaded[id]) {
		return loaded[id];
	}

	let base = def.base ?? import.meta.url;
	let pluginURL = new URL(`${id}/plugin.js`, base);
	let noCSS = document.querySelector(`.no-css-${id}, .no-${id}-css, .${id}-no-css`);

	let plugin = loaded[id] = {};
	plugin.loading = pluginURL;
	plugin.loadedJS = import(pluginURL).then(module => plugin.module = module);
	plugin.loaded = plugin.loadedJS.then(module => {
		if (!noCSS && module.hasCSS) {
			let pluginCSS = new URL(`${id}/plugin.css`, base);
			plugin.loading = pluginCSS;
			let link = util.create.in(document.head, `<link rel="stylesheet" href="${pluginCSS}">`);
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

// Load every registered plugin whose selector matches the current document.
export function loadAll (plugins = registry) {
	let ret = [];

	for (let id in plugins) {
		let def = plugins[id];
		let test = def.test ?? def;

		let doLoad = document.querySelector(test) || document.body.matches(`[data-load-plugins~="${id}"]`);
		let dontLoad = document.body.matches(`.no-${id}, .no-plugins`);

		if (doLoad && !dontLoad) {
			let plugin = load(id, typeof def === "string" ? { test: def } : def);
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
	for (let id in plugins) {
		let def = plugins[id];
		def = typeof def === "string" ? { test: def } : { ...def };

		if (base && !def.base) {
			def.base = base;
		}

		registry[id] = def;
	}

	loadAll(plugins);
}
