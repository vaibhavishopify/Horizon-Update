/**
 * Copies runtime libraries from node_modules into assets/ so the theme can
 * serve them without a bundler. Shopify requires a flat assets/ directory.
 *
 * Run with `npm run vendor` after `npm install` or a dependency upgrade.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Array<{ from: string, to: string, banner?: string }>} */
const files = [
  {
    from: 'node_modules/alpinejs/dist/module.esm.min.js',
    to: 'assets/alpine.js',
    banner: 'alpinejs',
  },
  {
    from: 'node_modules/@splidejs/splide/dist/js/splide.esm.js',
    to: 'assets/splide.js',
    banner: '@splidejs/splide',
  },
  {
    from: 'node_modules/@splidejs/splide/dist/css/splide-core.min.css',
    to: 'assets/splide-core.css',
  },
];

async function packageVersion(name) {
  const pkg = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8'));
  return pkg.version;
}

for (const file of files) {
  const from = resolve(root, file.from);
  const to = resolve(root, file.to);
  await mkdir(dirname(to), { recursive: true });

  if (file.banner) {
    const version = await packageVersion(file.banner);
    const source = await readFile(from, 'utf8');
    await writeFile(to, `/* ${file.banner}@${version} - vendored by scripts/vendor.mjs, do not edit */\n${source}`);
  } else {
    await copyFile(from, to);
  }

  console.log(`vendored ${file.from} -> ${file.to}`);
}
