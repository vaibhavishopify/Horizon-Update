/**
 * Volume pricing table: toggles the expanded rows. Replaces `volume-pricing.js`.
 * The state lives in the `volume-pricing--expanded` class (not reactive data) on purpose:
 * product-form.js morphs this element on variant change, which resets the class, and the
 * legacy behaviour collapsed the table in that case.
 * Markup in `blocks/buy-buttons.liquid`: `x-data="volumePricing()"` on `<volume-pricing>`
 * and `x-on:click="toggle"` on the toggle button.
 */
export const volumePricing = () => ({
  toggle() {
    this.$root.classList.toggle('volume-pricing--expanded');
  },
});
