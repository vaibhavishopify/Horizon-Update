# Horizon-Update

Shopify Horizon theme (3.5.1) being modernized incrementally with Alpine.js, Tailwind CSS and Splide.js.
Progress, decisions and remaining work are tracked in [docs/MIGRATION_INVENTORY.md](docs/MIGRATION_INVENTORY.md).

## Requirements

- Node 22+ and npm
- Shopify CLI (`shopify theme dev`, `shopify theme check`)

## Commands

```
npm install          # install Tailwind, Alpine and Splide
npm run build        # build assets/tailwind.css and vendor libraries into assets/
npm run watch:css    # rebuild Tailwind on change while editing Liquid
npm run vendor       # re-copy Alpine / Splide into assets/ after a dependency upgrade
npm run check        # Theme Check
npm run dev          # Shopify CLI development server
node scripts/verify.mjs [--only <scenario>] [--verbose]   # headless desktop + mobile checks against the dev server (Playwright)
```

Build outputs in `assets/` are committed because Shopify serves them directly:
`tailwind.css`, `alpine.js`, `splide.js`, `splide-core.css`.

## Architecture notes

- Tailwind source: `src/tailwind.css` (theme tokens mapped to the theme's CSS custom properties, no preflight).
- Alpine bootstrap and component registry: `assets/alpine-components.js`; one component per `assets/alpine-<name>.js`.
- Central slider module: `assets/slider.js` (`<slider-component>`); sections only render markup and pass `data-slider` config.
- Coding standards: `best-practices.md` (project rules for Alpine, Tailwind, Splide, workflow). Theme authoring baseline: `AGENTS.md`.
