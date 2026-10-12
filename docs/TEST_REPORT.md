# Horizon modernization: test report

Date: 2026-10-11 · Branch: `phase-1` (uncommitted) · Store: dev-by-vince.myshopify.com, development theme 152395579569 · Dev server: `shopify theme dev` on port 9292

This report lists every check that was run during the final re-test, how it was run, and the result. Companion document: [MIGRATION_INVENTORY.md](MIGRATION_INVENTORY.md) (what changed and why).

## 1. Tools and methods

| Method | What it covers | How to repeat |
|---|---|---|
| Theme Check (Shopify CLI 4.9.3) | Liquid syntax, schema JSON, translation keys, scoped CSS, orphaned snippets | `shopify theme check` |
| Node syntax checks | Every edited or new JS module parses | `node --check assets/<file>.js` |
| Build | Tailwind compiles from `src/tailwind.css`; Alpine and Splide vendored into `assets/` | `npm run build` |
| Playwright harness (headless Chromium) | 10 scenarios, each at a 1400px desktop viewport and an iPhone 13 viewport (390px, touch); records console errors, failed theme assets and per-scenario assertions; screenshots in the output folder | `node scripts/verify.mjs [--only <scenario>] [--verbose]` |
| Claude in Chrome (real Chrome, desktop only) | Interactive flows the harness does not drive: cart, quick add, zoom, variant change, thumbnails, keyboard; console capture after each flow | manual |
| Computed-style snapshot | Tailwind conversions compared property by property (40 CSS properties per element, desktop and mobile) before and after | scratchpad scripts `style-snapshot.mjs` + `snap-diff.mjs` (can be moved into `scripts/`) |
| Injected-markup checks | Alpine components whose markup is not present in this store's data (no policies, one market, no quantity breaks, one announcement) are mounted into the live page with their exact markup and exercised | Chrome JavaScript tool |

Two configurations were tested:

- **Configuration A (temporary):** the home template with the product list switched to the carousel layout plus temporary Slideshow (3 slides, dots, autoplay), Collection links (spotlight) and Carousel (5 card blocks, fill height) sections; the product template with the media gallery in carousel presentation, thumbnails on the left, dots on mobile. This exercises every slider code path.
- **Configuration B (committed):** the templates exactly as committed. Scenarios whose section is absent report "skipped" and pass.

Both template files were restored to the committed state afterwards (`git status` shows them clean). The cart line added during testing was removed (`/cart/clear.js`).

## 2. Static checks

| Check | Result | Notes |
|---|---|---|
| `shopify theme check` | **Pass**: 306 files, 0 errors, 31 warnings | 28 warnings are pre-existing (baseline before any change: 28). The 3 new ones are informational `ValidScopedCSSClass` notices of the same kind as the baseline (`sections/slideshow.liquid: disable-section-top-offset`, `snippets/predictive-search-resource-carousel.liquid: predictive-search-results__resource-header, __title`, `snippets/slider-thumbnails.liquid: icon`). No orphaned snippets. |
| `node --check` on `slider.js`, `alpine-components.js`, `component.js`, `theme-editor.js`, `product-card.js`, `zoom-dialog.js`, `localization.js`, `scripts/verify.mjs`, `scripts/vendor.mjs` | **Pass** | |
| `npm run build` | **Pass** | Tailwind 4.3.3 built `assets/tailwind.css` (13.8 KB); Alpine 3.17.4 and Splide 4.1.4 re-vendored |
| Import-map resolution | **Pass after fix** | Found during this re-test: the gift card template's own import map lacked `@theme/focus`, which `alpine-components.js` now imports, so Alpine did not start on the gift card page. Fixed in `templates/gift_card.liquid`; re-verified (Alpine bound, copy works). |

## 3. Playwright harness results

### Configuration A (temporary sections present)

| Scenario | Viewport | Result | Assertions passed |
|---|---|---|---|
| home | desktop, mobile | Pass | page loads, no theme console errors, no failed theme assets |
| product | desktop, mobile | Pass | same |
| cart | desktop, mobile | Pass | same |
| search | desktop, mobile | Pass | same |
| resource-carousel | desktop | Pass | sliderPresent, ready, hasSlides, nestedGalleriesDisabled, desktopPerPageApplied, movesForward (arrow) |
| resource-carousel | mobile | Pass | sliderPresent, ready, hasSlides, nestedGalleriesDisabled, mobileFixedWidthApplied, movesForward (touch swipe) |
| slideshow | desktop | Pass | present, ready, loops (clones), activeContentVisible, noHorizontalOverflow, dotsMatchSlides, liveRegionForAutoplay, slideWidthMode, autoplayAdvances, togglePauses, dotSelectsSlide, arrowAdvances |
| slideshow | mobile | Pass | same set with swipeAdvances (touch) |
| product-gallery | desktop | Pass | galleryPresent, sliderBound, sliderMounted, paginationMatchesSlides, firstThumbnailSelected, thumbnailSelectsSlide |
| product-gallery | mobile | Pass | galleryPresent, sliderBound, sliderMounted, paginationMatchesSlides, swipeAdvances |
| predictive-search | desktop, mobile | Pass | dialogOpen, resourceSlidersPresent, resourceSlidersReady (Collections and Pages carousels arrive through the Section Rendering API) |
| header-drawer | desktop | Pass | drawer not rendered at desktop (expected) |
| header-drawer | mobile | Pass | drawerPresent, drawerBound, opens, summaryAriaExpanded, escapeCloses (no nested menu in this store, so submenu checks did not run) |
| collection-filters | desktop | Pass | alpineStarted, accordionsBound, opensOnClick, closesOnEscape, escapeRefocusesSummary, closesOnOutsideClick |
| collection-filters | mobile | Pass | alpineStarted, accordionsBound, drawerVerticalAccordionsOpen, drawerAccordionToggles, drawerAccordionReopens |

Total: 20 runs, 20 passed.

### Configuration B (committed templates)

| Scenario | Result | Notes |
|---|---|---|
| home, product, cart, search | Pass (desktop and mobile) | |
| resource-carousel | Pass, skipped | no carousel-layout list in the committed templates |
| slideshow | Pass, skipped | no Slideshow section in the committed templates |
| product-gallery | Pass (desktop and mobile) | grid presentation: desktop shows the grid with the slider destroyed; mobile slider with dots and touch swipe |
| predictive-search, header-drawer, collection-filters | Pass (desktop and mobile) | |

Total: 20 runs, 20 passed (4 skipped by design).

Console errors ignored by the harness as third-party: Shopify's account web component menu lookup, `shop.app` framing blocked by CSP, platform `origin_trials` script blocked over plain HTTP in headless, Storefront API 400 from a platform call. None originates from theme code.

## 4. Chrome interactive checks (desktop)

| Area | What was done | Expected | Result |
|---|---|---|---|
| Home: product carousel (configuration A) | Inspected Splide instance | 8 slides, 4 per page, next-slide peek, gutters, nested card galleries disabled | Pass |
| Home: Collection links spotlight | `select(2)` from the links component | image slider moves to index 2, `aria-current` on link 3, loop type | Pass |
| Home: Carousel section (5 cards, fill height) | next arrow click | 3 per page, 370px cards, moves to index 2, link overlay inside card | Pass |
| Announcement bar | Live bar inspected; 2- and 3-slide bars injected with autoplay 1s and arrows from `slider-arrows` | Alpine bound; autoplay rotates; next and previous arrows move | Pass |
| Product page: carousel gallery, left thumbnails | thumbnail 3 click; variant change; stepped mouse drag; zoom from slide; Escape | slide 2 active and thumbnail synced; gallery re-rendered with a fresh slider; drag moves slides without opening zoom; zoom opens and closes | Pass |
| Product page: grid gallery (configuration B) | inspected; zoom from grid; variant change | slider hidden and destroyed on desktop, 15 grid items; zoom opens with 15 media and closes; new gallery mounts | Pass |
| Add to cart (quick add on a recommendation) | clicked "Add" | cart count 1, header bubble "1", cart drawer available | Pass |
| Cart drawer | open button; Escape | drawer opens with the line item, discount accordion bound to Alpine; closes | Pass |
| Quick add modal (collection card) | opened | gallery renders as a stacked list (slider intentionally not initialised in the modal), variant picker present, accordions bound; closes on Escape | Pass |
| Cart page | quantity plus; discount accordion toggle | item count 1 to 2; accordion toggles | Pass |
| Collection grid card gallery | hover first card; leave | hover preview moves to slide 2 instantly and returns; 10 media per card with 5 variant-only slides hidden and excluded from Splide | Pass |
| Collection filters | open Availability; Escape; outside click; apply "In stock"; Sort dropdown; choose "Price, low to high" | opens; closes and refocuses summary; closes; section re-renders with bindings intact; sort applied and dropdown closed | Pass |
| Predictive search | opened from header icon, typed "a" | Products grid plus Collections and Pages carousels initialised (27.5% cards) | Pass |
| Gift card page | copy button with clipboard stubbed | Alpine bound, code copied, success message shown, QR rendered | Pass after the import-map fix |
| Injected Alpine components | show more, anchored popover (hover), localization dropdown (toggle, outside click), character counter, volume pricing toggle | expand reveals hidden items with `aria-expanded`; popover opens on hover and closes on leave; panel opens and closes; counter "4/10"; expanded class toggled | Pass |
| Console after every flow | `read_console_messages` with error filter | no theme errors | Pass |

## 5. Tailwind conversions: computed-style parity

| Component | Elements compared | Result |
|---|---|---|
| Card block (`blocks/_card.liquid`) | `.card`, `.card__content`, `.card__inner`, `.card__media-wrapper`, `.card__link` | no differences (desktop and mobile) |
| Slide block (`blocks/_slide.liquid`) | `.slide__image-container`, `.slide__image`, `.slide__content` | no differences |
| Announcement bar (`sections/header-announcements.liquid`, `blocks/_announcement.liquid`) | `.announcement-bar__slider`, `__slides`, `__slide`, `__link` | no differences |

A first pass had shown 21 differences caused by Horizon's own `.flex` (adds a gap) and `.grid` (14-column page layout) classes sharing names with Tailwind utilities. The page layout class was renamed to `.layout-grid` (base.css, collection page, search results) and the unused `.flex` helper removed; the collection wrapper was then verified as a flex column at 390px and a 14-column grid at 1400px.

## 6. Not tested, and why

| Gap | Reason | How to close it |
|---|---|---|
| Theme editor: block select on slides, cards and announcements; section re-render; overlay state restore after an editor refresh | The Claude in Chrome extension has no permission for the Shopify admin domain | Allow the admin site in the extension, or check manually: select a slide block (slider moves, autoplay pauses), change a slider setting (no duplicate slider after re-render), refresh with filters drawer or header drawer open (re-opens) |
| Nested drawer submenus and vertical header menu accordion | The store's menu has no nested links; `drawer_accordion` is off | Add a menu with child links in the dev store and re-run `header-drawer` |
| Volume pricing, footer policy popover, localization dropdown in situ | No quantity price breaks, no shop policies, one market in the dev store | Covered with injected markup only; configure the store data to see them in place |
| Right-thumbnail position, `hint` mobile style, counter style on the product gallery | Only left thumbnails + dots were exercised in situ | Switch the block settings in the editor and re-run `product-gallery` |
| Real touch devices and Safari | Headless Chromium with touch emulation only | Open the preview URL on a phone |
| Non-English slider labels | Machine-authored strings in 30 locale files | Native review |

## 7. Environment notes

- The dev server must be running (`npm run dev` / `shopify theme dev`) before `node scripts/verify.mjs`.
- Playwright is a dev dependency (`npm install` once, then `npx playwright install chromium`).
- Scenario screenshots land in the `--out` folder (default `verify-output/`, ignored by git and by the Shopify CLI).
