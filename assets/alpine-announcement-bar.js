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
export const announcementBar = (config = {}) => ({
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
});
