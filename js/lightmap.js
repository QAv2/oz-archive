// ─── Lightmap Mode: Myst-Style Pre-Rendered Backgrounds ────────────
// Mobile tour uses fixed viewpoints (7 stops). Instead of real-time
// PBR + 44 lights, we show Cycles-rendered equirectangular panoramas
// as scene.background and hide all architecture. Only interactive
// exhibits render as 3D objects.
//
// On mobile: auto-enabled. On desktop: L key toggles for preview.

import * as THREE from 'three';

let active = false;
let sceneRef = null;
const archMeshes = [];    // architecture meshes to hide
const sconceGroups = [];  // sconce groups to hide
const lightStates = [];   // { light, originalIntensity }
const panoramas = [];     // equirectangular textures, indexed by stop
let originalBackground = null;
let originalFog = null;

// Blender equirect center = camera forward (+Z in Three.js)
// Three.js equirect center = +X axis
// Offset: rotate background by +π/2 around Y to align
let panoRotationY = Math.PI / 2;

const loader = new THREE.TextureLoader();
const PANO_COUNT = 7;

function preloadPanoramas() {
  for (let i = 0; i < PANO_COUNT; i++) {
    const tex = loader.load(`textures/pano/stop_${i}.jpg`);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    panoramas.push(tex);
  }
}

// ─── Init ───────────────────────────────────────────────────────────
export function initLightmap(scene) {
  sceneRef = scene;

  scene.traverse(obj => {
    if (obj.isMesh && obj.userData.archType) {
      archMeshes.push(obj);
    }
    if (obj.userData.isSconce) {
      sconceGroups.push(obj);
    }
    if (obj.isLight) {
      lightStates.push({ light: obj, originalIntensity: obj.intensity });
    }
  });

  preloadPanoramas();
}

// ─── Enable (mobile auto / desktop L key) ──────────────────────────
export function enableLightmapMode() {
  if (active) return;
  active = true;
  originalBackground = sceneRef.background;
  originalFog = sceneRef.fog;

  // Hide all architecture + sconces (panorama replaces them)
  for (const mesh of archMeshes) mesh.visible = false;
  for (const group of sconceGroups) group.visible = false;

  // Disable fog (panorama has baked atmosphere)
  sceneRef.fog = null;

  // Kill all PointLights, keep ambient/hemi for exhibit illumination
  for (const { light } of lightStates) {
    if (light.isAmbientLight) {
      light.intensity = 1.4;
    } else if (light.isHemisphereLight) {
      light.intensity = 1.2;
    } else {
      light.visible = false;
    }
  }

  // Apply background rotation to align Blender→Three.js equirect
  sceneRef.backgroundRotation = new THREE.Euler(0, panoRotationY, 0);

  // Set initial panorama (stop 0 = atrium)
  setPanoramaStop(0);
}

// ─── Disable (restore full PBR) ────────────────────────────────────
export function disableLightmapMode() {
  if (!active) return;
  active = false;

  for (const mesh of archMeshes) mesh.visible = true;
  for (const group of sconceGroups) group.visible = true;

  sceneRef.fog = originalFog;
  sceneRef.background = originalBackground;
  sceneRef.backgroundRotation = new THREE.Euler(0, 0, 0);

  for (const { light, originalIntensity } of lightStates) {
    light.intensity = originalIntensity;
    light.visible = true;
  }
}

// ─── Swap panorama on tour stop change ─────────────────────────────
export function setPanoramaStop(index) {
  if (!active || !sceneRef) return;
  if (index >= 0 && index < panoramas.length) {
    sceneRef.background = panoramas[index];
  }
}

// ─── Debug: adjust rotation (desktop [ ] keys) ────────────────────
export function adjustPanoRotation(delta) {
  panoRotationY += delta;
  if (sceneRef && active) {
    sceneRef.backgroundRotation = new THREE.Euler(0, panoRotationY, 0);
  }
  console.log(`Pano rotation: ${(panoRotationY * 180 / Math.PI).toFixed(1)}°`);
}

// ─── Toggle (desktop L key) ────────────────────────────────────────
export function toggleLightmapMode() {
  if (active) disableLightmapMode();
  else enableLightmapMode();
  return active;
}

export function isLightmapActive() { return active; }
