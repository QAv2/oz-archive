// ─── Hidden Portal: WorldView Intel Globe ────────────────────────────
// Stand at the center of the atrium and look straight down for 5 seconds.
// A barely-visible hex glyph on the floor glows and fills as the timer
// progresses. On completion — flash, then open WorldView in a new tab.
import * as THREE from 'three';
import { getCamera, isLocked } from './player.js';

const PORTAL_URL = 'https://worldview-intel.netlify.app';
const CENTER_RADIUS = 3.0;           // must be within 3m of origin (XZ)
const LOOK_DOWN_THRESHOLD = -0.7;    // camera direction Y (≈45° below horizon)
const HOLD_DURATION = 5.0;           // seconds of sustained look-down

let glyphGroup = null;
let progressRing = null;
let holdTimer = 0;
let triggered = false;
let flashEl = null;

const _dir = new THREE.Vector3();

export function initPortal(scene) {
  // ─── Glyph: hex ring + center dot, barely visible ───────────────
  glyphGroup = new THREE.Group();
  glyphGroup.position.set(0, 0.02, 0);
  glyphGroup.rotation.x = -Math.PI / 2;

  const ringGeo = new THREE.RingGeometry(0.5, 0.75, 6);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x0abdc6,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  glyphGroup.add(new THREE.Mesh(ringGeo, ringMat));

  const dotGeo = new THREE.CircleGeometry(0.1, 16);
  const dotMat = new THREE.MeshBasicMaterial({
    color: 0x0abdc6,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  glyphGroup.add(new THREE.Mesh(dotGeo, dotMat));

  scene.add(glyphGroup);

  // ─── Progress ring: fills as timer accumulates ──────────────────
  const progGeo = new THREE.RingGeometry(0.5, 0.65, 64, 1, 0, 0.001);
  const progMat = new THREE.MeshBasicMaterial({
    color: 0x0abdc6,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  progressRing = new THREE.Mesh(progGeo, progMat);
  progressRing.rotation.x = -Math.PI / 2;
  progressRing.position.set(0, 0.025, 0);
  scene.add(progressRing);

  // ─── Flash overlay (DOM) ────────────────────────────────────────
  flashEl = document.getElementById('portal-flash');
}

export function updatePortal(delta, elapsed) {
  if (triggered || !glyphGroup) return;

  // Idle: slow rotation + visible pulse
  glyphGroup.rotation.z = elapsed * 0.1;
  if (holdTimer === 0) {
    const pulse = 0.12 + Math.sin(elapsed * 0.8) * 0.06;
    glyphGroup.children.forEach(c => { c.material.opacity = pulse; });
  }

  const cam = getCamera();
  if (!cam || !isLocked()) {
    resetTimer();
    return;
  }

  // Position check: within CENTER_RADIUS of origin on XZ plane
  const distXZ = Math.sqrt(cam.position.x ** 2 + cam.position.z ** 2);
  // Look check: camera direction pointing downward
  cam.getWorldDirection(_dir);

  if (distXZ < CENTER_RADIUS && _dir.y < LOOK_DOWN_THRESHOLD) {
    holdTimer += delta;
    const progress = Math.min(holdTimer / HOLD_DURATION, 1);

    // Glyph intensifies
    const glow = 0.06 + progress * 0.5;
    glyphGroup.children.forEach(c => { c.material.opacity = glow; });

    // Progress ring fills clockwise
    progressRing.geometry.dispose();
    progressRing.geometry = new THREE.RingGeometry(
      0.5, 0.65, 64, 1, 0, progress * Math.PI * 2
    );
    progressRing.material.opacity = 0.3 + progress * 0.5;

    if (holdTimer >= HOLD_DURATION) {
      triggerPortal();
    }
  } else {
    resetTimer();
  }
}

function resetTimer() {
  if (holdTimer > 0) {
    holdTimer = 0;
    if (progressRing) {
      progressRing.material.opacity = 0;
      progressRing.geometry.dispose();
      progressRing.geometry = new THREE.RingGeometry(0.5, 0.65, 64, 1, 0, 0.001);
    }
    // Glyph snaps back to idle opacity (pulse loop takes over)
  }
}

function triggerPortal() {
  triggered = true;

  // Max glow
  glyphGroup.children.forEach(c => { c.material.opacity = 1.0; });
  progressRing.material.opacity = 1.0;

  // Flash → open → fade
  if (flashEl) {
    flashEl.style.display = 'block';
    requestAnimationFrame(() => {
      flashEl.style.opacity = '1';
    });

    setTimeout(() => {
      window.open(PORTAL_URL, '_blank');
      flashEl.style.opacity = '0';
      setTimeout(() => {
        flashEl.style.display = 'none';
        triggered = false;
        resetTimer();
      }, 800);
    }, 700);
  } else {
    window.open(PORTAL_URL, '_blank');
    triggered = false;
    resetTimer();
  }
}
