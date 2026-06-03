let Inspire = globalThis.Inspire;

// Setup Inspire iif it has not already been loaded
if (!Inspire?.loaded) {
	Inspire = globalThis.Inspire = await import("./src/inspire.js").then(m => m.default);

	Inspire.setup();
}

export default Inspire;

// The (initially empty) plugin registry, for plugin packages to populate.
export { registry } from "./src/plugins.js";
