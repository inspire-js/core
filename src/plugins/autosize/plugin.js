import Inspire from "../../inspire.js";

/**
 * Shrink the current slide's font-size in 10% steps until its content stops
 * overflowing the viewport. Bails out when the slide opts out (`.dont-resize`,
 * `--dont-resize`, `--font-sizing: fixed`, `overflow: hidden|clip`), during the
 * thumbnails overview, or when reducing the font-size stops having any effect.
 */
function adjustFontSize () {
	let slide = Inspire.currentSlide;

	if (!slide || document.body.matches(".show-thumbnails") || slide.matches(".dont-resize")) {
		return;
	}

	let cs = getComputedStyle(slide);

	if (
		cs.getPropertyValue("--dont-resize") ||
		cs.getPropertyValue("--font-sizing")?.trim() === "fixed" ||
		cs.overflow === "hidden" ||
		cs.overflow === "clip"
	) {
		return;
	}

	slide.style.fontSize = "";

	if (slide.scrollHeight <= innerHeight && slide.scrollWidth <= innerWidth) {
		return;
	}

	let size = parseInt(getComputedStyle(slide).fontSize);
	let prev = { scrollHeight: slide.scrollHeight, scrollWidth: slide.scrollWidth };
	let limit = 0;

	for (
		let factor = size / parseInt(getComputedStyle(document.body).fontSize);
		(slide.scrollHeight > innerHeight || slide.scrollWidth > innerWidth) && factor >= 1;
		factor -= 0.1
	) {
		slide.style.fontSize = factor * 100 + "%";

		if (
			prev &&
			prev.scrollHeight <= slide.scrollHeight &&
			prev.scrollWidth <= slide.scrollWidth
		) {
			// Reducing font-size is having no effect, abort mission after a few more tries
			if (++limit > 5) {
				break;
			}
		}
		else {
			limit = 0;
			prev = null;
		}
	}
}

// Re-fit on every slide change (async hook runs in a rAF, after sync slidechange
// hooks have applied their styles — so we measure the final layout), whenever the
// viewport changes size, and once on load (in case fonts/images settle after the
// first fit).
Inspire.hooks.add("slidechange-async", adjustFontSize);
addEventListener("resize", adjustFontSize, { passive: true });
addEventListener("load", adjustFontSize);

// If the first slide change already happened before we loaded (e.g. the plugin was
// loaded late), the hook above would miss the current slide — fit it now.
if (Inspire.slide !== undefined) {
	adjustFontSize();
}
