/**
 * Copies `text-to-copy` from the root element to the clipboard and reveals an optional
 * `x-ref="successMessage"` element. Replaces `copy-to-clipboard.js` (gift card page).
 */
export const copyToClipboard = () => ({
  async copy() {
    const text = this.$root.getAttribute('text-to-copy');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('[copyToClipboard] clipboard write failed', error);
      return;
    }
    this.$refs.successMessage?.classList.remove('visually-hidden');
  },
});
