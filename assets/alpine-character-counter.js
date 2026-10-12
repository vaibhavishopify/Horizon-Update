/**
 * Character counter for a text input with `maxlength`. Replaces `product-custom-property.js`.
 * Markup in `blocks/product-custom-property.liquid`: `x-data="characterCounter()"` on a wrapper,
 * `x-ref="input"` with `x-on:input="update"` on the field, and `x-ref="count"` with a
 * `data-template` such as "[current]/[max]" on the counter element.
 */
export const characterCounter = () => ({
  update() {
    /** @type {HTMLInputElement | HTMLTextAreaElement | undefined} */
    const input = this.$refs.input;
    /** @type {HTMLElement | undefined} */
    const count = this.$refs.count;
    const template = count?.getAttribute('data-template');
    if (!input || !count || !template) return;
    count.textContent = template
      .replace('[current]', String(input.value.length))
      .replace('[max]', String(input.maxLength));
  },
});
