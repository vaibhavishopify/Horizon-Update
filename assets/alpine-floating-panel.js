import { debounce, requestIdleCallback, viewTransition } from '@theme/utilities';

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
export const floatingPanel = (config = {}) => ({
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
});
