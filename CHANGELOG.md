# Changelog

## Unreleased

### Added

- Browser search (find-in-page) now searches the whole deck, not just the slide on screen, and jumps to the slide it matched, forwarding to the step that reveals the match. `beforematch` only tells us about elements that carry `hidden="until-found"`, so that is exact when the deck marks up its own, and otherwise runs all of the slide's steps so the match is visible wherever it is. Slides carry `hidden="until-found"` and are hidden with `content-visibility` instead of `display: none`, so [browsers that support it](https://caniuse.com/mdn-html_global_attributes_hidden_until-found) can look inside them. Everywhere else slides are simply not searchable, as before.

### Changed

- Plugin loading no longer times out per plugin after 4 s. Instead, `setup()` waits up to `Inspire.initTimeout` (default 10 s, configurable) for all plugins _and_ `delayInit` promises together, then initializes anyway and warns about whatever was still pending. `Inspire.plugins.loaded[id].loaded` now reflects the real load: it rejects on failure and stays pending on a stall, rather than being rejected with `"Timed out"`.
- `.previous` and `.next` slides are treated like every other slide that is not on screen: their contents are skipped with `content-visibility` where the slide carries `hidden="until-found"`, and they stay rendered-but-invisible (`visibility: hidden`) where it is missing, so that decks in browsers without support keep showing them. Deck CSS that shows them anyway needs `content-visibility: visible; clip-path: none; pointer-events: auto; visibility: visible` (see [plugins#12](https://github.com/inspire-js/plugins/pull/12), which does this for the presenter view's next-slide preview).

### Removed

- `plugin.loading`, `plugin.done` and `plugins.TIMEOUT`, which only served the old per-plugin timeout.

## 3.1.0

Steps are now data rather than DOM state: one `delayed:` grammar, one item model, one navigation path ([#4](https://github.com/inspire-js/core/pull/4), [#5](https://github.com/inspire-js/core/pull/5)).

### Breaking

Each of these is a find-and-replace in a deck, but nothing warns you: the old form simply stops doing anything.

- The `displayed` class on a stepped item is now `past`.
- The `itemcurrent` event is now `itemchange`. It carries the `item`, its `state` (`future` / `current` / `past`) and whether it is `active`.
- `Inspire.items` was an array of the current slide's item elements; it is now the item model — `Inspire.items.all`, `.count` and `.register()`. `Inspire.items.length`, `[0]` and `.forEach()` no longer work.
- `Inspire.itemCount` is gone; use `Inspire.items.count`.
- Slides no longer get a `data-index` attribute. Decks are free to use it; deck CSS that matched `.slide[data-index="N"]` will not.
- `data-step-from="N"` is now `data-step-min="N"`, on descendants of a `[data-steps]` element.
- `<script type="slide">` and `<style type="slide">` are gone, with the `slide-script` and `slide-style` plugins. Use `delayed:script` and `delayed:style` ([plugins#9](https://github.com/inspire-js/plugins/pull/9)).

### Added

- One grammar for delayed items, in class tokens and attribute names alike: `delayed(.modifier)*([index])?(:name)?` — `delayed:big` toggles a class, `delayed:open` sets an attribute, `delayed:script` runs code, `delayed[2]:` shares a step, `.transient` holds only while current, `.always` re-runs a script.
- A bundled `data-steps` plugin: `data-step-min` / `data-step-max` ranges on descendants, reflected as `data-step-state`, replacing the hardcoded 0–5 CSS. Steps are no longer capped at 5, and range elements no longer need dummy `<span>`s.
- `Inspire.items` as public API: `register(type)` to add an item vocabulary, plus `all` and `count`. `Inspire.lastItem` gives the slide's last step, including the extra one `.delayed-last` grants.
- Items are re-collected when the slide's DOM changes, so a class added from an `itemchange` listener or markup inserted by a `delayed:script` becomes a step without calling `Inspire.updateItems()`.
- Leaving a slide rewinds it, so nothing a slide switched on leaks into the next one.

### Fixed

- Entering a `.delayed-last` slide backwards lands on its terminal step, where every item is past, instead of on the last item.

### Known issues

- Removing an item from the slide you are on leaves the step count and the current step disagreeing ([#7](https://github.com/inspire-js/core/issues/7)).
