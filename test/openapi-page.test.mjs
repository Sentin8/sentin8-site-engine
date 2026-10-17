// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderOpenApiPage } from '../src/openapi-page.mjs';

const spec = {
  openapi: '3.1.0',
  info: { title: 'demo', version: '0.1.0', description: 'A demo service.' },
  paths: {
    '/v1/things': {
      post: {
        tags: ['things'],
        summary: 'Create a thing.',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', description: 'thing name' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } },
          403: { description: 'missing scope' },
        },
        security: [{ 'demo:things:write': [] }],
      },
      get: {
        tags: ['things'],
        summary: 'List things.',
        responses: { 200: { description: 'ok' } },
      },
    },
  },
  components: {
    schemas: {
      Thing: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  },
};

test('renderOpenApiPage produces grouped endpoint sections', () => {
  const md = renderOpenApiPage(spec);
  assert.ok(md.includes('**2 endpoints**'), 'endpoint count');
  assert.ok(md.includes('## things'), 'tag group');
  assert.ok(md.includes('### `POST /v1/things`'), 'operation heading');
  assert.ok(md.includes('Gate: `demo:things:write`'), 'gate scope');
  assert.ok(md.includes('**Request body** (`application/json`)'), 'request body section');
  assert.ok(md.includes('`name`'), 'request field');
  assert.ok(md.includes('`Thing`'), 'response ref type');
});

test('renderOpenApiPage escapes MDX expression braces', () => {
  const spec2 = JSON.parse(JSON.stringify(spec));
  spec2.paths['/v1/things'].post.requestBody.content['application/json'].schema.properties.name.description =
    'shape [{a, b: {c}}]';
  const md = renderOpenApiPage(spec2);
  assert.ok(!md.includes('[{a'), 'raw braces escaped');
  assert.ok(md.includes('&#123;'), 'entity-escaped braces present');
});

test('renderOpenApiPage handles an empty spec', () => {
  const md = renderOpenApiPage({ openapi: '3.1.0', info: { title: 'x' }, paths: {} });
  assert.ok(md.includes('**0 endpoints**'), 'zero endpoints line');
});
test('renderOpenApiPage shields colon-chained scopes from remark-emoji', () => {
  const spec2 = JSON.parse(JSON.stringify(spec));
  spec2.paths['/v1/things'].post.responses['403'] = {
    description: 'Missing bank8:ledger:things:write scope',
  };
  const md = renderOpenApiPage(spec2);
  assert.ok(md.includes('Missing `bank8:ledger:things:write` scope'), 'scope backticked in cell');
  assert.ok(!/Missing bank8:/.test(md), 'no bare scope left');
  // event names too
  const md2 = renderOpenApiPage({
    openapi: '3.1.0',
    info: { title: 'x' },
    paths: { '/a': { get: { tags: ['t'], summary: 'emits sentin8:bus:produce then done', responses: {} } } },
  });
  assert.ok(md2.includes('emits `sentin8:bus:produce`'), 'event name backticked');
});
