// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// index.mjs - the config + sidebar factories every site calls. One import
// produces the whole Docusaurus config from site.json (design §4.3, §5).

import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { VERTICAL_ACCENTS } from './theme-vars.mjs';

const __engineDir = path.dirname(fileURLToPath(import.meta.url));

const ALL_SITES = [
  { key: 'sentin8', name: 'Sentin8' },
  { key: 'bank8', name: 'Bank8' },
  { key: 'openfin8', name: 'OpenFin8' },
  // Built and deployed like every site; familyHidden only removes it from
  // the SIBLING sites' navbar dropdown + footer (family-visibility rule,
  // design §4.6) - hotel8.dev self-lists normally (design).
  { key: 'hotel8', name: 'Hotel8', familyHidden: true },
  { key: 'exchange8', name: 'Exchange8' },
  { key: 'trade8', name: 'Trade8' },
  { key: 'bill8', name: 'Bill8' },
  { key: 'email8', name: 'Email8' },
];

/** webpack interop fix for the openapi-docs plugin/theme libs. The compiled
 * `lib/**` files are TypeScript-CJS output (`exports.default = …`,
 * `var __createBinding = (this && this.__createBinding) || …`). Two webpack
 * behaviors combine into a browser crash (design §5):
 *
 *  1. webpack's CommonJsExportsParserPlugin bails out of export tracking on the
 *     `this`-guarded helper assignments, leaving `providedExports = ['__esModule']`
 *     - so webpack believes the module exports a namespace and emits
 *     `__webpack_require__.r()` on it while keeping the `exports.default = …`
 *     body verbatim; the free `exports` identifier then throws
 *     `ReferenceError: exports is not defined` in the browser.
 *  2. On the client build, @docusaurus/babel rewrites the helper guards into
 *     `import _x from "…/@babel/runtime/helpers/esm/…"` - a real ESM import
 *     token inside the CJS module, which forces the ESM classification
 *     (mechanism 1) even when the source itself was already CJS.
 *
 * Two engine-injected loaders keep these files pure CommonJS end to end:
 *  - `tsHelperGuardStrip` (pre): strips the `this && this.__x` helper guards so
 *    webpack's export tracking does not bail out;
 *  - `babelEsmHelperImportStrip` (post): rewrites the babel-injected
 *    `helpers/esm` imports to their CommonJS counterparts, removing the ESM
 *    tokens from the client build.
 * Concatenation is additionally disabled (the openapi-docs CJS interop trips
 * webpack 5's ConcatenatedModule - OQ-4 - and the interactive layer is only
 * served with it off). */
const tsHelperGuardStrip = path.resolve(__engineDir, 'ts-helper-guard-strip-loader.cjs');
const babelEsmHelperImportStrip = path.resolve(__engineDir, 'babel-esm-helper-import-strip-loader.cjs');

const webpackInteropFixPlugin = () => ({
  name: 'sentin8-site-engine-openapi-webpack-interop-fix',
  configureWebpack() {
    // docusaurus-(theme|plugin)-openapi-docs compiled lib output: TypeScript-CJS
    // JS files (theme components + markdown/schema generators).
    const openapiLibJs = new RegExp(
      'docusaurus-(theme|plugin)-openapi-docs/lib/.*\\.js$',
    );
    return {
      module: {
        rules: [
          { test: openapiLibJs, loader: tsHelperGuardStrip, enforce: 'pre' },
          { test: openapiLibJs, loader: babelEsmHelperImportStrip, enforce: 'post' },
        ],
      },
      optimization: { concatenateModules: false },
    };
  },
});

/**
 * Build the full Docusaurus config for a site from its site.json inventory.
 * Returns the config object to spread into docusaurus.config.js.
 */
export function makeSiteConfig(site, { devPort = 3000 } = {}) {
  const accent = site.accent || VERTICAL_ACCENTS[site.vertical] || '#D4AF37';
  const domain = site.domain || `${site.vertical}.dev`;

  // Family-visibility rule (design §4.6): a familyHidden roster entry is
  // listed only on its own site - the navbar domain dropdown and the footer
  // "All sites" column render the filtered roster, not the full one.
  const familySites = ALL_SITES.filter(
    (s) => s.key === site.vertical || !s.familyHidden,
  );

  const navbarItems = [];
  if (site.units?.length) {
    navbarItems.push({
      type: 'dropdown',
      label: site.vertical === 'sentin8' ? 'Services' : 'Products',
      position: 'left',
      items: site.units
        .filter((u) => u.kind === 'service')
        .map((u) => ({
          label: u.name,
          to: site.vertical === 'sentin8' ? `/docs/services/${u.slug}/` : `/docs/products/${u.slug}/`,
        })),
    });
  }
  if (site.apps?.length) {
    navbarItems.push({
      type: 'dropdown',
      label: 'Apps',
      position: 'left',
      items: site.apps.map((a) => ({
        label: a.name,
        to: `/docs/apps/${a.slug}/`,
      })),
    });
  }
  navbarItems.push(
    { to: '/docs/security', label: 'Security', position: 'left' },
    { to: '/docs/developers', label: 'Developers', position: 'left' },
    { to: '/docs/samples', label: 'Samples', position: 'left' },
    { type: 'dropdown', label: `${domain}`, position: 'right', items: familySites.map((s) => ({ label: s.name, href: `https://${s.key}.dev/` })) },
    { href: `https://github.com/${site.org}`, label: 'GitHub', position: 'right' },
  );

  return {
    title: site.name || site.vertical,
    tagline: site.tagline,
    url: `https://${domain}`,
    baseUrl: '/',
    onBrokenLinks: 'throw',
    favicon: `img/${site.vertical}-logo.svg`,
    customFields: {
      site,
      accent,
      domain,
    },
    themes: ['@docusaurus/theme-mermaid', 'docusaurus-theme-openapi-docs'],
    plugins: [
      // Interactive OpenAPI reference (OQ-4 resolution upgrade): one plugin
      // instance covers every harvested spec (per-unit entries in
      // `openapi/config.json`, written by `scripts/openapi-api-docs.mjs` at
      // harvest). Pages render under docs/api/{unit}/** with
      // request/response schema trees; the static typographic `api.md`
      // stays for search + the dossier voice.
      ...buildOpenApiPlugins(site),
      // webpack interop fix (OQ-4): keep the openapi-docs plugin/theme CJS
      // libs pure CommonJS end to end - see the loader doc block above.
      webpackInteropFixPlugin,
    ],
    themeConfig: {
      mermaid: { theme: { dark: 'dark', light: 'default' } },
      colorMode: {
        defaultMode: 'dark',
      },
      navbar: {
        title: site.name || site.vertical,
        logo: { alt: `${site.name || site.vertical} logo`, src: `img/${site.vertical}-logo.svg` },
        items: navbarItems,
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Site',
            items: [
              { label: 'Home', to: '/' },
              { label: 'Docs', to: '/docs' },
              { label: 'Security', to: '/docs/security' },
            ],
          },
          {
            title: 'All sites',
            items: familySites.map((s) => ({ label: s.name, href: `https://${s.key}.dev/` })),
          },
        ],
        copyright: `<svg width="100" version="1.1" viewBox="0 0 50.516 19.401" xmlns="http://www.w3.org/2000/svg">
 <g transform="translate(-56.622 -120.3)">
  <path d="m61.512 120.3q-0.94192 1.4288-1.6404 2.4765-0.6985 1.0372-1.1959 1.778-0.49742 0.74083-0.81492 1.2277-0.3175 0.47625-0.49742 0.78317-0.17992 0.30692-0.254 0.48683-0.0635 0.17992-0.0635 0.30692 0 0.26458 0.23283 0.26458 0.26458 0 0.61383-0.21166 0.35983-0.22225 0.762-0.59267 0.41275-0.381 0.83608-0.87842 0.42333-0.508 0.8255-1.0795l0.11642 0.0423q-0.381 0.53975-0.80433 1.0478-0.42333 0.49741-0.81492 0.86783-0.51858 0.48683-0.89958 0.70908-0.37042 0.22225-0.67733 0.22225-0.32808 0-0.47625-0.14816-0.13758-0.14817-0.13758-0.39159 0-0.22225 0.07408-0.45508 0.08467-0.24342 0.27517-0.5715 0.1905-0.33867 0.49742-0.81492 0.3175-0.47625 0.77258-1.1642 0.46567-0.6985 1.0901-1.651 0.62442-0.96309 1.4393-2.2542z"/>
  <path d="m65.075 124.99q-0.254 0.28575-0.5715 0.45509-0.3175 0.16933-0.62442 0.16933-0.29633 0-0.508-0.127-0.21167-0.13758-0.32808-0.3175h-0.02117q-0.10583 0.40217-0.39158 0.85725t-0.68792 0.83608q-0.39158 0.381-0.86783 0.635t-0.97367 0.254q-0.45508 0-0.68792-0.26458t-0.23283-0.70908q0-0.23284 0.11642-0.53975 0.11642-0.30692 0.3175-0.61384 0.21167-0.3175 0.48683-0.61383 0.28575-0.30692 0.61383-0.53975 0.32808-0.24342 0.68792-0.381 0.37042-0.14817 0.74083-0.14817 0.43392 0 0.66675 0.254 0.24342 0.254 0.26458 0.65617 0.02117 0.24342 0.22225 0.45508 0.21167 0.20109 0.5715 0.20109 0.3175 0 0.59267-0.15875 0.28575-0.15875 0.52917-0.41275zm-5.3234 2.0426q0 0.27516 0.10583 0.43391t0.3175 0.15875q0.28575 0 0.56092-0.14816 0.28575-0.15875 0.53975-0.40217 0.26458-0.254 0.48683-0.5715t0.381-0.65617q0.16933-0.33866 0.26458-0.65616 0.09525-0.32809 0.09525-0.59267 0-0.22225-0.11642-0.37042-0.10583-0.15875-0.33867-0.15875-0.22225 0-0.47625 0.14817-0.254 0.13758-0.51858 0.37042-0.254 0.23283-0.48683 0.53975-0.23283 0.30691-0.42333 0.635-0.17992 0.32808-0.28575 0.65616-0.10583 0.32809-0.10583 0.61384z"/>
  <path d="m68.603 124.03q-0.635 0.85725-1.2065 1.7462-0.56092 0.889-1.1642 1.7674 0.52917-0.11642 1.0372-0.381 0.51858-0.26459 0.97367-0.635 0.45508-0.37042 0.83608-0.81492 0.39158-0.4445 0.65617-0.89958l0.04233 0.0635q-0.46567 0.79375-1.0266 1.3229-0.55033 0.52917-1.0689 0.84667-0.51858 0.3175-0.93133 0.46567-0.41275 0.13758-0.59267 0.15875-0.05292 0.0318-0.21167 0.27516-0.15875 0.24342-0.42333 0.59267-0.26458 0.34925-0.635 0.74083-0.35983 0.39159-0.8255 0.71967-0.45508 0.33867-1.016 0.56092-0.56092 0.22225-1.2065 0.22225-0.381 0-0.70908-0.0847-0.32808-0.0847-0.56092-0.24342-0.24342-0.15875-0.37042-0.381-0.13758-0.22225-0.13758-0.49741 0-0.45509 0.32808-0.762 0.32808-0.29634 0.8255-0.29634 0.10583 0 0.17992 0.0106 0.0635 0.0106 0.13758 0.0317v0.0847h-0.08467q-0.41275 0-0.61383 0.254-0.20108 0.26459-0.20108 0.6985 0 0.28575 0.10583 0.48684 0.09525 0.20108 0.27517 0.32808 0.16933 0.127 0.40217 0.17992 0.23283 0.0635 0.508 0.0635 0.46567 0 0.92075-0.22225 0.4445-0.21167 0.85725-0.5715 0.41275-0.34925 0.78317-0.79375 0.381-0.4445 0.70908-0.89959 0.33867-0.4445 0.61383-0.85725 0.27517-0.42333 0.48683-0.71966l-0.02117-0.0212q-0.16933 0.20108-0.381 0.41275-0.20108 0.20108-0.43392 0.381-0.23283 0.16933-0.48683 0.28575-0.254 0.10583-0.52917 0.10583-0.20108 0-0.34925-0.0741-0.14817-0.0741-0.24342-0.1905-0.09525-0.127-0.13758-0.27517-0.04233-0.14816-0.04233-0.28575 0-0.32808 0.13758-0.67733 0.14817-0.34925 0.381-0.67733 0.23283-0.33867 0.53975-0.62442 0.30692-0.29633 0.635-0.51858 0.33867-0.22225 0.67733-0.34925 0.33867-0.13759 0.62442-0.13759 0.41275 0 0.59267 0.21167 0.1905 0.20108 0.1905 0.47625h0.03175l0.39158-0.60325zm-1.9579 0.0423q-0.34925 0-0.762 0.29634-0.40217 0.28575-0.762 0.71966-0.34925 0.43392-0.58208 0.94192-0.23283 0.508-0.23283 0.9525 0 0.23283 0.11642 0.381 0.127 0.13758 0.3175 0.13758 0.14817 0 0.381-0.11641 0.24342-0.127 0.49742-0.33867 0.26458-0.22225 0.52917-0.508 0.26458-0.29633 0.46567-0.62442 0.21167-0.32808 0.33867-0.67733 0.13758-0.35983 0.13758-0.70908 0-0.17992-0.10583-0.3175-0.09525-0.13759-0.33867-0.13759z"/>
  <path d="m70.893 124.03q-0.58208 0.83608-0.98425 1.4076-0.40217 0.5715-0.65617 0.9525-0.24342 0.381-0.35983 0.60325-0.10583 0.22225-0.10583 0.35984 0 0.27516 0.22225 0.27516 0.21167 0 0.48683-0.14816 0.28575-0.15875 0.59267-0.40217t0.61383-0.55033q0.30692-0.30692 0.5715-0.60325 0.27517-0.30692 0.47625-0.58209 0.21167-0.28575 0.30692-0.46566l0.08467 0.0529q-0.127 0.21167-0.34925 0.508-0.21167 0.29634-0.48683 0.61384-0.27517 0.30691-0.58208 0.61383t-0.62442 0.55033q-0.3175 0.24342-0.62442 0.39159-0.29633 0.14816-0.55033 0.14816-0.28575 0-0.42333-0.15875t-0.13758-0.34925q0-0.22225 0.09525-0.46566 0.10583-0.254 0.32808-0.61384 0.22225-0.35983 0.5715-0.86783 0.35983-0.51858 0.85725-1.27zm0.61383-1.9685q0.14817 0 0.24342 0.10583 0.09525 0.0953 0.09525 0.24342 0 0.14817-0.09525 0.254-0.09525 0.0952-0.24342 0.0952-0.14817 0-0.24342-0.0952-0.09525-0.10583-0.09525-0.254t0.09525-0.24342q0.09525-0.10583 0.24342-0.10583z"/>
  <path d="m75.609 125.01q-0.24342 0.39158-0.64558 0.84667-0.39158 0.4445-0.85725 0.83608-0.5715 0.47625-1.143 0.77258-0.5715 0.28575-1.1218 0.28575-0.39158 0-0.65617-0.20108-0.26458-0.21167-0.26458-0.61383 0-0.508 0.28575-1.0372 0.29633-0.52917 0.73025-0.96308 0.4445-0.4445 0.96308-0.71967 0.52917-0.27517 0.99483-0.27517 0.30692 0 0.52917 0.11642 0.23283 0.10583 0.23283 0.381 0 0.127-0.07408 0.21167-0.0635 0.0847-0.16933 0.13758-0.09525 0.0529-0.22225 0.0847-0.11642 0.0212-0.21167 0.0318 0.04233-0.10584 0.07408-0.21167 0.03175-0.11642 0.03175-0.23283 0-0.39159-0.37042-0.39159-0.27517 0-0.65617 0.27517-0.37042 0.26458-0.70908 0.67733-0.32808 0.41275-0.56092 0.91017-0.23283 0.49742-0.23283 0.96308 0 0.28575 0.127 0.48684 0.13758 0.20108 0.41275 0.20108 0.37042 0 0.84667-0.24342 0.48683-0.24341 0.94192-0.60325 0.47625-0.37041 0.91017-0.84666 0.4445-0.48684 0.74083-0.94192z"/>
  <path d="m78.424 124.03h0.68792q-0.39158 0.55033-0.75142 1.0689-0.35983 0.51858-0.64558 0.96308-0.27517 0.43392-0.4445 0.77258-0.16933 0.32809-0.16933 0.51859 0 0.27516 0.28575 0.27516 0.22225 0 0.56092-0.21166 0.34925-0.22225 0.75142-0.60325t0.8255-0.889 0.80433-1.0795l0.0635 0.0212q-0.28575 0.43392-0.67733 0.94192-0.381 0.49742-0.80433 0.93133-0.42333 0.43392-0.84667 0.73025-0.42333 0.28575-0.79375 0.28575-0.30692 0-0.45508-0.14816-0.13758-0.15875-0.13758-0.37042 0-0.14817 0.04233-0.28575 0.05292-0.14817 0.10583-0.29633l-0.02117-0.0106q-0.13758 0.14817-0.34925 0.34925-0.20108 0.1905-0.4445 0.35984-0.23283 0.16933-0.48683 0.28575-0.254 0.11641-0.48683 0.11641-0.39158 0-0.55033-0.24341-0.15875-0.24342-0.15875-0.55034 0-0.43391 0.27517-0.9525 0.27517-0.52916 0.6985-0.98425 0.42333-0.46566 0.92075-0.77258t0.94192-0.30692q0.21167 0 0.37042 0.0635 0.15875 0.0529 0.26458 0.15875 0.10583 0.0952 0.15875 0.22225 0.0635 0.127 0.09525 0.26459h0.02117zm-3.4608 2.9633q0 0.24342 0.09525 0.381 0.10583 0.127 0.28575 0.127 0.17992 0 0.42333-0.127 0.24342-0.13758 0.508-0.35983 0.26458-0.22225 0.51858-0.508 0.26458-0.29633 0.46567-0.62442 0.20108-0.32808 0.32808-0.66675 0.127-0.33866 0.127-0.64558 0-0.24342-0.13758-0.37042-0.13758-0.127-0.33867-0.127-0.3175 0-0.70908 0.27517-0.39158 0.27517-0.74083 0.70908-0.34925 0.42334-0.59267 0.94192-0.23283 0.51858-0.23283 0.99483z"/>
  <path d="m83.836 120.3q-0.94192 1.4288-1.6404 2.4765-0.6985 1.0372-1.1959 1.778-0.49742 0.74083-0.81492 1.2277-0.3175 0.47625-0.49742 0.78317t-0.254 0.48683q-0.0635 0.17992-0.0635 0.30692 0 0.26458 0.23283 0.26458 0.26458 0 0.61383-0.21166 0.35983-0.22225 0.762-0.59267 0.41275-0.381 0.83608-0.87842 0.42333-0.508 0.8255-1.0795l0.11642 0.0423q-0.381 0.53975-0.80433 1.0478-0.42333 0.49741-0.81492 0.86783-0.51858 0.48683-0.89958 0.70908-0.37042 0.22225-0.67733 0.22225-0.32808 0-0.47625-0.14816-0.13758-0.14817-0.13758-0.39159 0-0.22225 0.07408-0.45508 0.08467-0.24342 0.27517-0.5715 0.1905-0.33867 0.49742-0.81492 0.3175-0.47625 0.77258-1.1642 0.46567-0.6985 1.0901-1.651 0.62442-0.96309 1.4393-2.2542z"/>
  <path d="m86.193 120.3q-0.94192 1.4288-1.6404 2.4765-0.6985 1.0372-1.1959 1.778-0.49742 0.74083-0.81492 1.2277-0.3175 0.47625-0.49742 0.78317-0.17992 0.30692-0.254 0.48683-0.0635 0.17992-0.0635 0.30692 0 0.26458 0.23283 0.26458 0.26458 0 0.61383-0.21166 0.35983-0.22225 0.762-0.59267 0.41275-0.381 0.83608-0.87842 0.42333-0.508 0.8255-1.0795l0.11642 0.0423q-0.381 0.53975-0.80433 1.0478-0.42333 0.49741-0.81492 0.86783-0.51858 0.48683-0.89958 0.70908-0.37042 0.22225-0.67733 0.22225-0.32808 0-0.47625-0.14816-0.13758-0.14817-0.13758-0.39159 0-0.22225 0.07408-0.45508 0.08467-0.24342 0.27517-0.5715 0.1905-0.33867 0.49742-0.81492 0.3175-0.47625 0.77258-1.1642 0.46567-0.6985 1.0901-1.651 0.62442-0.96309 1.4393-2.2542z"/>
  <path d="m86.189 124.03q-0.381 0.55033-0.762 1.0583t-0.68792 0.93134q-0.29633 0.42333-0.48683 0.75141-0.1905 0.3175-0.1905 0.508 0 0.30692 0.29633 0.30692 0.30692 0 0.70908-0.29633 0.41275-0.29634 0.86783-0.78317 0.45508-0.49742 0.92075-1.1324 0.47625-0.64558 0.91017-1.3441h0.65617q-0.62442 0.85725-1.1642 1.7674-0.53975 0.89958-1.1324 1.7886 1.0054-0.17992 1.9156-0.87842 0.92075-0.70908 1.6298-1.7568l0.07408 0.0317q-0.762 1.1642-1.7357 1.8732-0.96308 0.6985-1.9579 0.85725-0.41275 0.56092-0.84667 1.1324-0.42333 0.58208-0.94192 1.0372-0.508 0.46567-1.1218 0.75142-0.61383 0.29633-1.3864 0.29633-0.34925 0-0.65617-0.0952-0.3175-0.0847-0.55033-0.24341-0.23283-0.15875-0.37042-0.381t-0.13758-0.47625q0-0.55034 0.37042-0.80434 0.35983-0.254 0.87842-0.254v0.0318q-0.381 0.0847-0.56092 0.33867-0.17992 0.26458-0.17992 0.65617 0 0.26458 0.10583 0.46566 0.10583 0.21167 0.27517 0.34925 0.16933 0.13759 0.39158 0.21167 0.21167 0.0741 0.4445 0.0741 0.49742 0 0.96308-0.23283t0.89958-0.61383q0.42333-0.381 0.81492-0.86784 0.39158-0.47625 0.74083-0.99483 0.34925-0.508 0.64558-0.99483 0.30692-0.49742 0.56092-0.889l-0.02117-0.0212q-0.16933 0.20108-0.41275 0.47625-0.24342 0.26458-0.53975 0.508-0.28575 0.24342-0.61383 0.41275-0.32808 0.16933-0.67733 0.16933-0.33867 0-0.48683-0.13758-0.14817-0.13758-0.14817-0.37042 0-0.21166 0.11642-0.4445 0.10583-0.24341 0.34925-0.60325 0.24342-0.35983 0.61383-0.87841 0.381-0.51859 0.91017-1.2912z"/>
  <path d="m68.917 136.65 2.2719-5.5192h3.4078v0.22843h-0.27164q-0.37042 0-0.59267 0.12964-0.15434 0.0864-0.24694 0.29016-0.06791 0.14817-0.06791 0.7717v5.5192q0 0.64205 0.06791 0.80257 0.06791 0.16051 0.27781 0.28398 0.2099 0.1173 0.5618 0.1173h0.27164v0.22843h-4.3709v-0.22843h0.27164q0.37042 0 0.59267-0.12964 0.15434-0.0864 0.24694-0.29634 0.06791-0.14816 0.06791-0.77787v-6.2045l-3.2103 7.6368h-0.14817l-3.2597-7.5812v5.8958q0 0.61736 0.03087 0.75935 0.08026 0.30869 0.34572 0.50624 0.27164 0.19138 0.84579 0.19138v0.22843h-2.8646v-0.22843h0.08643q0.27781 6e-3 0.51858-0.0864 0.24077-0.0988 0.36424-0.25929 0.12347-0.16051 0.19138-0.45067 0.01235-0.0679 0.01235-0.62971v-5.297q0-0.63588-0.06791-0.79022-0.06791-0.16051-0.27781-0.27781-0.2099-0.12347-0.5618-0.12347h-0.26546v-0.22843h3.4202z"/>
  <path d="m80.079 137.12h-2.9572l-0.3519 0.81492q-0.17286 0.40746-0.17286 0.67292 0 0.3519 0.28399 0.51859 0.16669 0.0988 0.82109 0.14816v0.22843h-2.7843v-0.22843q0.45067-0.0679 0.74083-0.37041 0.29016-0.30868 0.71614-1.2656l2.9942-6.6798h0.1173l3.0189 6.8651q0.43215 0.97543 0.70997 1.2286 0.2099 0.19139 0.59267 0.22225v0.22843h-4.0499v-0.22843h0.16669q0.48772 0 0.68527-0.13582 0.13582-0.0988 0.13582-0.28398 0-0.11113-0.03704-0.22843-0.01235-0.0556-0.18521-0.46302zm-0.2099-0.45685-1.2471-2.8831-1.2841 2.8831z"/>
  <path d="m92.679 130.94v2.951h-0.22842q-0.41363-1.21-1.2409-1.8397-0.82726-0.62971-1.8089-0.62971-0.93839 0-1.5619 0.53093-0.62354 0.52476-0.88283 1.4693-0.25929 0.94457-0.25929 1.9385 0 1.2039 0.28399 2.1114 0.28399 0.90752 0.9137 1.3335 0.63588 0.42598 1.5064 0.42598 0.30251 0 0.61736-0.0617 0.32103-0.0679 0.6544-0.19138v-1.741q0-0.49389-0.06791-0.63588-0.06791-0.14817-0.28399-0.26547-0.2099-0.1173-0.51241-0.1173h-0.21608v-0.22842h4.0684v0.22842q-0.46302 0.0309-0.64823 0.12965-0.17904 0.0926-0.27781 0.31485-0.05556 0.1173-0.05556 0.57415v1.741q-0.80257 0.35807-1.6731 0.5371-0.86431 0.18521-1.7965 0.18521-1.1915 0-1.9817-0.32103-0.78405-0.3272-1.3891-0.85195-0.59884-0.53094-0.93839-1.1915-0.43215-0.85196-0.43215-1.9076 0-1.8891 1.3273-3.1918t3.3399-1.3026q0.62354 0 1.1236 0.0988 0.27164 0.0494 0.87665 0.28399 0.61119 0.22843 0.72231 0.22843 0.17286 0 0.32103-0.12348 0.14817-0.12964 0.27164-0.48154z"/>
  <path d="m98.415 139.28v0.22843h-4.3771v-0.22843h0.27781q0.36424 0 0.58649-0.12964 0.16051-0.0864 0.24694-0.29634 0.06791-0.14816 0.06791-0.77787v-5.5069q0-0.64205-0.06791-0.80257-0.06791-0.16051-0.27781-0.27781-0.20373-0.12347-0.55563-0.12347h-0.27781v-0.22843h4.3771v0.22843h-0.27781q-0.36424 0-0.58649 0.12964-0.16051 0.0864-0.25312 0.29634-0.06791 0.14816-0.06791 0.77787v5.5069q0 0.64205 0.06791 0.80257 0.07408 0.16051 0.27781 0.28398 0.2099 0.1173 0.5618 0.1173z"/>
  <path d="m107.14 130.94v2.9016h-0.24077q-0.27164-1.1359-1.0125-1.741-0.74083-0.60501-1.6792-0.60501-0.78405 0-1.4384 0.45067-0.65441 0.45067-0.95691 1.1792-0.38894 0.93222-0.38894 2.0743 0 1.1236 0.28399 2.0496 0.28398 0.91987 0.889 1.3952 0.60501 0.4692 1.5681 0.4692 0.79022 0 1.4446-0.34572 0.66058-0.34573 1.3891-1.1915v0.72231q-0.7038 0.73466-1.4693 1.068-0.75935 0.3272-1.778 0.3272-1.3397 0-2.383-0.53711-1.0372-0.5371-1.6051-1.5434-0.5618-1.0063-0.5618-2.1422 0-1.1977 0.62354-2.2719 0.62971-1.0742 1.6916-1.6669 1.068-0.59267 2.2657-0.59267 0.88283 0 1.8644 0.38276 0.56798 0.22226 0.72232 0.22226 0.19755 0 0.33955-0.142 0.14816-0.14816 0.19138-0.46302z"/>
  <path d="m95.926 124.97q-0.03924-0.67683-0.27465-1.3438-0.33351-0.96129-0.33351-1.3242 0-0.51007 0.23542-0.77492 0.24523-0.26484 0.59835-0.26484 0.30408 0 0.52969 0.26484 0.22561 0.26485 0.22561 0.7553 0 0.44141-0.26484 1.236-0.25504 0.78472-0.31389 1.4517 0.5395-0.34332 0.9711-0.83377 0.66702-0.77492 0.99072-0.96129t0.65721-0.18637q0.3237 0 0.5395 0.2256 0.22561 0.2158 0.22561 0.51989 0 0.36293-0.3237 0.6474-0.3237 0.28446-1.6185 0.56892-0.7553 0.16676-1.2556 0.38256 0.51007 0.26484 1.2458 0.40217 1.1869 0.2158 1.5498 0.5395 0.37275 0.3237 0.37275 0.70625 0 0.29428-0.22561 0.51008-0.2158 0.2158-0.51007 0.2158-0.29427 0-0.65721-0.20599-0.35313-0.20599-0.96129-0.92206-0.40217-0.48064-1.0005-0.90243 0.01962 0.55911 0.22561 1.2163 0.35313 1.1575 0.35313 1.5793 0 0.39236-0.23542 0.66701-0.23542 0.26485-0.50026 0.26485-0.36294 0-0.65721-0.28446-0.20599-0.20599-0.20599-0.65721 0-0.47084 0.22561-1.128 0.22561-0.66702 0.28446-0.91224 0.05885-0.25504 0.1079-0.74549-0.57874 0.38255-1.0103 0.85339-0.71606 0.80434-1.079 1.0201-0.25504 0.15695-0.52969 0.15695-0.33351 0-0.56893-0.22561t-0.23542-0.50027q0-0.24522 0.19618-0.51007 0.20599-0.27465 0.60816-0.45122 0.26485-0.11771 1.2065-0.31389 0.60816-0.12752 1.1869-0.37274-0.52969-0.26485-1.2654-0.41198-1.2065-0.25504-1.491-0.46103-0.44141-0.3237-0.44141-0.78473 0-0.26484 0.2158-0.48064 0.22561-0.22561 0.51988-0.22561 0.3237 0 0.68664 0.20599 0.36294 0.20599 0.90244 0.83377 0.5395 0.61797 1.0986 0.96129z" fill="orange"/>
 </g>
</svg><br/>
Formerly PRIME (<code>authPrime</code>, <code>exchangePRIME</code>) - trusted by exchanges and banks worldwide - now Sentin8 (<code>Sentin8:Auth</code>, <code>Exchange8</code>), migrated from SVN to GitHub.<br/>
Copyright &copy;  ${new Date().getFullYear()} <a href="https://www.logicallymagic.com" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">logically MAGIC</a>`,
      },
      prism: {
        theme: undefined,
        magicComments: [],
      },
    },
    presets: [
      [
        'classic',
        {
          docs: {
            routeBasePath: 'docs',
            sidebarPath: './sidebars.js',
            editUrl: `https://github.com/${site.org}/${site.vertical}-site/edit/main/`,
            showLastUpdateTime: false,
            // API reference pages hydrate the openapi theme's store-backed
            // explorer: route them through @theme/ApiItem so the redux
            // Provider (ApiItem) wraps every /docs/api/** page.
            docItemComponent: '@theme/ApiItem',
            // The autogenerated generator would also claim every generated
            // api page (docs/api/**) as flat sidebar entries alongside the
            // engine's hierarchical api slices - filter the api subtree out
            // here so the menu is owned by the path trie alone. The filter
            // is recursive (a category is dropped only when its whole
            // subtree is api items); every other generated item survives
            // exactly as the default generator produced it.
            sidebarItemsGenerator: ({ defaultSidebarItemsGenerator, ...args }) => {
              const dropApi = (items) =>
                items
                  .filter((item) => !(item.id || '').startsWith('api/'))
                  .map((item) => (item.items ? { ...item, items: dropApi(item.items) } : item))
                  .filter(
                    (item) =>
                      item.type !== 'category' ||
                      (item.items || []).length > 0 ||
                      // category-index pages: Docusaurus links the index doc
                      // into the category and legitimately leaves items empty
                      item.link !== undefined,
                  );
              return dropApi(defaultSidebarItemsGenerator({ ...args }));
            },
          },
          blog: false,
          sitemap: {},
          // Webpack-resolved CSS: the engine theme (s8-* design system) + the
          // site's accent override. custom.css previously only @import'ed the
          // engine theme - css-loader does NOT resolve package-export
          // subpaths inside @import, so it silently no-oped and every s8-*
          // class rendered unstyled (the "links look like one word" defect).
          // Docusaurus resolves non-relative customCss entries against the
          // site root, so the engine CSS goes through node_modules explicitly.
          theme: {
            customCss: [
              'node_modules/@sentin8/site-engine/src/theme.css',
              './src/css/custom.css',
            ],
          },
        },
      ],
    ],
    markdown: {
      mermaid: true,
    },
    scripts: [],
    headTags: [
      { tagName: 'meta', attributes: { name: 'referrer', content: 'no-referrer' } },
      // Social-share metadata (link previews): WhatsApp/LinkedIn/X scrape
      // OpenGraph + twitter:card tags on the FIRST HTML response - without
      // them a shared link renders bare text, no image, no description
      // (owner finding: "when we share the sites on whatsapp and linkedin,
      // it should show the icon as image"). The card is a 1200x630 PNG at
      // static/img/og-card.png (Social scrapers never render SVG; generate
      // it with `scripts/og-images.mjs <siteDir>` from the vertical's logo +
      // site.json - regenerable, single source of truth). URLs must be
      // ABSOLUTE (scrapers do not resolve relative image URLs).
      { tagName: 'meta', attributes: { property: 'og:type', content: 'website' } },
      { tagName: 'meta', attributes: { property: 'og:site_name', content: site.name || site.vertical } },
      { tagName: 'meta', attributes: { property: 'og:title', content: site.name || site.vertical } },
      { tagName: 'meta', attributes: { property: 'og:description', content: site.tagline ?? '' } },
      { tagName: 'meta', attributes: { property: 'og:url', content: `https://${domain}/` } },
      {
        tagName: 'meta',
        attributes: {
          property: 'og:image',
          content: `https://${domain}/img/og-card.png`,
        },
      },
      { tagName: 'meta', attributes: { property: 'og:image:width', content: '1200' } },
      { tagName: 'meta', attributes: { property: 'og:image:height', content: '630' } },
      { tagName: 'meta', attributes: { property: 'og:image:alt', content: `${site.name || site.vertical} logo` } },
      { tagName: 'meta', attributes: { name: 'twitter:card', content: 'summary_large_image' } },
      { tagName: 'meta', attributes: { name: 'twitter:title', content: site.name || site.vertical } },
      { tagName: 'meta', attributes: { name: 'twitter:description', content: site.tagline ?? '' } },
      { tagName: 'meta', attributes: { name: 'twitter:image', content: `https://${domain}/img/og-card.png` } },
      // Quicksand - the default font family for all sites (owner decision
      // 2026-10-16). Weights 300-700; the theme maps everything to <=700.
      { tagName: 'link', attributes: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
      { tagName: 'link', attributes: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' } },
      {
        tagName: 'link',
        attributes: {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&display=swap',
        },
      },
    ],
    ...(site.noindex ? { noIndex: true } : {}),
  };
}

/**
 * Docs sidebar: fully autogenerated from the docs/ directory tree.
 * Section ordering and labels are owned by the `_category_.json` files the
 * scaffolder writes (docs/, docs/security/, docs/{products|services}/,
 * docs/reference/, …) - Docusaurus flattens autogenerated categories per
 * those files, so the factory needs no per-unit knowledge here.
 *
 * The interactive API reference pages append per-unit HIERARCHICAL slices
 * built at harvest from the generated pages (path-segment trie,
 * `docs/api/{slug}/sidebar.json`, written by
 * `scripts/openapi-api-docs.mjs` `writeHierarchicalSidebar`): category per
 * path segment with single-child compression, operations as leaves with
 * their method chip.
 * The interactive API reference lives under ONE top-level `API` root
 * category: `listApiSlices` merges every per-unit unit category into the
 * root's `items`, and the root links to the first unit-overview doc so the
 * collapsed top-level item still opens the reference. Other top-level
 * sections (Security, Products, SDKs, Developers, Samples, Reference) are
 * untouched - they keep riding the autogenerated sidebar.
 */
export function makeSidebars() {
  const fs = await_fs();
  const slices = fs
    ? listApiSlices(process.cwd(), fs)
    : [];
  if (slices.length === 0) {
    return { docs: [{ type: 'autogenerated', dirName: '.' }] };
  }
  const firstUnit = slices[0];
  const rootDocId =
    firstUnit.items?.[0]?.id ||
    (firstUnit.link?.type === 'doc' ? firstUnit.link.id : undefined) ||
    firstUnit.items?.[0]?.link?.id;
  return {
    docs: [
      { type: 'autogenerated', dirName: '.' },
      {
        type: 'category',
        label: 'API',
        ...(rootDocId ? { link: { type: 'doc', id: rootDocId } } : {}),
        ...(firstUnit.items?.[0]?.id ? { className: 'api-overview' } : {}),
        collapsed: true,
        items: slices,
      },
    ],
  };
}

/** Load the engine-generated hierarchical API sidebar slices (one
 * `api/{slug}/sidebar.json` per harvested unit). Missing/failed slices
 * degrade to nothing for that unit - the interactive pages still ride the
 * docs autogenerated sidebar (and with no slices at all the API root is
 * omitted entirely). Returns the plain categories per unit (the JSON top
 * level is an array of category items) for the API-root wrapper to nest. */
function listApiSlices(siteDir, fs2) {
  // The slices live under the docs content dir (they were written next to the
  // generated pages).
  const dir = path.join(siteDir, 'docs', 'api');
  if (!fs2.existsSync(dir)) return [];
  const out = [];
  for (const slug of fs2.readdirSync(dir).sort()) {
    const slicePath = path.join(dir, slug, 'sidebar.json');
    if (!fs2.existsSync(slicePath)) continue;
    try {
      const parsed = JSON.parse(fs2.readFileSync(slicePath, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) out.push(...parsed);
    } catch (err) {
      console.warn(`site-engine: api/${slug}/sidebar.json unparsable (${err.message}) - its interactive pages ride the docs sidebar`);
    }
  }
  return out;
}
/**
 * OpenAPI interactive-reference plugin list (OQ-4 upgrade).
 *
 * `scripts/openapi-api-docs.mjs` (run at harvest, before the Docusaurus
 * build) copies every unit spec to `openapi/{slug}-spec.json` and writes the
 * per-unit options into the `openapi/config.json` sidecar (a keyed object -
 * the plugin validates `config` as an object of entries, not an array). This
 * factory turns that sidecar into one `docusaurus-plugin-openapi-docs`
 * instance covering every unit - pages generate under docs/api/{slug}/**
 * (inside the docs content dir) with per-tag sidebar groups. A missing
 * sidecar (brand-new site pre-harvest, or no API-carrying units)
 * contributes nothing: the static api.md pages still render.
 *
 * The sidecar is JSON (not YAML) on purpose: the site config factory is
 * imported by docusaurus.config.js in Node, and a JSON parse needs no extra
 * dependency in the engine.
 */
export function buildOpenApiPlugins(site) {
  const fs = await_fs();
  const sidecarPath = path.join(process.cwd(), 'openapi', 'config.json');
  if (!fs || !fs.existsSync(sidecarPath)) return [];
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch (err) {
    console.warn(`site-engine: ${sidecarPath} unparsable (${err.message}) - interactive API reference skipped`);
    return [];
  }
  if (!entries || typeof entries !== 'object') return [];
  const keys = Object.keys(entries);
  if (keys.length === 0) return [];
  // NOTE the WRAPPER array: makeSiteConfig spreads the return value into the
  // plugins list (`...buildOpenApiPlugins(site)`), so a bare 2-tuple would
  // flatten into a string + a bare object (both invalid plugin entries).
  return [
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'openapi-docs',
        docsPluginId: 'default',
        config: entries,
      },
    ],
  ];
}

/** Node fs for config-time reads; the module also loads in tooling contexts
 * where fs is absent - degrade to "no interactive API" instead of throwing. */
function await_fs() {
  try {
    return createRequire(import.meta.url)('node:fs');
  } catch (err) {
    return null;
  }
}
