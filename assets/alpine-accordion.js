import { mediaQueryLarge, isMobileBreakpoint } from '@theme/utilities';

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
export const accordion = (config = {}) => ({
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
});
