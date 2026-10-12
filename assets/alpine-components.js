/**
 * Alpine.js bootstrap for the theme.
 *
 * Single entry point that registers every reusable `Alpine.data` component and
 * then starts Alpine. Alpine's own MutationObserver initialises `x-data` trees
 * that the theme editor or the section renderer inserts later, so no extra
 * `shopify:section:load` handling is needed here.
 *
 * Keep state local to the component; use `Alpine.store` only for state that is
 * genuinely shared across components.
 */
import Alpine from '@theme/alpine';
import {
  mediaQueryLarge,
  isMobileBreakpoint,
  debounce,
  requestIdleCallback,
  viewTransition,
  onAnimationEnd,
  isClickedOutside,
  removeWillChangeOnAnimationEnd,
} from '@theme/utilities';
import { trapFocus, removeTrapFocus } from '@theme/focus';

window.Alpine = Alpine;

/**
 * Accordion built on a native `<details>` / `<summary>` pair.
 *
 * Used by `snippets/accordion-custom-component.liquid`. The wrapper keeps the
 * `accordion-custom` tag because shared CSS and the `headerDrawer` component select it.
 *
 * @param {object} [config]
 * @param {boolean} [config.openOnDesktop] - Open by default at or above 750px.
 * @param {boolean} [config.openOnMobile] - Open by default below 750px.
 * @param {boolean} [config.disableOnDesktop] - Ignore summary clicks at or above 750px.
 * @param {boolean} [config.disableOnMobile] - Ignore summary clicks below 750px.
 * @param {boolean} [config.closeWithEscape] - Escape closes the accordion and refocuses the summary.
 *
 * @example
 * <accordion-custom x-data="accordion({ openOnDesktop: true })" x-on:click="handleClick" x-on:keydown="handleKeydown">
 *   <details><summary>Label</summary><div class="details-content">…</div></details>
 * </accordion-custom>
 */
Alpine.data('accordion', (config = {}) => ({
  openOnDesktop: Boolean(config.openOnDesktop),
  openOnMobile: Boolean(config.openOnMobile),
  disableOnDesktop: Boolean(config.disableOnDesktop),
  disableOnMobile: Boolean(config.disableOnMobile),
  closeWithEscape: Boolean(config.closeWithEscape),

  /** @type {(() => void) | null} */
  onBreakpointChange: null,

  init() {
    this.applyDefaultOpenState();
    this.onBreakpointChange = () => this.applyDefaultOpenState();
    mediaQueryLarge.addEventListener('change', this.onBreakpointChange);
  },

  destroy() {
    if (this.onBreakpointChange) mediaQueryLarge.removeEventListener('change', this.onBreakpointChange);
  },

  /** @returns {HTMLDetailsElement | null} */
  get details() {
    const details = this.$root.querySelector('details');
    return details instanceof HTMLDetailsElement ? details : null;
  },

  /** @returns {HTMLElement | null} */
  get summary() {
    const summary = this.details?.querySelector('summary');
    return summary instanceof HTMLElement ? summary : null;
  },

  /** Whether toggling is disabled at the current breakpoint. */
  get disabled() {
    return isMobileBreakpoint() ? this.disableOnMobile : this.disableOnDesktop;
  },

  /** Applies the per-breakpoint default open state. */
  applyDefaultOpenState() {
    const { details } = this;
    if (!details) return;
    details.open = isMobileBreakpoint() ? this.openOnMobile : this.openOnDesktop;
  },

  /**
   * Blocks the native toggle when the accordion is disabled for this breakpoint.
   * Delegated from the wrapper so nested accordions keep their own behaviour.
   * @param {MouseEvent} event
   */
  handleClick(event) {
    if (!this.disabled) return;
    if (!(event.target instanceof Element)) return;
    const summary = event.target.closest('summary');
    if (summary && summary === this.summary) event.preventDefault();
  },

  /**
   * Closes the accordion on Escape when it is used as a menu.
   * @param {KeyboardEvent} event
   */
  handleKeydown(event) {
    if (event.key !== 'Escape' || !this.closeWithEscape) return;
    const { details, summary } = this;
    if (!details) return;
    event.preventDefault();
    details.open = false;
    summary?.focus();
  },
}));

/**
 * Closes a `<details>` element when the user clicks outside it.
 *
 * Replaces `auto-close-details.js`. Apply to the `<details>` itself:
 * `x-data="autoCloseDetails('desktop')" x-on:click.outside="handleOutsideClick"`.
 *
 * @param {string} [modes='desktop'] - Comma-separated list of `desktop` and/or `mobile`.
 */
Alpine.data('autoCloseDetails', (modes = 'desktop') => ({
  handleOutsideClick() {
    const details = this.$root;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    const current = isMobileBreakpoint() ? 'mobile' : 'desktop';
    if (String(modes).includes(current)) details.removeAttribute('open');
  },
}));

/**
 * "Show more" disclosure for long lists, with a height animation.
 *
 * Replaces `show-more.js`. Markup (see `snippets/list-filter.liquid`):
 * - root: `x-data="showMore({ disableOnDesktop })"`, with `data-expanded` bound by the component
 * - `x-ref="content"`: the container whose height is animated
 * - `[data-show-more-item]`: the items hidden while collapsed (class `hidden`, or `mobile:hidden`
 *   when `disableOnDesktop` is set so desktop always shows everything)
 * - `x-ref="button"` with `x-on:click.prevent="toggle"`
 *
 * @param {object} [config]
 * @param {boolean} [config.disableOnDesktop] - Ignore toggles at or above 750px.
 */
Alpine.data('showMore', (config = {}) => ({
  expanded: false,
  disableOnDesktop: Boolean(config.disableOnDesktop),
  collapsedHeight: 0,
  /** @type {Animation | null} */
  animation: null,
  animationSpeed: 300,

  /** Class that hides the overflow items at the current configuration. */
  get hiddenClass() {
    return this.disableOnDesktop ? 'mobile:hidden' : 'hidden';
  },

  /** @returns {HTMLElement[]} */
  get items() {
    return Array.from(this.$root.querySelectorAll('[data-show-more-item]'));
  },

  toggle() {
    if (this.disableOnDesktop && !isMobileBreakpoint()) return;

    /** @type {HTMLElement} */
    const content = this.$refs.content;
    if (!content) return;

    let startHeight;
    let endHeight;

    if (!this.expanded) {
      this.collapsedHeight = content.offsetHeight;
      startHeight = this.collapsedHeight;
      for (const item of this.items) item.classList.remove(this.hiddenClass);
      endHeight = content.scrollHeight;
    } else {
      startHeight = content.offsetHeight;
      endHeight = this.collapsedHeight;
    }

    const wasExpanded = this.expanded;
    this.expanded = !wasExpanded;

    content.style.overflow = 'hidden';
    this.animation?.cancel();
    this.animation = content.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: this.animationSpeed, easing: 'ease-in-out' }
    );
    this.animation.onfinish = () => {
      if (wasExpanded) {
        for (const item of this.items) item.classList.add(this.hiddenClass);
      }
      content.style.removeProperty('height');
      content.style.overflow = '';
    };
  },
}));

/**
 * Announcement bar: fades between stacked announcement slides.
 *
 * Replaces `announcement-bar.js`. Used by `sections/header-announcements.liquid`:
 * `x-data="announcementBar({ autoplay: <seconds> })"` on the `announcement-bar-component`
 * element, with `x-on:click="handleClick"`, `x-on:mouseenter="suspend"` and
 * `x-on:mouseleave="resume"`. Slides are `.announcement-bar__slide` children; the shared
 * `slider-arrows` snippet supplies `.splide__arrow--prev/--next` buttons.
 * In the theme editor, selecting an announcement block shows it and pauses autoplay.
 *
 * @param {object} [config]
 * @param {number} [config.autoplay] - Seconds between slides; omit or 0 to disable autoplay.
 */
Alpine.data('announcementBar', (config = {}) => ({
  current: 0,
  interval: Number(config.autoplay) > 0 ? Number(config.autoplay) * 1000 : 0,
  /** @type {number | undefined} */
  timer: undefined,
  paused: false,
  /** @type {(() => void) | null} */
  onVisibilityChange: null,
  /** @type {((event: Event) => void) | null} */
  onBlockSelect: null,
  /** @type {((event: Event) => void) | null} */
  onBlockDeselect: null,

  init() {
    this.onVisibilityChange = () => (document.hidden ? this.suspend() : this.resume());
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    if (typeof Shopify !== 'undefined' && Shopify.designMode) {
      this.onBlockSelect = (event) => {
        const index = this.slides.findIndex((slide) => slide === event.target || slide.contains(/** @type {Node} */ (event.target)));
        if (index === -1) return;
        this.pause();
        this.show(index);
      };
      this.onBlockDeselect = (event) => {
        if (!this.slides.some((slide) => slide === event.target || slide.contains(/** @type {Node} */ (event.target)))) return;
        this.paused = false;
        this.play();
      };
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:block:deselect', this.onBlockDeselect);
    }

    this.play();
  },

  destroy() {
    this.suspend();
    if (this.onVisibilityChange) document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.onBlockSelect) document.removeEventListener('shopify:block:select', this.onBlockSelect);
    if (this.onBlockDeselect) document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);
  },

  /** @returns {HTMLElement[]} */
  get slides() {
    return Array.from(this.$root.querySelectorAll('.announcement-bar__slide'));
  },

  get autoplay() {
    return this.interval > 0;
  },

  /** @param {number} index */
  show(index) {
    const { slides } = this;
    if (slides.length === 0) return;
    this.current = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== this.current)));
  },

  next() {
    this.show(this.current + 1);
  },

  previous() {
    this.show(this.current - 1);
  },

  /**
   * Routes clicks on the arrow buttons rendered by snippets/slider-arrows.liquid.
   * @param {MouseEvent} event
   */
  handleClick(event) {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.splide__arrow--prev')) this.previous();
    else if (event.target.closest('.splide__arrow--next')) this.next();
  },

  /** Starts autoplay when enabled. */
  play() {
    if (!this.autoplay || this.timer !== undefined) return;
    this.$root.toggleAttribute('paused', false);
    this.timer = window.setInterval(() => {
      if (this.$root.matches(':hover') || document.hidden) return;
      this.next();
    }, this.interval);
  },

  /** Stops the timer without changing the paused state (hover, hidden tab). */
  suspend() {
    window.clearInterval(this.timer);
    this.timer = undefined;
  },

  /** Restarts autoplay unless explicitly paused. */
  resume() {
    if (!this.autoplay || this.paused) return;
    this.suspend();
    this.play();
  },

  /** Pauses autoplay until `resume()` is allowed again (editor selection). */
  pause() {
    this.paused = true;
    this.$root.toggleAttribute('paused', true);
    this.suspend();
  },
}));

/**
 * Anchored popover: pairs a trigger with a native `popover` element.
 *
 * Replaces `anchored-popover.js`. Markup: `x-data="anchoredPopover({ hover, closeOnResize })"`
 * on the wrapper, `x-ref="trigger"` on the button and `x-ref="popover"` on the popover.
 * When CSS anchor positioning is unsupported, the trigger's bounds are written to
 * `--anchor-*` custom properties on the popover for the CSS fallback.
 *
 * @param {object} [config]
 * @param {boolean} [config.hover] - Open on pointer enter and close on pointer leave, with a short delay.
 * @param {boolean} [config.closeOnResize] - Close the popover when the window is resized while open.
 */
Alpine.data('anchoredPopover', (config = {}) => ({
  hover: Boolean(config.hover),
  closeOnResize: Boolean(config.closeOnResize),
  interactionDelay: 200,
  /** @type {number | null} */
  timer: null,
  /** @type {AbortController | null} */
  controller: null,
  /** @type {(() => void) | null} */
  onResize: null,

  init() {
    /** @type {HTMLElement | undefined} */
    const trigger = this.$refs.trigger;
    /** @type {HTMLElement | undefined} */
    const popover = this.$refs.popover;
    if (!trigger || !popover) return;

    this.controller = new AbortController();
    const { signal } = this.controller;

    if (this.closeOnResize) {
      this.onResize = debounce(() => {
        if (popover.matches(':popover-open')) popover.hidePopover();
      }, 100);
      popover.addEventListener(
        'beforetoggle',
        (event) => {
          const { newState } = /** @type {ToggleEvent} */ (event);
          if (!this.onResize) return;
          window[newState === 'open' ? 'addEventListener' : 'removeEventListener']('resize', this.onResize);
        },
        { signal }
      );
    }

    if (this.hover) {
      trigger.addEventListener('pointerenter', () => this.onTriggerEnter(trigger, popover), { signal });
      trigger.addEventListener('pointerleave', () => this.onTriggerLeave(trigger, popover), { signal });
      popover.addEventListener('pointerenter', () => this.clearTimer(), { signal });
      popover.addEventListener('pointerleave', () => this.scheduleHide(popover), { signal });
    }

    if (!CSS.supports('position-anchor: --trigger')) {
      popover.addEventListener('beforetoggle', () => this.updatePosition(trigger, popover), { signal });
      requestIdleCallback(() => this.updatePosition(trigger, popover));
    }
  },

  destroy() {
    this.clearTimer();
    this.controller?.abort();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
  },

  clearTimer() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
  },

  /** @param {HTMLElement} popover */
  scheduleHide(popover) {
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      if (popover.matches(':popover-open')) popover.hidePopover();
    }, this.interactionDelay);
  },

  /**
   * @param {HTMLElement} trigger
   * @param {HTMLElement} popover
   */
  onTriggerEnter(trigger, popover) {
    trigger.dataset.hoverActive = 'true';
    if (popover.matches(':popover-open')) return;
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      if (trigger.matches('[data-hover-active]')) popover.showPopover();
    }, this.interactionDelay);
  },

  /**
   * @param {HTMLElement} trigger
   * @param {HTMLElement} popover
   */
  onTriggerLeave(trigger, popover) {
    delete trigger.dataset.hoverActive;
    this.clearTimer();
    if (popover.matches(':popover-open')) this.scheduleHide(popover);
  },

  /**
   * CSS fallback for browsers without anchor positioning.
   * @param {HTMLElement} trigger
   * @param {HTMLElement} popover
   */
  updatePosition(trigger, popover) {
    const rect = trigger.getBoundingClientRect();
    popover.style.setProperty('--anchor-top', `${rect.top}`);
    popover.style.setProperty('--anchor-right', `${window.innerWidth - rect.right}`);
    popover.style.setProperty('--anchor-bottom', `${window.innerHeight - rect.bottom}`);
    popover.style.setProperty('--anchor-left', `${rect.left}`);
    popover.style.setProperty('--anchor-height', `${rect.height}`);
    popover.style.setProperty('--anchor-width', `${rect.width}`);
  },
}));

/**
 * Floating panel: keeps a dropdown panel inside the viewport.
 *
 * Replaces `floating-panel.js`. Markup: `x-data="floatingPanel({ closeOnResize })"` on the
 * `floating-panel-component` element (tag kept: morph.js preserves its inline style and
 * theme-editor.js persists its state by tag name).
 *
 * @param {object} [config]
 * @param {boolean} [config.closeOnResize] - Close the parent `<details>` when the window is resized.
 *   Note: the legacy component only honoured the literal value "true"; callers pass the attribute
 *   without a value, so this stays off unless a caller opts in explicitly.
 */
Alpine.data('floatingPanel', (config = {}) => ({
  offset: 40,
  closeOnResize: Boolean(config.closeOnResize),
  /** @type {MutationObserver | null} */
  observer: null,
  /** @type {(() => void) | null} */
  onResize: null,

  init() {
    this.onResize = debounce(() => {
      const parent = this.$root.closest('details');
      if (parent instanceof HTMLDetailsElement && this.closeOnResize) {
        parent.open = false;
        parent.removeAttribute('open');
        this.updatePosition();
      }
    }, 100);
    window.addEventListener('resize', this.onResize);

    this.observer = new MutationObserver(() => this.updatePosition());
    requestIdleCallback(() => {
      this.updatePosition();
      this.observer?.observe(this.$root, { attributes: true });
    });
  },

  destroy() {
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.observer?.disconnect();
  },

  async updatePosition() {
    if (viewTransition.current) await viewTransition.current;

    /** @type {HTMLElement} */
    const panel = this.$root;
    const rect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    panel.style.top = `${this.offset}px`;

    if (rect.right > viewportWidth) {
      panel.style.left = `-${rect.right - viewportWidth + this.offset}px`;
    }

    if (rect.left < 0) {
      panel.style.left = `${Math.abs(rect.left) + this.offset}px`;
    }

    this.observer?.takeRecords();
  },
}));

/**
 * Localization dropdown (desktop header): toggles the country/language panel.
 *
 * Replaces `DropdownLocalizationComponent` in localization.js. Markup in `sections/header.liquid`:
 * `x-data="localizationDropdown()"` on the `dropdown-localization-component` element,
 * `x-ref="button"` with `x-on:click="toggle"`, and `x-ref="panel"` on the hidden panel.
 * The nested `localization-form-component` (search, keyboard, native submit) is unchanged.
 * `showPanel()` is exposed on the element because theme-editor.js restores the open state
 * through `el.showPanel()` after an editor refresh.
 */
Alpine.data('localizationDropdown', () => ({
  open: false,
  /** @type {AbortController | null} */
  controller: null,

  init() {
    /** @type {HTMLElement & { showPanel?: () => void }} */ (this.$root).showPanel = () => this.show();
  },

  destroy() {
    this.controller?.abort();
  },

  /** @returns {HTMLElement | null} */
  get form() {
    return this.$root.querySelector('localization-form-component');
  },

  toggle() {
    return this.open ? this.hide() : this.show();
  },

  show() {
    if (this.open) return;
    this.open = true;

    this.controller = new AbortController();
    const { signal } = this.controller;
    this.$root.addEventListener('keyup', (event) => this.handleKeyUp(/** @type {KeyboardEvent} */ (event)), { signal });
    document.addEventListener(
      'click',
      (event) => {
        if (isClickedOutside(/** @type {PointerEvent} */ (event), this.$root)) this.hide();
      },
      { signal }
    );

    this.$refs.panel?.removeAttribute('hidden');
    this.$refs.button?.setAttribute('aria-expanded', 'true');

    onAnimationEnd(this.$refs.panel, () => {
      const { form } = this;
      if (form) this.$root.style.setProperty('--width', `${form.offsetWidth}px`);
      /** @type {any} */ (form)?.focusSearchInput?.();
    });
  },

  hide() {
    if (!this.open) return;
    this.open = false;
    this.controller?.abort();
    this.controller = null;

    this.$refs.button?.setAttribute('aria-expanded', 'false');
    this.$refs.panel?.setAttribute('hidden', '');
    /** @type {any} */ (this.form)?.resetForm?.();
  },

  /** @param {KeyboardEvent} event */
  handleKeyUp(event) {
    if (event.key !== 'Escape') return;
    this.hide();
    event.stopPropagation();
    this.$refs.button?.focus();
  },
}));

/**
 * Localization drawer (mobile menu): focuses the search field when the details opens
 * and resets the form when it closes, mirroring `DrawerLocalizationComponent`.
 * Markup in `snippets/header-drawer.liquid`: `x-data="localizationDrawer()"` on the wrapper
 * and `x-on:toggle="toggle"` on the `<details>`.
 */
Alpine.data('localizationDrawer', () => ({
  /** @type {((event: Event) => void) | null} */
  onScroll: null,

  /** @param {ToggleEvent} event */
  toggle(event) {
    const { target } = event;
    /** @type {any} */
    const form = this.$root.querySelector('localization-form-component');
    if (!form || !(target instanceof HTMLDetailsElement)) return;

    const countryList = form.querySelector('.country-selector-form__wrapper');
    if (!this.onScroll) {
      this.onScroll = (scrollEvent) => {
        const filter = this.$root.querySelector('.country-filter');
        const list = scrollEvent.target instanceof HTMLElement ? scrollEvent.target : null;
        if (filter && list) filter.classList.toggle('is-scrolled', list.scrollTop > 0);
      };
    }

    if (target.open) {
      countryList?.addEventListener('scroll', this.onScroll);
      onAnimationEnd(target, () => form.focusSearchInput?.());
    } else {
      countryList?.removeEventListener('scroll', this.onScroll);
      form.resetForm?.();
    }
  },
}));

/**
 * Volume pricing table: toggles the expanded rows. Replaces `volume-pricing.js`.
 * The state lives in the `volume-pricing--expanded` class (not reactive data) on purpose:
 * product-form.js morphs this element on variant change, which resets the class, and the
 * legacy behaviour collapsed the table in that case.
 * Markup in `blocks/buy-buttons.liquid`: `x-data="volumePricing()"` on `<volume-pricing>`
 * and `x-on:click="toggle"` on the toggle button.
 */
Alpine.data('volumePricing', () => ({
  toggle() {
    this.$root.classList.toggle('volume-pricing--expanded');
  },
}));

/**
 * Character counter for a text input with `maxlength`. Replaces `product-custom-property.js`.
 * Markup in `blocks/product-custom-property.liquid`: `x-data="characterCounter()"` on a wrapper,
 * `x-ref="input"` with `x-on:input="update"` on the field, and `x-ref="count"` with a
 * `data-template` such as "[current]/[max]" on the counter element.
 */
Alpine.data('characterCounter', () => ({
  update() {
    /** @type {HTMLInputElement | HTMLTextAreaElement | undefined} */
    const input = this.$refs.input;
    /** @type {HTMLElement | undefined} */
    const count = this.$refs.count;
    const template = count?.getAttribute('data-template');
    if (!input || !count || !template) return;
    count.textContent = template
      .replace('[current]', String(input.value.length))
      .replace('[max]', String(input.maxLength));
  },
}));

/**
 * Copies `text-to-copy` from the root element to the clipboard and reveals an optional
 * `x-ref="successMessage"` element. Replaces `copy-to-clipboard.js` (gift card page).
 */
Alpine.data('copyToClipboard', () => ({
  async copy() {
    const text = this.$root.getAttribute('text-to-copy');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('[copyToClipboard] clipboard write failed', error);
      return;
    }
    this.$refs.successMessage?.classList.remove('visually-hidden');
  },
}));

/**
 * Mobile menu drawer with nested submenus. Replaces `header-drawer.js`.
 *
 * Markup in `snippets/header-drawer.liquid`: `x-data="headerDrawer()"` plus
 * `x-on:click="handleClick"` and `x-on:keyup="handleKeyUp"` on the `header-drawer` root,
 * `x-ref="details"` on the main `<details>`, `x-ref="menuDrawer"` on the sliding panel, and
 * `data-drawer-action="toggle | open-submenu | back | close"` on the controls (delegated so the
 * deeply nested menu markup needs no per-element bindings).
 *
 * `open()` and `refs.details` are exposed on the element for theme-editor.js, which re-opens the
 * drawer after an editor refresh with `el.open(); el.refs.details.setAttribute('open', '')`.
 */
Alpine.data('headerDrawer', () => ({
  init() {
    const root = /** @type {HTMLElement & { open?: () => void, refs?: object }} */ (this.$root);
    root.open = () => this.open();
    root.refs = { details: this.$refs.details, menuDrawer: this.$refs.menuDrawer };

    // Remove will-change after each panel animation so submenus can be positioned correctly.
    for (const element of this.$root.querySelectorAll('.menu-drawer__animated-element')) {
      element.addEventListener('animationend', removeWillChangeOnAnimationEnd);
    }
  },

  destroy() {
    for (const element of this.$root.querySelectorAll('.menu-drawer__animated-element')) {
      element.removeEventListener('animationend', removeWillChangeOnAnimationEnd);
    }
  },

  /** @returns {HTMLDetailsElement} */
  get details() {
    return this.$refs.details;
  },

  get isOpen() {
    return this.details.hasAttribute('open');
  },

  /**
   * Closest details to an event target, falling back to the main drawer.
   * @param {Event | Element} [source]
   * @returns {HTMLDetailsElement}
   */
  detailsFor(source) {
    const element = source instanceof Element ? source : source?.target;
    if (!(element instanceof Element)) return this.details;
    return element.closest('details') ?? this.details;
  },

  /** @param {MouseEvent} event */
  handleClick(event) {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest('[data-drawer-action]');
    if (!control || !this.$root.contains(control)) return;

    switch (control.getAttribute('data-drawer-action')) {
      case 'toggle':
        this.toggle();
        break;
      case 'open-submenu':
        this.open('submenu', control);
        break;
      case 'back':
        this.closeDetails(this.detailsFor(control));
        break;
      case 'close':
        this.close();
        break;
    }
  },

  /** @param {KeyboardEvent} event */
  handleKeyUp(event) {
    if (event.key !== 'Escape') return;
    this.closeDetails(this.detailsFor(event));
  },

  toggle() {
    return this.isOpen ? this.close() : this.open();
  },

  /**
   * Opens the main drawer or, with a target, the submenu that contains the control.
   * @param {string} [target]
   * @param {Element} [control]
   */
  open(target, control) {
    const details = this.detailsFor(control);
    const summary = details.querySelector('summary');
    if (!summary) return;

    summary.setAttribute('aria-expanded', 'true');
    this.preventInitialAccordionAnimations(details);

    requestAnimationFrame(() => {
      details.classList.add('menu-open');
      if (target) this.$refs.menuDrawer?.classList.add('menu-drawer--has-submenu-opened');

      // Wait for the drawer animation to complete before trapping focus.
      const drawer = details.querySelector('.menu-drawer, .menu-drawer__submenu');
      onAnimationEnd(drawer || details, () => trapFocus(details), { subtree: false });
    });
  },

  close() {
    this.closeDetails(this.details);
  },

  /** @param {HTMLDetailsElement} details */
  closeDetails(details) {
    const summary = details.querySelector('summary');
    if (!summary) return;

    summary.setAttribute('aria-expanded', 'false');
    details.classList.remove('menu-open');
    this.$refs.menuDrawer?.classList.remove('menu-drawer--has-submenu-opened');

    // Wait for the panel's own transition, not the whole subtree (child accordions can misfire on Firefox).
    const drawer = details.querySelector('.menu-drawer, .menu-drawer__submenu');
    onAnimationEnd(
      drawer || details,
      () => {
        resetDrawerDetails(details);
        if (details === this.details) {
          removeTrapFocus();
          for (const open of this.$root.querySelectorAll('details[open]:not(accordion-custom > details)')) {
            resetDrawerDetails(/** @type {HTMLDetailsElement} */ (open));
          }
        } else {
          trapFocus(this.details);
        }
      },
      { subtree: false }
    );
  },

  /**
   * Suppresses accordion animations for 100ms while the drawer opens.
   * @param {HTMLDetailsElement} details
   */
  preventInitialAccordionAnimations(details) {
    const content = details.querySelectorAll('accordion-custom .details-content');
    for (const element of content) element.classList.add('details-content--no-animation');
    setTimeout(() => {
      for (const element of content) element.classList.remove('details-content--no-animation');
    }, 100);
  },
}));

/**
 * Resets an open drawer details element to its closed state.
 * @param {HTMLDetailsElement} element
 */
function resetDrawerDetails(element) {
  element.classList.remove('menu-open');
  element.removeAttribute('open');
  element.querySelector('summary')?.setAttribute('aria-expanded', 'false');
}

Alpine.start();
