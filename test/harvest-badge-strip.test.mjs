// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-License-Identifier: Apache-2.0

// harvest-badge-strip.test.mjs - the header-badge-strip contract (WEB §4.2,
///). Source README badge rows link repo-relative (`../../LICENSE`)
// or repo-doc routes; both break inside the harvested site pages with
// `onBrokenLinks: throw`. The stripper must remove the header badge run for
// every shipped layout - adjacent, blank-gap, quote-lead, and prose-lead -
// and re-point any residual repo-relative LICENSE target in the body
// UNCONDITIONALLY (including when no header badge run was found).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripBadgeLines, repointLicenseTargets } from '../scripts/harvest.mjs';

const BADGE_ROW = [
  '[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../LICENSE)',
  '[![Built with Rust](https://img.shields.io/badge/Built%20with-Rust-orange.svg)](https://www.rust-lang.org/)',
  '[![Docs](https://img.shields.io/badge/docs/read-3aa757.svg)](https://bill8.dev/docs/services/risk)',
  '[![Website](https://img.shields.io/badge/website-bill8.dev-1a73e8.svg)](https://bill8.dev)',
].join('\n');

const ORG_REPO = { org: 'commerce8', repo: 'bill8-risk' };

test('strips the adjacent-to-H1 badge row (WEB-18 layout)', () => {
  const src = ['# Bank8:Risk - README', '', BADGE_ROW, '', 'Body prose.'].join('\n');
  const out = stripBadgeLines(src, ORG_REPO);
  assert.equal(out, ['# Bank8:Risk - README', '', 'Body prose.'].join('\n'));
});

test('strips the quote-lead badge row (WEB-18 layout)', () => {
  const src = [
    '# Bill8:Site - bill8.dev',
    '',
    BADGE_ROW,
    '',
    '> Site quote lead.',
    '',
    'Body prose.',
  ].join('\n');
  const out = stripBadgeLines(src, ORG_REPO);
  assert.equal(out, ['# Bill8:Site - bill8.dev', '', '> Site quote lead.', '', 'Body prose.'].join('\n'));
});

test('strips the prose-lead badge row (WEB-19: bill8-risk layout)', () => {
  const src = [
    '# Bill8:Risk - Fraud Prevention',
    '',
    'Fraud rules, velocity checks, sanctions screening, and the review queue.',
    '',
    BADGE_ROW,
    '',
    '## 1. Summary',
  ].join('\n');
  const out = stripBadgeLines(src, ORG_REPO);
  assert.equal(
    out,
    [
      '# Bill8:Risk - Fraud Prevention',
      '',
      'Fraud rules, velocity checks, sanctions screening, and the review queue.',
      '',
      '## 1. Summary',
    ].join('\n'),
  );
});

test('strips a hard-wrapped badge link split across lines (WEB-18 layout)', () => {
  const wrapped =
    '[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg\n)](../../LICENSE)';
  const src = ['# H1', '', wrapped, '[![Docs](https://bill8.dev/docs/services/risk)](https://bill8.dev)', '', 'Body.'].join('\n');
  const out = stripBadgeLines(src, ORG_REPO);
  assert.equal(out, ['# H1', '', 'Body.'].join('\n'));
});

test('re-points residual LICENSE targets even when no badge run was found (WEB-19 unconditional)', () => {
  const src = ['# No Badges', '', 'See the [license](../../LICENSE) for terms.', '', '## Section'].join('\n');
  const out = stripBadgeLines(src, ORG_REPO);
  assert.equal(
    out,
    [
      '# No Badges',
      '',
      'See the [license](https://github.com/commerce8/bill8-risk/blob/main/LICENSE) for terms.',
      '',
      '## Section',
    ].join('\n'),
  );
});

test('re-points a bare LICENSE target in the body', () => {
  const src = ['# H1', '', 'Licensed under [Apache 2.0](LICENSE).'].join('\n');
  const out = stripBadgeLines(src, { org: 'Bank8-dev', repo: 'bank8-ledger' });
  assert.equal(out, ['# H1', '', 'Licensed under [Apache 2.0](https://github.com/Bank8-dev/bank8-ledger/blob/main/LICENSE).'].join('\n'));
});

test('no-op on a badge block beyond the H1-lead window (mid-document, not the lead row)', () => {
  const deep = [...Array(30).fill('Paragraph text.').join('\n'), '', BADGE_ROW].join('\n');
  const src = ['# H1', '', '## Section 2', '', deep].join('\n');
  const out = stripBadgeLines(src, ORG_REPO);
  // The window is document-lead bounded: the deep badge row survives, but its
  // repo-relative LICENSE target is still re-pointed (unconditional repair).
  assert.ok(out.includes('[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/commerce8/bill8-risk/blob/main/LICENSE)'));
});

test('no-org/repo callers keep content verbatim (no GitHub base to re-point to)', () => {
  const src = ['# H1', '', BADGE_ROW, '', 'Body [license](../../LICENSE).'].join('\n');
  const out = stripBadgeLines(src);
  assert.equal(out, ['# H1', '', 'Body [license](../../LICENSE).'].join('\n'));
});

test('no H1 documents get the license re-point without a strip', () => {
  const src = ['Some intro.', '', '[license](../LICENSE)'].join('\n');
  const out = stripBadgeLines(src, ORG_REPO);
  assert.equal(out, ['Some intro.', '', '[license](https://github.com/commerce8/bill8-risk/blob/main/LICENSE)'].join('\n'));
});

test('repointLicenseTargets handles multi-line bodies directly', () => {
  const lines = ['a', 'x](../../LICENSE)y', 'z](LICENSE)w'].join('\n').split('\n');
  const out = repointLicenseTargets(lines, { org: 'commerce8', repo: 'bill8-payments' });
  assert.deepEqual(out, ['a', 'x](https://github.com/commerce8/bill8-payments/blob/main/LICENSE)y', 'z](https://github.com/commerce8/bill8-payments/blob/main/LICENSE)w']);
});

test('repointLicenseTargets is identity on missing org/repo', () => {
  const lines = ['a](../../LICENSE)'];
  assert.deepEqual(repointLicenseTargets(lines, {}), lines);
});