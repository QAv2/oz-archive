#!/usr/bin/env node
// ─── Oz Archive: Scene Data Export ──────────────────────────────────
// Exports the museum geometry as structured JSON for Blender import.
// No browser APIs needed — pure math.
//
// Outputs:
//   tools/scene-data.json  (geometry, lights, sconces, cameras, collisions)
//
// Then run in Blender: File > Scripting > Open > tools/build-blender-scene.py
//
// Run: cd tools && npm run export

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config (mirrored from js/config.js) ───────────────���────────────
const ATRIUM_RADIUS = 6;
const CEILING_HEIGHT = 3.5;
const CORRIDOR_LENGTH = 8;
const CORRIDOR_WIDTH = 4;
const WALL_THICKNESS = 0.3;
const ALCOVE_DEPTH = 6;
const ALCOVE_WIDTH = 6;
const NUM_SPOKES = 6;
const PLAYER_HEIGHT = 1.7;

const EXHIBITS = [
  { id: 'disclosure', lightColor: '#34d399' },
  { id: 'qa',         lightColor: '#fbbf24' },
  { id: 'intel',      lightColor: '#4488ff' },
  { id: 'physics',    lightColor: '#aa44ff' },
  { id: 'youtube',    lightColor: '#ff4444' },
  { id: 'iceberg',    lightColor: '#40c8ff' },
];

// ─── Collectors ─────────────────────────────────────────────────────
const meshes = [];      // { name, room, type, geoType, geoArgs, position, rotation }
const lights = [];      // { type, color, intensity, distance, decay, position, room }
const sconces = [];     // { position, rotationY, room }
const collisions = [];  // { cx, cz, hw, hd, sinA, cosA }

function r4(n) { return Math.round(n * 10000) / 10000; }
function hexCSS(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

// ─── Geometry helpers ───────────────────────────────────────────────
function addWall(room, width, height, depth, x, y, z, rotY, name) {
  meshes.push({
    name, room, materialType: 'wall',
    geoType: 'box', geoArgs: [width, height, depth],
    position: [r4(x), r4(y), r4(z)],
    rotation: [0, r4(rotY), 0],
  });
  collisions.push({
    cx: r4(x), cz: r4(z),
    hw: r4(width / 2), hd: r4(depth / 2),
    sinA: r4(Math.sin(rotY)), cosA: r4(Math.cos(rotY)),
  });
}

function addFloor(room, width, depth, x, z, rotZ, name) {
  meshes.push({
    name, room, materialType: 'floor',
    geoType: 'plane', geoArgs: [width, depth],
    position: [r4(x), 0, r4(z)],
    rotation: [r4(-Math.PI / 2), 0, r4(rotZ)],
  });
}

function addCeiling(room, width, depth, x, z, rotZ, name) {
  meshes.push({
    name, room, materialType: 'ceiling',
    geoType: 'plane', geoArgs: [width, depth],
    position: [r4(x), CEILING_HEIGHT, r4(z)],
    rotation: [r4(Math.PI / 2), 0, r4(rotZ)],
  });
}

function addHexDisc(room, radius, y, rotX, rotZ, name, materialType) {
  meshes.push({
    name, room, materialType,
    geoType: 'circle', geoArgs: [radius, 6],
    position: [0, y, 0],
    rotation: [r4(rotX), 0, r4(rotZ)],
  });
}

// ─── Build Atrium ───────────────────────────────────────────────────
addHexDisc('atrium', ATRIUM_RADIUS + 1, 0, -Math.PI / 2, Math.PI / 6,
  'atrium_floor', 'floor');
addHexDisc('atrium', ATRIUM_RADIUS + 1, CEILING_HEIGHT, Math.PI / 2, Math.PI / 6,
  'atrium_ceiling', 'ceiling');

const wallHalfLen = ATRIUM_RADIUS * Math.tan(Math.PI / 6);
const doorHalfWidth = CORRIDOR_WIDTH / 2;
const segmentLen = wallHalfLen - doorHalfWidth;

for (let i = 0; i < NUM_SPOKES; i++) {
  const angle = (i * Math.PI * 2) / NUM_SPOKES;
  const wcx = Math.sin(angle) * ATRIUM_RADIUS;
  const wcz = Math.cos(angle) * ATRIUM_RADIUS;

  if (segmentLen > 0.1) {
    const offsetDist = doorHalfWidth + segmentLen / 2;
    const perpAngle = angle + Math.PI / 2;

    const lx = wcx + Math.sin(perpAngle) * offsetDist;
    const lz = wcz + Math.cos(perpAngle) * offsetDist;
    addWall('atrium', segmentLen, CEILING_HEIGHT, WALL_THICKNESS,
      lx, CEILING_HEIGHT / 2, lz, angle, `atrium_wall_${i}_L`);

    const rx = wcx - Math.sin(perpAngle) * offsetDist;
    const rz = wcz - Math.cos(perpAngle) * offsetDist;
    addWall('atrium', segmentLen, CEILING_HEIGHT, WALL_THICKNESS,
      rx, CEILING_HEIGHT / 2, rz, angle, `atrium_wall_${i}_R`);
  }
}

// Atrium lights
lights.push({ type: 'ambient', color: '#1a1814', intensity: 0.6, position: [0, 0, 0], room: 'atrium' });
lights.push({ type: 'hemisphere', color: '#ddccaa', groundColor: '#333322', intensity: 0.8, position: [0, 0, 0], room: 'atrium' });
lights.push({ type: 'point', color: '#ffe8cc', intensity: 4.0, distance: 40, decay: 1, position: [0, r4(CEILING_HEIGHT - 0.3), 0], room: 'atrium' });

// ─── Build Corridors + Alcoves ──────────────────────────────────────
for (let i = 0; i < NUM_SPOKES; i++) {
  const angle = (i * Math.PI * 2) / NUM_SPOKES;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const perpSin = Math.sin(angle + Math.PI / 2);
  const perpCos = Math.cos(angle + Math.PI / 2);

  const corrRoom = `corridor_${i}`;
  const alcRoom = `alcove_${i}`;
  const corridorStart = ATRIUM_RADIUS;
  const corridorEnd = ATRIUM_RADIUS + CORRIDOR_LENGTH;
  const corridorMid = (corridorStart + corridorEnd) / 2;
  const halfWidth = CORRIDOR_WIDTH / 2;

  // ── Corridor geometry ──
  addFloor(corrRoom, CORRIDOR_WIDTH, CORRIDOR_LENGTH,
    sin * corridorMid, cos * corridorMid, angle, `corridor_${i}_floor`);
  addCeiling(corrRoom, CORRIDOR_WIDTH, CORRIDOR_LENGTH,
    sin * corridorMid, cos * corridorMid, angle, `corridor_${i}_ceiling`);

  const lwx = sin * corridorMid + perpSin * (halfWidth + WALL_THICKNESS / 2);
  const lwz = cos * corridorMid + perpCos * (halfWidth + WALL_THICKNESS / 2);
  addWall(corrRoom, WALL_THICKNESS, CEILING_HEIGHT, CORRIDOR_LENGTH,
    lwx, CEILING_HEIGHT / 2, lwz, angle, `corridor_${i}_wall_L`);

  const rwx = sin * corridorMid - perpSin * (halfWidth + WALL_THICKNESS / 2);
  const rwz = cos * corridorMid - perpCos * (halfWidth + WALL_THICKNESS / 2);
  addWall(corrRoom, WALL_THICKNESS, CEILING_HEIGHT, CORRIDOR_LENGTH,
    rwx, CEILING_HEIGHT / 2, rwz, angle, `corridor_${i}_wall_R`);

  // ── Corridor torches (4 per corridor) ──
  for (const pct of [0.3, 0.7]) {
    const dist = ATRIUM_RADIUS + CORRIDOR_LENGTH * pct;
    const bx = sin * dist;
    const bz = cos * dist;
    const wallOffset = halfWidth - 0.15;
    const sconceY = CEILING_HEIGHT - 0.6;

    for (const side of [1, -1]) {
      const tx = bx + perpSin * wallOffset * side;
      const tz = bz + perpCos * wallOffset * side;

      lights.push({
        type: 'point', color: '#ff8844', intensity: 5.0,
        distance: 20, decay: 1.5,
        position: [r4(tx), r4(sconceY), r4(tz)],
        room: corrRoom,
      });
      sconces.push({
        position: [r4(tx), r4(sconceY), r4(tz)],
        rotationY: r4(angle + (side > 0 ? Math.PI : 0)),
        room: corrRoom,
      });
    }
  }

  // ── Alcove geometry ──
  const alcoveCenter = corridorEnd + ALCOVE_DEPTH / 2;
  const alcHalfWidth = ALCOVE_WIDTH / 2;

  addFloor(alcRoom, ALCOVE_WIDTH, ALCOVE_DEPTH,
    sin * alcoveCenter, cos * alcoveCenter, angle, `alcove_${i}_floor`);
  addCeiling(alcRoom, ALCOVE_WIDTH, ALCOVE_DEPTH,
    sin * alcoveCenter, cos * alcoveCenter, angle, `alcove_${i}_ceiling`);

  const backDist = corridorEnd + ALCOVE_DEPTH;
  addWall(alcRoom, ALCOVE_WIDTH, CEILING_HEIGHT, WALL_THICKNESS,
    sin * backDist, CEILING_HEIGHT / 2, cos * backDist, angle, `alcove_${i}_wall_back`);

  const sideOffset = alcHalfWidth + WALL_THICKNESS / 2;
  addWall(alcRoom, WALL_THICKNESS, CEILING_HEIGHT, ALCOVE_DEPTH,
    sin * alcoveCenter + perpSin * sideOffset,
    CEILING_HEIGHT / 2,
    cos * alcoveCenter + perpCos * sideOffset,
    angle, `alcove_${i}_wall_L`);

  addWall(alcRoom, WALL_THICKNESS, CEILING_HEIGHT, ALCOVE_DEPTH,
    sin * alcoveCenter - perpSin * sideOffset,
    CEILING_HEIGHT / 2,
    cos * alcoveCenter - perpCos * sideOffset,
    angle, `alcove_${i}_wall_R`);

  // Wing walls
  const corridorHalf = CORRIDOR_WIDTH / 2;
  if (ALCOVE_WIDTH > CORRIDOR_WIDTH) {
    const wingLen = (ALCOVE_WIDTH - CORRIDOR_WIDTH) / 2;
    const wingOffset = corridorHalf + wingLen / 2;

    addWall(alcRoom, wingLen + WALL_THICKNESS, CEILING_HEIGHT, WALL_THICKNESS,
      sin * corridorEnd + perpSin * wingOffset,
      CEILING_HEIGHT / 2,
      cos * corridorEnd + perpCos * wingOffset,
      angle, `alcove_${i}_wing_L`);

    addWall(alcRoom, wingLen + WALL_THICKNESS, CEILING_HEIGHT, WALL_THICKNESS,
      sin * corridorEnd - perpSin * wingOffset,
      CEILING_HEIGHT / 2,
      cos * corridorEnd - perpCos * wingOffset,
      angle, `alcove_${i}_wing_R`);
  }

  // ── Alcove torches (2 per alcove) ──
  const alcoveDist = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.7;
  const alcoveAx = sin * alcoveDist;
  const alcoveAz = cos * alcoveDist;
  const alcoveWallOffset = (ALCOVE_WIDTH / 2) - 0.15;
  const alcoveY = CEILING_HEIGHT - 0.6;

  for (const side of [1, -1]) {
    const ax = alcoveAx + perpSin * alcoveWallOffset * side;
    const az = alcoveAz + perpCos * alcoveWallOffset * side;

    lights.push({
      type: 'point', color: '#ff8844', intensity: 4.0,
      distance: 15, decay: 1.5,
      position: [r4(ax), r4(alcoveY), r4(az)],
      room: alcRoom,
    });
    sconces.push({
      position: [r4(ax), r4(alcoveY), r4(az)],
      rotationY: r4(angle + (side > 0 ? Math.PI : 0)),
      room: alcRoom,
    });
  }

  // ── Exhibit accent light ──
  const exhibitDist = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.5;
  lights.push({
    type: 'point', color: EXHIBITS[i].lightColor, intensity: 3.5,
    distance: 25, decay: 1.5,
    position: [r4(sin * exhibitDist), r4(CEILING_HEIGHT - 0.5), r4(cos * exhibitDist)],
    room: alcRoom,
  });
}

// ─── Tour camera stops ──────────────────────────────────────────────
const ALCOVE_ENTRY_DIST = ATRIUM_RADIUS + CORRIDOR_LENGTH + 2;
const EXHIBIT_DIST = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.5;

const cameras = [{
  name: 'atrium', position: [0, PLAYER_HEIGHT, 0], lookAt: [0, PLAYER_HEIGHT, 1],
}];

for (let i = 0; i < NUM_SPOKES; i++) {
  const angle = (i * Math.PI * 2) / NUM_SPOKES;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  cameras.push({
    name: `alcove_${i}_${EXHIBITS[i].id}`,
    position: [r4(sin * ALCOVE_ENTRY_DIST), PLAYER_HEIGHT, r4(cos * ALCOVE_ENTRY_DIST)],
    lookAt: [r4(sin * EXHIBIT_DIST), PLAYER_HEIGHT, r4(cos * EXHIBIT_DIST)],
  });
}

// ─── Write output ───────────────────────────────────────────────────
const data = {
  config: { ATRIUM_RADIUS, CEILING_HEIGHT, CORRIDOR_LENGTH, CORRIDOR_WIDTH, WALL_THICKNESS, ALCOVE_DEPTH, ALCOVE_WIDTH, NUM_SPOKES },
  meshes,
  lights,
  sconces,
  cameras,
  collisions,
};

const outPath = path.join(__dirname, 'scene-data.json');
fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

console.log('Oz Archive Scene Export');
console.log('─'.repeat(40));
console.log(`  Meshes:     ${meshes.length}`);
console.log(`  Lights:     ${lights.length}`);
console.log(`  Sconces:    ${sconces.length}`);
console.log(`  Cameras:    ${cameras.length}`);
console.log(`  Collisions: ${collisions.length}`);
console.log(`\nWrote: ${outPath}`);
console.log(`Size:  ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
console.log('\nNext: Open Blender and run build-blender-scene.py');
