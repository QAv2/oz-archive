// ─── Procedural Architecture: Hex Atrium + 6 Corridors ─────────────
import * as THREE from 'three';
import {
  ATRIUM_RADIUS, CEILING_HEIGHT, CORRIDOR_LENGTH, CORRIDOR_WIDTH,
  WALL_THICKNESS, ALCOVE_DEPTH, ALCOVE_WIDTH, NUM_SPOKES, COLORS,
  EXHIBITS,
} from './config.js';

// Collision bounds exported for player.js — OBB format (not AABB)
// Each entry: { cx, cz, hw, hd, sinA, cosA }
export const wallBounds = [];

// All scene meshes for cleanup
const meshes = [];

// Torch lights exported for flicker animation in main.js
export const torchLights = [];

// ─── Texture Loader ────────────────────────────────────────────────
const textureLoader = new THREE.TextureLoader();

function loadTiled(path, repeatX, repeatY, srgb = true) {
  const tex = textureLoader.load(path);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Shared materials (one instance per surface type, fixed repeat)
let wallMat = null;
let floorMat = null;
let ceilingMat = null;

function getWallMaterial() {
  if (!wallMat) {
    wallMat = new THREE.MeshStandardMaterial({
      color: COLORS.walls,
      map: loadTiled('textures/wall-color.jpg', 2, 1),
      normalMap: loadTiled('textures/wall-normal.jpg', 2, 1, false),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.85,
      metalness: 0.0,
      emissive: COLORS.wallEmissive,
      emissiveIntensity: 0.05,
    });
  }
  return wallMat;
}

function getFloorMaterial() {
  if (!floorMat) {
    floorMat = new THREE.MeshStandardMaterial({
      color: COLORS.floor,
      map: loadTiled('textures/floor-color.jpg', 3, 3),
      normalMap: loadTiled('textures/floor-normal.jpg', 3, 3, false),
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.9,
      metalness: 0.0,
      emissive: 0x050505,
      emissiveIntensity: 0.02,
      side: THREE.DoubleSide,
    });
  }
  return floorMat;
}

function getCeilingMaterial() {
  if (!ceilingMat) {
    ceilingMat = new THREE.MeshStandardMaterial({
      color: COLORS.ceiling,
      map: loadTiled('textures/ceiling-color.jpg', 2, 2),
      normalMap: loadTiled('textures/ceiling-normal.jpg', 2, 2, false),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.8,
      metalness: 0.0,
      emissive: 0x030303,
      emissiveIntensity: 0.02,
      side: THREE.DoubleSide,
    });
  }
  return ceilingMat;
}

function addWall(scene, width, height, depth, x, y, z, rotY = 0, color = COLORS.walls) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geo, getWallMaterial());
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.userData.archType = 'wall';
  scene.add(mesh);
  meshes.push(mesh);

  // Store OBB data for collision (XZ plane only)
  wallBounds.push({
    cx: x, cz: z,
    hw: width / 2, hd: depth / 2,
    sinA: Math.sin(rotY), cosA: Math.cos(rotY),
  });

  return mesh;
}

function addFloor(scene, width, depth, x, z, color = COLORS.floor) {
  const geo = new THREE.PlaneGeometry(width, depth);
  const mesh = new THREE.Mesh(geo, getFloorMaterial());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0, z);
  mesh.userData.archType = 'floor';
  scene.add(mesh);
  meshes.push(mesh);
  return mesh;
}

function addCeiling(scene, width, depth, x, z, color = COLORS.ceiling) {
  const geo = new THREE.PlaneGeometry(width, depth);
  const mesh = new THREE.Mesh(geo, getCeilingMaterial());
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, CEILING_HEIGHT, z);
  mesh.userData.archType = 'ceiling';
  scene.add(mesh);
  meshes.push(mesh);
  return mesh;
}

export function buildScene(scene) {
  // ─── Fog (light — just enough depth cue, not darkness) ───────────
  scene.fog = new THREE.FogExp2(COLORS.fog, 0.020);
  scene.background = new THREE.Color(COLORS.void);

  // ─── Lighting — atmospheric vault ─────────────────────────────────
  const ambient = new THREE.AmbientLight(0x1a1814, 0.6);

  // Hemisphere fill — warm sky, cool ground
  const hemi = new THREE.HemisphereLight(0xddccaa, 0x333322, 0.8);

  // Soft central overhead — not blinding, just enough to read the atrium
  const centerLight = new THREE.PointLight(0xffe8cc, 4.0, 40, 1);
  centerLight.position.set(0, CEILING_HEIGHT - 0.3, 0);

  scene.add(ambient);
  scene.add(hemi);
  scene.add(centerLight);
  scene.add(ambient);

  // ─── Central Atrium Floor & Ceiling ───────────────────────────────
  const floorGeo = new THREE.CircleGeometry(ATRIUM_RADIUS + 1, 6);
  const floorMesh = new THREE.Mesh(floorGeo, getFloorMaterial());
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.rotation.z = Math.PI / 6;
  floorMesh.position.y = 0;
  floorMesh.userData.archType = 'floor';
  scene.add(floorMesh);
  meshes.push(floorMesh);

  const ceilGeo = new THREE.CircleGeometry(ATRIUM_RADIUS + 1, 6);
  const ceilMesh = new THREE.Mesh(ceilGeo, getCeilingMaterial());
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.rotation.z = Math.PI / 6;
  ceilMesh.position.y = CEILING_HEIGHT;
  ceilMesh.userData.archType = 'ceiling';
  scene.add(ceilMesh);
  meshes.push(ceilMesh);

  // ─── Hex Walls with Doorway Gaps ──────────────────────────────────
  const wallHalfLen = ATRIUM_RADIUS * Math.tan(Math.PI / 6);
  const doorHalfWidth = CORRIDOR_WIDTH / 2;
  const segmentLen = wallHalfLen - doorHalfWidth;

  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;
    const wallCenterX = Math.sin(angle) * ATRIUM_RADIUS;
    const wallCenterZ = Math.cos(angle) * ATRIUM_RADIUS;

    if (segmentLen > 0.1) {
      const offsetDist = doorHalfWidth + segmentLen / 2;
      const perpAngle = angle + Math.PI / 2;
      const lx = wallCenterX + Math.sin(perpAngle) * offsetDist;
      const lz = wallCenterZ + Math.cos(perpAngle) * offsetDist;
      addWall(scene, segmentLen, CEILING_HEIGHT, WALL_THICKNESS,
        lx, CEILING_HEIGHT / 2, lz, angle);

      const rx = wallCenterX - Math.sin(perpAngle) * offsetDist;
      const rz = wallCenterZ - Math.cos(perpAngle) * offsetDist;
      addWall(scene, segmentLen, CEILING_HEIGHT, WALL_THICKNESS,
        rx, CEILING_HEIGHT / 2, rz, angle);
    }

    buildCorridor(scene, i, angle);
  }

  // ─── Corridor Torches (two per corridor, wall-mounted) ────────────
  const bracketMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a, roughness: 0.9, metalness: 0.3,
  });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff6600, emissive: 0xff8844, emissiveIntensity: 2.0, roughness: 1.0,
  });
  const bracketGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.15, 6);
  const cupGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.08, 8);
  const flameGeo = new THREE.SphereGeometry(0.04, 8, 6);

  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;
    const perpSin = Math.sin(angle + Math.PI / 2);
    const perpCos = Math.cos(angle + Math.PI / 2);

    for (const pct of [0.3, 0.7]) {
      const dist = ATRIUM_RADIUS + CORRIDOR_LENGTH * pct;
      const bx = Math.sin(angle) * dist;
      const bz = Math.cos(angle) * dist;
      const wallOffset = (CORRIDOR_WIDTH / 2) - 0.15;
      const sconceY = CEILING_HEIGHT - 0.6;

      // Both walls: +perpSin (right) and -perpSin (left)
      for (const side of [1, -1]) {
        const tx = bx + perpSin * wallOffset * side;
        const tz = bz + perpCos * wallOffset * side;

        // Light
        const torch = new THREE.PointLight(0xff8844, 5.0, 20, 1.5);
        torch.position.set(tx, sconceY, tz);
        scene.add(torch);
        torchLights.push({
          light: torch,
          baseIntensity: 5.0,
          baseX: tx,
          baseZ: tz,
          phase: Math.random() * Math.PI * 2,
        });

        // Sconce geometry
        const sconce = new THREE.Group();
        sconce.userData.isSconce = true;
        sconce.position.set(tx, sconceY, tz);
        sconce.rotation.y = angle + (side > 0 ? Math.PI : 0);

        const bracket = new THREE.Mesh(bracketGeo, bracketMat);
        bracket.rotation.z = Math.PI / 2;
        bracket.position.set(0, 0, -0.08);
        sconce.add(bracket);

        const cup = new THREE.Mesh(cupGeo, bracketMat);
        sconce.add(cup);

        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(0, 0.06, 0);
        sconce.add(flame);

        scene.add(sconce);
      }
    }

    // ─── Alcove back wall sconces (one per side) ────────────────────
    const alcoveDist = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.7;
    const alcoveAx = Math.sin(angle) * alcoveDist;
    const alcoveAz = Math.cos(angle) * alcoveDist;
    const alcoveWallOffset = (ALCOVE_WIDTH / 2) - 0.15;
    const alcoveY = CEILING_HEIGHT - 0.6;

    for (const side of [1, -1]) {
      const ax = alcoveAx + perpSin * alcoveWallOffset * side;
      const az = alcoveAz + perpCos * alcoveWallOffset * side;

      const alcoveTorch = new THREE.PointLight(0xff8844, 4.0, 15, 1.5);
      alcoveTorch.position.set(ax, alcoveY, az);
      scene.add(alcoveTorch);
      torchLights.push({
        light: alcoveTorch,
        baseIntensity: 4.0,
        baseX: ax,
        baseZ: az,
        phase: Math.random() * Math.PI * 2,
      });

      const alcoveSconce = new THREE.Group();
      alcoveSconce.userData.isSconce = true;
      alcoveSconce.position.set(ax, alcoveY, az);
      alcoveSconce.rotation.y = angle + (side > 0 ? Math.PI : 0);

      const ab = new THREE.Mesh(bracketGeo, bracketMat);
      ab.rotation.z = Math.PI / 2;
      ab.position.set(0, 0, -0.08);
      alcoveSconce.add(ab);

      const ac = new THREE.Mesh(cupGeo, bracketMat);
      alcoveSconce.add(ac);

      const af = new THREE.Mesh(flameGeo, flameMat);
      af.position.set(0, 0.06, 0);
      alcoveSconce.add(af);

      scene.add(alcoveSconce);
    }
  }

  // ─── Per-Exhibit Colored Accent Lights ─────────────────────────────
  for (let i = 0; i < EXHIBITS.length; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;
    const dist = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.5;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;

    const light = new THREE.PointLight(EXHIBITS[i].lightColor, 3.5, 25, 1.5);
    light.position.set(x, CEILING_HEIGHT - 0.5, z);
    scene.add(light);
  }
}

function buildCorridor(scene, index, angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const perpSin = Math.sin(angle + Math.PI / 2);
  const perpCos = Math.cos(angle + Math.PI / 2);

  const corridorStart = ATRIUM_RADIUS;
  const corridorEnd = ATRIUM_RADIUS + CORRIDOR_LENGTH;
  const corridorMid = (corridorStart + corridorEnd) / 2;
  const halfWidth = CORRIDOR_WIDTH / 2;

  // Floor
  addFloor(scene, CORRIDOR_WIDTH, CORRIDOR_LENGTH,
    sin * corridorMid, cos * corridorMid);
  const lastFloor = meshes[meshes.length - 1];
  lastFloor.rotation.z = angle;

  // Ceiling
  addCeiling(scene, CORRIDOR_WIDTH, CORRIDOR_LENGTH,
    sin * corridorMid, cos * corridorMid);
  const lastCeil = meshes[meshes.length - 1];
  lastCeil.rotation.z = angle;

  // Left wall
  const lwx = sin * corridorMid + perpSin * (halfWidth + WALL_THICKNESS / 2);
  const lwz = cos * corridorMid + perpCos * (halfWidth + WALL_THICKNESS / 2);
  addWall(scene, WALL_THICKNESS, CEILING_HEIGHT, CORRIDOR_LENGTH,
    lwx, CEILING_HEIGHT / 2, lwz, angle);

  // Right wall
  const rwx = sin * corridorMid - perpSin * (halfWidth + WALL_THICKNESS / 2);
  const rwz = cos * corridorMid - perpCos * (halfWidth + WALL_THICKNESS / 2);
  addWall(scene, WALL_THICKNESS, CEILING_HEIGHT, CORRIDOR_LENGTH,
    rwx, CEILING_HEIGHT / 2, rwz, angle);

  // Alcove at the end
  buildAlcove(scene, index, angle, corridorEnd);
}

function buildAlcove(scene, index, angle, corridorEnd) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const perpSin = Math.sin(angle + Math.PI / 2);
  const perpCos = Math.cos(angle + Math.PI / 2);

  const alcoveCenter = corridorEnd + ALCOVE_DEPTH / 2;
  const halfWidth = ALCOVE_WIDTH / 2;

  // Floor
  addFloor(scene, ALCOVE_WIDTH, ALCOVE_DEPTH,
    sin * alcoveCenter, cos * alcoveCenter);
  const lastFloor = meshes[meshes.length - 1];
  lastFloor.rotation.z = angle;

  // Ceiling
  addCeiling(scene, ALCOVE_WIDTH, ALCOVE_DEPTH,
    sin * alcoveCenter, cos * alcoveCenter);
  const lastCeil = meshes[meshes.length - 1];
  lastCeil.rotation.z = angle;

  // Back wall
  const backDist = corridorEnd + ALCOVE_DEPTH;
  addWall(scene, ALCOVE_WIDTH, CEILING_HEIGHT, WALL_THICKNESS,
    sin * backDist, CEILING_HEIGHT / 2, cos * backDist, angle);

  // Left side wall
  const sideLen = ALCOVE_DEPTH;
  const sideOffset = halfWidth + WALL_THICKNESS / 2;
  addWall(scene, WALL_THICKNESS, CEILING_HEIGHT, sideLen,
    sin * alcoveCenter + perpSin * sideOffset,
    CEILING_HEIGHT / 2,
    cos * alcoveCenter + perpCos * sideOffset,
    angle);
  // Right side wall
  addWall(scene, WALL_THICKNESS, CEILING_HEIGHT, sideLen,
    sin * alcoveCenter - perpSin * sideOffset,
    CEILING_HEIGHT / 2,
    cos * alcoveCenter - perpCos * sideOffset,
    angle);

  // Wing walls connecting corridor to wider alcove
  const corridorHalf = CORRIDOR_WIDTH / 2;
  if (ALCOVE_WIDTH > CORRIDOR_WIDTH) {
    const wingLen = (ALCOVE_WIDTH - CORRIDOR_WIDTH) / 2;
    const wingOffset = corridorHalf + wingLen / 2;

    // Left wing
    addWall(scene, wingLen + WALL_THICKNESS, CEILING_HEIGHT, WALL_THICKNESS,
      sin * corridorEnd + perpSin * wingOffset,
      CEILING_HEIGHT / 2,
      cos * corridorEnd + perpCos * wingOffset,
      angle);
    // Right wing
    addWall(scene, wingLen + WALL_THICKNESS, CEILING_HEIGHT, WALL_THICKNESS,
      sin * corridorEnd - perpSin * wingOffset,
      CEILING_HEIGHT / 2,
      cos * corridorEnd - perpCos * wingOffset,
      angle);
  }
}

// Returns positions for exhibit placement
export function getExhibitPositions() {
  const positions = [];
  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;
    const dist = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.5;
    positions.push({
      x: Math.sin(angle) * dist,
      z: Math.cos(angle) * dist,
      angle,
    });
  }
  return positions;
}
