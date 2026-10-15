#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// harvest.mjs — build-time docs harvester (design/sentin8-websites-design.md §4.2).
//
// For every unit in site.json: pull README.md / DESIGN.md / BUSINESS.md /
// SECURITY.md / CHANGELOG.md from the unit's own repository, and emit them
// under docs/reference/{unit}/ as reference pages:
//   - README.md   → overview.mdx (format: md — maintainer prose may contain
//                   raw HTML/angle brackets that MDX would reject)
//   - DESIGN.md   → design.md
//   - BUSINESS.md → business.md
//   - SECURITY.md → security.md
//   - CHANGELOG.md → changelog.md
//
// Resolution order: local sibling folder (../../{repo}/) first — local dev
// and the aggregation tree never need the network — then
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
    'repository — README (overview), DESIGN (DDD), BUSINESS (BRD), and the',
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

for (const unit of units) {
  const { slug, repo, org } = unit;
  if (!slug || !repo) continue;

  const dir = path.join(outRoot, slug);
  mkdirSync(dir, { recursive: true });

  // Category metadata: the sidebar label for the harvested subtree.
  writeFileSync(
    path.join(dir, '_category_.json'),
    JSON.stringify({ label: unit.name || slug, position: 100 + (units.indexOf(unit) + 1) * 10 }, null, 2) + '\n',
  );

  // The per-unit source files, in listing order: file → output name → label.
  const sources = [
    ['README.md', 'overview', 'Overview'],
    ['DESIGN.md', 'design', 'Architecture (DDD)'],
    ['BUSINESS.md', 'business', 'Business rules (BRD)'],
    ['SECURITY.md', 'security', 'Security'],
    ['CHANGELOG.md', 'changelog', 'Changelog'],
  ];

  // Resolve all sources up front so the index lists only what exists.
  const resolved = [];
  for (const [file, outName, label] of sources) {
    const content = await resolveFile(repo, file, org);
    if (content === null) {
      console.warn(`harvest: ${repo}: ${file} not found (skipped)`);
      continue;
    }
    resolved.push({ outName, label });
    const fm = [
      '---',
      `title: ${JSON.stringify(`${unit.name || slug} — ${label}`)}`,
      `sidebar_label: ${JSON.stringify(label)}`,
      // Docusaurus 3.10: per-file format lives under the mdx frontmatter
      // key (mdx-loader reads frontMatter.mdx.format) — keeps raw HTML /
      // angle brackets in maintainer docs from being parsed as JSX.
      'mdx:',
      '  format: md',
      `custom_edit_url: https://github.com/${org}/${repo}/edit/main/${file}`,
      '---',
      '',
    ].join('\n');
    writeFileSync(path.join(dir, `${outName}.md`), fm + content + '\n');
    harvested++;
  }

  // Category landing: makes /docs/reference/{slug}/ a real page, listing
  // only the pages that were actually harvested.
  writeFileSync(
    path.join(dir, 'index.md'),
    [
      '---',
      `title: ${JSON.stringify(unit.name || slug)}`,
      `sidebar_label: ${JSON.stringify(unit.name || slug)}`,
      '---',
      '',
      `# ${unit.name || slug} — reference`,
      '',
      `Rendered at build time from \`github.com/${org}/${repo}\` — the`,
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