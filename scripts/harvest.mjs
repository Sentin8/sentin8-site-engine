#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// harvest.mjs - build-time docs harvester (design/sentin8-websites-design.md §4.2).
//
// For every unit in site.json: pull README.md / DESIGN.md / BUSINESS.md /
// SECURITY.md / CHANGELOG.md from the unit's own repository, and emit them
// under docs/reference/{unit}/ as reference pages:
//   - README.md   → overview.mdx (format: md - maintainer prose may contain
//                   raw HTML/angle brackets that MDX would reject)
//   - DESIGN.md   → design.md
//   - BUSINESS.md → business.md
//   - SECURITY.md → security.md
//   - CHANGELOG.md → changelog.md
//
// Resolution order: local sibling folder (../../{repo}/) first - local dev
// and the aggregation tree never need the network - then
// raw.githubusercontent.com/{org}/{repo}/main/{file}. A missing remote file
// fails the build (docs never silently trail).
//
// Usage: node harvest.mjs [site-dir]   (default: CWD)

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BRANCH = 'main';
const SIBLING_DIRS = ['../../', '../', './'];

const arg = process.argv[2] || process.cwd();
const siteDir = path.resolve(arg);
const siteJsonPath = path.join(siteDir, 'site.json');
if (!existsSync(siteJsonPath)) {
  console.error(`harvest: no site.json at ${siteJsonPath}`);
  process.exit(1);
}
const site = JSON.parse(readFileSync(siteJsonPath, 'utf8'));

const outRoot = path.join(siteDir, 'docs', 'reference');
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

// Section landing for the harvested tree (the wipe removed any
// scaffolder-written copy; this one is always current).
writeFileSync(
  path.join(outRoot, 'index.md'),
  [
    '---',
    'sidebar_position: 1',
    '---',
    '',
    '# Reference',
    '',
    `Architecture deep-dives harvested at build time from each unit's own`,
    'repository - README (overview), DESIGN (DDD), BUSINESS (BRD), and the',
    'canonical SECURITY. The repositories stay the source of truth; the',
    'harvester re-renders this section on every build.',
    '',
  ].join('\n'),
);

// Category metadata for the section itself (label + position).
writeFileSync(
  path.join(outRoot, '_category_.json'),
  JSON.stringify({ label: 'Reference (harvested)', position: 60 }, null, 2) + '\n',
);

const units = [
  ...site.units.filter((u) => u.kind === 'service' || u.kind === 'starter'),
  ...(site.starters || []).map((s) => ({ ...s, kind: 'starter' })),
  ...(site.apps || []).map((a) => ({ ...a, kind: 'app' })),
  ...(site.sdks || []).map((s) => ({ ...s, kind: 'sdk' })),
];

let harvested = 0;
let failures = 0;

const isPlatform = site.vertical === 'sentin8';
const productDir = isPlatform ? 'services' : 'products';

for (const unit of units) {
  const { slug, repo, org } = unit;
  if (!slug || !repo) continue;

  // Routing (WEB §4.5, the product dossier): service/starter docs embed
  // INSIDE the product tree; app docs inside the app tree; everything also
  // lands in the consolidated reference tree.
  const unitDir =
    unit.kind === 'service' || unit.kind === 'starter'
      ? path.join(siteDir, 'docs', productDir, slug)
      : unit.kind === 'app'
        ? path.join(siteDir, 'docs', 'apps', slug)
        : path.join(siteDir, 'docs', 'sdk', slug);
  mkdirSync(unitDir, { recursive: true });
  const refDir = path.join(outRoot, slug);
  mkdirSync(refDir, { recursive: true });
  // Category metadata for the reference subtree.
  writeFileSync(
    path.join(refDir, '_category_.json'),
    JSON.stringify({ label: unit.name || slug, position: 100 + (units.indexOf(unit) + 1) * 10 }, null, 2) + '\n',
  );

  // The per-unit source files: file → output name → label → embed-in-product?
  // The hand-authored {slug}/index.md owns the overview voice, so README
  // stays reference-only; the dossier (DESIGN/BUSINESS/SECURITY/CHANGELOG)
  // embeds inside the product tree AND mirrors into the reference tree.
  // docs/openapi.json is NOT harvested to a page: the interactive
  // docusaurus-plugin-openapi-docs layer (openapi-api-docs.mjs below) renders
  // every endpoint under /docs/api/{slug}/** with the store-backed explorer.
  const sources = [
    ['README.md', 'overview', 'Overview', false],
    ['DESIGN.md', 'design', 'Architecture (DDD)', true],
    ['BUSINESS.md', 'business', 'Business rules (BRD)', true],
    ['SECURITY.md', 'security', 'Security', true],
    ['CHANGELOG.md', 'changelog', 'Changelog', true],
  ];

  // Typography normalization (site typography rule): the sites render with
  // plain hyphens; source-repo prose may use long dashes and is normalized at
  // render time so the sites stay consistent without touching the sources.
  const normalizeTypography = (s) => s.replaceAll(' \u2014 ', ' - ').replaceAll('\u2014', '-');

  const writeFileWithFrontmatter = (dir, file, outName, label, content) => {
    const fm = [
      '---',
      `title: ${JSON.stringify(`${unit.name || slug} - ${label}`)}`,
      `sidebar_label: ${JSON.stringify(label)}`,
      // Docusaurus 3.10: per-file format lives under the mdx frontmatter
      // key (mdx-loader reads frontMatter.mdx.format) - keeps raw HTML /
      // angle brackets in maintainer docs from being parsed as JSX.
      'mdx:',
      '  format: md',
      `custom_edit_url: https://github.com/${org}/${repo}/edit/main/${file}`,
      '---',
      '',
    ].join('\n');
    writeFileSync(path.join(dir, `${outName}.md`), fm + normalizeTypography(content) + '\n');
  };

    // Resolve all sources up front so indexes list only what exists.
    const resolved = [];
    for (const [file, outName, label, embed] of sources) {
    let content = await resolveFile(repo, file, org);
    if (content === null) {
      console.warn(`harvest: ${repo}: ${file} not found (skipped)`);
      continue;
    }
    resolved.push({ file, outName, label });
    // Every source lands in the consolidated reference tree...
    writeFileWithFrontmatter(refDir, file, outName, label, content);
    // ...and the dossier sources also embed inside the product/app tree.
    if (embed) writeFileWithFrontmatter(unitDir, file, outName, label, content);
    harvested++;
  }

  // Reference landing: lists only what was actually harvested.
  writeFileSync(
    path.join(refDir, 'index.md'),
    [
      '---',
      `title: ${JSON.stringify(unit.name || slug)}`,
      `sidebar_label: ${JSON.stringify(unit.name || slug)}`,
      '---',
      '',
      `# ${unit.name || slug} - reference`,
      '',
      `Rendered at build time from \`github.com/${org}/${repo}\` - the`,
      'repository stays the source of truth.',
      '',
      ...resolved.map((r) => `- [${r.label}](${r.outName})`),
      '',
    ].join('\n'),
  );
}

if (failures > 0) {
  console.error(`harvest: ${failures} hard failures`);
  process.exit(1);
}
console.log(`harvest: ${harvested} reference pages written to docs/reference/`);

// Interactive OpenAPI reference (OQ-4 upgrade): stage the unit specs + the
// per-unit plugin config sidecar, then run the plugin's generator per unit —
// its MDX lands under `api/{slug}/` and merges into the docs sidebar via the
// engine sidebars factory. This is the ONLY API reference rendering: the
// previous static api.md fallback is retired (target state has no
// transitional paths).
try {
  const { execFileSync } = await import('node:child_process');
  const engineScriptsDir = path.dirname(fileURLToPath(import.meta.url));
  execFileSync(process.execPath, [path.join(engineScriptsDir, 'openapi-api-docs.mjs'), siteDir], { stdio: 'inherit' });
  const configJson = path.join(siteDir, 'openapi', 'config.json');
  if (existsSync(configJson)) {
    for (const slug of Object.keys(JSON.parse(readFileSync(configJson, 'utf8')))) {
      try {
        execFileSync('npx', ['docusaurus', 'gen-api-docs', slug], { cwd: siteDir, stdio: ['ignore', 'ignore', 'inherit'] });
        console.log(`harvest: gen-api-docs: ${slug}`);
      } catch (err) {
        console.warn(`harvest: gen-api-docs ${slug} failed (${err.status ?? err.message})`);
      }
    }
  }
} catch (err) {
  console.warn(`harvest: interactive API stage skipped (${err.message})`);
}

/* ---------------------------------------------------------------- */

async function resolveFile(repo, file, org) {
  for (const base of SIBLING_DIRS) {
    const local = path.join(siteDir, base, repo, file);
    if (existsSync(local)) return readFileSync(local, 'utf8');
  }
  try {
    const url = `https://raw.githubusercontent.com/${org}/${repo}/${DEFAULT_BRANCH}/${file}`;
    const res = await fetch(url);
    if (res.ok) return await res.text();
    if (res.status === 404) return null;
    throw new Error(`harvest: HTTP ${res.status} for ${url}`);
  } catch (err) {
    failures++;
    console.error(String(err));
    return null;
  }
}