// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// openapi-page.mjs — render an OpenAPI 3.1 spec as a static docs page
// (design/sentin8-websites-design.md §2, OQ-4 resolution / WEB-14).
//
// The interactive docusaurus-plugin-openapi-docs is rejected: its CJS/ESM
// bundles break on Docusaurus 3.10's webpack 5.112 (client chunk throws
// `exports is not defined`; request sections render as skeleton fallbacks).
// A static spec→markdown page needs no client JS, rides search + sidebar
// natively, and stays in the sites' typographic voice.

// Colon-chained identifiers (OAuth scopes, event names: bank8:ledger:postings:write,
// sentin8:bus:produce) are CODE semantics — and remark-emoji would otherwise read the
// inner `:segment:` as an emoji shortcode (`:ledger:` → 📒). Backtick-wrapping every
// colon-chain both renders it as code and shields it from the emoji transform.
const codeChain = /\b[a-z0-9][a-z0-9_-]*(?::[a-z0-9][a-z0-9_-]*){1,}\b/g;

const escCell = (s) =>
  String(s)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(codeChain, (m) => '`' + m + '`');

const row = (cells) => '| ' + cells.map(escCell).join(' | ') + ' |';

/**
 * Render an OpenAPI 3.1 spec object into markdown page content.
 * Returns the markdown body (frontmatter added by the caller).
 */
export function renderOpenApiPage(spec) {
  const lines = [];
  if (spec.info?.description) {
    lines.push(escCell(String(spec.info.description).trim().split('\n').slice(0, 3).join(' ')));
    lines.push('');
  }
  lines.push('> Generated from the service\u2019s OpenAPI 3.1 spec (`docs/openapi.json`,');
  lines.push('> served live at `GET /openapi.json`) \u2014 the source of truth is the');
  lines.push('> service\u2019s own `#[utoipa::path]` annotations.');
  lines.push('');

  const components = spec.components?.schemas || {};
  const describeSchema = (node) => {
    if (!node) return '\u2014';
    if (node.$ref) return `\`${node.$ref.split('/').pop()}\``;
    if (node.type === 'array') return `${describeSchema(node.items)}[]`;
    if (node.type === 'object' && node.properties) return 'object';
    if (node.type === 'string' && node.enum) return 'string (enum)';
    if (node.type) return node.type;
    if (node.oneOf) return node.oneOf.map(describeSchema).join(' \\| ');
    if (node.anyOf) return node.anyOf.map(describeSchema).join(' \\| ');
    return '\u2014';
  };

  const expandRef = (node) => {
    if (!node?.$ref) return [];
    const comp = components[node.$ref.split('/').pop()];
    if (!comp?.properties) return [];
    const req = new Set(comp.required || []);
    return Object.entries(comp.properties).map(([pn, pnode]) =>
      row([
        '`' + pn + '`',
        describeSchema(pnode),
        req.has(pn) ? 'yes' : 'no',
        pnode.description || '',
      ]),
    );
  };

  const schemaTable = (node, out) => {
    if (!node) return;
    if (node.$ref) {
      schemaTable(components[node.$ref.split('/').pop()], out);
      return;
    }
    const props = node.type === 'object' ? node.properties : null;
    if (!props) return;
    out.push(row(['Field', 'Type', 'Required', 'Description']));
    out.push(row(['---', '---', '---', '---']));
    const req = new Set(node.required || []);
    for (const [pname, pnode] of Object.entries(props)) {
      out.push(row([
        '`' + pname + '`',
        describeSchema(pnode),
        req.has(pname) ? 'yes' : 'no',
        pnode.description || '',
      ]));
      // one level of referenced-object expansion so request rows are honest
      for (const r of expandRef(pnode)) out.push(r);
    }
  };

  // group operations by tag
  const groups = new Map();
  let total = 0;
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const tag = (op.tags && op.tags[0]) || 'other';
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push({ path, method, op });
      total++;
    }
  }
  lines.push(`**${total} endpoint${total === 1 ? '' : 's'}**${groups.size > 1 ? ` across ${groups.size} groups` : ''}.`);

  for (const [tag, ops] of groups) {
    lines.push('');
    lines.push(`## ${tag}`);
    lines.push('');
    for (const { path, method, op } of ops) {
      lines.push(`### \`${method.toUpperCase()} ${path}\``);
      lines.push('');
      if (op.summary) {
        lines.push(escCell(op.summary).replace(/`/g, (m, o, s) => m));
        lines.push('');
      }
      const scopes = (op.security || []).flatMap((s) => Object.keys(s)).filter(Boolean);
      if (scopes.length) {
        lines.push(`Gate: ${scopes.map((s) => '`' + s + '`').join(', ')}`);
        lines.push('');
      }
      const content = op.requestBody?.content;
      if (content) {
        const ct = Object.keys(content)[0];
        lines.push(`**Request body** (\`${ct}\`):`);
        lines.push('');
        const out = [];
        schemaTable(content[ct].schema, out);
        out.forEach((l) => lines.push(l));
        lines.push('');
      }
      if (op.parameters?.length) {
        lines.push('**Parameters**:');
        lines.push('');
        lines.push(row(['Name', 'In', 'Required', 'Type']));
        lines.push(row(['---', '---', '---', '---']));
        for (const p of op.parameters) {
          lines.push(row([
            '`' + p.name + '`',
            p.in,
            p.required ? 'yes' : 'no',
            p.schema ? describeSchema(p.schema) : '\u2014',
          ]));
        }
        lines.push('');
      }
      const responses = Object.entries(op.responses || {});
      if (responses.length) {
        lines.push('**Responses**:');
        lines.push('');
        lines.push(row(['Status', 'Description', 'Body']));
        lines.push(row(['---', '---', '---']));
        for (const [code, r] of responses) {
          let bodyType = '\u2014';
          if (r.content) {
            const ct2 = Object.keys(r.content)[0];
            bodyType = describeSchema(r.content[ct2].schema);
          }
          lines.push(row([code, r.description || '', bodyType]));
        }
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}