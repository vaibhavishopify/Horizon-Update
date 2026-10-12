import { isMobileBreakpoint } from '@theme/utilities';

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
export const showMore = (config = {}) => ({
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
});
