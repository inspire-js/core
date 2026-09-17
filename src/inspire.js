import * as plugins from "./plugins.js";
import * as util from "./util.js";
import * as imports from "./imports.js";
import * as items from "./items.js";
// The delayed vocabulary is core functionality: not gated behind plugin loading
import "./plugins/delayed/plugin.js";

const { $, $$, bind, Hooks, create, autoplay } = util;

if ($(".additive-steps")) {
	console.warn(
		".additive-steps is not used anymore. Simply use data-step-all instead of data-step for additive steps.",
	);
}

// Cache <title> element, we may need it for slides that don"t have titles
const documentTitle = document.title + "";

let _ = {
	loaded: util.defer(),

	// Plugin machinery (loader + registry). Core ships the registry empty;
	// plugin packages (e.g. @inspirejs/plugins) write their entries into it.
	plugins,
	loadPlugin: plugins.load,

	// Inspire will not initialize until any promises pushed here are resolved
	// This is useful for plugins to delay initialization until they've fetched stuff
	delayInit: [],

	// Elements to ignore (works with nesting too)
	// This works better than commenting, which cannot be
	ignore: ".inspire-remove, .inspire-comment",

	// Arrow keys inside these elements will not trigger navigation
	editableElements: "input, textarea, select, button, [contenteditable]",

	ready: util.defer(),
	slideshowCreated: util.defer(),
	importsLoaded: imports.loaded,
	loadImports: imports.load,

	hooks: new Hooks(),

	// Step items of the current slide, and the registry of item types (see items.js)
	items,

	async setup () {
		this.loaded.resolve(true);

		$$(this.ignore).forEach(el => el.remove());

		await this.loadImports();

		// Load every plugin whose selector matches. The registry already holds core's
		// own bundled plugins; plugin packages imported alongside the core add more
		this.dependencies = plugins.loadAll();

		this.domSetup();

		await Promise.allSettled(this.dependencies);

		let loaded = Object.keys(plugins.loaded);
		console.info("Inspire.js plugins loaded:", loaded.length ? loaded.join(", ") : "none");

		this.ready.resolve();

		await Promise.allSettled(this.delayInit);
		this.init();
	},

	domSetup () {
		// Make all external links open in a new window
		$$('a[href^="http"]:not([target])').forEach(a => (a.target = "_blank"));

		// Set <html> attributes from query string
		const url = new URL(location);
		const params = url.searchParams;

		for (let [key, value] of params) {
			document.documentElement.setAttribute("data-" + key, value);
		}

		if (params.get("profile")) {
			this.profile = params.get("profile");
		}
	},

	init () {
		// Current slide
		_.index = 0;

		// Current step within the slide; 0 means no items reached yet
		_.item = 0;

		// Slides that have been displayed at least once
		_.displayed = new Set();

		_.hooks.run("init-start");

		// Create slide indicator
		_.indicator = create.in(document.body, `<div id=indicator></div>`);

		// Add on screen navigation
		let onscreen = create.in(
			document.body,
			`<div id=onscreen-nav class="hidden">
			<button class="onscreen-nav prev" type=button>◂</button>
			<button class="onscreen-nav next" type=button>Next ▸</button>
		</div>`,
		);

		onscreen.children[0].addEventListener("click", evt => _.previous());
		onscreen.children[1].addEventListener("click", evt => _.next());

		// Get the slide elements into an array
		_.slides = $$(`.slide:not(${_.ignoreSlides})`, document.body);
		document.documentElement.style.setProperty("--total-slides", _.slides.length);

		// Order of the slides
		_.order = [];

		if (!_.slides.length) {
			console.warn(
				'[Inspire.js] There are no slides! Add some elements with class="slide" to create a presentation.',
			);
			return;
		}

		let slideContainers = new Set();

		for (let i = 0; i < _.slides.length; i++) {
			let slide = _.slides[i];

			for (let ancestor = slide; (ancestor = ancestor.parentNode); ) {
				slideContainers.add(ancestor);
			}

			if (slide.id && !slide.dataset.originalid) {
				slide.dataset.originalid = slide.id;
			}

			// Set data-title attribute to the title of the slide
			let title = slide.title || slide.getAttribute("data-title");

			if (title) {
				slide.removeAttribute("title");
			}
			else {
				// no title attribute, fetch title from heading(s)
				let heading = $("h1, h2, h3, h4, h5, h6", slide);

				if (heading && heading.textContent.trim()) {
					title = heading.textContent;
				}

				if (!title && slide.id) {
					// Still no title, but it has an id, try from that
					title = slide.id
						.replace(/-(\w)/g, ($0, $1) => " " + $1.toUpperCase())
						.replace(/^./, a => a.toUpperCase());
				}
			}

			if (title) {
				slide.setAttribute("data-title", title);

				if (!slide.id) {
					// If a slide has a title but not an id, get its id from that
					let id = title
						.replace(/[^\w\s-]/g, "") // Remove non-ASCII characters
						.trim()
						.replace(/\s+/g, "-") // Convert whitespace to hyphens
						.toLowerCase();

					if (/\d/.test(id)) {
						// Make sure it doesn't start with a number
						id = "slide-" + id;
					}

					slide.id = id; // Ok if it's duplicate, next bit of code will fix that
				}
			}

			if (slide.id) {
				// If duplicate id, append number to make it unique
				util.deduplicateId(slide);
			}
			else {
				// Asign ids to slides that don"t have one
				slide.id = "slide" + (i + 1);
			}

			let imp = slide.getAttribute("data-insert"),
				imported = imp ? _.getSlideById(imp) : null;

			if (imp && !imported) {
				// data-insert to slide that does not exist, remove slide
				console.warn(`Slide not found for data-insert="${imp}", ignoring.`);
				slide.remove();
				_.slides.splice(i, 1);
				i--;
				continue;
			}

			_.order.push(imported ? _.slides.indexOf(imported) : i);
		}
		// end slide loop

		slideContainers.delete(document.body);
		slideContainers.delete(document.documentElement);
		slideContainers.delete(document);
		slideContainers.forEach(el => el.classList.add("slide-container"));

		addEventListener("hashchange", _.hashchange);

		// Find-in-page matched text in a slide that is not on screen: switch to it.
		// beforematch fires once per hidden="until-found" ancestor of the match,
		// innermost first: anything the deck marked up itself, then the slide. So the
		// first one is the closest we get to knowing where in the slide the match is.
		let match;

		document.addEventListener("beforematch", evt => {
			if (match) {
				// Same match, further out
				return;
			}

			if (evt.target.matches(".slide") && location.hash === "#" + evt.target.id) {
				// Not a search: navigating to a slide reveals it the same way, and
				// hashchange is already taking us there, with the step it was given
				return;
			}

			match = evt.target;
			let slide = _.getSlide(match);

			// The browser is midway through revealing: it still has to drop the
			// attribute and scroll to the match. Switching slides under it would
			// change the layout it is working on, so wait until it is done.
			requestAnimationFrame(() => {
				if (slide) {
					_.goto(slide);

					// Only the slide itself fired it, so the match could be anywhere
					// in it: run every step, and it is visible wherever it is
					_.gotoItem(match === slide ? Infinity : items.stepOf(match));
				}

				match = null;
			});
		});

		_.hooks.run("init-before-first-goto", this);

		// If there"s already a hash, update current slide number
		_.goto(location.hash.substr(1) || 0);

		bind(window, {
			/**
				Keyboard navigation
				Ctrl+G : Go to slide...
				(Shift instead of Ctrl works too)
			*/
			keyup: evt => {
				if (!evt.composedPath()[0].matches(_.editableElements)) {
					let letter = evt.key.toUpperCase();

					if (letter === "G" && (evt.ctrlKey || evt.shiftKey) && !evt.altKey) {
						let slide = prompt("Which slide?");
						_.goto(+slide ? slide - 1 : slide);
					}
					else {
						_.hooks.run("keyup", { evt, letter, context: this });
					}
				}
			},
			/**
				Keyboard navigation
				Home : First slide
				End : Last slide
				Space/Up/Right arrow : Next item/slide
				Ctrl + Space/Up/Right arrow : Next slide
				Down/Left arrow : Previous item/slide
				Ctrl + Down/Left arrow : Previous slide
				(Shift instead of Ctrl works too)
			*/
			keydown: evt => {
				if (
					evt.altKey ||
					evt.target.contains(_.currentSlide) ||
					!evt.composedPath()[0].matches(_.editableElements)
				) {
					if (evt.keyCode >= 32 && evt.keyCode <= 40) {
						evt.preventDefault();
					}

					switch (evt.key) {
						case "PageUp":
							_.previous();
							break;
						case "PageDown":
							_.next();
							break;
						case "End":
							_.end();
							break;
						case "Home":
							_.start();
							break;
						case "ArrowLeft": // <-
						case "ArrowUp":
							_.previous(evt.ctrlKey || evt.shiftKey);
							break;
						case " ": // space
						case "ArrowRight": // ->
						case "ArrowDown":
							_.next(evt.ctrlKey || evt.shiftKey);
							break;
					}
				}
			},
		});

		_.hooks.run("init-end", this);

		_.slideshowCreated.resolve();

		return this;
	},

	hashchange (evt) {
		_.goto(location.hash.substr(1) || 0);
	},

	start () {
		_.goto(0);
	},

	end () {
		_.goto(_.slides.length - 1);
	},

	/**
		@param hard {Boolean} Whether to advance to the next slide (true) or
			just the next step (which could very well be showing a list item)
	 */
	next (hard) {
		if (!hard && items.count) {
			_.nextItem();
		}
		else {
			_.goto(_.index + 1);
		}
	},

	nextItem () {
		if (_.item < _.lastItem) {
			_.gotoItem(_.item + 1);
		}
		else {
			// Finished all slide items, go to next slide
			_.next(true);
		}
	},

	previous (hard) {
		if (!hard && _.item > 0) {
			_.previousItem();
		}
		else {
			_.goto(_.index - 1, Infinity);
		}
	},

	previousItem () {
		_.gotoItem(_.item - 1);
	},

	// The last step of the current slide. `.delayed-last` grants one extra step past
	// the last item, where every item is past and none is current.
	get lastItem () {
		let extra = _.currentSlide?.matches(".delayed-last, .delayed-last *") ? 1 : 0;
		return items.count + extra;
	},

	/**
	 * Go to an arbitrary slide
	 * @param {Element | string | number} which Slide element, id, or number
	 * @param {number} [step] Step to land on; defaults to 0 when the slide changes.
	 *   Clamped to the slide's last step, so `Infinity` means "the end".
	 */
	goto (which, step) {
		let slide;
		let prev = _.slide;

		// We have to remove it to prevent multiple calls to goto messing up
		// our current item (and there"s no point either, so we save on performance)
		globalThis.removeEventListener("hashchange", _.hashchange);

		let isWhichAnId = which + "" === which;

		if (isWhichAnId) {
			// Argument is a slide id
			let id = which;
			which = $(which[0] === "#" ? which : "#" + which);

			// Id is of the form #slide42, just find that slide by number
			if (!which && /^slide(\d+)$/.test(id)) {
				which = id.slice(5) - 1;
			}
		}

		if (which instanceof Element) {
			// Argument is an element
			// Is it a slide? Inside a slide? Contains a slide?
			slide = which.closest(".slide") || $(".slide", which);
		}

		if (!slide && isWhichAnId && localStorage.Inspire_currentSlide) {
			// No slide found with this id, load the one most recently accessed
			which = +localStorage.Inspire_currentSlide;
		}

		if (slide) {
			if (!slide.matches(":target") || location.hash !== "#" + slide.id) {
				location.hash = ""; // See https://twitter.com/LeaVerou/status/1046114577648422912
				location.hash = slide.id;
			}

			_.slide = _.index = _.slides.indexOf(slide);
		}
		else if (which + 0 === which && which in _.slides) {
			// Argument is a valid slide number
			_.index = which;
			_.slide = _.order[which];

			slide = _.currentSlide;

			location.hash = "#" + slide.id;
		}

		if (prev !== _.slide) {
			// Slide actually changed, perform any other tasks needed
			document.title = slide.getAttribute("data-title") || documentTitle;

			let prevSlide = _.slides[prev];
			let firstTime = !_.displayed.has(slide);
			_.displayed.add(slide);

			// Which revisit is this?
			let revisit = 0;

			for (let i = 0; i < _.index; i++) {
				if (_.order[i] === _.slide) {
					revisit++;
				}
			}

			slide.dataset.visit = revisit + 1;

			// Leaving a slide rewinds it, so nothing it switched on leaks out
			items.rewind();

			// hidden="until-found" is what lets find-in-page search slides that are
			// not on screen (see the beforematch listener in init()). The browser
			// removes it from the slide it reveals, so we put it back here.
			// Only where it is supported: elsewhere `hidden` is a boolean, so it
			// would hide every slide, including the one we are switching to.
			if ("onbeforematch" in HTMLElement.prototype) {
				for (let s of _.slides) {
					if (!s.hasAttribute("hidden")) {
						s.setAttribute("hidden", "until-found");
					}
				}
			}

			let env = { slide, prevSlide, firstTime, which, context: this };
			_.hooks.run("slidechange", env);

			localStorage.Inspire_currentSlide = _.index;

			// Adjust color-scheme of Inspire chrome
			document.documentElement.style.setProperty("color-scheme", "");
			document.documentElement.style.setProperty(
				"color-scheme",
				getComputedStyle(slide).getPropertyValue("color-scheme"),
			);

			// Show or hide onscreen navigation
			$("#onscreen-nav").classList.toggle("hidden", !slide.matches(".onscreen-nav"));

			// Update the slide number
			_.indicator.textContent = env.slide.classList.contains("no-slide-number")
				? ""
				: _.index + 1;

			// Collect items after the hook, since plugins may still be changing the DOM
			items.update(slide);
			_.gotoItem(step ?? 0);

			// Videos outside future items start playing
			autoplay(slide);

			// Make videos without visible controls play/pause on click
			for (let video of $$("video:not([controls])", env.slide)) {
				video.addEventListener("click", evt => {
					if (video.paused) {
						video.play();
					}
					else {
						video.pause();
					}
				});
			}

			// Update next/previous
			let previousPrevious = _.slides.previous;
			let previousNext = _.slides.next;

			_.slides.previous = _.slides[_.order[_.index - 1]];
			_.slides.next = _.slides[_.order[_.index + 1]];

			_.slides.previous && _.slides.previous.classList.add("previous");
			_.slides.next && _.slides.next.classList.add("next");

			if (previousPrevious && previousPrevious != _.slides.previous) {
				previousPrevious.classList.remove("previous");
			}

			if (previousNext && previousNext != _.slides.next) {
				previousNext.classList.remove("next");
			}

			// Run the slidechange event and hook
			requestAnimationFrame(() => {
				let evt = new Event("slidechange", { bubbles: true });
				Object.assign(evt, { prevSlide, firstTime });
				slide.dispatchEvent(evt);

				_.hooks.run("slidechange-async", env);
			});
		}
		else if (step !== undefined) {
			_.gotoItem(step);
		}

		// If you attach the listener immediately again then it will catch the event
		// We have to do it asynchronously
		setTimeout(() => addEventListener("hashchange", _.hashchange), 200);
	},

	/**
	 * Run code once on a slide when the slide is active
	 * @param {String | HTMLElement} ref CSS selector or slide element
	 * @returns {Promise<HTMLElement>} The slide that was activated
	 */
	async on (ref) {
		if (/^[\w-]+$/.test(ref)) {
			console.warn("Inspire.on() expects a selector now, not an id");
			ref = "#" + ref;
		}

		if (_.currentSlide === ref || _.currentSlide?.matches(ref)) {
			return _.currentSlide;
		}

		return new Promise(resolve => {
			let callback = evt => {
				if (ref === evt.target || (typeof ref === "string" && evt.target.matches(ref))) {
					resolve(evt.target);
					evt.target.removeEventListener("slidechange", callback);
				}
			};

			document.body.addEventListener("slidechange", callback);
		});
	},

	/**
	 * Run code for specific elements, once, only when the slide they appear in becomes active
	 * @param {string} selector
	 * @param {function} callback
	 * @returns {HTMLElement[]} The slides that contain elements matching the selector
	 */
	for (selector, callback) {
		let slides = $$(`.slide:has(${selector})`);

		for (let slide of slides) {
			_.on(slide).then(slide => {
				for (let element of $$(selector, slide)) {
					callback(element);
				}
			});
		}

		return slides;
	},

	// Re-collect the current slide's items after a DOM change
	updateItems () {
		items.refresh();
	},

	/**
	 * Go to a specific step in the current slide
	 * @param {number} which 0 means no items are current, just the slide itself.
	 *   Clamped to the slide's last step.
	 * @returns {number} The step actually gone to
	 */
	gotoItem (which) {
		_.item = items.goto(which, _.lastItem);
		_.hooks.run("gotoitem-end", { which: _.item, context: this });
		return _.item;
	},

	// Get current slide as an element
	get currentSlide () {
		return _.slides?.[_.slide];
	},

	getSlideById (id) {
		id = id[0] === "#" ? id : "#" + id;
		return $(".slide" + id);
	},

	// Get the slide an element belongs to
	getSlide (element) {
		return element.closest(".slide");
	},

	// Plugins call this after changing the DOM: items are re-collected and other
	// plugins are notified via the `inspire-domchanged` event
	domchanged (element) {
		element.dispatchEvent(new Event("inspire-domchanged", { bubbles: true }));

		if (items.slide?.contains(element)) {
			items.refresh();
		}
	},
};

_.util = {};
Object.assign(_.util, util);

export default _;
