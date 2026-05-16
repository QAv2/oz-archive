// Headless screenshots of new-exhibit landing pages.
// Run: node tools/capture-exhibit-screenshots.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'textures');

const targets = [
  {
    name: 'exhibit-scrolls.png',
    url: 'https://disclosure-scrolls.netlify.app/',
    viewport: { width: 1200, height: 840 },
    clip: { x: 0, y: 0, width: 1200, height: 840 },
  },
  {
    name: 'exhibit-oracle.png',
    url: 'https://qav2-oracle.netlify.app/',
    viewport: { width: 1280, height: 800 },
    clip: { x: 0, y: 0, width: 1280, height: 800 },
    waitUntil: 'domcontentloaded',
  },
];

const browser = await chromium.launch({ headless: true });
for (const t of targets) {
  const ctx = await browser.newContext({ viewport: t.viewport });
  const page = await ctx.newPage();
  await page.goto(t.url, { waitUntil: t.waitUntil || 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const outPath = path.join(OUT_DIR, t.name);
  await page.screenshot({ path: outPath, clip: t.clip });
  console.log('wrote', outPath);
  await ctx.close();
}
await browser.close();
