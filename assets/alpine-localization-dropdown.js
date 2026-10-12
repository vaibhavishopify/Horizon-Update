import { onAnimationEnd, isClickedOutside } from '@theme/utilities';

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
export const localizationDropdown = () => ({
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
});
