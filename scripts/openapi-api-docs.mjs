#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// openapi-api-docs.mjs - `docusaurus-plugin-openapi-docs` integration
// (design/sentin8-websites-design.md §2, OQ-4 interactive resolution).
//
// The plugin generates per-operation doc pages (interactive response
// schemas, request samples) from the unit's OpenAPI spec. It runs as a
// second-pass generator AFTER the doc harvester:
//
//   1. `harvest.mjs`   - pulls specs + prose into docs/reference/{unit}/
//   2. `openapi-api-docs.mjs` - for every unit carrying docs/openapi.json,
//      copies the spec to `openapi/{slug}-spec.json` (with per-operation
//      sidebar labels normalized to uniform `\`METHOD /path\`` entries - see
//      normalizeSidebarLabels below) and writes the plugin's per-unit
//      options into the `openapi/config.json` sidecar (a keyed object - the
//      plugin validates `config` as an object of entries, not an array).
//   3. `docusaurus.config.js` mounts the plugin with that config; the
//      generated pages live under `/docs/api/{slug}/**` (inside the docs
//      content dir - sidebars resolve doc ids from the docs root) with
//      per-operation routes.
//
// The interactive layer is the sole API reference (the legacy static
// api.md fallback is retired); the engine's sidebar factory merges the
// generated per-unit sidebar slices.

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

    const normalized = normalizeSidebarLabels(spec);
    writeFileSync(path.join(specsDir, `${slug}-spec.json`), JSON.stringify(normalized, null, 2) + '\n');
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

/** Normalize every operation to one uniform sidebar label: `METHOD /path`.
 *
 * The `docusaurus-plugin-openapi-docs` sidebar label is
 * `operation.summary || operationId` - taken verbatim from the utoipa-dumped
 * specs, whose summaries carry three different shapes tree-wide:
 * "`METHOD /path` - description" (the drift-guard doc convention), plain
 * prose summaries without the path, and bare operationIds when a handler
 * has no summary. The engine side of the sites contract fixes the SHAPE at
 * spec-staging time instead of letting each utoipa annotation decide it:
 *
 *   - label = a single backticked `` `METHOD /path` `` (Stripe/GitHub-catalog
 *     style) - unique within the unit, sorts sensibly by path, and never
 *     wraps the sidebar;
 *   - the operation's own prose stays where it belongs: the page body and
 *     the page `description` (moved into `operation.description` when the
 *     summary carried it, so nothing the router authors wrote is lost).
 *
 * Mutates and returns the spec (the caller serializes it).
 */
export function normalizeSidebarLabels(spec) {
  const paths = spec?.paths;
  if (!paths || typeof paths !== 'object') return spec;
  // OpenAPI path-item keys are lowercase (`get`, `post`, …); accept them and
  // the (rare) uppercase forms, normalizing to the uppercase verb for labels.
  const METHOD_RE = /^[A-Za-z]+$/;
  for (const [routePath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!METHOD_RE.test(method) || !op || typeof op !== 'object') continue;
      const verb = method.toUpperCase();
      const summary = typeof op.summary === 'string' ? op.summary.trim() : '';
      const label = `\`${verb} ${routePath}\``;
      if (summary) {
        // Preserve the authored prose as the page description: strip the
        // (optional) leading "`METHOD /path`" convention prefix and the
        // separators so the body does not repeat what the label already
        // states, then merge it with any existing description.
        const prose = summary
          .replace(new RegExp(`^\\s*\`?${verb}\\s+${escapeRegExp(routePath)}\`?\\s*([-—:\\u2014]\\s*)?`), '')
          .trim();
        const existing = typeof op.description === 'string' ? op.description.trim() : '';
        if (prose) op.description = prose === existing ? existing : [existing, prose].filter(Boolean).join('\n\n');
      }
      op.summary = label;
    }
  }
  return spec;
}

/** Escape a literal path for RegExp use. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolve the unit's OpenAPI spec: local sibling repo first (dev loop +
 * aggregation tree), then GitHub main - the doc harvester's resolution
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
        console.warn(`openapi-api-docs: ${repo}: local spec unparsable - skipped`);
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
    console.warn(`openapi-api-docs: ${repo}: spec not found (${err.message}) - skipped`);
    return null;
  }
}
