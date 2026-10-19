// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// schema-guard.test.mjs - the empty-schema response guard (OAPEC §2 rule 10).
// A 2xx-JSON response must carry a usable schema; the utoipa
// `serde_json::Value` body placeholder serializes an empty schema `{}` and
// the rendered page then shows only "OK".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findEmptySchemaResponses } from '../scripts/openapi-api-docs.mjs';

const op = (responses) => ({
  operationId: 'x',
  responses,
});

test('flags the serde_json::Value placeholder (empty schema object)', () => {
  const spec = {
    paths: {
      '/v1/properties/{property_id}/availability': {
        get: op({
          '200': { description: 'OK', content: { 'application/json': { schema: {} } } },
          '401': { description: 'Not authenticated' },
        }),
      },
    },
  };
  const violations = findEmptySchemaResponses(spec);
  assert.deepEqual(violations, [{ verb: 'GET', route: '/v1/properties/{property_id}/availability', code: '200' }]);
});

test('flags a JSON media type declared with no schema at all', () => {
  const spec = {
    paths: {
      '/v1/things': {
        post: op({ '201': { description: 'Created', content: { 'application/json': {} } } }),
      },
    },
  };
  assert.equal(findEmptySchemaResponses(spec).length, 1);
});

test('accepts typed responses ($ref, properties, additionalProperties, non-JSON media)', () => {
  const spec = {
    paths: {
      '/typed': {
        get: op({
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RatePlan' } },
            },
          },
        }),
      },
      '/free-form': {
        post: op({
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { type: 'object', additionalProperties: true } },
            },
          },
        }),
      },
      '/binary': {
        get: op({
          '200': {
            description: 'OK',
            content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
          },
        }),
      },
      '/no-content': { delete: op({ '204': { description: 'Deleted' } }) },
    },
  };
  assert.deepEqual(findEmptySchemaResponses(spec), []);
});

test('flags every offending op without collateral on 4xx/5xx (they may be bare)', () => {
  const spec = {
    paths: {
      '/a': { get: op({ '200': { description: 'OK', content: { 'application/json': { schema: {} } } }, '401': { description: 'No schema is fine here' } }) },
      '/b': { post: op({ '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } } }) },
      '/c': { put: op({ '200': { description: 'OK', content: { 'application/json': { schema: {} } } } }) },
    },
  };
  const violations = findEmptySchemaResponses(spec);
  assert.equal(violations.length, 2);
  assert.ok(violations.some((v) => v.route === '/a' && v.verb === 'GET'));
  assert.ok(violations.some((v) => v.route === '/c' && v.verb === 'PUT'));
});

test('compound schemas count as usable (allOf/anyOf/oneOf)', () => {
  const spec = {
    paths: {
      '/compound': {
        get: op({
          '200': {
            description: 'OK',
            content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/A' }] } } },
          },
        }),
      },
    },
  };
  assert.deepEqual(findEmptySchemaResponses(spec), []);
});

test('non-JSON / non-2xx content and malformed path items are ignored', () => {
  const spec = {
    paths: {
      '/redirect': { get: op({ '302': { description: 'Found' } }) },
      '/text': { get: op({ '200': { description: 'OK', content: { 'text/plain': { schema: {} } } } }) },
      '/bare': { parameters: [] },
    },
  };
  assert.deepEqual(findEmptySchemaResponses(spec), []);
});