import { isMobileBreakpoint } from '@theme/utilities';

/**
 * Closes a `<details>` element when the user clicks outside it.
 *
 * Replaces `auto-close-details.js`. Apply to the `<details>` itself:
 * `x-data="autoCloseDetails('desktop')" x-on:click.outside="handleOutsideClick"`.
 *
 * @param {string} [modes='desktop'] - Comma-separated list of `desktop` and/or `mobile`.
 */
export const autoCloseDetails = (modes = 'desktop') => ({
  handleOutsideClick() {
    const details = this.$root;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    const current = isMobileBreakpoint() ? 'mobile' : 'desktop';
    if (String(modes).includes(current)) details.removeAttribute('open');
  },
});
