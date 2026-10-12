/**
 * Storefront verification harness (development only, not uploaded to Shopify).
 *
 * Opens pages on the local `shopify theme dev` server in headless Chromium at a
 * desktop and a mobile viewport, records console errors, optionally runs an
 * interaction scenario, and saves screenshots.
 *
 * Usage:
 *   node scripts/verify.mjs [--base http://127.0.0.1:9292] [--out <dir>] [--only <scenario>]
 *
 * Add scenarios to `SCENARIOS` below. Each scenario receives a Playwright page
 * and the viewport name and returns an object of assertions ({ name: boolean }).
 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg, i, all) => (arg.startsWith('--') ? [arg.slice(2), all[i + 1] ?? true] : null))
    .filter(Boolean)
);
const BASE = (args.base ?? 'http://127.0.0.1:9292').replace(/\/$/, '');
const OUT = resolve(args.out ?? 'verify-output');
const ONLY = args.only;

const VIEWPORTS = {
  desktop: { viewport: { width: 1400, height: 900 } },
  mobile: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
};

/** Matches this theme's own asset URLs (not Shopify platform scripts on cdn.shopify.com/shopifycloud). */
const THEME_ASSET = /\/cdn\/shop\/t\/\d+\/assets\//;

/** Console errors that come from Shopify platform scripts, not the theme. */
// Third-party / platform console noise that is not produced by theme code.
const IGNORED_ERRORS = [
  /\[shopify-account\]/,
  /web-pixels/,
  /cdn\.shopify\.com\/shopifycloud/,
  /shopifysvc\.com/, // Shopify platform metrics (OTLP) endpoint blocked by CORS on the local dev server
];

/**
 * Swipes a slider from right to left. Mobile uses real touch events through the DevTools
 * protocol (what phones send); desktop uses a mouse drag.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} locator
 * @param {string} viewport
 */
async function swipe(page, locator, viewport) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('swipe target has no bounding box');
  const y = box.y + box.height / 2;
  if (viewport === 'mobile') {
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.8, y }] });
    for (let i = 1; i <= 10; i++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (0.8 - 0.06 * i), y }] });
      await page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
    return;
  }
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 12 });
  await page.mouse.up();
}

/** Resolved at runtime: first product handle from the storefront JSON endpoint. */
const SCENARIO_PRODUCT_PATH = async () => {
  const response = await fetch(`${BASE}/products.json?limit=1`);
  const data = await response.json();
  const handle = data.products?.[0]?.handle;
  if (!handle) throw new Error('no products available to build a product URL');
  return `/products/${handle}`;
};

/** @type {Record<string, { path: string | (() => Promise<string>), run?: (page: import('playwright').Page, viewport: string) => Promise<Record<string, boolean>> }>} */
const SCENARIOS = {
  home: { path: '/' },
  product: { path: SCENARIO_PRODUCT_PATH },
  cart: { path: '/cart' },
  search: { path: '/search?q=shirt' },

  'resource-carousel': {
    // Requires a section with layout_type "carousel" on the home page.
    path: '/',
    async run(page, viewport) {
      const results = {};
      const slider = page.locator('slider-component.resource-list__slider').first();
      if ((await slider.count()) === 0) {
        console.log('      skipped: no carousel-layout resource list on this page (switch a product list to "carousel" to exercise it)');
        return results;
      }
      results.sliderPresent = true;

      // Scroll the window, not the element: scrollIntoView can also shift overflow-hidden ancestors horizontally.
      await slider.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
      await page.waitForTimeout(500);
      const state = await slider.evaluate((el) => ({
        ready: el.hasAttribute('data-slider-ready'),
        slides: el.slides.length,
        widths: el.slides.slice(0, 3).map((s) => Math.round(s.getBoundingClientRect().width)),
        trackWidth: Math.round(el.querySelector('.splide__track').getBoundingClientRect().width),
        perPage: el.splide?.options.perPage,
        fixedWidth: el.splide?.options.fixedWidth ?? null,
        nestedGalleriesEnabled: [...el.querySelectorAll('slideshow-component')].filter((g) => g.getAttribute('disabled') !== 'true' && g.slides?.length > 1).length,
      }));
      results.ready = state.ready;
      results.hasSlides = state.slides > 1;
      results.nestedGalleriesDisabled = state.nestedGalleriesEnabled === 0;
      if (viewport === 'mobile') {
        // clamp(150px, 60cqw, 450px) of a 390px container -> about 234px
        results.mobileFixedWidthApplied = Boolean(state.fixedWidth) && state.widths[0] >= 150 && state.widths[0] <= 450 && state.widths[0] < state.trackWidth;
      } else {
        results.desktopPerPageApplied = state.perPage >= 2 && state.widths[0] < state.trackWidth / state.perPage;
      }
      // The harness saves `<scenario>-<viewport>.png` after run(); this one captures the initial state.
      await page.screenshot({ path: resolve(OUT, `resource-carousel-initial-${viewport}.png`) });

      const before = await slider.evaluate((el) => el.current);
      if (viewport === 'mobile') {
        // swipe left
        const box = await slider.boundingBox();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 12 });
        await page.mouse.up();
      } else {
        await slider.hover();
        await page.locator('slider-component.resource-list__slider .splide__arrow--next').first().click();
      }
      await page.waitForTimeout(800);
      results.movesForward = (await slider.evaluate((el) => el.current)) > before;
      return results;
    },
  },

  slideshow: {
    // Requires a Slideshow section with 2+ slides, dots and autoplay on the home page.
    path: '/',
    async run(page, viewport) {
      const results = {};
      const slider = page.locator('slider-component.slideshow').first();
      if ((await slider.count()) === 0) {
        console.log('      skipped: no Slideshow section on this page (add one with 2+ slides to exercise it)');
        return results;
      }
      results.present = true;
      await slider.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80));
      await page.waitForTimeout(500);

      const state = await slider.evaluate((el) => ({
        ready: el.hasAttribute('data-slider-ready'),
        type: el.splide?.options.type,
        clones: el.querySelectorAll('.splide__slide--clone').length,
        slides: el.slides.length,
        dots: el.querySelectorAll('.splide__pagination__page').length,
        liveRegion: Boolean(el.querySelector('[aria-live]')),
        slideWidth: Math.round(el.slides[0].getBoundingClientRect().width),
        trackWidth: Math.round(el.querySelector('.splide__track').getBoundingClientRect().width),
        activeContentOpacity: getComputedStyle(el.querySelector('.splide__slide.is-active .slide__content')).opacity,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        current: el.current,
      }));
      results.ready = state.ready;
      results.loops = state.type === 'loop' && state.clones > 0;
      results.activeContentVisible = state.activeContentOpacity === '1';
      results.noHorizontalOverflow = state.pageOverflow <= 0;
      const hasToggle = (await slider.locator('.splide__toggle').count()) > 0;
      const hasCounter = (await slider.locator('[data-slider-current]').count()) > 0;
      if (state.dots > 0) results.dotsMatchSlides = state.dots === state.slides;
      if (hasToggle) results.liveRegionForAutoplay = state.liveRegion;
      // full-frame mode fills the track; with-hints mode leaves the page margins free
      results.slideWidthMode = state.slideWidth === state.trackWidth || state.slideWidth < state.trackWidth;
      await page.screenshot({ path: resolve(OUT, `slideshow-initial-${viewport}.png`) });

      if (hasToggle) {
        await page.waitForTimeout(3600);
        results.autoplayAdvances = (await slider.evaluate((el) => el.current)) !== state.current;
        await slider.locator('.splide__toggle').click();
        await page.waitForTimeout(300);
        results.togglePauses = await slider.evaluate((el) => el.splide.Components.Autoplay.isPaused());
      }

      if (state.dots > 0) {
        const dots = slider.locator('.splide__pagination__page');
        await dots.nth(0).click();
        await page.waitForTimeout(800);
        results.dotSelectsSlide = (await slider.evaluate((el) => el.current)) === 0;
      } else if (hasCounter) {
        await slider.evaluate((el) => el.select(0, undefined, { animate: false }));
        await page.waitForTimeout(300);
        results.counterShowsCurrent = (await slider.locator('[data-slider-current]').first().textContent())?.trim() === '1';
      }

      if (viewport === 'mobile') {
        const box = await slider.boundingBox();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(800);
        results.swipeAdvances = (await slider.evaluate((el) => el.current)) === 1;
      } else {
        await slider.hover();
        await slider.locator('.splide__arrow--next').click();
        await page.waitForTimeout(800);
        results.arrowAdvances = (await slider.evaluate((el) => el.current)) === 1;
      }
      return results;
    },
  },

  'product-gallery': {
    path: SCENARIO_PRODUCT_PATH,
    async run(page, viewport) {
      const results = {};
      const gallery = page.locator('media-gallery').first();
      results.galleryPresent = (await gallery.count()) > 0;
      if (!results.galleryPresent) return results;

      const state = await gallery.evaluate((el) => {
        const slider = el.querySelector('slider-component');
        const DESTROYED = 7;
        return {
          presentation: el.dataset.presentation,
          slider: Boolean(slider),
          refsMatch: el.refs.slideshow === slider,
          display: slider ? getComputedStyle(slider).display : null,
          destroyed: slider?.splide ? slider.splide.state.is(DESTROYED) : null,
          mounted: slider?.splide ? !slider.splide.state.is(DESTROYED) : false,
          slides: slider?.allSlides.length ?? 0,
          dots: slider?.querySelectorAll('.splide__pagination__page').length ?? 0,
          // visible thumbnails only: the desktop and mobile control sets hide each other by breakpoint
          thumbnails: slider ? [...slider.querySelectorAll('[data-slider-go]')].filter((t) => t.offsetWidth > 0).length : 0,
          selectedThumb: slider ? [...slider.querySelectorAll('[data-slider-go][aria-selected="true"]')].find((t) => t.offsetWidth > 0)?.getAttribute('data-slider-go') ?? null : null,
          gridVisible: Boolean(el.querySelector('.media-gallery__grid')) && getComputedStyle(el.querySelector('.media-gallery__grid')).display !== 'none',
          current: slider?.current ?? 0,
        };
      });
      results.sliderBound = state.slider && state.refsMatch;

      if (state.presentation === 'grid' && viewport === 'desktop') {
        results.desktopGridShown = state.gridVisible && state.display === 'none';
        results.sliderDestroyedOnDesktop = state.destroyed === true;
        return results;
      }

      results.sliderMounted = state.mounted;
      results.paginationMatchesSlides = state.dots === 0 || state.dots === state.slides;
      if (state.thumbnails > 0) results.firstThumbnailSelected = state.selectedThumb === '0';

      const slider = gallery.locator('slider-component');
      await slider.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80));
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(OUT, `product-gallery-${viewport}.png`) });

      if (state.thumbnails > 1) {
        await slider.locator('[data-slider-go="1"]:visible').first().click();
        await page.waitForTimeout(700);
        const after = await slider.evaluate((el) => ({ current: el.current, selected: [...el.querySelectorAll('[data-slider-go][aria-selected="true"]')].find((t) => t.offsetWidth > 0)?.getAttribute('data-slider-go') }));
        results.thumbnailSelectsSlide = after.current === 1 && after.selected === '1';
      } else if (state.slides > 1) {
        await swipe(page, slider, viewport);
        await page.waitForTimeout(800);
        results.swipeAdvances = (await slider.evaluate((el) => el.current)) > state.current;
      }
      return results;
    },
  },

  'predictive-search': {
    path: '/',
    async run(page) {
      const results = {};
      await page.locator('button[on\\:click="#search-modal/showDialog"]:visible').first().click();
      await page.waitForTimeout(500);
      await page.keyboard.type('a');
      await page.waitForTimeout(3000);
      results.dialogOpen = await page.evaluate(() => Boolean(document.querySelector('dialog[open]')));
      const sliders = await page.evaluate(() =>
        [...document.querySelectorAll('dialog[open] slider-component')].map((el) => ({
          ready: el.hasAttribute('data-slider-ready'),
          slides: el.slides.length,
          width: Math.round(el.slides[0]?.getBoundingClientRect().width ?? 0),
        }))
      );
      results.resourceSlidersPresent = sliders.length > 0;
      results.resourceSlidersReady = sliders.every((s) => s.ready && s.slides > 0 && s.width > 0);
      await page.screenshot({ path: resolve(OUT, 'predictive-search-open.png') });
      await page.keyboard.press('Escape');
      return results;
    },
  },

  'header-drawer': {
    path: '/',
    async run(page, viewport) {
      const results = {};
      if (viewport !== 'mobile') return results; // the drawer only renders in the mobile menu style
      const drawer = page.locator('header-drawer').first();
      results.drawerPresent = (await drawer.count()) > 0;
      if (!results.drawerPresent) return results;
      results.drawerBound = await drawer.evaluate((el) => Boolean(el._x_dataStack) && typeof el.open === 'function');

      await page.locator('header-drawer summary[data-drawer-action="toggle"]').first().click();
      await page.waitForTimeout(700);
      results.opens = await page.evaluate(() => {
        const details = document.querySelector('header-drawer details');
        return details?.open === true && details.classList.contains('menu-open');
      });
      results.summaryAriaExpanded = await page.evaluate(
        () => document.querySelector('header-drawer summary[data-drawer-action="toggle"]')?.getAttribute('aria-expanded') === 'true'
      );
      await page.screenshot({ path: resolve(OUT, `header-drawer-open-${viewport}.png`) });

      const submenu = page.locator('header-drawer summary[data-drawer-action="open-submenu"]').first();
      if ((await submenu.count()) > 0) {
        await submenu.click();
        await page.waitForTimeout(700);
        results.submenuOpens = await page.evaluate(() => {
          const sub = document.querySelector('header-drawer details details.menu-open');
          return Boolean(sub) && document.querySelector('header-drawer [x-ref="menuDrawer"]')?.classList.contains('menu-drawer--has-submenu-opened') === true;
        });
        await page.locator('header-drawer details.menu-open [data-drawer-action="back"]').first().click();
        await page.waitForTimeout(700);
        results.backCloses = await page.evaluate(() => !document.querySelector('header-drawer details details.menu-open'));
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
      results.escapeCloses = await page.evaluate(() => document.querySelector('header-drawer details')?.open === false);
      return results;
    },
  },

  'collection-filters': {
    path: '/collections/all',
    async run(page, viewport) {
      const results = {};
      results.alpineStarted = await page.evaluate(() => typeof window.Alpine === 'object');
      results.accordionsBound = await page.evaluate(() =>
        [...document.querySelectorAll('accordion-custom')].every((el) => Boolean(el._x_dataStack))
      );

      if (viewport === 'desktop') {
        const summary = page.locator('.facets--horizontal accordion-custom summary').first();
        await summary.click();
        results.opensOnClick = await page.evaluate(
          () => document.querySelector('.facets--horizontal accordion-custom details')?.open === true
        );
        await page.keyboard.press('Escape');
        results.closesOnEscape = await page.evaluate(
          () => document.querySelector('.facets--horizontal accordion-custom details')?.open === false
        );
        results.escapeRefocusesSummary = await page.evaluate(() => document.activeElement?.tagName === 'SUMMARY');
        await summary.click();
        await page.mouse.click(700, 150);
        results.closesOnOutsideClick = await page.evaluate(
          () => document.querySelector('.facets--horizontal accordion-custom details')?.open === false
        );
      } else {
        await page.getByRole('button', { name: /filter/i }).first().click();
        await page.waitForTimeout(600);
        results.drawerVerticalAccordionsOpen = await page.evaluate(() =>
          [...document.querySelectorAll('#filters-drawer accordion-custom[open] details')].every((d) => d.open)
        );
        const first = page.locator('#filters-drawer accordion-custom summary').first();
        await first.click();
        await page.waitForTimeout(400);
        results.drawerAccordionToggles = await page.evaluate(
          () => document.querySelector('#filters-drawer accordion-custom details')?.open === false
        );
        await first.click();
        await page.waitForTimeout(400);
        results.drawerAccordionReopens = await page.evaluate(
          () => document.querySelector('#filters-drawer accordion-custom details')?.open === true
        );
      }

      // show-more inside the filter lists, when a filter has enough values to render it
      const showMore = page.locator('show-more-component').first();
      if ((await showMore.count()) > 0) {
        results.showMoreBound = await showMore.evaluate((el) => Boolean(el._x_dataStack));
      }
      return results;
    },
  },
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  let failures = 0;

  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (ONLY && name !== ONLY) continue;

    for (const [viewportName, contextOptions] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      /** @type {string[]} */
      const errors = [];
      /** @type {string[]} */
      const network = [];
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        // Resource and CSP failures are reported separately with their URL; they come from
        // third-party or platform requests unless the URL points at a theme asset.
        if (/Failed to load resource|Content Security Policy/.test(text)) {
          network.push(`${text.slice(0, 80)} <- ${msg.location()?.url ?? 'unknown url'}`);
          return;
        }
        errors.push(text);
      });
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('requestfailed', (request) => network.push(`${request.failure()?.errorText} <- ${request.url()}`));
      page.on('response', (response) => {
        if (response.status() >= 400) network.push(`HTTP ${response.status()} <- ${response.url()}`);
      });

      let assertions = {};
      let navError = null;
      try {
        // 'load' rather than 'networkidle': the dev server keeps a hot-reload connection open.
        const path = typeof scenario.path === 'function' ? await scenario.path() : scenario.path;
        const response = await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
        if (!response || response.status() >= 400) navError = `HTTP ${response?.status()}`;
        await page.waitForTimeout(1500);
        if (scenario.run) assertions = await scenario.run(page, viewportName);
        await page.screenshot({ path: resolve(OUT, `${name}-${viewportName}.png`), fullPage: false });
      } catch (error) {
        navError = error instanceof Error ? error.message : String(error);
      }

      const themeErrors = errors.filter((text) => !IGNORED_ERRORS.some((pattern) => pattern.test(text)));
      const assetFailures = network.filter((text) => THEME_ASSET.test(text));
      const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([key]) => key);
      const ok = !navError && themeErrors.length === 0 && assetFailures.length === 0 && failed.length === 0;
      if (!ok) failures++;

      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} @ ${viewportName}`);
      if (navError) console.log(`      navigation: ${navError}`);
      for (const text of themeErrors) console.log(`      console error: ${text.slice(0, 200)}`);
      for (const text of assetFailures) console.log(`      theme asset failed: ${text.slice(0, 200)}`);
      const external = network.filter((text) => !THEME_ASSET.test(text));
      if (external.length && args.verbose) for (const text of external) console.log(`      network (external): ${text.slice(0, 160)}`);
      else if (external.length) console.log(`      network (external, ignored): ${external.length} — pass --verbose to list`);
      for (const key of failed) console.log(`      assertion failed: ${key}`);
      const passed = Object.keys(assertions).filter((key) => assertions[key]);
      if (passed.length) console.log(`      ok: ${passed.join(', ')}`);

      await context.close();
    }
  }

  await browser.close();
  console.log(failures ? `\n${failures} failing run(s)` : '\nall runs passed');
  process.exit(failures ? 1 : 0);
}

main();
