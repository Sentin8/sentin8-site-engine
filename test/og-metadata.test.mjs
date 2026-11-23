// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// og-metadata.test.mjs - node:test for the social-share head tags emitted by
// makeSiteConfig. WhatsApp/LinkedIn/X scrape og:*/twitter:* on the first HTML
// response; a missing or relative og:image renders the shared link with NO
// image (owner finding 2026-10-19), so the factory contract is pinned here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSiteConfig } from '../src/index.mjs';

const site = {
  vertical: 'bank8',
  name: 'Bank8',
  org: 'Bank8-dev',
  domain: 'bank8.dev',
  tagline: 'Banking, payments, and open banking on Sentin8',
  accent: '#1B6CA8',
  units: [],
};

function meta(config, key) {
  return config.headTags.find(
    (t) =>
      t.tagName === 'meta' &&
      Object.values(t.attributes ?? {}).some((v) => String(v) === key),
  );
}

test('the global og image block is emitted with an absolute URL', () => {
  const config = makeSiteConfig(site);
  // The image tags are the part Docusaurus does NOT emit for us, so the
  // engine owns them. og:title / og:description / og:url / twitter:card are
  // per-page tags Docusaurus already renders from the page's own metadata
  // (og:url follows the page's canonical URL); emitting them here as well
  // produced two of each on every page, so the engine leaves them alone.
  for (const key of [
    'og:type',
    'og:site_name',
    'og:image',
    'og:image:width',
    'og:image:height',
    'og:image:alt',
    'twitter:image',
  ]) {
    assert.ok(meta(config, key), `missing meta tag: ${key}`);
  }
});

test('og:image is an ABSOLUTE URL to the canonical PNG card', () => {
  const config = makeSiteConfig(site);
  const img = meta(config, 'og:image');
  assert.equal(img.attributes.content, 'https://bank8.dev/img/og-card.png');
  const tw = meta(config, 'twitter:image');
  assert.equal(tw.attributes.content, 'https://bank8.dev/img/og-card.png');
});

test('dimensions match the 1200x630 card', () => {
  const config = makeSiteConfig(site);
  assert.equal(meta(config, 'og:image:width').attributes.content, '1200');
  assert.equal(meta(config, 'og:image:height').attributes.content, '630');
});

test('the engine no longer duplicates the per-page og tags', () => {
  const config = makeSiteConfig(site);
  for (const key of ['og:title', 'og:description', 'og:url', 'twitter:card']) {
    assert.equal(meta(config, key), undefined, `${key} must not be duplicated`);
  }
});