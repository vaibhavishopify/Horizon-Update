# Horizon theme: coding standards and best practices

Permanent development guide for this Shopify Horizon (3.5.1) theme as modernized with
Alpine.js, Tailwind CSS v4 and Splide.js. It is the standard every change is reviewed
against. `AGENTS.md` (Shopify's theme authoring guide, kept with this repo) remains the
baseline for Liquid, schema, CSS and the Component framework; this file adds the project
rules for the three libraries and says what wins where the two overlap.

Status note. These standards were written from the code in this repository, Shopify's
published theme guidance, and the Alpine, Tailwind and Splide documentation. The external
document "Shopify Theme Development - Alpine.js + Tailwind + Liquid Best Practices" was not
available in the repository or any connected source when this file was written, so nothing
here is taken from it. When it is added to the repo, reconcile each section marked
"Reconcile" below and record the result in the change log at the end of this file.

Paths are relative to the theme root. Verify every example against current source before
relying on it; the source is the contract, this file is the explanation.

---

## A. Architecture overview

### A.1 Stack

| Layer | Owner | Where |
|---|---|---|
| Markup, initial render, merchant settings | Liquid | `layout/`, `templates/`, `sections/`, `blocks/`, `snippets/` |
| Small UI interactions (toggles, disclosures, popovers, counters) | Alpine.js 3.17 | `assets/alpine-*.js`, registered in `assets/alpine-components.js` |
| All carousels and sliders | Splide 4.1 through one wrapper | `assets/slider.js` (`<slider-component>`), `snippets/slider*.liquid` |
| Network, cart, variant, section rendering, dialogs, media | Horizon `Component` framework (unchanged) | `assets/component.js` and the original feature modules |
| Styling | Tailwind utilities first, then component CSS | `src/tailwind.css` (source), `assets/tailwind.css` (built), `{% stylesheet %}` blocks, `assets/base.css` |
| Build | npm scripts, Tailwind CLI, vendor copy script; no bundler | `package.json`, `scripts/vendor.mjs` |
| Verification | Theme Check, Playwright harness | `shopify theme check`, `scripts/verify.mjs` |

### A.2 Folder and file placement

- `assets/` stays flat. One module per feature. Alpine components are `assets/alpine-<name>.js`;
  the Splide wrapper is `assets/slider.js`; vendored libraries are `assets/alpine.js`,
  `assets/splide.js`, `assets/splide-core.css`; the built stylesheet is `assets/tailwind.css`.
- `src/tailwind.css` is the only Tailwind source. Never edit `assets/tailwind.css` by hand.
- `scripts/` holds Node tooling (`vendor.mjs`, `verify.mjs`). `docs/` holds the migration
  inventory and test reports. `.shopifyignore` keeps `src/`, `scripts/`, `docs/`, package files
  and `node_modules/` off the store; keep it in sync when adding tooling.
- Shared slider markup lives in `snippets/slider.liquid`, `slider-arrows.liquid`,
  `slider-controls.liquid`, `slider-thumbnails.liquid`. Sections and blocks render those
  snippets; they do not contain slider markup of their own.

### A.3 Naming

| Thing | Convention | Examples |
|---|---|---|
| Alpine component files | `alpine-<kebab-name>.js`, exporting a camelCase factory | `alpine-show-more.js` exports `showMore` |
| `x-data` names | camelCase, same as the factory | `x-data="showMore({ disableOnDesktop: true })"` |
| Import-map specifiers | `@theme/<file-name-without-extension>` | `@theme/alpine-show-more`, `@theme/slider` |
| Custom element tags | kebab-case; must not end in `-component` unless the element is a real `Component` subclass (see B.6) | `slider-component` (Component), `show-more-disclosure` (Alpine) |
| CSS classes written by hand | BEM, block from the owning file | `.slider-thumbnails__thumbnail`, `.card__media-wrapper` |
| Data hooks read by JS | `data-*`, verb or noun, never a styling class | `data-slider-go`, `data-drawer-action`, `data-show-more-item` |
| Slider config attributes | `data-slider` (base), `data-slider-mobile` (below 750px) | see C and F |
| Setting IDs | snake_case; keep the kebab-case logical-spacing IDs that already exist | `autoplay_interval`, `padding-block-start` |
| Locale keys | `accessibility.*`, `actions.*`, `content.*` groups already in `locales/en.default.json` | `accessibility.slider_go_to_slide` |

### A.4 Component framework boundary

Horizon ships its own `Component` base class with `ref="name"` refs and `on:event="/method"`
delegated handlers. The division of labour is:

- Keep on `Component`: anything that fetches, morphs or re-renders (`product-form`,
  `cart-items`, `cart-drawer`, `quick-add`, `variant-picker`, `facets`, `paginated-list`,
  `predictive-search`, `localization-form`), every `DialogComponent`, `DeferredMedia` and
  `ProductModel`, `header-menu` / `header` sticky state, and `<slider-component>` itself.
- Move to Alpine: local, self-contained interaction state that reads and writes only its own
  subtree (accordions, disclosures, popovers, drawers, counters, clipboard, announcement rotation).
- Do not duplicate a cart or section-rendering flow in Alpine. Project rule from the brief:
  no new Ajax cart implementation.

### A.5 Section Rendering and the theme editor

Alpine binds `x-data` trees that arrive later through its MutationObserver, so markup inserted
by `sectionRenderer`, `morphSection`, `hydrate()` or the theme editor initialises without
extra code. Two consequences to design for:

- `morph.js` can reset attributes and classes on morphed nodes. State that must survive a
  morph belongs in an attribute the morph preserves, or must be re-derived in `init()`.
  `volumePricing` keeps its state as a class on purpose because the variant morph resets it,
  which is the legacy behaviour.
- `theme-editor.js` restores some UI state after an editor refresh by calling methods on the
  element (`el.showPanel()`, `el.open()`, `el.refs.details`). An Alpine component that replaces
  such an element must expose the same method names on `$root` in `init()`.

---

## B. Alpine.js standards

### B.1 When to use Alpine

Use Alpine when native HTML (`details`, `dialog`, `popover`, forms) needs a small amount of
behaviour: breakpoint-dependent defaults, Escape handling, delayed hover, outside click,
height animation, timers. Prefer the native element first and add Alpine on top of it. If the
behaviour needs network access, Section Rendering, focus trapping across a modal, or
cross-section coordination, use the `Component` framework instead (A.4).

### B.2 Component structure

Every component is one file exporting a factory, registered once:

```js
// assets/alpine-example.js
import { isMobileBreakpoint } from '@theme/utilities';

/**
 * One-paragraph description, the consuming Liquid file, and the markup contract.
 * @param {object} [config]
 * @param {boolean} [config.option] - What it changes.
 */
export const example = (config = {}) => ({
  option: Boolean(config.option),
  /** @type {AbortController | null} */
  controller: null,

  init() {
    this.controller = new AbortController();
    // listeners on window/document go here with { signal: this.controller.signal }
  },

  destroy() {
    this.controller?.abort();
  },

  handleClick(event) {
    // public handler, referenced from x-on
  },
});
```

```js
// assets/alpine-components.js: add the import and the entry in `components`
import { example } from '@theme/alpine-example';
```

Then add `"@theme/alpine-example": "{{ 'alpine-example.js' | asset_url }}"` to the import
maps in `snippets/scripts.liquid` and `templates/gift_card.liquid` (the gift card template has
its own layout and import map).

Rules:

- Coerce config values (`Boolean()`, `Number()`) so Liquid-rendered strings behave.
- Declare every instance field up front with a JSDoc type; do not create fields lazily.
- Put listeners on `window` or `document` behind an `AbortController` or a stored handler and
  remove them in `destroy()`. Alpine calls `destroy()` when the root leaves the DOM, which
  happens on every section re-render.
- Keep handlers public and named `handle<Event>` or a verb (`toggle`, `show`, `hide`).
- Expose a method on `$root` only when existing theme code calls it (A.5), and say so in the
  JSDoc.
- No `Alpine.store` unless two unrelated components genuinely share state. None do today.

### B.3 Directive usage in Liquid

- `x-data="name(config)"` on the element that owns the behaviour. Pass config as a JS object
  literal built from Liquid, with booleans and numbers unquoted:
  `x-data="accordion({ openOnDesktop: {{ open_on_desktop | default: false }} })"`.
- Bind events with `x-on:event="method"` (long form, not `@`), modifiers allowed
  (`x-on:click.outside`, `x-on:click.prevent`). Delegate from the root when the inner markup is
  merchant-controlled or deeply nested (`headerDrawer` uses `data-drawer-action`).
- Use `x-ref="name"` for fixed internal elements. Treat refs as optional and check them; merchant
  settings can remove the element.
- Prefer attribute state the CSS already reads (`open`, `aria-expanded`, `data-expanded`,
  `hidden`) over new reactive fields, so the server-rendered state and the JS state are the same
  thing. Use `x-bind`/`x-show` only when the state has no native attribute.
- `x-cloak` is defined in `src/tailwind.css`. Use it only for content that must be hidden until
  Alpine binds; server-rendered content should look correct before JavaScript runs.
- No inline logic longer than a method call in a directive. Logic lives in the component file.

### B.4 Accessibility inside Alpine components

- Keep `aria-expanded`, `aria-selected`, `aria-hidden` in sync in the same method that changes
  visibility. Return focus to the trigger on Escape (`accordion`, `localizationDropdown`).
- Use native `<details>`, `<dialog>` and `popover` so keyboard and screen-reader behaviour is
  free; Alpine only adds the extras.

### B.5 Section rendering and editor safety

- Make `init()` idempotent: Alpine re-runs it for every new root, including re-rendered
  sections. Do not assume a component runs once per page.
- Do not query outside `$root` except `document`/`window` listeners. A component that reaches
  into sibling sections breaks under partial section rendering.
- In design mode, listen for `shopify:block:select` / `shopify:block:deselect` only when the
  component shows one child at a time (`announcementBar`, `slider.js`).

### B.6 The `-component` tag boundary (project-specific, verified)

`assets/component.js` `getClosestComponent()` treats any element whose tag ends in `-component`
as the target of `on:*="/method"` handlers and silently drops the handler when that element is not
a `Component` instance. An element converted to Alpine must therefore either use a tag that does
not end in `-component` (as `show-more-disclosure` does), or every `on:*` handler inside it must
have a nearer real `Component` or an explicit `#id/` selector. Tags kept for CSS or editor reasons
(`floating-panel-component`, `anchored-popover-component`, `dropdown-localization-component`,
`announcement-bar-component`) were checked against this rule; re-check whenever one of them gains
inner `on:*` handlers.

Reconcile: Alpine coding conventions from the external document (directive style, store usage,
file layout) against B.2 and B.3.

---

## C. Tailwind CSS standards

### C.1 Configuration (verified in `src/tailwind.css`)

- Tailwind v4, CSS-first configuration. No `tailwind.config.js`.
- Preflight is not imported. Horizon's own reset in `assets/base.css` stays.
- The default palette is removed. Colours, spacing, radii, fonts, durations, z-index layers and
  icon sizes are mapped with `@theme inline reference` to the theme's custom properties
  (`snippets/theme-styles-variables.liquid`, `snippets/color-schemes.liquid`). Utilities therefore
  follow merchant settings and colour schemes automatically.
- Breakpoints: `md` 750px (the theme's canonical mobile/desktop split), `lg` 990px, `xl` 1200px,
  `2xl` 1400px. Mobile-only rules use `max-md:`.
- Utilities are emitted unlayered so they beat `base.css` by source order. Shopify injects
  `{% stylesheet %}` CSS after `tailwind.css`, so legacy component rules still win over utilities
  until that rule is removed from the component.
- `underline` is blocked (`@source not inline('underline')`) because `blocks/email-signup.liquid`
  emits the merchant setting value `underline` as a class.
- Add tokens only by mapping an existing theme custom property. Do not introduce colours,
  spacing or fonts that are not merchant-controlled.

### C.2 Utility-first, with limits

- Use utilities for layout, spacing, sizing, positioning, display, flex/grid, overflow, object
  fit, simple state variants (`hover:`, `focus-visible:`, `disabled:`, `group-hover/slider:`).
- Keep a BEM class on the root of every component and on elements that JS, other CSS or Theme
  Check selectors reference (`.card`, `.slider-thumbnails__thumbnail`). Utilities are added next
  to it, not instead of it, so hooks remain stable.
- Keep custom CSS (in the owning file's single `{% stylesheet %}` block) when any of these apply,
  and say which one in a comment:
  - the value comes from a merchant setting or Liquid computation (`{% style %}` or inline
    custom properties);
  - state selectors such as `:has()`, `[aria-selected='true']`, `.is-active`;
  - container queries, `@starting-style`, keyframes, view transitions;
  - third-party element styling (Splide-generated dots, model viewer, payment buttons);
  - `::before`/`::after`, scrollbars, or anything that would need an arbitrary utility longer
    than the equivalent rule.
- Arbitrary values (`px-[var(--x)]`) are acceptable when they reference a theme variable. Do not
  write literal pixel or colour arbitrary values.
- Do not use `@apply`. It hides which utilities a component relies on and defeats the "class
  tokens must exist in the built CSS" check.

### C.3 Class ordering and readability

Order classes: BEM hook, then layout (`relative flex grid`), box (`size- w- h- min-w-0`), spacing
(`m- p- gap-`), typography, visual (`bg- border- rounded- overflow-`), state variants last.
Break long class attributes across lines in Liquid when they exceed roughly 120 characters.

### C.4 Dynamic classes and Liquid

Tailwind only generates utilities it can find as literal strings in scanned files. Never build a
utility name from Liquid at render time (`px-{{ size }}`). Use a `case`/`assign` that emits
complete class names, or pass the value through a custom property and use one utility that
reads it.

### C.5 Conversion method

When converting a component from legacy CSS to utilities, capture computed styles before and
after at desktop (1400px) and mobile (390px) for every element the component renders, and
require zero differences before removing the legacy rule. The scratchpad scripts used so far
(`style-snapshot.mjs`, `snap-diff.mjs`) should be promoted to `scripts/` when the next
conversion starts. Watch for name collisions with Horizon's own helper classes: `.grid` was
renamed `.layout-grid` and `.flex` removed for this reason.

Reconcile: Tailwind conventions from the external document (class ordering, when to keep custom
CSS, token policy) against C.2 and C.3.

---

## D. Liquid standards

The Liquid rules in `AGENTS.md` ("Liquid composition", "Schema ownership", "Storefront copy")
apply unchanged. Project additions:

- Sections and blocks compose; snippets render. Slider, arrows, controls and thumbnails are
  snippets so every consumer gets the same markup and accessibility.
- Pass every caller-local value into a snippet explicitly. Snippets that read `section`,
  `block` or `settings` directly must say so in their `{% doc %}`.
- Build JSON for `data-slider` with `{% capture %}`/`assign` and literal keys; never apply
  `| times`/`| plus` to a string you already built, and never leave trailing commas. Keep the
  JSON on one line so Theme Check and the browser parse it identically.
- Escape merchant strings in attributes (`| escape`). Numeric setting values in attributes
  (`autoplay="{{ section.settings.speed }}"`) are acceptable without escaping.
- Every storefront string goes through `t`; schema labels use `t:` keys in
  `locales/en.default.schema.json`. New runtime keys must be added to all 31 storefront locale
  files (Theme Check `MatchingTranslations` fails otherwise).
- Keep `{{ block.shopify_attributes }}` on the element that is the selectable block, which for a
  slide or card is the `<li class="splide__slide">`.
- Keep stable IDs. Append `section.id` or `block.id` to any `id` that can appear more than once.
- Use `{% liquid %}` for multi-line logic and keep `{% doc %}` (snippets, blocks) or the section
  contract comment (sections) current when parameters change.
- Do not use `{% javascript %}`/`{% stylesheet %}` for shared code; shared behaviour lives in
  `assets/` and shared CSS in a style-owner snippet.

Reconcile: Liquid conventions from the external document.

---

## E. Preserving existing Shopify functionality

These must keep working after every change. They are the regression list for review and for
`scripts/verify.mjs`.

| Area | Owner (unchanged) | Rule |
|---|---|---|
| Add to cart, cart drawer, cart page, quantity, notes, discounts | `product-form.js`, `cart-items.js`, `cart-drawer.js`, `cart-discount.js`, `@theme/events` | Never re-implement; dispatch and listen to the existing cart events with their payloads |
| Variant selection and media sync | `variant-picker.js`, `product-form.js`, `media-gallery.js` | The gallery re-renders on variant change; the slider must remount from `updatedCallback` and preserve the selected index |
| Quick add modal | `quick-add.js`, `snippets/quick-add-modal.liquid` | The modal content is marked `data-slider-disable-nested`; galleries inside it render as plain lists |
| Predictive search and facets | `predictive-search.js`, `facets-*.js`, `paginated-list.js` | Markup arrives through the Section Rendering API; sliders and Alpine must initialise from inserted DOM without page-level hooks |
| Dialogs and drawers | `dialog.js` (`DialogComponent`) | Keep; focus trapping, Escape and scroll lock live there (user decision: not converted) |
| Theme editor | `theme-editor.js`, `shopify:*` events | Block select moves the matching slider/announcement, autoplay pauses; state restore after refresh depends on `showPanel()`, `open()`, `refs.details` |
| Localization | `localization.js` (`localization-form-component`) | The Alpine toggles only open/close; form search, keyboard and submit stay on the Component |
| Deferred media, 3D models, video | `media.js` | Retained; sliders must not clone slides that contain video or `model-viewer` (use `rewind`, not `loop`, there) |
| Accelerated checkout, product form submit | `blocks/buy-buttons.liquid` and product form markup | Preserve variant IDs, availability, quantity rules and submit semantics |
| App blocks and app embeds | `@app` block types in schemas | Never remove accepted block types or `content_for 'blocks'` |

Rules of engagement:

- Read definitions, producers and consumers of an event together before changing any.
- A pre-existing bug is reported, not fixed, until the user decides (list in
  `docs/MIGRATION_INVENTORY.md`, section F).
- Do not remove settings, translations, event handlers or app integrations silently; every
  removal is listed in the inventory with the reason.

---

## F. Splide.js standards

### F.1 Single integration point (verified in `assets/slider.js`)

All sliders go through `<slider-component>` from `snippets/slider.liquid`. No other file may
import `@theme/splide` or call `new Splide()`. The wrapper owns: shared defaults, reduced-motion
handling, keyboard behaviour, i18n labels from `Theme.translations.slider_*`, mobile breakpoint
merge, hidden-slide handling, custom `[data-slider-go]` controls with `aria-selected` sync,
`[data-slider-current]` counters, theme-editor block select/deselect, drag-vs-click protection
(`data-slider-dragged`), and the `slideshow:select` event consumed by the theme.

### F.2 Rendering a slider

```liquid
{% capture config %}{"perPage":{{ columns }},"gap":"{{ gap }}px","arrows":true,"rewind":true}{% endcapture %}
{% capture config_mobile %}{"perPage":1,"fixedWidth":"80%","gap":"12px"}{% endcapture %}
{% render 'slider',
  slides_html: slides_html,
  config: config,
  config_mobile: config_mobile,
  per_page: columns,
  per_page_mobile: 1,
  show_arrows: true,
  arrows_class: 'px-xs',
  controls: controls_html,
  class: 'my-section__slider',
  ref: 'slideshow'
%}
```

- The full parameter list (`slides` or `slides_html`, `config`, `config_mobile`, `per_page`,
  `per_page_mobile`, `show_arrows`, `icon_style`, `icon_shape`, `arrows_position`,
  `arrows_class`, `arrow_class`, `arrows_always_visible`, `header`, `controls`, `class`,
  `container_class`, `track_class`, `list_class`, `slide_class`, `ref`, `style`, `attributes`)
  is documented in the `{% doc %}` of `snippets/slider.liquid`; keep that block current.
- Each slide is `<li class="splide__slide …">`. Put `{{ block.shopify_attributes }}` and any
  `ref="slides[]"` / `data-slide-id` on that `li`.
- `config` holds the desktop/base options; `config_mobile` is merged into `breakpoints[749]`
  (`mediaQuery: 'max'`). Pass `per_page` and `per_page_mobile` so slides have a width before Splide
  mounts (no layout shift).
- Use `rewind: true` by default. Use `loop` only where approved (Slideshow section, collection
  links) and never for slides that contain video, 3D models, forms or editor block attributes;
  `sections/slideshow.liquid` switches to rewind in design mode for that reason.
- Put merchant choices (autoplay, interval, dots, arrows, columns) in the section or block
  schema with `t:` labels, never in global theme settings (user decision).
- Nested sliders: a parent that must not initialise children sets `data-slider-disable-nested`
  on the container; the wrapper skips mounting inside it.
- Hidden slides (`hidden` attribute, e.g. variant-only images) are excluded from Splide
  automatically; call `refresh()` after toggling them.

### F.3 Controls and accessibility

- Arrows: `snippets/slider-arrows.liquid` (labels from `accessibility.slideshow_previous/next`).
- Dots, counter, play/pause: `snippets/slider-controls.liquid`. Autoplay requires a visible
  pause control and the `pauseOnHover`/`pauseOnFocus` defaults.
- Thumbnails: `snippets/slider-thumbnails.liquid` renders a `role="tablist"` of `role="tab"`
  buttons; `slider.js` keeps `aria-selected` in sync.
- Respect `prefers-reduced-motion` (the wrapper passes `reducedMotion` to Splide). Do not add
  autoplay without a pause control.
- Programmatic API from other modules: `select()`, `next()`, `previous()`, `play()`, `pause()`,
  `refresh()`, `current`, `initialSlide`, `refs.slides`. Do not reach into `splide` internals
  from outside the wrapper.

### F.4 Performance

- Slides render server-side; Splide only positions them. Keep per-slide images with `widths`
  and `sizes` matching the rendered slide width (`perPage`, `fixedWidth`).
- `slider.js` is loaded globally from `snippets/scripts.liquid` because sliders arrive through
  section rendering (predictive search). Do not add a second loader.

Reconcile: slider conventions from the external document (option defaults, naming of config
attributes).

---

## G. Build and asset management

### G.1 Commands (verified in `package.json`)

```
npm install            # once; installs Tailwind CLI, Alpine, Splide, Playwright (dev)
npm run build          # build:css (src/tailwind.css -> assets/tailwind.css) then vendor
npm run watch:css      # Tailwind in watch mode while editing Liquid
npm run vendor         # re-copy Alpine / Splide into assets/ after a dependency upgrade
npm run check          # shopify theme check
npm run dev            # shopify theme dev
node scripts/verify.mjs [--only <scenario>] [--verbose]   # Playwright checks against the dev server
```

### G.2 Rules

- Build outputs in `assets/` (`tailwind.css`, `alpine.js`, `splide.js`, `splide-core.css`) are
  committed; Shopify serves them directly. Rebuild and commit them in the same change as the
  Liquid or source edit that needs them.
- Libraries are vendored by `scripts/vendor.mjs` with a version banner; never hand-edit a vendored
  file. Upgrade through `package.json`, then `npm run vendor`, then re-run verification.
- No bundler and no transpilation. Modules are native ES modules resolved through the import map in
  `snippets/scripts.liquid` (and the separate map in `templates/gift_card.liquid`). Every
  `@theme/*` import needs an entry in both maps when the module can run on the gift card page.
- Load a module once, globally, only when its markup can be injected by section rendering
  (`alpine-components.js`, `slider.js`). Otherwise load it from the section or block that renders
  the markup.
- Never run in-place editors (`sed -i`, `perl -i`) inside theme directories while
  `shopify theme dev` is running; their temporary files break the upload watcher. Write files
  whole or use an editor.
- Keep `.shopifyignore` and `.gitignore` current when adding tooling output.

---

## H. Accessibility and performance

The `AGENTS.md` sections "Accessibility" and "Performance" apply unchanged. Project additions:

- Every control rendered by the new snippets has an accessible name from a locale key. Decorative
  SVGs are `aria-hidden="true"`.
- Each slider has exactly one live region (Splide's) for position announcements; do not add
  another.
- Keyboard: arrows and dots are buttons; thumbnails are tabs; `Escape` closes accordions used as
  menus, dropdowns and the header drawer and returns focus to the trigger.
- Reduced motion: sliders use `reducedMotion` settings; Alpine animations (show more) run through
  the Web Animations API and should be skipped or shortened when
  `prefers-reduced-motion: reduce` matches (open item, see Remaining Work in the inventory).
- Images: `width`/`height` plus `widths`/`sizes` that match the rendered slide or card width.
  Lazy-load everything below the fold.
- Pre-init layout: slides get a width from `per_page`/`per_page_mobile` before Splide mounts;
  `x-cloak` only for content that is wrong before Alpine binds.
- Budget: `tailwind.css` is about 14 KB; `splide.js` is 97 KB unminified (CDN gzips it). Report
  any asset growth above those sizes in the inventory.

---

## I. Development workflow

1. **Read first.** Read every file involved, including the consumers of a snippet or event, before
   editing. Check `docs/MIGRATION_INVENTORY.md` for the component's status and known debt.
2. **Branch.** Work on the feature branch the user names (currently `phase-1`); never commit on
   `main` directly.
3. **Change.** Follow sections A–H. Extend the owning snippet, block or module rather than adding
   a parallel one. New merchant choices go in section/block schemas with locale labels.
4. **Build.** `npm run build` whenever Liquid class usage or `src/tailwind.css` changed.
5. **Check.** `shopify theme check` must report 0 errors; new warnings must be explained.
   `node --check` every edited JS module.
6. **Verify.** Start `npm run dev`, then `node scripts/verify.mjs` (desktop and mobile). Add a
   scenario when a new interactive component ships. For interactions the harness does not drive
   (editor, real touch devices), test manually and record what was done.
7. **Document.** Update `docs/MIGRATION_INVENTORY.md` (status, custom CSS kept, debt) and, for
   test rounds, `docs/TEST_REPORT.md`.
8. **Review.** Self-review the `git diff` against this file. Low-risk standard corrections that
   preserve behaviour may proceed without approval; anything that changes business logic, removes
   a feature, setting, translation, event handler or app integration, or fixes a pre-existing bug
   is proposed first and waits for the user's decision.
9. **Commit.** Only when asked. One stage per commit, build outputs included.

---

## Change log

| Date | Change |
|---|---|
| 2026-10-12 | Initial version written from the repository state at commit `e206717` on `phase-1`. External best-practices document not available; sections marked "Reconcile" are pending. |
