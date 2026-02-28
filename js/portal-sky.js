// ─── Hidden Portal: Device Geometry / Suppressed Physics ─────────────
// Pb core + Hg geodesic shell + 3 orthogonal torus generators (gimbal)
// = physical quaternion [1, i, j, k].
// Stand at atrium center, look UP for 5s → opens suppressed-physics.
import * as THREE from 'three';
import { getCamera, isLocked } from './player.js';
import { CEILING_HEIGHT } from './config.js';

// TODO: update when dedicated device-spec page is deployed
const PORTAL_URL = 'https://qav2.github.io/suppressed-physics-map/';
const CENTER_RADIUS = 3.0;
const LOOK_UP_THRESHOLD = 0.7;    // camera.direction.y (≈45° above horizon)
const HOLD_DURATION = 5.0;

let deviceGroup = null;
let rings = [];          // 3 orthogonal torus meshes (i, j, k)
let hgShell = null;      // mercury geodesic wireframe
let pbCore = null;       // lead core — the real axis [1,0,0,0]
let progressRing = null;
let holdTimer = 0;
let triggered = false;
let flashEl = null;

const _dir = new THREE.Vector3();

const AMBER    = 0xffa040;
const HG_COLOR = 0xb8c4d0;   // cool mercury silver
const PB_COLOR = 0xffc060;   // warm gold — the identity element

export function initSkyPortal(scene) {
  deviceGroup = new THREE.Group();
  deviceGroup.position.set(0, CEILING_HEIGHT - 0.02, 0);

  // ─── Mercury containment field (geodesic wireframe) ─────────────
  // Icosahedron detail=1 gives clean geodesic facets
  const hgGeo = new THREE.IcosahedronGeometry(0.30, 1);
  const hgMat = new THREE.MeshBasicMaterial({
    color: HG_COLOR,
    transparent: true,
    opacity: 0.03,
    wireframe: true,
    depthWrite: false,
  });
  hgShell = new THREE.Mesh(hgGeo, hgMat);
  deviceGroup.add(hgShell);

  // ─── Lead core — the real axis, identity [1,0,0,0] ─────────────
  // Doesn't spin. The identity element is still.
  const pbGeo = new THREE.SphereGeometry(0.06, 12, 12);
  const pbMat = new THREE.MeshBasicMaterial({
    color: PB_COLOR,
    transparent: true,
    opacity: 0.10,
    depthWrite: false,
  });
  pbCore = new THREE.Mesh(pbGeo, pbMat);
  deviceGroup.add(pbCore);

  // ─── Three orthogonal torus generators (i, j, k) ───────────────
  // Each in its own pivot so it spins in-plane via local rotation.y
  // Staggered radii prevent z-fighting between rings.
  const configs = [
    { rot: [0, 0, 0],            radius: 0.40, speed:  0.15 },  // XZ plane (i)
    { rot: [Math.PI / 2, 0, 0],  radius: 0.43, speed: -0.11 },  // XY plane (j)
    { rot: [0, 0, Math.PI / 2],  radius: 0.46, speed:  0.09 },  // YZ plane (k)
  ];

  rings = configs.map(({ rot, radius, speed }) => {
    const pivot = new THREE.Object3D();
    pivot.rotation.set(...rot);

    const geo = new THREE.TorusGeometry(radius, 0.012, 12, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh._speed = speed;
    pivot.add(mesh);
    deviceGroup.add(pivot);
    return mesh;
  });

  scene.add(deviceGroup);

  // ─── Progress ring (flat outer fill indicator, faces downward) ──
  const progGeo = new THREE.RingGeometry(0.65, 0.75, 64, 1, 0, 0.001);
  const progMat = new THREE.MeshBasicMaterial({
    color: AMBER,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  progressRing = new THREE.Mesh(progGeo, progMat);
  progressRing.rotation.x = Math.PI / 2;
  progressRing.position.set(0, CEILING_HEIGHT - 0.025, 0);
  scene.add(progressRing);

  // ─── Flash overlay (DOM) ────────────────────────────────────────
  flashEl = document.getElementById('portal-sky-flash');
}

export function updateSkyPortal(delta, elapsed) {
  if (triggered || !deviceGroup) return;

  const active = holdTimer > 0;
  const progress = active ? Math.min(holdTimer / HOLD_DURATION, 1) : 0;

  // ─── Generator spin (each ring in its own plane) ────────────────
  // Idle: slow independent rotation. Active: accelerates to 6x.
  const speedMul = 1 + progress * 5;
  rings.forEach(r => {
    r.rotation.y += r._speed * speedMul * delta;
  });

  // ─── Ring opacity ───────────────────────────────────────────────
  const ringOp = active
    ? 0.06 + progress * 0.55
    : 0.04 + Math.sin(elapsed * 0.5) * 0.02;
  rings.forEach(r => { r.material.opacity = ringOp; });

  // ─── Mercury shell breathe ──────────────────────────────────────
  const hgOp = active
    ? 0.03 + progress * 0.22
    : 0.025 + Math.sin(elapsed * 0.35) * 0.012;
  hgShell.material.opacity = hgOp;
  const hgScale = 1 + Math.sin(elapsed * 0.25) * 0.015;
  hgShell.scale.setScalar(hgScale);

  // ─── Pb core — steady glow (the real axis doesn't rotate) ──────
  const coreOp = active
    ? 0.10 + progress * 0.75
    : 0.08 + Math.sin(elapsed * 0.7) * 0.03;
  pbCore.material.opacity = coreOp;

  // ─── Trigger check ─────────────────────────────────────────────
  const cam = getCamera();
  if (!cam || !isLocked()) { resetTimer(); return; }

  const distXZ = Math.sqrt(cam.position.x ** 2 + cam.position.z ** 2);
  cam.getWorldDirection(_dir);

  if (distXZ < CENTER_RADIUS && _dir.y > LOOK_UP_THRESHOLD) {
    holdTimer += delta;
    const p = Math.min(holdTimer / HOLD_DURATION, 1);

    // Progress ring fills clockwise
    progressRing.geometry.dispose();
    progressRing.geometry = new THREE.RingGeometry(
      0.65, 0.75, 64, 1, 0, p * Math.PI * 2
    );
    progressRing.material.opacity = 0.25 + p * 0.55;

    if (holdTimer >= HOLD_DURATION) triggerPortal();
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
      progressRing.geometry = new THREE.RingGeometry(0.65, 0.75, 64, 1, 0, 0.001);
    }
  }
}

function triggerPortal() {
  triggered = true;

  // Everything blazes
  hgShell.material.opacity = 0.5;
  pbCore.material.opacity = 1.0;
  rings.forEach(r => { r.material.opacity = 1.0; });
  progressRing.material.opacity = 1.0;

  // Flash → open → fade
  if (flashEl) {
    flashEl.style.display = 'block';
    requestAnimationFrame(() => { flashEl.style.opacity = '1'; });

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
