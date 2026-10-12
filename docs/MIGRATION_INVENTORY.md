# Horizon modernization: migration inventory

Tracks the Alpine.js, Tailwind CSS and Splide.js migration of this Horizon 3.5.1 theme.
Update this file whenever a component changes status. Paths are relative to the theme root.

Status legend: `not started` · `in progress` · `converted` · `tested` · `blocked` · `retained`

## Stage log

| Stage | Scope | Status | Notes |
|---|---|---|---|
| 1. Foundation | npm project, Tailwind v4 build, Alpine + Splide vendored, loaders wired | done, Theme Check clean, verified in Chrome and Playwright | |
| 2. Shared architecture | `assets/slider.js`, `assets/alpine-components.js`, token mapping in `src/tailwind.css`, `scripts/verify.mjs` harness | done (slider snippet lands with first consumer) | |
| 3. Component migration | Alpine waves, then sliders, Tailwind per component | Alpine waves 1-2 done (section A); all seven `slideshow-component` consumers moved to Splide (section D); Tailwind conversion in progress | |
| 4. Legacy cleanup | remove replaced JS/CSS | done for JS and slideshow snippets | Deleted: `assets/accordion-custom.js`, `auto-close-details.js`, `show-more.js`, `announcement-bar.js`, `anchored-popover.js`, `floating-panel.js`, `volume-pricing.js`, `product-custom-property.js`, `copy-to-clipboard.js`, `header-drawer.js`, `slideshow.js`; `snippets/slideshow.liquid`, `slideshow-slide.liquid`, `slideshow-styles.liquid`, `slideshow-controls.liquid`, `slideshow-arrows.liquid`, `slideshow-arrow.liquid`. Dead slideshow handlers removed from `theme-editor.js`; dead arrow animation removed from `base.css`; `header-announcements.liquid` and `_collection-info.liquid` now render `slider-arrows`. Theme Check: 0 errors, no orphaned snippets; full Playwright suite passes |
| 5. Final verification | full checks, final report | not started | |

## Build, run and verify

```
npm install          # once
npm run build        # Tailwind CSS -> assets/tailwind.css, then vendor libraries into assets/
npm run watch:css    # Tailwind in watch mode while editing Liquid
npm run vendor       # re-copy Alpine / Splide after a dependency upgrade
npm run check        # shopify theme check
npm run dev          # shopify theme dev
node scripts/verify.mjs [--only <scenario>] [--verbose]   # headless desktop + mobile checks against the dev server
```

Committed build outputs (Shopify serves them directly): `assets/tailwind.css`, `assets/alpine.js`,
`assets/splide.js`, `assets/splide-core.css`. `.shopifyignore` keeps `src/`, `scripts/`, `docs/`,
`node_modules/`, `verify-output/` and the package files off the store. Playwright is a dev dependency
used only by `scripts/verify.mjs`.

## Foundation decisions (verified in source)

- **No bundler.** Libraries are copied from `node_modules` by `scripts/vendor.mjs`; modules resolve through the import map in `snippets/scripts.liquid` (`@theme/alpine`, `@theme/splide`, `@theme/slider`, `@theme/alpine-components`). `templates/gift_card.liquid` has its own import map and also loads Alpine.
- **Tailwind v4.3.3**, CSS-first config in `src/tailwind.css`. Preflight is not imported (Horizon owns its reset in `assets/base.css`). Utilities are emitted unlayered so they beat `base.css` by source order. Section `{% stylesheet %}` CSS is injected by Shopify after `tailwind.css`, so legacy component rules still win until they are removed.
- **Tailwind palette removed**; colours, spacing, radii, fonts, motion, z-index and icon sizes map to the theme's own custom properties (`snippets/theme-styles-variables.liquid`, `snippets/color-schemes.liquid`) through `@theme inline reference`, so merchant settings and colour schemes keep working. Breakpoints: `md` 750px (theme canonical), `lg` 990px, `xl` 1200px, `2xl` 1400px. Use `max-md:` for mobile-only rules.
- **Blocked utility:** `underline` (`@source not inline('underline')`), because `blocks/email-signup.liquid` emits the merchant setting value `underline` as a class.
- **Alpine 3.17.4** starts from `assets/alpine-components.js` (loaded as a low-priority module from `snippets/scripts.liquid`). Register `Alpine.data` components there. `[x-cloak]` is defined in `src/tailwind.css`.
- **Handler boundary rule.** `component.js` `getClosestComponent()` treats any element whose tag ends in `-component` as the target of `on:*="/method"` handlers and silently drops the handler when that element is not a `Component` instance. An element converted to Alpine must therefore either keep a tag that does not end in `-component` (e.g. `show-more-disclosure`), or every `on:*` handler inside it must have a nearer real `Component` or an explicit `#id/` selector (true for `floating-panel-component`, `anchored-popover-component`, `dropdown-localization-component`, `announcement-bar-component`).
- **Splide 4.1.4** is initialised only by `assets/slider.js` (`<slider-component>`). Config comes from `data-slider` (desktop/base) and `data-slider-mobile` (merged into `breakpoints[749]`). Shared defaults, reduced motion, keyboard, theme-editor block select/deselect and `slideshow:select` event emission live in that module. Accessibility labels come from `Theme.translations.slider_*` (locale keys `accessibility.slider_*`, added to all 31 storefront locale files).

## A. Converted to Alpine.js

All rows below were verified in Chrome (Claude in Chrome, desktop) and, where listed, in Playwright at 1400px and iPhone 13 viewports. The legacy JS file is left on disk until Stage 4 but is no longer loaded.

| Component | Files | Previous implementation | Alpine implementation | Complete | Tested | Notes |
|---|---|---|---|---|---|---|
| Accordion | `snippets/accordion-custom-component.liquid`; consumers: `blocks/_accordion-row.liquid`, `blocks/menu.liquid`, `snippets/cart-summary.liquid`, `snippets/header-drawer.liquid`, `snippets/list-filter.liquid`, `snippets/price-filter.liquid`, `snippets/sorting.liquid` | `assets/accordion-custom.js` (HTMLElement over native `details`) | `Alpine.data('accordion')`: per-breakpoint default open state, disabled breakpoints, Escape close with summary refocus; delegated click on the wrapper | yes | collection filters desktop + mobile drawer (Playwright + Chrome); filter apply then re-render | Tag `accordion-custom` kept (CSS in 9 files, `header-drawer.js`). `open-by-default-*` attributes kept for CSS in `cart-summary.liquid` |
| Auto-close details | `snippets/list-filter.liquid`, `snippets/price-filter.liquid`, `snippets/sorting.liquid` | `assets/auto-close-details.js` (global document click listener) | `Alpine.data('autoCloseDetails')` with `x-on:click.outside` on each `<details>` | yes | outside click closes Availability filter and Sort dropdown (Chrome) | Breakpoint now from `isMobileBreakpoint()` (matchMedia 750px) instead of `innerWidth < 750` |
| Show more | `snippets/list-filter.liquid` | `assets/show-more.js` (Component, WAAPI height animation) | `Alpine.data('showMore')`, tag renamed `show-more-component` → `show-more-disclosure` (see boundary rule) | yes | injected markup in Chrome: expand/collapse, labels, `aria-expanded`, hidden items | No filter in the dev store has enough values to render it in situ |
| Announcement bar | `sections/header-announcements.liquid` | `assets/announcement-bar.js` (Component, setInterval fade) | `Alpine.data('announcementBar')`: autoplay, hover suspend, visibility change, arrows via delegated click on the shared `slideshow-arrows` buttons, editor block select/deselect | yes | injected 3-slide markup in Chrome: autoplay rotation, next/previous | Improvement: block select in the editor now shows the selected announcement (legacy ignored it). Store currently has one block (no autoplay) |
| Anchored popover | `blocks/footer-policy-list.liquid`, `snippets/volume-pricing-info.liquid` | `assets/anchored-popover.js` | `Alpine.data('anchoredPopover')`: hover open/close with delay, close on resize, CSS anchor fallback | yes | injected markup in Chrome: hover opens after delay, leave closes | Not rendered in dev store (no shop policies, no quantity price breaks) |
| Floating panel | `snippets/list-filter.liquid`, `snippets/price-filter.liquid`, `snippets/sorting.liquid` | `assets/floating-panel.js` | `Alpine.data('floatingPanel')`: viewport-fit positioning, resize handling | yes | collection filters and Sort (Chrome): panels bound, sort applied and dropdown closed | Tag kept: `morph.js` preserves its inline style and `theme-editor.js` persists its state by tag. Legacy `closeOnResize` only honoured the literal value `"true"`, callers pass a bare attribute; behaviour preserved (off) and logged in section F |
| Localization dropdown and drawer toggles | `sections/header.liquid`, `snippets/header-drawer.liquid` | `DropdownLocalizationComponent`, `DrawerLocalizationComponent` in `assets/localization.js` (removed from that file) | `Alpine.data('localizationDropdown')`, `Alpine.data('localizationDrawer')`; `showPanel()` exposed on the element for `theme-editor.js` restore | yes | injected markup in Chrome: toggle, Escape with refocus, outside click, `showPanel()` | `localization-form-component` (search, keyboard, native submit) retained. Dev store has one market, so not rendered in situ |
| Volume pricing toggle | `blocks/buy-buttons.liquid` | `assets/volume-pricing.js` | `Alpine.data('volumePricing')` (class toggle) | yes | static review only: dev store has no quantity price breaks | State kept as a class on purpose (variant morph resets it, as before) |
| Custom property character counter | `blocks/product-custom-property.liquid` | `assets/product-custom-property.js` | `Alpine.data('characterCounter')` on the inner wrapper (block root tag is schema-generated) | yes | injected markup in Chrome | |
| Copy to clipboard (gift card) | `templates/gift_card.liquid` | `assets/copy-to-clipboard.js` | `Alpine.data('copyToClipboard')`; Alpine added to the gift card import map | yes | gift card preview page in Chrome: copies code, success message shown | |

## B. Partially converted

| Component | Now Alpine | Still original | Why incomplete | Remaining |
|---|---|---|---|---|
| _none yet_ | | | | |

## C. Not converted to Alpine.js

| Component | Files | Current implementation | Plan | Risk notes |
|---|---|---|---|---|
| header-drawer, header-menu, sticky header state | `assets/header-drawer.js`, `assets/header-menu.js`, `assets/header.js` | Component | Wave 2 (next) | Header is hydrated by `section-hydration`; morph can reset Alpine-managed attributes |
| hotspots, popup-link / filters-drawer dialog shells, sticky add-to-cart visibility | respective assets | Component / DialogComponent | Wave 2 | `DialogComponent` stays as base for cart drawer and quick add (user decision) |
| Deferred media / product model (video play-pause) | `assets/media.js`, `snippets/video.liquid` | `DeferredMedia` Component, base class of `ProductModel` (Shopify model viewer) | **Retained** | Coupled to `media:started-playing`, `dialog:close`, media gallery and zoom dialog; subclassing semantics would have to be rebuilt in Alpine for no behavioural gain |
| product-form, add-to-cart, cart-items, cart-drawer, cart-icon, quick-add, variant-picker, swatches, facets (7 components), paginated-list / results-list / blog-posts-list, predictive-search, product-recommendations, local-pickup, cart-note save, cart-discount, quick-order-list, price / inventory / sku morphing, header hydration, localization form submit | see audit | Network / Section Rendering / cart flow | **Retained intentionally** | Rewriting would duplicate cart and section-rendering logic (project rule 7) |

## D. Splide.js migration

| Slider | Files | Mechanism today | Status | Notes |
|---|---|---|---|---|
| resource-list carousel (collection-list, product-list, featured-blog-posts, main-collection-list, product-recommendations section + block) | `snippets/resource-list-carousel.liquid` → `snippets/slider.liquid` | Splide via `slider-component` | **tested** (Chrome desktop; Playwright desktop + mobile: per-page widths, mobile card-size clamp, peek, gutters, arrows, keyboard, swipe, nested card galleries disabled, `slideshow:select` payload) | Desktop: `perPage` = columns, right padding = gutter + `--peek-next-slide-size`; mobile: `fixedWidth` clamp(150px, mobile_card_size, 450px). Tested with the home product list switched to carousel |
| Carousel section | `sections/carousel.liquid`, `blocks/_carousel-content.liquid`, `blocks/_card.liquid` | Splide via `slider-component` (`_card` roots are `splide__slide`) | **converted**, editor test pending | `perPage` columns / mobile_columns, gap from `--carousel-gap`, fill/position via list alignment. Not looped (legacy `infinite: false`) |
| Slideshow section | `sections/slideshow.liquid`, `blocks/_slide.liquid`, `snippets/slider-controls.liquid` | Splide via `slider-component` with dots / counter / play-pause controls | **tested** (Chrome + Playwright desktop and mobile: loop with clones, dots follow the active slide, autoplay interval, toggle pauses, dot/arrow/swipe navigation, with-hints widths and gutters, content-below-media grid, counter updates, no horizontal overflow) | Loops on the storefront (approved); rewinds in the theme editor so clones never carry editor block attributes. The scroll-driven content reveal became an active-slide fade (`.is-active .slide__content`). Tested with a temporary 3-slide section on the home template |
| Predictive search resource carousel | `snippets/predictive-search-resource-carousel.liquid`, `snippets/predictive-search-styles.liquid` | Splide via `slider-component`, arrows in the header | **tested** (Chrome: Collections and Pages carousels render through the Section Rendering API, 27.5% cards, no errors) | `slider.js` is loaded globally from `snippets/scripts.liquid` so injected markup initialises |
| Collection links spotlight | `sections/collection-links.liquid` (`assets/collection-links.js` unchanged) | Splide via `slider-component`, `ref="slideshow"` | **tested** (Chrome: four looping image slides, `select()` from the link list moves the slider and `aria-current` follows, no errors) | `collection-links.js` keeps calling `select()` and listening to `slideshow:select`; tested with a temporary section on the home template |
| Product media gallery (+ featured product) | `snippets/product-media-gallery-content.liquid`, `snippets/product-media-gallery-content-styles.liquid`, `snippets/slider-thumbnails.liquid`, `snippets/quick-add-modal.liquid`, `snippets/quick-add-modal-styles.liquid` (`assets/media-gallery.js`, `assets/zoom-dialog.js` unchanged) | Splide via `slider-component`: dots / counter via `slider-controls`, thumbnails via `slider-thumbnails` (`data-slider-go` buttons), grid mode destroys the slider at 750px+ (`destroy: true` with a mobile override), hint mode uses `fixedWidth: 90%` | **tested** (grid presentation: Chrome + Playwright desktop shows the grid with the slider destroyed, mobile slider with dots and touch swipe, variant change re-renders, zoom opens and closes; carousel presentation with left thumbnails: sticky thumbnail column, thumbnail click and `aria-selected` sync, arrows always visible, stepped mouse drag, zoom from a slide) | Rewind instead of loop (clones would duplicate videos and 3D models). The quick-add modal marks its content `data-slider-disable-nested` so the gallery renders as a plain list there, as before. Fix in `assets/component.js`: delegated `on:click` handlers now ignore the click that ends a slider drag (`slider-component[data-slider-dragged]`), otherwise a drag over a zoomable slide opened the zoom dialog |
| Product-card gallery | `snippets/card-gallery.liquid`, `snippets/product-card.liquid`, `snippets/product-grid.liquid`, `snippets/editorial-product-grid.liquid` (`assets/product-card.js`: only the view-transition active-image lookup changed) | Splide via `slider-component`, `ref="slideshow"`; `product-card.js` keeps using `select({ id })`, `next()`, `previous()`, `initialSlide`, `refs.slides` and the `hidden` attribute on variant-image slides | **tested** (Chrome collection grid: 10 media per card with 5 variant-only slides hidden and excluded from Splide, hover preview advances and reverts; home carousel: nested card galleries disabled with no arrows or drag; Playwright collection and home pass) | Hidden variant slides drop the `splide__slide` class and are re-added with `refresh()` when revealed (`slider.js` `#syncHiddenSlides`). Rewind instead of loop. `disabled="true"` from the `product_card_carousel` setting keeps blocking drag, arrows and programmatic selection, as before |
| Announcement bar | `assets/announcement-bar.js` → Alpine | opacity fade | **retained as fade** (user decision: non-track mechanisms stay) | Converted to Alpine, see section A |
| Layered slideshow | `assets/layered-slideshow.js` | ARIA tab panels | **retained** | |
| Marquee | `assets/marquee.js` | CSS keyframes | **retained** | |
| Comparison slider | `assets/comparison-slider.js` | range input | **retained** (not a carousel) | |

## E. Tailwind CSS migration

Utilities map to the theme's own tokens (see "Foundation decisions"), so converted markup still follows merchant settings and colour schemes.

**Converted to utilities (verified: identical computed styles before and after on desktop and mobile, 40 properties per element):**

| Component | Files | Now utilities | Custom CSS kept and why |
|---|---|---|---|
| Slider shell, arrows, controls, thumbnails (new) | `snippets/slider.liquid`, `slider-arrows.liquid`, `slider-controls.liquid`, `slider-thumbnails.liquid` | Layout, positioning, hover reveal, blend modes, sizes, pagination wrapper | Pre-init slide width fallback (Splide classes), Splide-generated dot buttons, thumbnail column sticky rules and selected outline, counter colours |
| Resource-list carousel | `snippets/resource-list-carousel.liquid` | Everything (container, gutters, track hover-clip padding) | none |
| Carousel section content | `blocks/_carousel-content.liquid` | List alignment for fill / position | one fill-height rule on cards |
| Card block | `blocks/_card.liquid` | Root, content, inner, media wrapper and link layout | Merchant border settings, `100cqw` min-height, video z-index, `.card__link ~` pointer-events logic |
| Slide block | `blocks/_slide.liquid` | Image container, media fitting, content wrapper | Active-slide content fade (state), rounded corners from the merchant setting |
| Announcement bar | `sections/header-announcements.liquid`, `blocks/_announcement.liquid` | Slider row, slides wrapper width and centring, link overlay | Named grid area for the cross-fade stack, slide fade transition (state), arrow size from `--button-size` |
| Predictive-search carousel | `snippets/predictive-search-resource-carousel.liquid`, `snippets/predictive-search-styles.liquid` | Padding and header arrows | Entry animations shared with the other result lists |

**Utility name collisions resolved:** Horizon defined its own `.flex` (display + gap) and `.grid` (14-column page layout, flex column on mobile) in `base.css`. Tailwind's `grid` utility had been overriding the mobile layout of the collection and search wrappers since the foundation stage. The page layout class is now `.layout-grid` (`base.css`, `sections/main-collection.liquid`, `sections/search-results.liquid`), and the unused `.flex` helper was removed. The `underline` utility stays blocked (merchant setting value in `blocks/email-signup.liquid`).

**Still on legacy CSS:** `assets/base.css` (about 4,200 lines) and roughly 120 `{% stylesheet %}` blocks. Recommended order for further conversion: footer and header rows, product grid, cart, filters, product information, then the remaining blocks; each with the computed-style snapshot method used above (`scratchpad` scripts can be moved into `scripts/`).

**Justified custom CSS (expected to remain):** colour-scheme generation (`snippets/color-schemes.liquid`), token emission (`snippets/theme-styles-variables.liquid`), view transitions, keyframes, `:has()` state selectors, container queries, Liquid-computed `{% style %}` blocks, `@starting-style` accordion animation, third-party overrides (model viewer, payment buttons), Splide-generated elements.

**Stylesheets that remain necessary:** `assets/base.css` (foundations), `assets/overflow-list.css` (shadow DOM), `assets/template-giftcard.css`, `assets/splide-core.css`, `assets/tailwind.css` (built).

## F. Remaining technical debt and decisions

- **Verification coverage:** Chrome (desktop only; the extension window cannot be resized and the storefront refuses framing) plus Playwright at desktop and iPhone 13 viewports via `scripts/verify.mjs` (10 scenarios, 20 runs, all passing at the end of this stage). Theme editor interactions are **not yet exercised**: the Claude in Chrome extension has no permission for `admin.shopify.com` / the store admin, so block select and section re-render inside the editor need a manual pass or that site permission. What to check in the editor: selecting a `_slide`, `_card` or `_announcement` block moves the matching slider, autoplay pauses while a slide is selected, filters and header drawer re-open after an editor refresh, and no duplicate sliders after a section re-render.
- **Temporary test data used during verification (all reverted):** the home template was switched to the carousel product list and given temporary Slideshow, Collection links and Carousel sections; the product template was switched to carousel presentation with thumbnails. The sections themselves are not in any template of this store, so merchants will see them only after adding them in the editor.
- **Pre-existing bugs found (user to decide, ask before fixing):** `sections` appended repeatedly in `assets/product-form.js:387-392`; marquee resize reads an undefined property (`assets/marquee.js:157`); announcement bar never resumed after a tab switch (`assets/announcement-bar.js:86,125`; the Alpine version uses suspend/resume so this no longer occurs); `h1`-`h6` colour fallback references undefined `--font-hN-color` (`assets/base.css:753`); `local-pickup.js` and `results-list.js` skip `super.disconnectedCallback()`; dead `on:click` handlers in `snippets/search-modal.liquid:26-27`; `'dropdown'` vs `'dropdowns'` in `snippets/variant-main-picker.liquid:44`; keyboard discount removal blocked by a `MouseEvent` check in `assets/cart-discount.js`; floating panel `data-close-on-resize` never took effect because the JS compared against the string `"true"` while callers pass a bare attribute.
- `npm audit` reports a build-time-only advisory (braces, via `@tailwindcss/cli` watcher). Not shipped to the storefront; the suggested fix downgrades the CLI.
- `assets/splide.js` is the unminified ESM build (97 KB raw, gzipped by the CDN). Minifying would need a build tool.
- Non-default locale strings for the new `accessibility.slider_*` keys were machine-authored; native review recommended.
- `AGENTS.md` still says "keep the runtime dependency set unchanged"; it should be amended to reflect the approved Alpine / Tailwind / Splide architecture.
