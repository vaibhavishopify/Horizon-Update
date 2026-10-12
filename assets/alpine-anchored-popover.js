import { debounce, requestIdleCallback } from '@theme/utilities';

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
export const anchoredPopover = (config = {}) => ({
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
});
