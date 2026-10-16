// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// h.mjs - JSX-free React authoring helper. The engine ships inside
// node_modules; Docusaurus excludes node_modules from its Babel/MDX pipeline,
// so every engine component is written with plain createElement. Site-local
// pages import the component set and use MDX freely.

import { createElement as h } from 'react';

export { h };

/** Class-string helper: joins truthy class names. */
export function cx(...names) {
  return names.filter(Boolean).join(' ');
}

/** Anchor builder keeping external cross-site links consistent. */
export function external(url, label, { chip, accent } = {}) {
  return h(
    'a',
    { href: url, target: '_blank', rel: 'noopener noreferrer', className: 's8-external' },
    label,
    chip ? h('span', { className: 's8-chip', style: chipStyle(accent) }, chip) : null,
  );
}

export function chipStyle(accent) {
  return accent ? { borderColor: accent, color: accent } : undefined;
}