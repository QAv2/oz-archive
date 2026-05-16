// Visual smoke test for new exhibits. Uses cinema mode to position the camera.
// Run with `python3 -m http.server 8080` in oz-archive root.
import { chromium } from 'playwright';

const URL_BASE = 'http://localhost:8080/?cinema';
const SHOTS = '/tmp';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

await page.goto(URL_BASE, { waitUntil: 'networkidle', timeout: 30000 });
// Let cinema-mode init finish exposing __ozarchive and textures settle
await page.waitForTimeout(3000);
const ready = await page.evaluate(() => !!window.__ozarchive);
if (!ready) { console.error('FAIL: window.__ozarchive not set'); process.exit(2); }

// Read EXHIBITS layout: index 3 = Disclosure Scrolls (angle 3 of 6), index 4 = Oracle (angle 4 of 6)
const layout = await page.evaluate(() => {
  // Recompute the alcove positions from config constants accessible via the module
  const { ATRIUM_RADIUS, CORRIDOR_LENGTH, ALCOVE_DEPTH, NUM_SPOKES, PLAYER_HEIGHT, EXHIBITS } =
    window.__ozCfgProbe || {};
  return { ATRIUM_RADIUS, CORRIDOR_LENGTH, ALCOVE_DEPTH, NUM_SPOKES, PLAYER_HEIGHT, EXHIBITS };
});

// Need to expose config — re-import in page
const cfg = await page.evaluate(async () => {
  const c = await import('./js/config.js');
  return {
    ATRIUM_RADIUS: c.ATRIUM_RADIUS,
    CORRIDOR_LENGTH: c.CORRIDOR_LENGTH,
    ALCOVE_DEPTH: c.ALCOVE_DEPTH,
    NUM_SPOKES: c.NUM_SPOKES,
    PLAYER_HEIGHT: c.PLAYER_HEIGHT,
    EXHIBITS: c.EXHIBITS.map(e => ({ id: e.id, name: e.name, type: e.type })),
  };
});
console.log('config:', cfg);

function alcovePos(i, { ATRIUM_RADIUS, CORRIDOR_LENGTH, ALCOVE_DEPTH, NUM_SPOKES }) {
  const angle = (i * Math.PI * 2) / NUM_SPOKES;
  const dist = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.5;
  return {
    x: Math.sin(angle) * dist,
    z: Math.cos(angle) * dist,
    angle,
  };
}

async function shotAt(viewName, camX, camY, camZ, lookX, lookY, lookZ) {
  await page.evaluate(([px, py, pz, lx, ly, lz]) => {
    const cam = window.__ozarchive.camera;
    cam.position.set(px, py, pz);
    cam.lookAt(lx, ly, lz);
  }, [camX, camY, camZ, lookX, lookY, lookZ]);
  // Allow updateExhibits to settle the lerp
  await page.waitForTimeout(800);
  const path = `${SHOTS}/oz-${viewName}.png`;
  await page.screenshot({ path });
  console.log('wrote', path);
}

// 1) Atrium center looking at scroll alcove (index 3) — should see FURLED scroll in the distance
const scrollIdx = cfg.EXHIBITS.findIndex(e => e.id === 'scrolls');
const oracleIdx = cfg.EXHIBITS.findIndex(e => e.id === 'oracle');
console.log('scrollIdx =', scrollIdx, 'oracleIdx =', oracleIdx);
const sp = alcovePos(scrollIdx, cfg);
const op = alcovePos(oracleIdx, cfg);
const exhibitDist = cfg.ATRIUM_RADIUS + cfg.CORRIDOR_LENGTH + cfg.ALCOVE_DEPTH * 0.5;
const insideFrac = (exhibitDist - 1.8) / exhibitDist; // ~1.8m in front of exhibit

// Atrium → scroll: should be FURLED
await shotAt('atrium-toward-scroll',
  0, cfg.PLAYER_HEIGHT, 0,
  sp.x, 1.65, sp.z);

// Corridor mid → scroll: mid-unfurl
await shotAt('corridor-mid-scroll',
  sp.x * 0.55, cfg.PLAYER_HEIGHT, sp.z * 0.55,
  sp.x, 1.65, sp.z);

// Inside scroll alcove: fully unfurled
await shotAt('inside-scroll-alcove',
  sp.x * insideFrac, cfg.PLAYER_HEIGHT, sp.z * insideFrac,
  sp.x, 1.65, sp.z);

// Inside oracle alcove: laptop screen at ~0.95m
await shotAt('inside-oracle-alcove',
  op.x * insideFrac, cfg.PLAYER_HEIGHT, op.z * insideFrac,
  op.x, 0.95, op.z);

// Closer oracle (kneeling-eye distance)
const tableFrac = (exhibitDist - 1.0) / exhibitDist;
await shotAt('close-oracle-laptop',
  op.x * tableFrac, 1.30, op.z * tableFrac,
  op.x, 0.95, op.z);

// Atrium center looking up (ceiling portal still present)
await shotAt('atrium-look-up',
  0, cfg.PLAYER_HEIGHT, 0,
  0, 4.0, 0.001);

console.log('errors:', errs);
await ctx.close();
await browser.close();
if (errs.length > 0) process.exit(1);
