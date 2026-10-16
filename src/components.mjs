// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// components.mjs - the MDX-importable component set (design §5). All
// components are JSX-free (h()) so they compile inside node_modules.

import { h, cx, chipStyle } from './h.mjs';
import { VERTICAL_ACCENTS as ACCENTS } from './theme-vars.mjs';

/* ------------------------------------------------------------------ */
/* Landing & hero                                                      */
/* ------------------------------------------------------------------ */

/**
 * Where-to-start strip: explicit titled links with one-line explanations -
 * the first thing a new visitor reads after the hero (WEB §4.5).
 */
export function StartHere({ items }) {
  return h(
    'nav',
    { className: 's8-start', 'aria-label': 'Where to start' },
    h('p', { className: 's8-start-title' }, 'Where to start'),
    h(
      'div',
      { className: 's8-start-grid' },
      (items || []).map((it, i) =>
        h(
          'a',
          {
            key: i,
            href: it.href,
            className: cx('s8-start-link', it.primary && 's8-start-primary'),
            ...(it.href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          },
          h('span', { className: 's8-start-label' }, it.title),
          h('span', { className: 's8-start-desc' }, it.description),
          h('span', { className: 's8-start-go' }, '→'),
        ),
      ),
    ),
  );
}

/**
 * Hero visual: the whole-system map - every unit, grouped by plane, rendered
 * as a compact panel. Unlike a cherry-picked code snippet, this shows the
 * ENTIRE platform/vertical at a glance (the WEB-12 lesson: a single-service
 * visual misrepresents the whole).
 */
export function SystemMap({ name, planes, groups = [], services = [], apps = [] }) {
  // Default grouping: one flat "services" group + apps, when no planes given.
  const columns = planes?.length
    ? planes.map((p) => ({ title: p.title, items: (p.items || []).map((s) => s.name || s) }))
    : [
        { title: 'Services', items: services.map((u) => u.name || u.slug) },
        ...(apps.length ? [{ title: 'Apps', items: apps.map((a) => a.name || a.slug) }] : []),
        ...(groups || []),
      ];

  return h(
    'div',
    { className: 's8-map', 'aria-label': `${name} system map` },
    h('div', { className: 's8-map-bar' },
      h('span', { className: 's8-map-dots' },
        h('i', { className: 's8-map-dot s8-map-dot-r' }),
        h('i', { className: 's8-map-dot s8-map-dot-y' }),
        h('i', { className: 's8-map-dot s8-map-dot-g' })),
      h('span', { className: 's8-map-title' }, `${name} - the whole system`)),
    h(
      'div',
      { className: 's8-map-body' },
      ...columns.map((col, ci) =>
        h(
          'div',
          { key: ci, className: 's8-map-col' },
          h('span', { className: 's8-map-col-title' }, col.title),
          ...col.items.map((n, i) => h('span', { key: i, className: 's8-map-item' }, n)),
        ),
      ),
    ),
  );
}

/** Hero banner for landing pages: title, tagline, optional CTA links. */
export function Hero({ title, tagline, actions = [], accent, visual }) {
  const actionEls = actions.length
    ? h(
        'div',
        { className: 's8-hero-actions' },
        actions.map((a, i) =>
          h(
            'a',
            {
              key: i,
              href: a.href,
              className: cx('s8-btn', a.primary && 's8-btn-primary'),
              style: a.primary && accent ? { background: accent, borderColor: accent } : undefined,
              ...(a.href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
            },
            a.label,
          ),
        ),
      )
    : null;

  return h(
    'header',
    { className: 's8-hero' },
    h('div', { className: 's8-hero-glow' }),
    h(
      'div',
      { className: 's8-hero-inner' },
      h(
        'div',
        { className: 's8-hero-copy' },
        h('h1', { className: 's8-hero-title' }, title),
        tagline ? h('p', { className: 's8-hero-tagline' }, tagline) : null,
        actionEls,
      ),
      visual || null,
    ),
  );
}

/** Section wrapper with title + optional lead paragraph. */
export function Section({ id, title, lead, children }) {
  return h(
    'section',
    { id, className: 's8-section' },
    h('h2', null, title),
    lead ? h('p', { className: 's8-lead' }, lead) : null,
    children,
  );
}

/* ------------------------------------------------------------------ */
/* Card grids                                                          */
/* ------------------------------------------------------------------ */

function cardGrid(kind, items, { linkPrefix = '', keyPrefix = kind } = {}) {
  const cards = items.map((it, i) =>
    h(
      'a',
      {
        key: i,
        href: it.href || `${linkPrefix}${it.slug}/`,
        className: `s8-card s8-card-${kind}`,
      },
      h('div', { className: 's8-card-head' },
        h('span', { className: 's8-card-name' }, it.name || it.slug),
        it.kind ? h('span', { className: 's8-card-kind' }, it.kind) : null),
      h('p', { className: 's8-card-summary' }, it.summary),
      it.scopes?.length
        ? h('div', { className: 's8-card-scopes' },
            it.scopes.slice(0, 4).map((s, j) => h('span', { key: j, className: 's8-scope' }, s)),
            it.scopes.length > 4 ? h('span', { key: 'more', className: 's8-scope s8-scope-more' }, `+${it.scopes.length - 4}`) : null)
        : null,
      h('span', { className: 's8-card-go' }, 'Explore →'),
    ),
  );
  return h('div', { className: cx('s8-grid', `s8-grid-${keyPrefix}`), key: keyPrefix }, ...cards);
}

/** Grid of service cards (platform site vocabulary). */
export const ServiceGrid = (props) => cardGrid('service', props.items || [], { linkPrefix: props.linkPrefix });
/** Grid of product cards (vertical site vocabulary). */
export const ProductGrid = (props) => cardGrid('product', props.items || [], { linkPrefix: props.linkPrefix });
/** Grid of app cards. */
export const AppGrid = (props) => cardGrid('app', props.items || [], { linkPrefix: props.linkPrefix });
/** Grid of SDK cards. */
export const SdkGrid = (props) => cardGrid('sdk', props.items || []);
/** Grid of use-case cards (title + body, no link). */
export function UseCaseGrid({ items }) {
  return h(
    'div',
    { className: 's8-grid s8-grid-usecase' },
    (items || []).map((it, i) =>
      h(
        'div',
        { key: i, className: 's8-card s8-card-usecase' },
        h('div', { className: 's8-card-head' }, h('span', { className: 's8-card-name' }, it.name)),
        h('p', { className: 's8-card-summary' }, it.summary),
        it.body ? h('p', { className: 's8-card-body' }, it.body) : null,
      ),
    ),
  );
}

/** Vertical showcase cards for sentin8.dev (cross-site absolute links). */
export function VerticalShowcase({ items }) {
  return h(
    'div',
    { className: 's8-grid s8-grid-vertical' },
    (items || []).map((it, i) =>
      h(
        'a',
        {
          key: i,
          href: it.href || `https://${it.slug}.dev/`,
          className: 's8-card s8-card-vertical',
          style: { '--s8-accent': it.accent },
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        h('div', { className: 's8-card-head' },
          h('span', { className: 's8-card-name' }, it.name),
          h('span', { className: 's8-chip', style: chipStyle(it.accent) }, it.chip || `${it.slug}.dev`)),
        h('p', { className: 's8-card-summary' }, it.summary),
        h('span', { className: 's8-card-go' }, 'Visit site →'),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

/** The five security pillars strip (SECURITY.md rendered as cards). */
export function SecurityPillars({ items }) {
  return h(
    'div',
    { className: 's8-pillars' },
    (items || []).map((it, i) =>
      h(
        'div',
        { key: i, className: 's8-pillar' },
        h('div', { className: 's8-pillar-num' }, `0${i + 1}`),
        h('h3', null, it.title),
        h('p', null, it.summary),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* API surface                                                         */
/* ------------------------------------------------------------------ */

/** Method badge coloring per HTTP verb. */
export function MethodBadge({ method }) {
  const m = String(method || '').toUpperCase();
  return h('span', { className: cx('s8-method', `s8-method-${m}`) }, m);
}

/** One API endpoint row: METHOD path - description - scope. */
export function ApiRow({ method, path, description, scope }) {
  return h(
    'tr',
    null,
    h('td', null, h(MethodBadge, { method }), ' ', h('code', null, path)),
    h('td', null, description),
    scope ? h('td', null, h('span', { className: 's8-scope' }, scope)) : h('td'),
  );
}

/** API surface table: endpoint rows grouped by family. */
export function ApiTable({ caption, rows }) {
  return h(
    'figure',
    { className: 's8-api-table' },
    h(
      'table',
      null,
      caption ? h('caption', null, caption) : null,
      h('thead', null, h('tr', null, h('th', null, 'Endpoint'), h('th', null, 'Description'), h('th', null, 'Scope'))),
      h('tbody', null, ...(rows || []).map((r, i) => h(ApiRow, { key: i, ...r }))),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Cross-site links & provenance                                       */
/* ------------------------------------------------------------------ */

/**
 * Cross-vertical reference link - renders an external absolute link with
 * the target vertical's accent chip (design §4.6).
 */
export function CrossSiteLink({ url, label, vertical }) {
  const accent = ACCENTS[vertical] || ACCENTS.sentin8;
  return h(
    'a',
    {
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      className: 's8-external',
    },
    label,
    h('span', { className: 's8-chip', style: chipStyle(accent) }, `${vertical}.dev`),
  );
}

/** Provenance banner for harvested pages (design §4.1). */
export function ProvenanceNote({ repo }) {
  return h(
    'aside',
    { className: 's8-provenance' },
    h('p', null,
      'This page is rendered at build time from ',
      h('code', null, repo),
      ' - the repository stays the source of truth.'),
  );
}

/* ------------------------------------------------------------------ */
/* Quickstart                                                          */
/* ------------------------------------------------------------------ */

/** Quickstart block: steps as an ordered list with optional code inline. */
export function QuickStart({ steps }) {
  return h(
    'ol',
    { className: 's8-quickstart' },
    (steps || []).map((s, i) =>
      h('li', { key: i },
        h('strong', null, s.title),
        s.body ? h('p', null, s.body) : null),
    ),
  );
}