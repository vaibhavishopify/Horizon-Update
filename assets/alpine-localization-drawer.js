import { onAnimationEnd } from '@theme/utilities';

/**
 * Localization drawer (mobile menu): focuses the search field when the details opens
 * and resets the form when it closes, mirroring `DrawerLocalizationComponent`.
 * Markup in `snippets/header-drawer.liquid`: `x-data="localizationDrawer()"` on the wrapper
 * and `x-on:toggle="toggle"` on the `<details>`.
 */
export const localizationDrawer = () => ({
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
});
