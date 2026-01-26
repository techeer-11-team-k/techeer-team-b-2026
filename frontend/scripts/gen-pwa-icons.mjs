#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'public', 'icons');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3182F6"/><stop offset="100%" stop-color="#1B64DA"/></linearGradient></defs>
<rect width="512" height="512" rx="96" fill="url(#g)"/>
<path d="M256 108 L436 268 L436 420 L332 420 L332 320 L180 320 L180 420 L76 420 L76 268 Z" fill="white" fill-opacity="0.95"/>
<path d="M256 168 L396 308 L396 404 L300 404 L300 304 L212 304 L212 404 L116 404 L116 308 Z" fill="none" stroke="white" stroke-width="24" stroke-linejoin="round"/>
</svg>`;

async function generate() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('Run: npm i -D sharp');
    process.exit(1);
  }
  mkdirSync(iconsDir, { recursive: true });
  const buf = Buffer.from(svg);
  for (const size of [192, 512]) {
    const png = await sharp(buf).resize(size, size).png().toBuffer();
    writeFileSync(join(iconsDir, `icon-${size}x${size}.png`), png);
    writeFileSync(join(iconsDir, `icon-maskable-${size}x${size}.png`), png);
  }
  console.log('PWA icons written to public/icons/');
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
