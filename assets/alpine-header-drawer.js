import { onAnimationEnd, removeWillChangeOnAnimationEnd } from '@theme/utilities';
import { trapFocus, removeTrapFocus } from '@theme/focus';

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
export const headerDrawer = () => ({
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
});

/**
 * Resets an open drawer details element to its closed state.
 * @param {HTMLDetailsElement} element
 */
function resetDrawerDetails(element) {
  element.classList.remove('menu-open');
  element.removeAttribute('open');
  element.querySelector('summary')?.setAttribute('aria-expanded', 'false');
}
