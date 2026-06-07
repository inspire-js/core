# Inspire.js

### Lean, hackable, extensible slide deck framework. Create basic slides by just writing HTML and CSS, do fancy custom stuff with JS, the sky is the limit!

This repo is the **core engine** (`@inspirejs/core`). Inspire.js is split across a few packages:

| Package | What it is |
|---|---|
| [`@inspirejs/core`](https://github.com/inspire-js/core) | this repo — the core engine + `inspire.css` |
| [`@inspirejs/plugins`](https://github.com/inspire-js/plugins) | optional plugins, autoloaded on demand |
| [`inspirejs.org`](https://github.com/inspire-js/inspire.js) | meta package: bundles core + plugins in one install |
| [demo / theme](https://github.com/inspire-js/demo) | the [inspirejs.org](https://inspirejs.org) site + the default theme |

## Getting started

```sh
npm install @inspirejs/core
```

`@inspirejs/core` is native ESM and imports its dependencies by bare specifier (e.g. `@inspirejs/core`). Resolve those however your project already does — an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap), a bundler, or a no-build tool. Then include the stylesheet and import the engine:

```html
<link href="/path/to/@inspirejs/core/inspire.css" rel="stylesheet" />

<script type="module">
	import "@inspirejs/core"; // initializes automatically
</script>
```

That’s it. Slides are any elements with `class="slide"` — no JS needed to create them. `import Inspire from "@inspirejs/core"` gives you the API (also the global `Inspire`).

### Plugins (optional)

You don’t need plugins to use Inspire.js. Extra functionality (syntax highlighting, presenter view, live demos, …) lives in the separate [`@inspirejs/plugins`](https://github.com/inspire-js/plugins) package, which autoloads on demand — just add a second import:

```js
import "@inspirejs/plugins";
```

Or install [`inspirejs.org`](https://github.com/inspire-js/inspire.js), which bundles core + plugins.

### Core plugins (built in)

A few _fundamental_ features ship bundled with core as built-in plugins — modular internally, but always on, with nothing extra to install. Currently:

- **`autosize`** — shrinks a slide's font-size to keep its content from overflowing the viewport. Opt out for the whole deck with `class="no-autosize"` (or `no-plugins`) on `<body>`, or per slide/subtree with `class="dont-resize"`, `--dont-resize`, `--font-sizing: fixed`, or `overflow: hidden | clip`.

### Legacy URLs

Old absolute URLs like `https://inspirejs.org/inspire.mjs`, `/inspire.css`, and `/plugins/…` still resolve, but **migrate off them as soon as possible.** They only redirect to the new packages to soften breakage; because the underlying files have been reorganized, they are unlikely to keep working correctly. Depend on the npm packages instead.

## API FAQ

### Running code after any imports have loaded

```js
await Inspire.importsLoaded;
// code to run after imports have loaded
```

Note that `await` needs to be inside an async function otherwise it will error. However, this could just be a self-executing async function.

### Running code after a specific plugin has loaded

```js
await Inspire.importsLoaded;
await Inspire.plugins.loaded.PLUGIN_ID.loaded;
// code to run after the plugin with id PLUGIN_ID has loaded and executed
```

or:

```js
await Inspire.loadPlugin(PLUGIN_ID);
// code to run after the plugin with id PLUGIN_ID has loaded and executed
```

The second example would load the plugin if it hasn't otherwise been loaded, but if it will never be loaded twice.

### Running code when a specific slide is displayed

You can do this via the `slidechange` hook:

```js
Inspire.hooks.add("slidechange", env => {
	if (Inspire.currentSlide.id === "slide-id") {
		// Code to run
	}
});
```

or, via an event:

```js
document.addEventListener("slidechange", evt => {
	if (Inspire.currentSlide.id === "slide-id") {
		// Code to run
	}
});
```

### Running code when a specific slide is displayed for the first time

You can do this via the `slidechange` hook:

```js
Inspire.hooks.add("slidechange", env => {
	if (Inspire.currentSlide.id === "slide-id" && env.firstTime) {
		// Code to run
	}
});
```

or, via an event:

```js
document.addEventListener("slidechange", evt => {
	if (Inspire.currentSlide.id === "slide-id" && evt.firstTime) {
		// Code to run
	}
});
```

or:

```js
$("#slide-id").addEventListener("slidechange", evt => {
	// Code to run
}, {once: true});
```

### Running code after a specific slide has been displayed

You can do this via the `slidechange` hook:

```js
Inspire.hooks.add("slidechange", env => {
	if (env.prevSlide.id === "slide-id") {
		// Code to run
	}
});
```

or, via an event:

```js
document.addEventListener("slidechange", evt => {
	if (evt.prevSlide.id === "slide-id") {
		// Code to run
	}
});
```
