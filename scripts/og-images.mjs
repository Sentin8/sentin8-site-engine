// SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
// SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
// SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:CI
// SPDX-License-Identifier: Apache-2.0

//! OG/social-share card generator (WhatsApp/LinkedIn/Twitter link previews).
//!
//! Social scrapers (WhatsApp, LinkedIn, Twitter/X, iMessage, Slack) never
//! render SVG `og:image`s, and a bare `og:title` link preview with no image
//! looks like plain text - the owner finding ("currently it shows no image").
//! The target state: every site ships a 1200x630 PNG card at
//! `static/img/og-card.png` (branded: vertical accent background, centered
//! logo, product name), and `makeSiteConfig` emits the full
//! `og:*`/`twitter:*` metadata block referencing its absolute URL.
//!
//! Usage from the SITE root: `node {engine}/scripts/og-images.mjs .`
//! Source of truth: `{vertical}/logo/{vertical}-logo.png` (single logo
//! pipeline) + the site's own `site.json` (accent + name). No-op when the
//! logo PNG is missing (the card simply is not regenerated; the config
//! factory keeps pointing at the canonical path).

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const W = 1200;
const H = 630;

async function main() {
  const siteDir = path.resolve(process.argv[2] ?? '.');
  const site = JSON.parse(readFileSync(path.join(siteDir, 'site.json'), 'utf8'));
  const vertical = site.vertical;

  // The engine resolves sharp from its OWN node_modules (tooling-only dep;
  // sites never bundle it) while running from the site dir.
  const engineDir = path.dirname(new URL(import.meta.url).pathname);
  let sharp;
  try {
    sharp = require(path.join(engineDir, '..', 'node_modules', 'sharp'));
  } catch {
    // engine repo layout: scripts/ og-images.mjs -> node_modules one level up
    sharp = require(path.join(engineDir, 'node_modules', 'sharp'));
  }

  // Logo PNG source: prefer the site's harvested copy, fall back to the
  // vertical's logo/ directory (the canonical single-source pipeline).
  const candidates = [
    path.join(siteDir, 'static', 'img', `${vertical}-logo.png`),
    path.join(siteDir, '..', 'logo', `${vertical}-logo.png`),
  ];
  const logoPath = candidates.find((p) => existsSync(p));
  if (!logoPath) {
    console.log(`og-images: no ${vertical}-logo.png - card skipped`);
    return;
  }

  mkdirSync(path.join(siteDir, 'static', 'img'), { recursive: true });

  // Card: accent-tinted dark base (matches the s8 design system's glass-over-
  // deep-navy look), the logo centered on a glass panel, product name beneath.
  const accent = site.accent ?? '#D4AF37';
  const name = site.name ?? vertical;
  const bgSvg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0a0e1a"/>
          <stop offset="100%" stop-color="#141a2e"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#glow)"/>
      <rect x="330" y="88" width="540" height="380" rx="28"
            fill="#ffffff" fill-opacity="0.045"
            stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
      <text x="600" y="545" text-anchor="middle"
            font-family="DejaVu Sans,Verdana,sans-serif" font-size="64"
            font-weight="700" fill="#f5f5f5">${escapeXml(name)}</text>
      <text x="600" y="590" text-anchor="middle"
            font-family="DejaVu Sans,Verdana,sans-serif" font-size="26"
            font-weight="500" fill="${accent}">${escapeXml(site.domain ?? '')}</text>
    </svg>`,
  );

  // Logo centered inside the panel: fit within 440x300.
  const logoPng = await sharp(logoPath)
    .resize(440, 300, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logoPng).metadata();
  const logoX = Math.round(600 - logoMeta.width / 2);
  const logoY = Math.round(278 - logoMeta.height / 2);

  const card = await sharp(bgSvg)
    .composite([{ input: logoPng, left: logoX, top: logoY }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(siteDir, 'static', 'img', 'og-card.png'));

  console.log(
    `og-images: ${vertical}-site static/img/og-card.png ${card.width}x${card.height} ${Math.round(card.size / 1024)}KB`,
  );
}

/** Minimal XML escaping for text injected into the SVG (documented-safe:
 * names/domains are plain identifiers, but the escape is unconditional). */
function escapeXml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

main().catch((err) => {
  console.error('og-images failed:', err.message);
  process.exit(1);
});