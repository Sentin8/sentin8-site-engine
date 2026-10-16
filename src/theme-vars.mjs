// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-Engine
// SPDX-License-Identifier: Apache-2.0

// theme-vars.mjs - per-site theming contract consumed by theme.css and the
// config factory. The platform accent is Royal Gold; each vertical site
// overrides --site-accent via site.json (design/sentin8-websites-design.md §5).

export const PLATFORM_ACCENT = '#D4AF37';
export const PLATFORM_NAME = 'Sentin8';

/**
 * Vertical accents - the per-site brand chips rendered across all 7 sites
 * (vertical showcase cards, CrossSiteLink chips). Keep in sync with each
 * vertical's site.json "accent" (the site-local value is authoritative).
 */
export const VERTICAL_ACCENTS = {
  sentin8: PLATFORM_ACCENT,
  bank8: '#1B6CA8',
  hotel8: '#C08A3E',
  exchange8: '#2E9B8F',
  trade8: '#B85450',
  bill8: '#7B4FBF',
  email8: '#3E8FB0',
  health8: '#5FA85F',
};