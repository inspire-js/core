# Inspire.js

### Lean, hackable, extensible slide deck framework. Create basic slides by just writing HTML and CSS, do fancy custom stuff with JS, the sky is the limit!

This repo is the **core engine** (`@inspirejs/core`). Inspire.js is split across a few packages:

| Package                                                       | What it is                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`@inspirejs/core`](https://github.com/inspire-js/core)       | this repo — the core engine + `inspire.css`                         |
| [`@inspirejs/plugins`](https://github.com/inspire-js/plugins) | optional plugins, autoloaded on demand                              |
| [`inspirejs.org`](https://github.com/inspire-js/inspire.js)   | meta package: bundles core + plugins in one install                 |
| [demo / theme](https://github.com/inspire-js/demo)            | the [inspirejs.org](https://inspirejs.org) site + the default theme |

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
- **`data-steps`** — numbered steps on an element, see [Incremental display](#numbered-steps-data-steps).

### Legacy URLs

Old absolute URLs like `https://inspirejs.org/inspire.mjs`, `/inspire.css`, and `/plugins/…` still resolve, but **migrate off them as soon as possible.** They only redirect to the new packages to soften breakage; because the underlying files have been reorganized, they are unlikely to keep working correctly. Depend on the npm packages instead.

## Incremental display

To reveal parts of a slide one step at a time, add `class="delayed"` to any element. Each delayed element appears on its own step as you advance, in source order:

```html
<ul>
	<li class="delayed">First, then…</li>
	<li class="delayed">second, then…</li>
	<li class="delayed">third.</li>
</ul>
```

Use `class="delayed-children"` on a container to make all of its direct children delayed, without annotating each one:

```html
<ul class="delayed-children">
	<li>First</li>
	<li>Second</li>
	<li>Third</li>
</ul>
```

Every delayed element carries one of three classes at any time: `future` (its step hasn't come yet), `current` (its step is the one you're on) or `past` (you've moved past it). Style them however you like; `inspire.css` fades `future` out. A few modifiers are built in:

| Modifier | Effect |
| --- | --- |
| `transient` (or `delayed-transient` on a container) | past items dim to 30% |
| `collapse` (or `delayed-collapse`) | future items take no space |
| `collapse-notcurrent` (or `delayed-collapse-notcurrent`) | only the current item takes space |
| `delayed-last` on the slide | one extra step at the end where nothing is current |

### Controlling order and grouping with `data-index`

By default, delayed items reveal in source order. Add `data-index` to override that order — items are revealed from lowest index to highest (items without `data-index` count as `0`, so they come first). The values only set _relative order_; gaps don't matter, so `data-index="2"` then `data-index="10"` is the same as `1` then `2`.

Items that share the **same** `data-index` are revealed **together, in a single step**. This is handy for revealing a whole group at once — e.g. a table column:

```html
<tr><td>R</td><td>255</td><td class="delayed" data-index="1">0xFF</td></tr>
<tr><td>G</td><td>0</td>  <td class="delayed" data-index="1">0x00</td></tr>
<tr><td>B</td><td>140</td><td class="delayed" data-index="1">0x8C</td></tr>
```

All three `0x…` cells appear on the same step. Items _without_ `data-index` are never grouped — each still gets its own step.

`data-index="0"` is special: it means "with the slide". Such items are already past when the slide appears and are rewound when you leave it, which is mostly useful with the attributes below.

### Delayed classes, attributes and scripts

Revealing is only one thing a step can do. The same `delayed` word, as a prefix, folds anything else into the slide's flow:

```html
<!-- The slide gains `zoomed`, then `answered`, one step each. Nothing is hidden. -->
<section class="slide delayed:zoomed delayed:answered">…</section>

<!-- Attributes: <details> opens at its step; inline styles merge per property -->
<details delayed:open>…</details>
<p style="color: gray" delayed:style="color: red" delayed[2]:style="color: blue">…</p>

<!-- Code runs when its step is reached, with `this` being the element -->
<button delayed:script="this.click()">Play</button>
```

The grammar is `delayed(.modifier)*([index])?(:name)?`, the same for class tokens and attribute names:

- `[index]` works like `data-index`: `delayed[2]:lit` shares a step with a `.delayed` item that has `data-index="2"`, and `delayed[0]:script` runs as soon as the slide appears.
- `.transient` holds only while the step is current (`delayed.transient:glow`), instead of from the step on.
- `.always` re-runs a script every time its step is reached; by default scripts run once per element.
- Steps follow source order: attributes in the order they are written, and class tokens where the `class` attribute sits among them.
- Setting the same attribute at two steps needs two distinct names, e.g. `delayed:style` and `delayed[1]:style`; the latest active one wins.
- `delayed:script` with an empty value runs the element's text, for longer code: `<script type="text/plain" delayed:script>…</script>`. `class`, `id` and `data-index` cannot be delayed.

Because a slide is left by rewinding it, a delayed `<style>` that must affect things outside the slide can be `<style media="not all" delayed[0]:media="all">`. Styles scoped to the slide need no help: `<style>@scope { … }</style>`.

### Numbered steps: `data-steps`

`data-steps="3"` gives an element three anonymous steps and reflects where you are as attributes: `data-step` (the current step, absent before the first) and `data-step-all` (every step reached, e.g. `"0 1 2"`, for cumulative styles via `[data-step-all~="1"]`). Descendants can declare when they show, relative to their closest stepped ancestor: `data-step="2"` (only during step 2), `data-step-min="2"` (from step 2 on), `data-step-max="2"` (until step 2). The `delayed:` classes above are usually the more readable option, since you name states instead of numbering them.

### Reacting to steps from JS

Every element whose item changes state gets a bubbling `itemchange` event, with `event.item`, `event.state` and `event.active`:

```js
slide.addEventListener("itemchange", evt => {
	if (evt.state === "current") {
		// evt.target just got its turn
	}
});
```

`Inspire.item` is the current step, `Inspire.gotoItem(n)` goes to one, `Inspire.items.all` lists the current slide's items and `Inspire.items.count` its step count. The `gotoitem-end` hook runs after every step change. DOM changes inside the current slide are picked up automatically (class changes and added/removed elements); after changing attributes from JS, call `Inspire.domchanged(element)`.

### Defining your own step syntax

All of the above are _item types_ registered through one API, and you can add your own:

```js
Inspire.items.register({
	name: "pulse",
	selector: "[data-pulse]",        // elements that get items (the slide too, if it matches)
	items: element => [{}, {}],      // descriptors per element; default is one. `index`, `transient`, `key` are understood by core
	apply (element, items, env) {    // called once per element whose items changed state
		element.classList.toggle("pulsing", items.some(item => item.active));
	},
});
```

Each item has `element`, `index`, `step`, `state` (`future`, `current` or `past`) and `active` (past-or-current, or only current when `transient`). A type without a `selector` gets `items(slide)` called once and returns descriptors with their own `element`, for syntaxes no selector can find.

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
$("#slide-id").addEventListener(
	"slidechange",
	evt => {
		// Code to run
	},
	{ once: true },
);
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
