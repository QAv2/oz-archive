// ─── Player: PointerLockControls + WASD + AABB Collision ───────────
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PLAYER_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS } from './config.js';
import { wallBounds } from './scene.js';

let controls = null;
let camera = null;

export function getCamera() { return camera; }
export function getControls() { return controls; }

const moveState = { forward: false, backward: false, left: false, right: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

let enabled = false;

export function createPlayer(renderer) {
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, PLAYER_HEIGHT, 0);

  controls = new PointerLockControls(camera, renderer.domElement);

  // Keyboard
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return { camera, controls };
}

export function lockPointer() {
  controls.lock();
}

export function isLocked() {
  return controls?.isLocked ?? false;
}

export function enableMovement() {
  enabled = true;
}

export function disableMovement() {
  enabled = false;
  moveState.forward = moveState.backward = moveState.left = moveState.right = false;
}

export function updatePlayer(delta) {
  if (!enabled || !controls.isLocked) return;

  // Decelerate
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;

  // Direction from input
  direction.z = Number(moveState.forward) - Number(moveState.backward);
  direction.x = Number(moveState.right) - Number(moveState.left);
  direction.normalize();

  if (moveState.forward || moveState.backward) velocity.z -= direction.z * PLAYER_SPEED * 10 * delta;
  if (moveState.left || moveState.right) velocity.x -= direction.x * PLAYER_SPEED * 10 * delta;

  // Clamp speed
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
  if (speed > PLAYER_SPEED) {
    velocity.x = (velocity.x / speed) * PLAYER_SPEED;
    velocity.z = (velocity.z / speed) * PLAYER_SPEED;
  }

  // Apply movement with collision — check X and Z independently for wall-sliding
  const prevPos = camera.position.clone();

  // Try X movement
  controls.moveRight(-velocity.x * delta);
  if (checkCollision()) {
    camera.position.copy(prevPos);
    // Re-apply only to reset, then try Z
  }
  const afterX = camera.position.clone();

  // Try Z movement from afterX position
  controls.moveForward(-velocity.z * delta);
  if (checkCollision()) {
    camera.position.copy(afterX);
  }

  // Keep height locked
  camera.position.y = PLAYER_HEIGHT;
}

function checkCollision() {
  const px = camera.position.x;
  const pz = camera.position.z;
  const r = PLAYER_RADIUS;

  for (const w of wallBounds) {
    // Transform player into wall's local coordinate space
    const dx = px - w.cx;
    const dz = pz - w.cz;
    const localX = dx * w.cosA - dz * w.sinA;
    const localZ = dx * w.sinA + dz * w.cosA;

    // Closest point on the wall rectangle in local space
    const nearX = Math.max(-w.hw, Math.min(w.hw, localX));
    const nearZ = Math.max(-w.hd, Math.min(w.hd, localZ));

    // Circle-vs-point distance check
    const distSq = (localX - nearX) ** 2 + (localZ - nearZ) ** 2;
    if (distSq < r * r) return true;
  }
  return false;
}

function onKeyDown(e) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward = true; break;
    case 'KeyS': case 'ArrowDown':  moveState.backward = true; break;
    case 'KeyA': case 'ArrowLeft':  moveState.left = true; break;
    case 'KeyD': case 'ArrowRight': moveState.right = true; break;
  }
}

function onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward = false; break;
    case 'KeyS': case 'ArrowDown':  moveState.backward = false; break;
    case 'KeyA': case 'ArrowLeft':  moveState.left = false; break;
    case 'KeyD': case 'ArrowRight': moveState.right = false; break;
  }
}
