// ─── Tour Mode: Mobile 3D Virtual Tour ──────────────────────────────
// Matterport-style: fixed viewpoints, drag to look, tap hotspots to teleport
import * as THREE from 'three';
import {
  ATRIUM_RADIUS, CORRIDOR_LENGTH, ALCOVE_DEPTH, NUM_SPOKES,
  PLAYER_HEIGHT, EXHIBITS,
} from './config.js';
import { exhibitObjects } from './exhibits.js';
import { triggerExhibitAction, closeOverlay, isOverlayActive } from './interaction.js';

// ─── Tour Camera ────────────────────────────────────────────────────
let camera = null;

export function createTourCamera(renderer) {
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, PLAYER_HEIGHT, 0);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return camera;
}

export function getTourCamera() { return camera; }

// ─── Tour Stops ─────────────────────────────────────────────────────
// Stop 0 = atrium center, Stops 1-6 = 2m into each alcove
const ALCOVE_ENTRY_DIST = ATRIUM_RADIUS + CORRIDOR_LENGTH + 2;
const EXHIBIT_DIST = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.5;

const stops = [];

function buildStops() {
  // Stop 0 — Atrium center
  stops.push({
    position: new THREE.Vector3(0, PLAYER_HEIGHT, 0),
    lookAt: new THREE.Vector3(0, PLAYER_HEIGHT, 1), // forward
    name: 'ATRIUM',
    hint: 'Drag to look around \u2022 Tap a portal to enter',
    exhibitIndex: -1,
  });

  // Stops 1-6 — Alcove viewpoints
  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    stops.push({
      position: new THREE.Vector3(sin * ALCOVE_ENTRY_DIST, PLAYER_HEIGHT, cos * ALCOVE_ENTRY_DIST),
      lookAt: new THREE.Vector3(sin * EXHIBIT_DIST, PLAYER_HEIGHT, cos * EXHIBIT_DIST),
      name: EXHIBITS[i].name.toUpperCase(),
      hint: 'Drag to look \u2022 Tap button to interact',
      exhibitIndex: i,
    });
  }
}

// ─── Navigation State ───────────────────────────────────────────────
let currentStop = 0;
let transitioning = false;

// ─── Touch Look-Around ──────────────────────────────────────────────
// Spherical coordinates for FPS-style look
let yaw = 0;   // horizontal angle (radians)
let pitch = 0; // vertical angle (radians), clamped ±80°

let touchStartX = 0;
let touchStartY = 0;
let touchStartYaw = 0;
let touchStartPitch = 0;
let touchMoved = false;
const TOUCH_SENSITIVITY = 0.004;
const PITCH_LIMIT = Math.PI * 0.44; // ~80°
const TAP_THRESHOLD = 10; // px — below this is a tap, above is a drag

export function initTourControls(renderer) {
  const el = renderer.domElement;

  el.addEventListener('touchstart', (e) => {
    if (transitioning || isOverlayActive()) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartYaw = yaw;
    touchStartPitch = pitch;
    touchMoved = false;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (transitioning || isOverlayActive()) return;
    e.preventDefault(); // prevent scroll
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) touchMoved = true;

    yaw = touchStartYaw + dx * TOUCH_SENSITIVITY;
    pitch = touchStartPitch - dy * TOUCH_SENSITIVITY;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  }, { passive: false });

  el.addEventListener('touchend', (e) => {
    if (transitioning || isOverlayActive()) return;
    if (touchMoved) return; // was a drag, not a tap

    // It's a tap — raycast for hotspots and exhibits
    const touch = e.changedTouches[0];
    handleTap(touch.clientX, touch.clientY);
  }, { passive: true });
}

// ─── Hotspot Meshes ─────────────────────────────────────────────────
const hotspots = [];   // { mesh, hitArea, targetStop, group }
const raycaster = new THREE.Raycaster();
const tapNDC = new THREE.Vector2();

const HOTSPOT_ENTRANCE_DIST = ATRIUM_RADIUS + 1.5; // just inside corridor mouth
const HOTSPOT_BACK_DIST = ATRIUM_RADIUS + CORRIDOR_LENGTH + 0.5; // just inside alcove entrance

export function initHotspots(scene) {
  buildStops();

  // 6 atrium hotspots — one at each corridor entrance
  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;
    const x = Math.sin(angle) * HOTSPOT_ENTRANCE_DIST;
    const z = Math.cos(angle) * HOTSPOT_ENTRANCE_DIST;
    createHotspot(scene, x, z, i + 1, EXHIBITS[i].lightColor); // target = alcove stop
  }

  // 6 "back" hotspots — one at each alcove entrance pointing back
  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;
    const x = Math.sin(angle) * HOTSPOT_BACK_DIST;
    const z = Math.cos(angle) * HOTSPOT_BACK_DIST;
    createHotspot(scene, x, z, 0, 0x00ff41); // target = atrium
  }

  // Set initial look direction (toward spoke 0 = +Z)
  yaw = 0;
  pitch = 0;
}

function createHotspot(scene, x, z, targetStop, color) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Torus ring on the floor
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.04, 8, 24),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.8,
      flatShading: true,
    })
  );
  torus.rotation.x = -Math.PI / 2;
  torus.position.y = 0.05;
  group.add(torus);

  // Spinning octahedron above
  const octa = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      flatShading: true,
    })
  );
  octa.position.y = 0.5;
  octa.userData.spin = true;
  group.add(octa);

  // Invisible cylinder hit area (0.7m radius for comfortable tap target)
  const hitGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.5, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitArea = new THREE.Mesh(hitGeo, hitMat);
  hitArea.position.y = 0.75;
  hitArea.userData.isHotspot = true;
  hitArea.userData.targetStop = targetStop;
  group.add(hitArea);

  scene.add(group);
  hotspots.push({ torus, octa, hitArea, targetStop, group });
}

// ─── Tap Handling ───────────────────────────────────────────────────
function handleTap(clientX, clientY) {
  tapNDC.x = (clientX / window.innerWidth) * 2 - 1;
  tapNDC.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(tapNDC, camera);

  // Check hotspots first
  const hitAreas = hotspots.map(h => h.hitArea);
  const hits = raycaster.intersectObjects(hitAreas);
  if (hits.length > 0) {
    const target = hits[0].object.userData.targetStop;
    navigateTo(target);
    return;
  }

  // Check exhibit meshes at alcove stops
  if (currentStop > 0) {
    const exhibitIdx = currentStop - 1;
    const exhibit = exhibitObjects[exhibitIdx];
    if (exhibit) {
      const meshes = [];
      exhibit.group.traverse((child) => { if (child.isMesh) meshes.push(child); });
      const exhibitHits = raycaster.intersectObjects(meshes);
      if (exhibitHits.length > 0) {
        triggerExhibitAction(exhibitIdx);
      }
    }
  }
}

// ─── Navigation (fade transition) ───────────────────────────────────
const fadeEl = () => document.getElementById('tour-fade');

export function navigateTo(stopIndex) {
  if (transitioning || stopIndex === currentStop) return;
  if (stopIndex < 0 || stopIndex >= stops.length) return;
  transitioning = true;

  const fade = fadeEl();

  // Fade out (0.4s)
  fade.classList.add('active');

  setTimeout(() => {
    // Teleport camera
    const stop = stops[stopIndex];
    camera.position.copy(stop.position);

    // Set look direction toward the stop's lookAt target
    const dir = new THREE.Vector3().subVectors(stop.lookAt, stop.position).normalize();
    yaw = Math.atan2(dir.x, dir.z);
    pitch = Math.asin(-dir.y);

    currentStop = stopIndex;
    updateHotspotVisibility();
    updateHUD();

    // Fade in (0.4s)
    fade.classList.remove('active');

    setTimeout(() => {
      transitioning = false;
    }, 400);
  }, 400);
}

// ─── Hotspot Visibility ─────────────────────────────────────────────
function updateHotspotVisibility() {
  for (const hs of hotspots) {
    if (currentStop === 0) {
      // At atrium: show corridor entrance hotspots (targetStop 1-6), hide back hotspots (targetStop 0)
      hs.group.visible = hs.targetStop > 0;
    } else {
      // At alcove: only show the back hotspot for this alcove
      hs.group.visible = hs.targetStop === 0 && isHotspotForCurrentAlcove(hs);
    }
  }
}

function isHotspotForCurrentAlcove(hs) {
  if (currentStop <= 0) return false;
  const alcoveIdx = currentStop - 1;
  const angle = (alcoveIdx * Math.PI * 2) / NUM_SPOKES;
  const expectedX = Math.sin(angle) * HOTSPOT_BACK_DIST;
  const expectedZ = Math.cos(angle) * HOTSPOT_BACK_DIST;
  const dx = hs.group.position.x - expectedX;
  const dz = hs.group.position.z - expectedZ;
  return (dx * dx + dz * dz) < 1;
}

// ─── HUD Updates ────────────────────────────────────────────────────
const hudEl = () => document.getElementById('tour-hud');
const locEl = () => document.getElementById('tour-location');
const hintEl = () => document.getElementById('tour-hint');
const exhibitBtn = () => document.getElementById('tour-exhibit-btn');
const backBtn = () => document.getElementById('tour-back-btn');

function updateHUD() {
  const stop = stops[currentStop];
  locEl().textContent = stop.name;
  hintEl().textContent = stop.hint;

  // Exhibit button
  if (currentStop > 0) {
    const data = EXHIBITS[currentStop - 1];
    const btn = exhibitBtn();
    btn.style.display = 'block';
    btn.style.borderColor = data.lightColorCSS;
    btn.style.color = data.lightColorCSS;
    btn.textContent = data.action === 'link' ? 'OPEN PROJECT' : 'TAP TO INTERACT';
    backBtn().style.display = 'block';
  } else {
    exhibitBtn().style.display = 'none';
    backBtn().style.display = 'none';
  }
}

// ─── Start Tour ─────────────────────────────────────────────────────
export function startTour() {
  hudEl().style.display = 'block';

  // Exhibit button handler
  exhibitBtn().addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentStop > 0) {
      triggerExhibitAction(currentStop - 1);
    }
  });

  // Back button handler
  backBtn().addEventListener('click', (e) => {
    e.stopPropagation();
    navigateTo(0);
  });

  // Place camera at atrium
  currentStop = 0;
  camera.position.copy(stops[0].position);
  yaw = 0;
  pitch = 0;
  updateHotspotVisibility();
  updateHUD();
}

// ─── Per-Frame Update ───────────────────────────────────────────────
const lookTarget = new THREE.Vector3();

export function updateTour(delta, elapsed) {
  if (!camera) return;

  // Update camera orientation from spherical coords
  lookTarget.set(
    Math.sin(yaw) * Math.cos(pitch),
    -Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch)
  );
  lookTarget.add(camera.position);
  camera.lookAt(lookTarget);

  // Animate hotspots — pulse opacity + spin octahedrons
  for (const hs of hotspots) {
    if (!hs.group.visible) continue;
    hs.octa.rotation.y = elapsed * 2;
    hs.octa.rotation.x = elapsed * 0.7;
    hs.torus.material.opacity = 0.5 + Math.sin(elapsed * 3) * 0.3;
    hs.octa.position.y = 0.45 + Math.sin(elapsed * 2) * 0.08;
  }
}
