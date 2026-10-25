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

  // Badge-block stripping (site rendering rule): source READMEs open with
  // shields.io badge lines whose LINK TARGETS are repo-relative
  // (`../../LICENSE`, `../LICENSE`) or repo-doc routes
  // (`/docs/services/{slug}`) - both resolve to broken links inside the
  // harvested site pages (the sites render their own footer/nav license
  // links, so the badges carry no information the site lacks). Layouts
  // shipped so far: badges directly after the H1, badges after H1 + blank
  // line, and badges after a quote-lead paragraph. The strip treats the
  // badge block as a contiguous RUN: a badge-image line plus the
  // continuation line of a hard-wrapped badge link (URL and target split
  // across lines), ending at the first non-badge content line. The window
  // search skips blank lines and quote-lead prose between the H1 and the
  // first badge line. Residual repo-relative LICENSE link targets anywhere
  // in the body are re-pointed to the repo's GitHub URL - defense-in-depth
  // against future layouts.
  const stripBadgeLines = (s, { org, repo } = {}) => {
    const lines = s.split('\n');
    const startsBadge = (ln) => ln.trim().startsWith('[![');
    const isQuote = (ln) => ln.trimStart().startsWith('> ');
    // Find the H1 (first line beginning '# ').
    let h1 = lines.findIndex((ln) => ln.startsWith('# '));
    if (h1 === -1) return s;
    // Search window: the first badge line after the H1 (skipping blanks and
    // quote-lead prose).
    let start = -1;
    for (let i = h1 + 1; i < lines.length && i < h1 + 24; i += 1) {
      if (startsBadge(lines[i])) { start = i; break; }
      // Stop the search at real content: a heading or non-quoted prose.
      if (lines[i].startsWith('# ') || (lines[i].trim() !== '' && !isQuote(lines[i]))) break;
    }
    if (start === -1) return s;
    // The run: consecutive badge lines, where a badge line followed by a
    // line starting with `)](` makes both part of one wrapped badge link -
    // the continuation line belongs to the run too.
    let end = start;
    while (end < lines.length) {
      if (startsBadge(lines[end])) { end += 1; continue; }
      if (end > start && lines[end].trimStart().startsWith(')](') ) { end += 1; continue; }
      break;
    }
    let out = lines.slice(0, start).concat(lines.slice(end));
    // Repair the blank-line seam the strip can leave (badge block was the
    // whole paragraph between two blanks).
    while (out[start - 1] !== undefined && out[start] !== undefined && out[start - 1].trim() === '' && out[start].trim() === '') out.splice(start, 1);
    // Defense-in-depth: any repo-relative LICENSE link target that leaked
    // past the badge strip re-points to the repo on GitHub (same content,
    // no broken relative route).
    const ghBase = org && repo ? `https://github.com/${org}/${repo.replace(new RegExp(`^${org}/`), '')}/blob/main/LICENSE` : null;
    if (ghBase) {
      out = out.map((ln) =>
        ln
          .replace(/\]\((?:\.\.\/)+(?:LICENSE)\)/g, `](${ghBase})`)
          .replace(/\]\(LICENSE\)/g, `](${ghBase})`),
      );
    }
    return out.join('\n');
  };

  const writeFileWithFrontmatter = (dir, file, outName, label, content, { org: unitOrg, repo: unitRepo } = {}) => {
    // Repair origin for leaked license link targets: prefer the unit's own
    // org/repo, fall back to the harvest-level org/repo pair.
    const rOrg = unitOrg || org;
    const rRepo = unitRepo || repo;
    const fm = [
      '---',
      `title: ${JSON.stringify(`${unit.name || slug} - ${label}`)}`,
      `sidebar_label: ${JSON.stringify(label)}`,
      // Docusaurus 3.10: per-file format lives under the mdx frontmatter
      // key (mdx-loader reads frontMatter.mdx.format) - keeps raw HTML /
      // angle brackets in maintainer docs from being parsed as JSX.
      'mdx:',
      '  format: md',
      `custom_edit_url: https://github.com/${rOrg}/${rRepo}/edit/main/${file}`,
      '---',
      '',
    ].join('\n');
    writeFileSync(path.join(dir, `${outName}.md`), fm + normalizeTypography(stripBadgeLines(content, { org: rOrg, repo: rRepo })) + '\n');
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
// per-unit plugin config sidecar, then run the plugin's generator per unit -
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
  // Hierarchical API sidebar: path-segment trie per unit, built from the
  // generated pages (WEB design §2 OQ-4 sidebar rule). Consumed by the
  // engine's makeSidebars() at config time.
  const { writeHierarchicalSidebar } = await import(path.join(engineScriptsDir, 'openapi-api-docs.mjs'));
  if (existsSync(configJson)) {
    for (const slug of Object.keys(JSON.parse(readFileSync(configJson, 'utf8')))) {
      // Stale slice first: the plugin skips rewriting existing pages, but the
      // tree must reflect the current generated set.
      rmSync(path.join(siteDir, 'docs', 'api', slug, 'sidebar.json'), { force: true });
      const n = writeHierarchicalSidebar(siteDir, slug);
      if (n > 0) console.log(`harvest: api tree: ${slug} (${n} operations)`);
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