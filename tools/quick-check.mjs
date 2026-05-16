// Quick desktop+mobile smoke check after the scroll/laptop changes.
import { chromium, devices } from 'playwright';

const PHONE = devices['iPhone 13'];
const URL = 'http://localhost:8080/?skipboot';

const browser = await chromium.launch({ headless: true });
let pass = 0, fail = 0;
const log = (name, ok, info = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`);
  ok ? pass++ : fail++;
};

// Desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => ({
    bootHidden: getComputedStyle(document.getElementById('boot-screen')).display === 'none',
    canvasOk: (document.getElementById('game-canvas')?.getContext('webgl2') || document.getElementById('game-canvas')?.getContext('webgl')) ? true : false,
    hud: document.getElementById('hud-prompt')?.textContent?.includes('CLICK'),
  }));

  log('Desktop: no JS errors', errs.length === 0, errs.slice(0, 2).join('; '));
  log('Desktop: boot hidden', state.bootHidden);
  log('Desktop: canvas alive', state.canvasOk);
  log('Desktop: HUD CLICK TO ENTER', !!state.hud);
  await ctx.close();
}

// Mobile tour
{
  const ctx = await browser.newContext({ ...PHONE, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => ({
    bootHidden: getComputedStyle(document.getElementById('boot-screen')).display === 'none',
    hudVis: document.getElementById('tour-hud')?.style.display === 'block',
    loc: document.getElementById('tour-location')?.textContent,
  }));

  log('Mobile: no JS errors', errs.length === 0, errs.slice(0, 2).join('; '));
  log('Mobile: boot hidden', state.bootHidden);
  log('Mobile: tour HUD visible', state.hudVis);
  log('Mobile: location ATRIUM', state.loc === 'ATRIUM', state.loc);
  await ctx.close();
}

await browser.close();
console.log('─'.repeat(40));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
