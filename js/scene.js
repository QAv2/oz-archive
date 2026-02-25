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

function addWall(scene, width, height, depth, x, y, z, rotY = 0, color = COLORS.walls) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: COLORS.wallEmissive,
    emissiveIntensity: 1.0,
    roughness: 0.6,
    metalness: 0.1,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
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
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: 0x151228,
    emissiveIntensity: 0.6,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  meshes.push(mesh);
  return mesh;
}

function addCeiling(scene, width, depth, x, z, color = COLORS.ceiling) {
  const geo = new THREE.PlaneGeometry(width, depth);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: 0x181530,
    emissiveIntensity: 0.5,
    roughness: 0.8,
    metalness: 0.0,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, CEILING_HEIGHT, z);
  scene.add(mesh);
  meshes.push(mesh);
  return mesh;
}

export function buildScene(scene) {
  // ─── Fog (light — just enough depth cue, not darkness) ───────────
  scene.fog = new THREE.FogExp2(COLORS.fog, 0.006);
  scene.background = new THREE.Color(COLORS.void);

  // ─── Lighting — warm, bright museum interior ─────────────────────
  // Ambient fill — ensures nothing goes pure black
  const ambient = new THREE.AmbientLight(0x887766, 1.5);
  scene.add(ambient);

  // Hemisphere: warm white sky, warm ground bounce
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x554433, 3.0);
  scene.add(hemi);

  // Central overhead — bright warm white, long range
  const centerLight = new THREE.PointLight(0xffe8cc, 10.0, 60, 1);
  centerLight.position.set(0, CEILING_HEIGHT - 0.3, 0);
  scene.add(centerLight);

  // ─── Central Atrium Floor & Ceiling ───────────────────────────────
  const floorGeo = new THREE.CircleGeometry(ATRIUM_RADIUS + 1, 6);
  const floorMat = new THREE.MeshStandardMaterial({
    color: COLORS.floor,
    emissive: 0x151228,
    emissiveIntensity: 0.6,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.rotation.z = Math.PI / 6;
  floorMesh.position.y = 0;
  scene.add(floorMesh);
  meshes.push(floorMesh);

  const ceilGeo = new THREE.CircleGeometry(ATRIUM_RADIUS + 1, 6);
  const ceilMat = new THREE.MeshStandardMaterial({
    color: COLORS.ceiling,
    emissive: 0x181530,
    emissiveIntensity: 0.5,
    roughness: 0.8,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.rotation.z = Math.PI / 6;
  ceilMesh.position.y = CEILING_HEIGHT;
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

  // ─── Corridor Lights (two per corridor — mid and alcove entrance) ─
  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;

    // Mid-corridor light
    const midDist = ATRIUM_RADIUS + CORRIDOR_LENGTH * 0.5;
    const mx = Math.sin(angle) * midDist;
    const mz = Math.cos(angle) * midDist;
    const corridorLight = new THREE.PointLight(0xeeddbb, 6.0, 30, 1);
    corridorLight.position.set(mx, CEILING_HEIGHT - 0.3, mz);
    scene.add(corridorLight);

    // Alcove entrance light
    const entDist = ATRIUM_RADIUS + CORRIDOR_LENGTH;
    const ex = Math.sin(angle) * entDist;
    const ez = Math.cos(angle) * entDist;
    const entLight = new THREE.PointLight(0xeeddbb, 4.0, 25, 1);
    entLight.position.set(ex, CEILING_HEIGHT - 0.3, ez);
    scene.add(entLight);
  }

  // ─── Per-Exhibit Colored Accent Lights ─────────────────────────────
  for (let i = 0; i < EXHIBITS.length; i++) {
    const angle = (i * Math.PI * 2) / NUM_SPOKES;
    const dist = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.5;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;

    const light = new THREE.PointLight(EXHIBITS[i].lightColor, 5.0, 30, 1);
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
