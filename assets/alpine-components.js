/**
 * Alpine.js bootstrap for the theme.
 *
 * Single entry point that registers every reusable `Alpine.data` component and
 * then starts Alpine. Each component lives in its own `assets/alpine-<name>.js`
 * module (resolved through the `@theme/alpine-<name>` import-map entries in
 * `snippets/scripts.liquid` and `templates/gift_card.liquid`) and exports a
 * factory; this file only maps factories to their `x-data` names.
 *
 * Alpine's own MutationObserver initialises `x-data` trees that the theme editor
 * or the section renderer inserts later, so no extra `shopify:section:load`
 * handling is needed here.
 *
 * Keep state local to the component; use `Alpine.store` only for state that is
 * genuinely shared across components. See best-practices.md, section B.
 */
import Alpine from '@theme/alpine';
import { accordion } from '@theme/alpine-accordion';
import { autoCloseDetails } from '@theme/alpine-auto-close-details';
import { showMore } from '@theme/alpine-show-more';
import { announcementBar } from '@theme/alpine-announcement-bar';
import { anchoredPopover } from '@theme/alpine-anchored-popover';
import { floatingPanel } from '@theme/alpine-floating-panel';
import { localizationDropdown } from '@theme/alpine-localization-dropdown';
import { localizationDrawer } from '@theme/alpine-localization-drawer';
import { volumePricing } from '@theme/alpine-volume-pricing';
import { characterCounter } from '@theme/alpine-character-counter';
import { copyToClipboard } from '@theme/alpine-copy-to-clipboard';
import { headerDrawer } from '@theme/alpine-header-drawer';

window.Alpine = Alpine;

/** `x-data` name → component factory. Add new components here and in both import maps. */
const components = {
  accordion,
  autoCloseDetails,
  showMore,
  announcementBar,
  anchoredPopover,
  floatingPanel,
  localizationDropdown,
  localizationDrawer,
  volumePricing,
  characterCounter,
  copyToClipboard,
  headerDrawer,
};

for (const [name, factory] of Object.entries(components)) {
  Alpine.data(name, factory);
}

Alpine.start();
