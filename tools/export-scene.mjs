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
addHexDisc('atrium', ATRIUM_RADIUS + 2, 0, -Math.PI / 2, Math.PI / 6,
  'atrium_floor', 'floor');
addHexDisc('atrium', ATRIUM_RADIUS + 2, CEILING_HEIGHT, Math.PI / 2, Math.PI / 6,
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

// ─── Exhibit Positions (same math as scene.js getExhibitPositions) ──
const EXHIBIT_META = [
  { id: 'disclosure', type: 'screen',   lightColor: '#34d399', texture: 'textures/exhibit-disclosure.png' },
  { id: 'qa',         type: 'qa',       lightColor: '#fbbf24', texture: null },
  { id: 'intel',      type: 'crt',      lightColor: '#4488ff', texture: 'textures/exhibit-intel.png' },
  { id: 'physics',    type: 'lab',      lightColor: '#aa44ff', texture: null },
  { id: 'youtube',    type: 'carousel', lightColor: '#ff4444', texture: null },
  { id: 'iceberg',    type: 'iceberg',  lightColor: '#40c8ff', texture: null },
];

const exhibits = [];
for (let i = 0; i < NUM_SPOKES; i++) {
  const angle = (i * Math.PI * 2) / NUM_SPOKES;
  const dist = ATRIUM_RADIUS + CORRIDOR_LENGTH + ALCOVE_DEPTH * 0.5;
  const ex = EXHIBIT_META[i];
  const groupX = Math.sin(angle) * dist;
  const groupZ = Math.cos(angle) * dist;
  const groupRotY = angle + Math.PI;  // face toward center
  const z0 = -ALCOVE_DEPTH * 0.3;

  const parts = [];  // { name, geoType, geoArgs, position:[x,y,z], rotation:[x,y,z], material }

  if (ex.type === 'screen') {
    parts.push({ name: 'frame', geoType: 'box', geoArgs: [2.4, 1.6, 0.1], position: [0, 1.8, z0], rotation: [0,0,0], material: 'iron' });
    parts.push({ name: 'screen', geoType: 'plane', geoArgs: [2.2, 1.4], position: [0, 1.8, z0 + 0.09], rotation: [0,0,0], material: 'screen', texture: ex.texture, emissiveColor: ex.lightColor });
    parts.push({ name: 'label', geoType: 'box', geoArgs: [1.4, 0.18, 0.02], position: [0, 0.8, z0], rotation: [0,0,0], material: 'label' });
  } else if (ex.type === 'crt') {
    parts.push({ name: 'desk', geoType: 'box', geoArgs: [2.2, 0.06, 0.9], position: [0, 0.74, z0], rotation: [0,0,0], material: 'stone' });
    for (const [dx, dz] of [[-1.0, -0.38], [1.0, -0.38], [-1.0, 0.38], [1.0, 0.38]]) {
      parts.push({ name: 'desk_leg', geoType: 'box', geoArgs: [0.06, 0.74, 0.06], position: [dx, 0.37, z0 + dz], rotation: [0,0,0], material: 'stone' });
    }
    parts.push({ name: 'back_panel', geoType: 'box', geoArgs: [2.2, 0.50, 0.04], position: [0, 0.50, z0 - 0.43], rotation: [0,0,0], material: 'stone' });
    parts.push({ name: 'mon_stand', geoType: 'box', geoArgs: [0.5, 0.04, 0.35], position: [0, 0.79, z0 - 0.05], rotation: [0,0,0], material: 'beige_dark' });
    parts.push({ name: 'mon_body', geoType: 'box', geoArgs: [0.95, 0.72, 0.65], position: [0, 1.17, z0 - 0.08], rotation: [0,0,0], material: 'beige' });
    parts.push({ name: 'bezel', geoType: 'box', geoArgs: [0.82, 0.60, 0.03], position: [0, 1.19, z0 + 0.24], rotation: [0,0,0], material: 'dark' });
    parts.push({ name: 'screen', geoType: 'plane', geoArgs: [0.74, 0.52], position: [0, 1.19, z0 + 0.28], rotation: [0,0,0], material: 'screen', texture: ex.texture, emissiveColor: ex.lightColor });
    parts.push({ name: 'mon_led', geoType: 'cylinder', geoArgs: [0.012, 0.012, 0.01, 6], position: [0.32, 0.92, z0 + 0.24], rotation: [Math.PI/2,0,0], material: 'led_green' });
    parts.push({ name: 'tower', geoType: 'box', geoArgs: [0.20, 0.45, 0.42], position: [0.85, 1.0, z0 - 0.05], rotation: [0,0,0], material: 'beige' });
    parts.push({ name: 'tower_front', geoType: 'box', geoArgs: [0.18, 0.43, 0.01], position: [0.85, 1.0, z0 + 0.16], rotation: [0,0,0], material: 'beige_dark' });
    parts.push({ name: 'floppy', geoType: 'box', geoArgs: [0.10, 0.012, 0.01], position: [0.85, 1.14, z0 + 0.17], rotation: [0,0,0], material: 'grey_metal' });
    parts.push({ name: 'cdrom', geoType: 'box', geoArgs: [0.12, 0.025, 0.01], position: [0.85, 1.08, z0 + 0.17], rotation: [0,0,0], material: 'beige_dark' });
    parts.push({ name: 'eject_btn', geoType: 'box', geoArgs: [0.015, 0.012, 0.008], position: [0.90, 1.06, z0 + 0.175], rotation: [0,0,0], material: 'grey_metal' });
    parts.push({ name: 'power_btn', geoType: 'cylinder', geoArgs: [0.015, 0.015, 0.008, 8], position: [0.85, 1.18, z0 + 0.175], rotation: [Math.PI/2,0,0], material: 'grey_metal' });
    parts.push({ name: 'tower_led', geoType: 'cylinder', geoArgs: [0.008, 0.008, 0.008, 6], position: [0.85, 1.16, z0 + 0.175], rotation: [Math.PI/2,0,0], material: 'led_green' });
    parts.push({ name: 'keyboard', geoType: 'box', geoArgs: [0.48, 0.02, 0.16], position: [-0.05, 0.78, z0 + 0.28], rotation: [0,0,0], material: 'beige_dark' });
    for (let row = 0; row < 4; row++) {
      parts.push({ name: `keys_${row}`, geoType: 'box', geoArgs: [0.42, 0.003, 0.025], position: [-0.05, 0.80, z0 + 0.22 + row * 0.035], rotation: [0,0,0], material: 'dark_keys' });
    }
    parts.push({ name: 'mousepad', geoType: 'box', geoArgs: [0.18, 0.005, 0.20], position: [0.42, 0.775, z0 + 0.28], rotation: [0,0,0], material: 'dark' });
    parts.push({ name: 'mouse', geoType: 'box', geoArgs: [0.05, 0.02, 0.08], position: [0.42, 0.79, z0 + 0.28], rotation: [0,0,0], material: 'beige' });
    parts.push({ name: 'label', geoType: 'box', geoArgs: [1.4, 0.18, 0.02], position: [0, 0.55, z0 + 0.55], rotation: [0,0,0], material: 'label' });
  } else if (ex.type === 'lab') {
    parts.push({ name: 'bench', geoType: 'box', geoArgs: [2.0, 0.08, 0.9], position: [0, 0.9, z0], rotation: [0,0,0], material: 'stone' });
    for (const dx of [-0.9, 0.9]) {
      parts.push({ name: 'bench_leg', geoType: 'box', geoArgs: [0.06, 0.9, 0.8], position: [dx, 0.45, z0], rotation: [0,0,0], material: 'stone' });
    }
    parts.push({ name: 'icosahedron', geoType: 'icosahedron', geoArgs: [0.35, 0], position: [0, 1.7, z0], rotation: [0,0,0], material: 'emissive', emissiveColor: ex.lightColor, flatShading: true });
    parts.push({ name: 'ring', geoType: 'torus', geoArgs: [0.5, 0.02, 8, 24], position: [0, 1.7, z0], rotation: [Math.PI/2,0,0], material: 'emissive', emissiveColor: ex.lightColor });
    parts.push({ name: 'label', geoType: 'box', geoArgs: [1.4, 0.18, 0.02], position: [0, 0.7, z0 + 0.6], rotation: [0,0,0], material: 'label' });
  } else if (ex.type === 'carousel') {
    parts.push({ name: 'pillar', geoType: 'cylinder', geoArgs: [0.08, 0.08, 2.5, 8], position: [0, 1.25, z0], rotation: [0,0,0], material: 'iron' });
    for (let f = 0; f < 5; f++) {
      const fa = (f / 5) * Math.PI * 2;
      parts.push({
        name: `frame_${f}`, geoType: 'box', geoArgs: [0.8, 0.6, 0.04],
        position: [Math.sin(fa) * 0.7, 1.5, z0 + Math.cos(fa) * 0.7],
        rotation: [0, -fa, 0],
        material: f === 0 ? 'emissive' : 'iron',
        ...(f === 0 ? { emissiveColor: ex.lightColor } : {}),
      });
    }
    parts.push({ name: 'label', geoType: 'box', geoArgs: [1.4, 0.18, 0.02], position: [0, 0.5, z0 + 1.0], rotation: [0,0,0], material: 'label' });
  } else if (ex.type === 'iceberg') {
    const layers = [
      { w: 0.6, h: 0.12, y: 2.05, color: '#eeffff', emColor: '#ccffff', emInt: 0.5 },
      { w: 0.9, h: 0.10, y: 1.85, color: '#88ddff', emColor: '#66ccee', emInt: 0.35 },
      { w: 1.2, h: 0.14, y: 1.65, color: '#55bbdd', emColor: '#44aacc', emInt: 0.25 },
      { w: 1.5, h: 0.16, y: 1.42, color: '#3399bb', emColor: '#228899', emInt: 0.2 },
      { w: 1.8, h: 0.18, y: 1.16, color: '#226688', emColor: '#115577', emInt: 0.15 },
      { w: 2.0, h: 0.20, y: 0.88, color: '#114466', emColor: '#0a3355', emInt: 0.1 },
    ];
    parts.push({ name: 'waterline', geoType: 'cylinder', geoArgs: [1.1, 1.1, 0.01, 16], position: [0, 1.92, z0], rotation: [0,0,0], material: 'waterline' });
    layers.forEach((l, li) => {
      parts.push({
        name: `ice_${li}`, geoType: 'box', geoArgs: [l.w, l.h, l.w * 0.6],
        position: [0, l.y, z0], rotation: [0,0,0],
        material: 'ice', color: l.color, emissiveColor: l.emColor, emissiveIntensity: l.emInt,
        flatShading: true,
      });
    });
    parts.push({ name: 'label', geoType: 'box', geoArgs: [1.4, 0.18, 0.02], position: [0, 0.55, z0 + 0.7], rotation: [0,0,0], material: 'label' });
  } else if (ex.type === 'qa') {
    parts.push({ name: 'base', geoType: 'cylinder', geoArgs: [0.35, 0.45, 0.15, 8], position: [0, 0.075, z0], rotation: [0,0,0], material: 'stone' });
    parts.push({ name: 'column', geoType: 'cylinder', geoArgs: [0.18, 0.25, 0.65, 8], position: [0, 0.475, z0], rotation: [0,0,0], material: 'iron' });
    parts.push({ name: 'cap', geoType: 'cylinder', geoArgs: [0.38, 0.28, 0.1, 8], position: [0, 0.85, z0], rotation: [0,0,0], material: 'stone' });
    parts.push({ name: 'glow_ring', geoType: 'torus', geoArgs: [0.32, 0.015, 8, 24], position: [0, 0.91, z0], rotation: [-Math.PI/2,0,0], material: 'emissive', emissiveColor: ex.lightColor });
    // QA voxel text exported as approximate bounding boxes
    parts.push({ name: 'qa_text', geoType: 'box', geoArgs: [1.0, 0.84, 0.12], position: [0, 1.5, z0], rotation: [0,0,0], material: 'emissive', emissiveColor: ex.lightColor, flatShading: true });
    parts.push({ name: 'label', geoType: 'box', geoArgs: [1.4, 0.18, 0.02], position: [0, 0.55, z0 + 0.6], rotation: [0,0,0], material: 'label' });
  }

  // Round all positions/rotations
  parts.forEach(p => {
    p.position = p.position.map(r4);
    p.rotation = p.rotation.map(r4);
    p.geoArgs = p.geoArgs.map(r4);
  });

  exhibits.push({
    id: ex.id,
    type: ex.type,
    lightColor: ex.lightColor,
    groupPosition: [r4(groupX), 0, r4(groupZ)],
    groupRotationY: r4(groupRotY),
    alcoveIndex: i,
    parts,
  });
}

// ─── Portal Geometry ────────────────────────────────────────────────
const portals = {
  floor: {
    position: [0, 0.02, 0],
    rotationX: r4(-Math.PI / 2),
    parts: [
      { name: 'hex_ring', geoType: 'ring', geoArgs: [0.5, 0.75, 6], material: 'portal_cyan' },
      { name: 'center_dot', geoType: 'circle', geoArgs: [0.1, 16], material: 'portal_cyan' },
    ],
  },
  ceiling: {
    position: [0, r4(CEILING_HEIGHT - 0.02), 0],
    parts: [
      { name: 'pb_core', geoType: 'sphere', geoArgs: [0.06, 12, 12], material: 'portal_gold', color: '#ffc060' },
      { name: 'hg_shell', geoType: 'icosahedron', geoArgs: [0.30, 1], material: 'portal_silver', color: '#b8c4d0', wireframe: true },
      { name: 'ring_i', geoType: 'torus', geoArgs: [0.40, 0.012, 12, 64], pivotRotation: [0,0,0], material: 'portal_amber', color: '#ffa040' },
      { name: 'ring_j', geoType: 'torus', geoArgs: [0.43, 0.012, 12, 64], pivotRotation: [r4(Math.PI/2),0,0], material: 'portal_amber', color: '#ffa040' },
      { name: 'ring_k', geoType: 'torus', geoArgs: [0.46, 0.012, 12, 64], pivotRotation: [0,0,r4(Math.PI/2)], material: 'portal_amber', color: '#ffa040' },
    ],
  },
};

// ─── Write output ───────────────────────────────────────────────────
const data = {
  config: { ATRIUM_RADIUS, CEILING_HEIGHT, CORRIDOR_LENGTH, CORRIDOR_WIDTH, WALL_THICKNESS, ALCOVE_DEPTH, ALCOVE_WIDTH, NUM_SPOKES },
  meshes,
  lights,
  sconces,
  cameras,
  collisions,
  exhibits,
  portals,
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
console.log(`  Exhibits:   ${exhibits.length} (${exhibits.reduce((n, e) => n + e.parts.length, 0)} parts)`);
console.log(`  Portals:    2 (floor + ceiling)`);
console.log(`\nWrote: ${outPath}`);
console.log(`Size:  ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
console.log('\nNext: Open Blender and run build-blender-scene.py');
