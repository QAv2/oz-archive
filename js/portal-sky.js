// ─── Hidden Portal: Device Geometry / Reference Frame Engine ─────────
// The current device (The Mercury Core, Oct 2026): a coreless mercury
// sphere inside three nested Helmholtz coil pairs at right angles
// (R = 14 / 18 / 22.5 cm, each pair at ±R/2), scaled up ~2.1×.
// The coils hold still; the sphere spins, and a void opens at the top
// of its spin axis. Stand at atrium center, look UP for 5s → opens The
// Mercury Core (its predecessor, the February 2026 capsule, is at /capsule/).
import * as THREE from 'three';
import { getCamera, isLocked } from './player.js';
import { CEILING_HEIGHT } from './config.js';

const PORTAL_URL = 'https://qav2.github.io/reference-frame-engine/';
const CENTER_RADIUS = 3.0;
const LOOK_UP_THRESHOLD = 0.7;    // camera.direction.y (≈45° above horizon)
const HOLD_DURATION = 5.0;

const SCALE = 2.14;                        // device metres → atrium metres
const HG_R = 0.050 * SCALE;                // mercury sphere radius
const COIL_R = { x: 0.14 * SCALE, y: 0.18 * SCALE, z: 0.225 * SCALE };

let deviceGroup = null;
let coils = [];          // 6 rings: 3 Helmholtz pairs (fixed)
let hgSphere = null;     // mercury, spins about the vertical axis
let spinAxis = null;     // faint line along the spin axis
let voidMesh = null;     // vapour void at the top of the spin axis
let spinSpeed = 0.2;     // rad/s, eased toward the target
let progressRing = null;
let holdTimer = 0;
let triggered = false;
let flashEl = null;

const _dir = new THREE.Vector3();

const AMBER    = 0xffa040;   // copper windings
const HG_COLOR = 0xb8c4d0;   // cool mercury silver
const VOID_COLOR = 0xe8f0ff; // the void reads as a pale point of light

function faint(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

export function initSkyPortal(scene) {
  deviceGroup = new THREE.Group();
  // Hang the cage so the top ring of the vertical pair clears the ceiling
  deviceGroup.position.set(0, CEILING_HEIGHT - COIL_R.z / 2 - 0.08, 0);

  // ─── Three Helmholtz pairs (two coaxial rings per axis, ±R/2) ───
  // x: rings face ±X · y (the device's Y = three.js Z) · z: the vertical pair
  const pairs = [
    { R: COIL_R.x, rot: [0, Math.PI / 2, 0], axis: new THREE.Vector3(1, 0, 0) },
    { R: COIL_R.y, rot: [0, 0, 0],           axis: new THREE.Vector3(0, 0, 1) },
    { R: COIL_R.z, rot: [Math.PI / 2, 0, 0], axis: new THREE.Vector3(0, 1, 0) },
  ];
  coils = [];
  pairs.forEach(({ R, rot, axis }) => {
    const geo = new THREE.TorusGeometry(R, 0.011, 10, 72);
    for (const side of [1, -1]) {
      const ring = new THREE.Mesh(geo, faint(AMBER, 0.05));
      ring.rotation.set(...rot);
      ring.position.copy(axis).multiplyScalar(side * R / 2);
      deviceGroup.add(ring);
      coils.push(ring);
    }
  });

  // ─── Mercury sphere — no core ───────────────────────────────────
  // Geodesic wireframe so the spin reads through the facets
  hgSphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(HG_R, 2),
    new THREE.MeshBasicMaterial({ color: HG_COLOR, transparent: true, opacity: 0.04, wireframe: true, depthWrite: false })
  );
  deviceGroup.add(hgSphere);

  // ─── Spin axis — everything light gathers here ──────────────────
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -HG_R * 1.25, 0), new THREE.Vector3(0, HG_R * 1.25, 0),
  ]);
  spinAxis = new THREE.Line(axisGeo,
    new THREE.LineBasicMaterial({ color: HG_COLOR, transparent: true, opacity: 0.03, depthWrite: false }));
  deviceGroup.add(spinAxis);

  // ─── Vapour void — opens at the top of the axis as it spins up ──
  voidMesh = new THREE.Mesh(new THREE.SphereGeometry(HG_R * 0.16, 12, 12), faint(VOID_COLOR, 0));
  voidMesh.position.set(0, HG_R * 0.78, 0);
  voidMesh.scale.setScalar(0.001);
  deviceGroup.add(voidMesh);

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

  // ─── Sphere spin-up (the coils never move) ──────────────────────
  // Idle: a slow turn. Active: spins up toward ~30x.
  const targetSpin = 0.2 + progress * progress * 6;
  spinSpeed += (targetSpin - spinSpeed) * Math.min(1, delta * 2);
  hgSphere.rotation.y += spinSpeed * delta;

  // ─── Coil drive (glow) ──────────────────────────────────────────
  const coilOp = active
    ? 0.06 + progress * 0.55
    : 0.04 + Math.sin(elapsed * 0.5) * 0.02;
  coils.forEach(c => { c.material.opacity = coilOp; });

  // ─── Mercury breathe ────────────────────────────────────────────
  hgSphere.material.opacity = active
    ? 0.04 + progress * 0.30
    : 0.03 + Math.sin(elapsed * 0.35) * 0.012;
  spinAxis.material.opacity = active ? 0.03 + progress * 0.45 : 0.02;

  // ─── Void opens past the halfway mark ───────────────────────────
  const v = Math.max(0, (progress - 0.5) / 0.5);
  voidMesh.scale.setScalar(Math.max(0.001, v));
  voidMesh.material.opacity = v * 0.9;

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
  hgSphere.material.opacity = 0.6;
  spinAxis.material.opacity = 0.8;
  voidMesh.scale.setScalar(1);
  voidMesh.material.opacity = 1.0;
  coils.forEach(c => { c.material.opacity = 1.0; });
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
