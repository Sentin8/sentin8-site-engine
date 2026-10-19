#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// openapi-api-docs.mjs — `docusaurus-plugin-openapi-docs` integration
// (design/sentin8-websites-design.md §2, OQ-4 interactive resolution).
//
// The plugin generates per-operation doc pages (interactive response
// schemas, request samples) from the harvested `docs/reference/{unit}/api`
// sources. It runs as a second-pass generator AFTER the doc harvester:
//
//   1. `harvest.mjs`   — pulls specs + prose into docs/reference/{unit}/
//   2. `openapi-api-docs.mjs` — for every unit carrying docs/openapi.json,
//      copies the spec to `openapi/{slug}-spec.json` and appends the
//      plugin's per-unit entry to `openapi/config.yaml` (the id/category
//      sidecar the site config feeds to `createConfig`-style docusaurus
//      presets).
//   3. `docusaurus.config.js` mounts the plugin with that config; the
//      generated pages live under `/api/{slug}` with per-operation routes.
//
// The static `api.md` pages stay: they are the search-indexable,
// typographic voice; the plugin pages add the interactive layer at
// `/api/...` and link back to the static page (and vice versa).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

await main();

async function main() {
  const arg = process.argv[2] || process.cwd();
  const siteDir = path.resolve(arg);
  const siteJsonPath = path.join(siteDir, 'site.json');
  if (!existsSync(siteJsonPath)) {
    console.error(`openapi-api-docs: no site.json at ${siteJsonPath}`);
    process.exit(1);
  }
  const site = JSON.parse(readFileSync(siteJsonPath, 'utf8'));

  const units = [
    ...site.units.filter((u) => u.kind === 'service' || u.kind === 'starter'),
    ...(site.starters || []).map((s) => ({ ...s, kind: 'starter' })),
    ...(site.apps || []).map((a) => ({ ...a, kind: 'app' })),
    ...(site.sdks || []).map((s) => ({ ...s, kind: 'sdk' })),
  ];

  const specsDir = path.join(siteDir, 'openapi');
  rmSync(specsDir, { recursive: true, force: true });
  mkdirSync(specsDir, { recursive: true });

  const entries = {};

  for (const unit of units) {
    const { slug, repo, org } = unit;
    if (!slug || !repo) continue;
    const spec = await resolveSpec(repo, org);
    if (!spec) continue;

    writeFileSync(path.join(specsDir, `${slug}-spec.json`), JSON.stringify(spec, null, 2) + '\n');
    entries[slug] = {
      specPath: `openapi/${slug}-spec.json`, // site-dir-relative (the plugin resolves against siteDir)
      outputDir: `docs/api/${slug}`,
      sidebarOptions: {
        groupPathsBy: 'tag',
        categoryLinkSource: 'info',
      },
    };
  }

  writeFileSync(path.join(siteDir, 'openapi', 'config.json'), JSON.stringify(entries, null, 2) + '\n');
  console.log(`openapi-api-docs: ${entries.length} unit spec(s) prepared under openapi/`);
}

/** Resolve the unit's OpenAPI spec: local sibling repo first (dev loop +
 * aggregation tree), then GitHub main — the doc harvester's resolution
 * order. */
async function resolveSpec(repo, org) {
  const candidates = [
    path.join(process.cwd(), '..', '..', repo, 'docs', 'openapi.json'),
    path.join(process.cwd(), '..', repo, 'docs', 'openapi.json'),
    path.join(process.cwd(), repo, 'docs', 'openapi.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return JSON.parse(readFileSync(c, 'utf8'));
      } catch (err) {
        console.warn(`openapi-api-docs: ${repo}: local spec unparsable — skipped`);
        return null;
      }
    }
  }
  const url = `https://raw.githubusercontent.com/${org}/${repo}/main/docs/openapi.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return JSON.parse(await res.text());
  } catch (err) {
    console.warn(`openapi-api-docs: ${repo}: spec not found (${err.message}) — skipped`);
    return null;
  }
}
