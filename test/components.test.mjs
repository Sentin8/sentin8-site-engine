// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// components.test.mjs - node:test smoke for the MDX-importable component set.
// Components are JSX-free h() calls, so they render through ReactDOMServer
// with no build step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SystemMap } from '../src/components.mjs';

const planes = [
  { title: 'Identity & access', items: ['Sentin8:Auth', 'Sentin8:Acme'] },
  { title: 'Data & events', items: ['Sentin8:DB'] },
];

const render = (props) =>
  renderToStaticMarkup(React.createElement(SystemMap, { name: 'Sentin8', planes, ...props }));

const colTitles = (html) =>
  [...html.matchAll(/class="s8-map-col-title">([^<]*)</g)].map((m) =>
    m[1].replace(/&amp;/g, '&'),
  );

test('SystemMap renders one column per plane by default', () => {
  const html = render({});
  assert.deepEqual(colTitles(html), ['Identity & access', 'Data & events']);
  assert.ok(!html.includes('s8-map-cert'), 'no cert column without the prop');
});

test('SystemMap appends the certified column LAST, after every plane (OIDF-CERT)', () => {
  const html = render({
    certified: {
      label: 'Certified',
      mark: '/img/openid-certified.png',
      alt: 'OpenID Certified',
      href: 'https://sentin8.dev/certification',
    },
  });

  // The cert column is the final column, never interleaved with the planes.
  const titles = colTitles(html);
  assert.deepEqual(titles, ['Identity & access', 'Data & events', 'Certified']);
  assert.ok(html.includes('s8-map-col s8-map-cert'), 'cert column carries its own class');

  // Mark + accessible alt + the link to the certification record.
  assert.ok(html.includes('src="/img/openid-certified.png"'), 'official mark referenced');
  assert.ok(html.includes('alt="OpenID Certified"'), 'mark has alt text');
  assert.ok(
    html.includes('href="https://sentin8.dev/certification"'),
    'lockup links the certification record',
  );
});

test('SystemMap cert column defaults its label and link', () => {
  const html = render({ certified: { mark: '/img/openid-certified.png' } });
  assert.deepEqual(colTitles(html), ['Identity & access', 'Data & events', 'Certified']);
  assert.ok(
    html.includes('href="https://sentin8.dev/certification"'),
    'href defaults to the certification record',
  );
  assert.ok(html.includes('alt="OpenID Certified"'), 'alt defaults to OpenID Certified');
});
