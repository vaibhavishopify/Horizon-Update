/**
 * Central Splide.js slider module.
 *
 * Every carousel in the theme is initialised here. Sections and snippets only
 * render markup and pass configuration; they never create Splide instances.
 *
 * Markup contract (rendered by `snippets/slider.liquid`):
 *
 *   <slider-component
 *     class="splide"
 *     data-slider='{"perPage":4,"gap":"16px","arrows":true}'
 *     data-slider-mobile='{"perPage":2}'
 *   >
 *     <div class="splide__track">
 *       <ul class="splide__list">
 *         <li class="splide__slide" data-slide-id="...">...</li>
 *       </ul>
 *     </div>
 *     <!-- optional .splide__arrows and .splide__pagination rendered in Liquid -->
 *   </slider-component>
 *
 * - `data-slider` holds the desktop (base) options as JSON.
 * - `data-slider-mobile` holds overrides applied at or below the theme's
 *   mobile breakpoint (749px, see `MOBILE_BREAKPOINT`). It is merged into
 *   `breakpoints[749]`, so sections never hard-code breakpoint values.
 * - Anything not supplied falls back to `DEFAULTS` below, which own the shared
 *   behaviour (speed, easing, drag, keyboard, accessibility labels).
 *
 * Lifecycle:
 * - Mounts once on connect and destroys on disconnect, so section re-renders in
 *   the theme editor and `morphSection` updates never double-initialise.
 * - `updatedCallback()` (called by `@theme/morph` after a section morph) refreshes
 *   the live instance so new or removed slides are picked up.
 * - In the theme editor, selecting a slide block moves the slider to it and
 *   pauses autoplay; deselecting resumes it.
 *
 * Public API (kept compatible with the legacy `slideshow-component` consumers):
 * `select(indexOrId, event?, { animate })`, `next()`, `previous()`, `play()`,
 * `pause()`, `resume()`, `refresh()`, `current`, `slides`, `splide`.
 * Dispatches `slideshow:select` (`SlideshowSelectEvent`) after every move.
 */
import Splide from '@theme/splide';
import { Component } from '@theme/component';
import { SlideshowSelectEvent } from '@theme/events';
import { prefersReducedMotion } from '@theme/utilities';

/** Matches `@media screen and (max-width: 749px)` used across the theme. */
export const MOBILE_BREAKPOINT = 749;

/** Maps Splide i18n keys to the `Theme.translations` keys rendered by `snippets/scripts.liquid`. */
const I18N_KEYS = {
  prev: 'slider_previous',
  next: 'slider_next',
  first: 'slider_first',
  last: 'slider_last',
  slideX: 'slider_go_to_slide',
  pageX: 'slider_go_to_page',
  play: 'slider_play',
  pause: 'slider_pause',
  carousel: 'slider_role_carousel',
  slide: 'slider_role_slide',
  select: 'slider_select_slide',
  slideLabel: 'slider_slide_label',
};

/**
 * Builds Splide's i18n map from the theme translations. Missing keys fall back
 * to Splide's English defaults.
 * @returns {Record<string, string>}
 */
function i18n() {
  const translations = typeof Theme !== 'undefined' ? Theme.translations : {};
  /** @type {Record<string, string>} */
  const map = {};
  for (const [splideKey, themeKey] of Object.entries(I18N_KEYS)) {
    const value = translations[themeKey];
    if (value) map[splideKey] = value;
  }
  return map;
}

/**
 * Shared defaults for every slider. Section-specific values are passed through
 * `data-slider` and override these.
 * @type {import('@theme/splide').Options}
 */
export const DEFAULTS = {
  type: 'slide',
  perPage: 1,
  // perMove is left unset so Splide moves by the number of visible slides (perPage), like the legacy slideshow.
  gap: 0,
  arrows: true,
  pagination: false,
  speed: 400,
  rewindSpeed: 600,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  drag: true,
  snap: true,
  keyboard: 'focused',
  slideFocus: false,
  trimSpace: true,
  omitEnd: true,
  mediaQuery: 'max',
  interval: 5000,
  pauseOnHover: true,
  pauseOnFocus: true,
  // Never start a drag from form fields or the 3D model viewer (it has its own pointer handling).
  noDrag: 'input, textarea, select, model-viewer, .shopify-model-viewer-ui',
  // Splide's own reduced-motion handling: instant moves and no autoplay.
  reducedMotion: { speed: 0, rewindSpeed: 0, autoplay: 'pause' },
};

/**
 * Parses a JSON attribute, returning an empty object for missing or invalid values.
 * @param {string | null} value
 * @returns {Record<string, any>}
 */
function parseJSON(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('[slider] Invalid JSON in data-slider attribute', error);
    return {};
  }
}

/**
 * @typedef {Object} SliderRefs
 * @property {HTMLElement} [track]
 */

/**
 * A theme slider powered by Splide.
 * @extends {Component<SliderRefs>}
 */
export class SliderComponent extends Component {
  /** @type {InstanceType<typeof Splide> | null} */
  splide = null;

  /** @type {number} */
  #previousIndex = 0;

  /** @type {boolean} */
  #userInitiated = false;

  /** @type {'select' | 'drag' | 'scroll'} */
  #userTrigger = 'select';

  /** @type {boolean} */
  #editorPaused = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.splide) return;

    // Children may not be parsed yet when the element is upgraded during an
    // editor insertion; wait one frame before reading the track.
    requestAnimationFrame(() => {
      if (this.isConnected && !this.splide) this.#mount();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#destroy();
  }

  /**
   * Called by `@theme/morph` after a section re-render. The morph rewrites attributes and
   * children from server HTML, which strips Splide's own classes and inline styles, so the
   * instance is rebuilt from scratch and the active index restored.
   */
  updatedCallback() {
    super.updatedCallback();
    const index = this.current;
    this.#destroy();
    this.#mount();
    if (index > 0) this.select(index, undefined, { animate: false });
  }

  /**
   * Resolves the final Splide options for this element.
   * @returns {import('@theme/splide').Options}
   */
  get options() {
    const base = parseJSON(this.getAttribute('data-slider'));
    const mobile = parseJSON(this.getAttribute('data-slider-mobile'));
    /** @type {Record<string, any>} */
    const breakpoints = { ...(base.breakpoints && typeof base.breakpoints === 'object' ? base.breakpoints : {}) };

    if (Object.keys(mobile).length > 0) {
      const existing = breakpoints[MOBILE_BREAKPOINT];
      breakpoints[MOBILE_BREAKPOINT] = { ...(existing && typeof existing === 'object' ? existing : {}), ...mobile };
    }

    /** @type {import('@theme/splide').Options} */
    const options = { ...DEFAULTS, ...base, breakpoints, i18n: { ...i18n(), ...(base.i18n || {}) } };

    // Mirror the legacy slideshow: announce slide changes only when autoplaying.
    if (options.live === undefined) options.live = Boolean(options.autoplay);

    return options;
  }

  /** This slider's own track (not one belonging to a nested slider). */
  get track() {
    for (const track of this.querySelectorAll('.splide__track')) {
      if (track.closest('slider-component') === this) return /** @type {HTMLElement} */ (track);
    }
    return null;
  }

  /** The slide elements Splide manages (visible, non-hidden), excluding clones. */
  get slides() {
    return /** @type {HTMLElement[]} */ (
      Array.from(this.track?.querySelectorAll(':scope > .splide__list > .splide__slide:not(.splide__slide--clone)') ?? [])
    );
  }

  /** Every slide element including ones hidden with the `hidden` attribute (e.g. variant images). */
  get allSlides() {
    return /** @type {HTMLElement[]} */ (
      Array.from(this.track?.querySelectorAll(':scope > .splide__list > li:not(.splide__slide--clone)') ?? [])
    );
  }

  /** The first slide, hidden or not. Kept for product-card.js, which reads its `slide-id`. */
  get initialSlide() {
    return this.allSlides[0] ?? null;
  }

  /** Whether this slider sits inside another slider. Nested sliders are disabled (no drag, arrows or selection). */
  get isNested() {
    return this.parentElement?.closest('slider-component') !== null;
  }

  /** `disabled="true"` (merchant setting) or nesting turns off drag, arrows and programmatic selection. */
  get disabled() {
    return this.getAttribute('disabled') === 'true' || this.isNested;
  }

  /** Index of the active slide. */
  get current() {
    return this.splide ? this.splide.index : 0;
  }

  /**
   * Splide collects every `.splide__slide`; slides hidden with the `hidden` attribute (product-card
   * variant images) drop the class so they are excluded, and regain it when revealed.
   * @returns {boolean} Whether anything changed and Splide needs a refresh.
   */
  #syncHiddenSlides() {
    let changed = false;
    for (const slide of this.allSlides) {
      const shouldBeSlide = !slide.hidden;
      if (slide.classList.contains('splide__slide') !== shouldBeSlide) {
        slide.classList.toggle('splide__slide', shouldBeSlide);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Moves to a slide.
   * @param {number | string | { id: string }} target - Slide index, `{ id }` matching `data-slide-id`, or a Splide control string such as `'>'`.
   * @param {Event} [event] - The triggering event, when user initiated. Kept for parity with the legacy API.
   * @param {{ animate?: boolean }} [options]
   */
  select(target, event, options = {}) {
    if (!this.splide || this.disabled) return;
    if (this.#syncHiddenSlides()) this.splide.refresh();

    /** @type {number | string} */
    let control;
    if (typeof target === 'object' && target !== null) {
      const index = this.slides.findIndex((slide) => slide.dataset.slideId === String(target.id));
      if (index === -1) return;
      control = index;
    } else {
      control = target;
    }

    this.#userInitiated = Boolean(event);
    this.#userTrigger = 'select';
    const animate = options.animate !== false && !prefersReducedMotion();

    if (animate) {
      this.splide.go(control);
      return;
    }

    // Zero both speeds: Splide uses rewindSpeed (not speed) when jumping between the ends.
    const { speed, rewindSpeed } = this.splide.options;
    this.splide.options = { speed: 0, rewindSpeed: 0 };
    this.splide.go(control);
    this.splide.options = { speed, rewindSpeed };
  }

  /** @param {Event} [event] */
  next(event) {
    this.select('>', event);
  }

  /** @param {Event} [event] */
  previous(event) {
    this.select('<', event);
  }

  play() {
    this.splide?.Components.Autoplay?.play();
  }

  pause() {
    this.splide?.Components.Autoplay?.pause();
  }

  /** Resumes autoplay unless it was paused by the theme editor. */
  resume() {
    if (this.#editorPaused) return;
    this.play();
  }

  refresh() {
    this.#syncHiddenSlides();
    this.splide?.refresh();
  }

  /**
   * Pauses for the theme editor and keeps it paused across `resume()` calls
   * until `editorResume()` runs on block deselect.
   */
  editorPause() {
    this.#editorPaused = true;
    this.pause();
  }

  editorResume() {
    this.#editorPaused = false;
    this.play();
  }

  #mount() {
    if (!this.track) return;

    // Containers such as the quick-add modal lay the slides out as a plain list instead.
    if (this.closest('[data-slider-disable-nested]')) return;

    this.#syncHiddenSlides();
    if (this.slides.length === 0) return;
    this.classList.add('splide');

    const options = this.options;
    if (this.disabled) {
      Object.assign(options, { drag: false, arrows: false, keyboard: false, pagination: false, autoplay: false });
      this.setAttribute('data-slider-disabled', '');
    } else {
      this.removeAttribute('data-slider-disabled');
    }

    const splide = new Splide(this, options);
    splide.on('moved', (/** @type {number} */ index) => this.#onMoved(index));
    splide.on('drag', () => {
      this.#userInitiated = true;
      this.#userTrigger = 'drag';
    });

    // While a pointer drag has moved the slides, mark the root so the theme's delegated
    // `on:click` handlers (component.js) ignore the click that ends the drag, the same way
    // Splide suppresses native clicks after a drag.
    splide.on('dragging', () => this.setAttribute('data-slider-dragged', ''));
    splide.on('dragged', () => {
      window.setTimeout(() => this.removeAttribute('data-slider-dragged'), 100);
    });

    // Opt-in: clicking a non-active slide (e.g. a peeking slide) navigates to it.
    if (this.hasAttribute('data-slider-navigate-on-click')) {
      splide.on('click', (/** @type {{ index: number }} */ slideComponent) => {
        if (slideComponent.index === splide.index) return;
        this.#userInitiated = true;
        this.#userTrigger = 'select';
        splide.go(slideComponent.index);
      });
    }

    this.splide = splide;
    splide.mount();
    this.#previousIndex = splide.index;

    // Splide handles arrow, pagination and keyboard moves itself; mark them as user initiated
    // so `slideshow:select` consumers can tell them apart from programmatic selection.
    const markUserInitiated = () => {
      this.#userInitiated = true;
      this.#userTrigger = 'select';
    };
    for (const control of this.querySelectorAll('.splide__arrow, .splide__pagination__page')) {
      control.addEventListener('click', markUserInitiated, { signal: this.#mountSignal() });
    }
    this.addEventListener(
      'keydown',
      (event) => {
        if (event.key.startsWith('Arrow')) markUserInitiated();
      },
      { signal: this.#mountSignal() }
    );

    // Custom pagination such as thumbnails: any `[data-slider-go="<index>"]` control inside the
    // root selects that slide; `aria-selected` is kept in sync in #onMoved.
    this.addEventListener(
      'click',
      (event) => {
        if (!(event.target instanceof Element)) return;
        const control = event.target.closest('[data-slider-go]');
        if (!control || !this.contains(control)) return;
        const index = Number(control.getAttribute('data-slider-go'));
        if (Number.isNaN(index)) return;
        event.preventDefault();
        this.select(index, event);
      },
      { signal: this.#mountSignal() }
    );
    this.#syncGoControls(this.current);

    this.setAttribute('data-slider-ready', '');
  }

  /** @param {number} index */
  #syncGoControls(index) {
    for (const control of this.querySelectorAll('[data-slider-go]')) {
      const selected = Number(control.getAttribute('data-slider-go')) === index;
      control.setAttribute('aria-selected', String(selected));
      if (selected && control instanceof HTMLElement && control.closest('[data-slider-go-scroll]')) {
        control.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
      }
    }
  }

  /** @type {AbortController | null} */
  #mountController = null;

  /** Signal tied to the current mount; aborted on destroy so listeners never accumulate. */
  #mountSignal() {
    if (!this.#mountController) this.#mountController = new AbortController();
    return this.#mountController.signal;
  }

  #destroy() {
    this.#mountController?.abort();
    this.#mountController = null;
    if (!this.splide) return;
    this.splide.destroy(true);
    this.splide = null;
    this.removeAttribute('data-slider-ready');
  }

  /** @param {number} index */
  #onMoved(index) {
    const slide = this.slides[index];
    if (!slide) return;

    // Counter controls ("3 / 8") rendered by snippets/slider-controls.liquid.
    for (const counter of this.querySelectorAll('[data-slider-current]')) {
      counter.textContent = String(index + 1);
    }
    this.#syncGoControls(index);

    this.dispatchEvent(
      new SlideshowSelectEvent({
        index,
        id: slide.dataset.slideId ?? null,
        slide,
        previousIndex: this.#previousIndex,
        userInitiated: this.#userInitiated,
        trigger: this.#userTrigger,
      })
    );

    this.#previousIndex = index;
    this.#userInitiated = false;
    this.#userTrigger = 'select';
  }
}

if (!customElements.get('slider-component')) {
  customElements.define('slider-component', SliderComponent);
}

/* ------------------------------------------------------------------------- */
/* Theme editor integration                                                   */
/* ------------------------------------------------------------------------- */

if (typeof Shopify !== 'undefined' && Shopify.designMode) {
  /**
   * @param {Event} event
   * @returns {{ slider: SliderComponent, slide: HTMLElement } | null}
   */
  const resolve = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return null;
    const slide = target.closest('.splide__slide');
    const slider = slide?.closest('slider-component');
    if (!(slide instanceof HTMLElement) || !(slider instanceof SliderComponent)) return null;
    return { slider, slide };
  };

  document.addEventListener('shopify:block:select', (event) => {
    const match = resolve(event);
    if (!match) return;
    const index = match.slider.slides.indexOf(match.slide);
    if (index === -1) return;
    match.slider.editorPause();
    match.slider.select(index, undefined, { animate: index !== match.slider.current });
  });

  document.addEventListener('shopify:block:deselect', (event) => {
    resolve(event)?.slider.editorResume();
  });
}
