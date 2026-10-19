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

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
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

/** Build the hierarchical API sidebar slice for one unit from its generated
 * pages (docs/api/{slug}/*.api.mdx). Writes `docs/api/{slug}/sidebar.json`
 * consumed by the engine's `makeSidebars()` (which merges the per-unit
 * slices into the docs sidebar).
 *
 * Structure: a collapsible category per path segment - `ledger` > `v1` >
 * `accounts` > `{id}` > ... - leaves are the operations carrying their
 * page id, a `METHOD + tail` label, and the method chip class. Single-child
 * category chains are compressed (`v1 > accounts > {id} > statements`
 * reads `accounts/{id}/statements`) so a common prefix never fans out into
 * a lone-child chain; the common first segments stay visible at the top
 * level per the owner's tree request.
 *
 * @param {string} siteDir - the site root (pages live under docs/api/{slug})
 * @param {string} slug - the unit slug (subdir of docs/api)
 */
export function writeHierarchicalSidebar(siteDir, slug) {
  const unitDir = path.join(siteDir, 'docs', 'api', slug);
  const ops = collectOperations(unitDir, slug);
  if (ops.length === 0) return 0;
  const root = buildPathTrie(ops);
  const rootItems = trieToSidebar(root, { pageId: null });
  // The unit's intro doc (bank-8-ledger.info.mdx -> unit id) is the anchor of
  // the category: it is an ITEM (not just the category link) because plugin
  // components like useCurrentSidebarCategory() require the doc to sit
  // inside the sidebar category chain during static rendering.
  const infoId = readInfoDocId(unitDir);
  if (infoId) {
    rootItems.unshift({
      type: 'doc',
      id: `api/${slug}/${infoId}`,
      label: 'Overview',
      className: 'api-overview',
    });
  }
  // The whole tree rides in one collapsible category named for the unit slug
  // (its link points at the unit's intro doc so opening the menu lands
  // somewhere useful).
  const firstDoc = infoId ? `api/${slug}/${infoId}` : findFirstDoc(rootItems.slice(1));
  const unitCategory = {
    type: 'category',
    label: slug,
    ...(firstDoc ? { link: { type: 'doc', id: firstDoc } } : {}),
    items: rootItems,
    collapsed: true,
  };
  writeFileSync(path.join(unitDir, 'sidebar.json'), JSON.stringify([unitCategory], null, 2) + '\n');
  return ops.length;
}

/** Read every generated api page in the unit dir and extract the sidebar
 * triple: { id, method, path } (id from frontmatter, method + path from the
 * normalized sidebar_label). Pages the plugin wrote without a parseable
 * label are skipped - they cannot be placed in the path trie. */
function collectOperations(unitDir, slug) {
  const ops = [];
  if (!existsSync(unitDir)) return ops;
  for (const fn of readdirSync(unitDir).sort()) {
    if (!fn.endsWith('.api.mdx')) continue;
    const text = readFileSync(path.join(unitDir, fn), 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm.id || !fm.label) continue;
    // The label is quoted YAML: "\"`POST /v1/accounts`\"" - strip the double
    // quotes first, then the backticks around the verb-included label.
    const m = /^(?:["'])?([A-Z]+) (\/.*?)(?:["'])?$/s.exec(fm.label.replace(/^["']|["']$/g, '').replace(/`/g, ''));
    if (!m) continue;
    ops.push({ id: fm.id, method: m[1], path: m[2], base: `api/${slug}/` });
  }
  return ops;
}

/** Minimal frontmatter reader: the two keys we need as scalars. */
function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return {};
  const id = /^id:\s*["'`]?([^"'`\n]+?)["'`]?\s*$/m.exec(m[1]);
  const label = /^sidebar_label:\s*(.*)$/m.exec(m[1]);
  return { id: id && id[1].trim(), label: label && label[1].trim() };
}

/** The unit's intro doc id: the plugin generates `{unit}.info.mdx` next to
 * the operation pages - its id is the file basename without the extension. */
function readInfoDocId(unitDir) {
  try {
    const info = readdirSync(unitDir).find((fn) => fn.endsWith('.info.mdx'));
    return info ? info.replace(/\.info\.mdx$/, '') : null;
  } catch {
    return null;
  }
}

/** Insert one operation {method, path} into the trie keyed by path segments. */
function buildPathTrie(ops) {
  const root = { children: new Map(), ops: [] };
  for (const op of ops) {
    let node = root;
    const segments = op.path.split('/').filter(Boolean);
    for (const seg of segments) {
      if (!node.children.has(seg)) node.children.set(seg, { children: new Map(), ops: [] });
      node = node.children.get(seg);
    }
    node.ops.push(op);
  }
  return root;
}

/** Convert a trie node into Docusaurus sidebar items. Returns a category item
 * when the node has children or multiple/mixed ops (never a bare page list
 * without grouping), and collapses single-child chains. The category links
 * to its first descendant page (Docusaurus opens it expanded). Leaf labels
 * are `METHOD + tail` where tail is the path tail distinguishable within the
 * parent chain (falls back to the full path). */
function trieToSidebar(node, ctx) {
  return walkTrie(node, ctx, []);
}

/** Recursive builder: `prefixSegments` carries the (possibly compressed) path
 * this subtree represents. Returns the sidebar ITEMS for the subtree (never a
 * wrapper). A node with children produces ONE category labeled with its
 * segment path (`v1/accounts/{id}`); leaves carry `METHOD + tail`, where the
 * tail is the distinguishing segments after the category prefix when a tail
 * exists, else the full path. Root nodes (empty prefix) return their items
 * un-wrapped. */
function walkTrie(node, ctx, prefixSegments) {
  let segments = [...prefixSegments];
  let cur = node;
  // Compress chains: one child + no own ops -> fold the child segment in.
  while (cur.children.size === 1 && cur.ops.length === 0) {
    const [seg, child] = [...cur.children.entries()][0];
    segments = [...segments, seg];
    cur = child;
  }
  const childItems = [];
  for (const [seg, child] of [...cur.children.entries()]
    .sort((a, b) => segmentOrder(a[0]).localeCompare(segmentOrder(b[0])) || (a[0] < b[0] ? -1 : 1))) {
    childItems.push(...walkTrie(child, ctx, [...segments, seg]));
  }
  const opItems = cur.ops
    .slice()
    .sort((a, b) => a.method.localeCompare(b.method) || (a.path < b.path ? -1 : 1))
    .map((op) => {
      const segs = op.path.split('/').filter(Boolean);
      const tailStart = segs.findIndex((s, i) => segments[i] !== s);
      const tail = tailStart >= 0 ? segs.slice(Math.max(tailStart, segments.length)) : [];
      const label = tail.length > 0 ? `\`${op.method} ${tail.join('/')}\`` : `\`${op.method} ${segs.join('/')}\``;
      return {
        type: 'doc',
        id: `${op.base}${op.id}`,
        label,
        className: `api-method ${op.method.toLowerCase()}`,
      };
    });
  const items = [...childItems, ...opItems];
  // Root with no prefix: a bare item list (grouped under the unit category by
  // the caller).
  if (segments.length === 0) return items;
  if (items.length === 0) return [];
  // A single flattened leaf needs no category of its own.
  if (items.length === 1 && items[0].type === 'doc') return [items[0]];
  const firstDoc = ctx.pageId || findFirstDoc(items);
  return [{
    type: 'category',
    label: segments.join('/'),
    ...(firstDoc ? { link: { type: 'doc', id: firstDoc } } : {}),
    items,
    collapsed: true,
  }];
}

/** First doc id in the subtree - categories link to a representative page so
 * Docusaurus can auto-open them. */
function findFirstDoc(items) {
  for (const it of items) {
    if (it.type === 'doc') return it.id;
    const sub = it.items && findFirstDoc(it.items);
    if (sub) return sub;
  }
  return null;
}

/** Sort parameterized segments ({id}) after literals for readability. */
function segmentOrder(seg) {
  return seg.startsWith('{') ? `~~${seg}` : seg;
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
          .replace(new RegExp(`^\\s*\`?${verb}\\s+${escapeRegExp(routePath)}\`?\\s*([--:\\u2014]\\s*)?`), '')
          .trim();
        const existing = readableDescription(op, verb, routePath);
        if (prose) {
          op.description = prose === existing ? existing : [existing, prose].filter(Boolean).join('\n\n');
        } else if (existing) {
          op.description = existing;
        }
      } else {
        // No authored summary: the plugin would otherwise copy the label (summary
        // || operationId fallback) into the description - a route path is not
        // documentation. Synthesize a readable sentence for the bare pages.
        op.description = readableDescription(op, verb, routePath);
      }
      op.summary = label;
    }
  }
  return spec;
}

/** The page description for an operation: author prose when present, or a
 * readable sentence synthesized from the operationId. Handlers without
 * summaries/descriptions otherwise render pages whose only "documentation"
 * is the route path itself.
 *
 * The synthesis stays factual: it names the action over the operation name's
 * words ("add-preference" -> "Add preference.", "policy_create_set" ->
 * "Creates a policy set.") - never invented behavior. A description that
 * merely echoes the label or route path is treated as absent. */
function readableDescription(op, verb, routePath) {
  const existing = typeof op.description === 'string' ? op.description.trim() : '';
  const bare = existing.replace(/[`]/g, '').replace(/\s+/g, ' ');
  const labelish = `${verb} ${routePath}`;
  if (existing && bare !== labelish && bare !== routePath) return existing;
  const source = typeof op.operationId === 'string' && op.operationId.trim() ? op.operationId.trim() : '';
  if (!source) return existing;
  const words = source
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return existing;
  return `${words[0][0].toUpperCase()}${words[0].slice(1).toLowerCase()} ${words.slice(1).join(' ').toLowerCase()}.`;
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
