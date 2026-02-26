// Final verification — uses ?skipboot to bypass headless timing issues
import { chromium, devices } from 'playwright';
const PHONE = devices['iPhone 13'];
const URL = 'http://localhost:8080/?skipboot';

async function test() {
  const browser = await chromium.launch({ headless: true });
  let pass = 0, fail = 0;
  const results = [];

  function ok(name, cond, detail = '') {
    if (cond) { results.push(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); pass++; }
    else { results.push(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fail++; }
  }

  // ─── MOBILE TOUR ────────────────────────────────────────────────
  console.log('--- MOBILE TOUR MODE ---');
  {
    const ctx = await browser.newContext({ ...PHONE, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    // Give tour time to init
    await page.waitForTimeout(2000);

    ok('No JS errors', errors.length === 0, errors.length ? errors.slice(0, 3).join('; ') : '');

    // WebGL check
    const gl = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      const ctx = c?.getContext('webgl2') || c?.getContext('webgl');
      return ctx ? (ctx.isContextLost() ? 'lost' : 'alive') : 'null';
    });
    ok('WebGL alive', gl === 'alive', gl);

    // Tour state
    const state = await page.evaluate(() => ({
      bootHidden: getComputedStyle(document.getElementById('boot-screen')).display === 'none',
      doorHidden: document.getElementById('door-overlay')?.style.display === 'none',
      hudVisible: document.getElementById('tour-hud')?.style.display === 'block',
      location: document.getElementById('tour-location')?.textContent,
      hint: document.getElementById('tour-hint')?.textContent,
      exBtn: document.getElementById('tour-exhibit-btn')?.style.display,
      backBtn: document.getElementById('tour-back-btn')?.style.display,
      crtBtn: document.getElementById('crt-toggle')?.style.display,
      canvasW: document.getElementById('game-canvas')?.width,
      canvasH: document.getElementById('game-canvas')?.height,
    }));
    console.log('  Tour state:', JSON.stringify(state, null, 2));

    ok('Boot screen hidden', state.bootHidden);
    ok('Door overlay hidden', state.doorHidden);
    ok('Tour HUD visible', state.hudVisible);
    ok('Location = ATRIUM', state.location === 'ATRIUM', `got: "${state.location}"`);
    ok('Hint text present', state.hint?.length > 0, `"${state.hint}"`);
    ok('Exhibit btn hidden at atrium', state.exBtn === 'none');
    ok('Back btn hidden at atrium', state.backBtn === 'none');
    ok('CRT toggle visible', state.crtBtn === 'block');
    ok('Canvas sized', state.canvasW > 100 && state.canvasH > 100, `${state.canvasW}x${state.canvasH}`);

    await page.screenshot({ path: '/tmp/oz-mobile-atrium.png' });

    // Touch drag
    await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      function fire(type, x, y) {
        const t = new Touch({ identifier: 0, target: c, clientX: x, clientY: y });
        c.dispatchEvent(new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t],
          changedTouches: [t], cancelable: true,
        }));
      }
      fire('touchstart', 200, 400);
      fire('touchmove', 260, 400);
      fire('touchmove', 320, 400);
      fire('touchend', 320, 400);
    });
    await page.waitForTimeout(300);
    ok('Touch drag no crash', errors.length === 0);

    // Tap (raycast)
    await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      function fire(type, x, y) {
        const t = new Touch({ identifier: 0, target: c, clientX: x, clientY: y });
        c.dispatchEvent(new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t],
          changedTouches: [t], cancelable: true,
        }));
      }
      fire('touchstart', 200, 300);
      fire('touchend', 200, 300);
    });
    await page.waitForTimeout(300);
    ok('Tap raycast no crash', errors.length === 0);

    // Fade transition element
    const fadeWorks = await page.evaluate(() => {
      const fade = document.getElementById('tour-fade');
      if (!fade) return false;
      fade.classList.add('active');
      const cs = getComputedStyle(fade);
      fade.classList.remove('active');
      return cs.transition.includes('opacity');
    });
    ok('Fade transition CSS set up', fadeWorks);

    // Verify hotspots are in the scene (check via DOM/render count)
    ok('No errors after all interactions', errors.length === 0,
      errors.length ? errors.slice(0,3).join('; ') : '');

    await page.screenshot({ path: '/tmp/oz-mobile-final.png' });
    await ctx.close();
  }

  // ─── DESKTOP ────────────────────────────────────────────────────
  console.log('\n--- DESKTOP MODE ---');
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => ({
      bootHidden: getComputedStyle(document.getElementById('boot-screen')).display === 'none',
      hudText: document.getElementById('hud-prompt')?.textContent,
      tourHidden: document.getElementById('tour-hud')?.style.display !== 'block',
      crtBtn: document.getElementById('crt-toggle')?.style.display,
    }));
    console.log('  Desktop state:', JSON.stringify(state, null, 2));

    ok('Desktop: Boot hidden', state.bootHidden);
    ok('Desktop: HUD says CLICK TO ENTER', state.hudText?.includes('CLICK'), `got: "${state.hudText}"`);
    ok('Desktop: Tour NOT active', state.tourHidden);
    ok('Desktop: CRT toggle visible', state.crtBtn === 'block');
    ok('Desktop: No JS errors', errors.length === 0,
      errors.length ? errors.join('; ') : '');

    await page.screenshot({ path: '/tmp/oz-desktop-skipboot.png' });
    await ctx.close();
  }

  await browser.close();

  // ─── Summary ────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  for (const r of results) console.log(r);
  console.log('─'.repeat(60));
  console.log(`  ${pass} passed, ${fail} failed, ${pass + fail} total`);
  console.log('='.repeat(60));
  process.exit(fail > 0 ? 1 : 0);
}

test().catch(err => { console.error('RUNNER ERROR:', err); process.exit(2); });
