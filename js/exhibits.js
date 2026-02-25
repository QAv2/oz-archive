// ─── Exhibit Objects: 6 Procedural Models ──────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EXHIBITS, CEILING_HEIGHT, ALCOVE_DEPTH } from './config.js';
import { getExhibitPositions } from './scene.js';

// Public: array of { mesh, data, position } for interaction.js
export const exhibitObjects = [];

export function buildExhibits(scene) {
  const positions = getExhibitPositions();

  for (let i = 0; i < EXHIBITS.length; i++) {
    const data = EXHIBITS[i];
    const pos = positions[i];
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);
    // Face back toward center
    group.rotation.y = pos.angle + Math.PI;

    switch (data.type) {
      case 'screen':   buildScreen(group, data); break;
      case 'crt':      buildCRT(group, data); break;
      case 'lab':      buildLab(group, data); break;
      case 'carousel': buildCarousel(group, data); break;
      case 'arcade':   buildArcade(group, data); break;
      case 'qa':       buildQA(group, data); break;
      default:         buildScreen(group, data); break;
    }

    scene.add(group);
    exhibitObjects.push({
      group,
      data,
      worldPos: new THREE.Vector3(pos.x, CEILING_HEIGHT / 2, pos.z),
    });
  }
}

// ─── Wall-mounted Screen ────────────────────────────────────────────
function buildScreen(group, data) {
  // Frame
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.6, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x222233, flatShading: true })
  );
  frame.position.set(0, 1.8, -ALCOVE_DEPTH * 0.3);
  group.add(frame);

  // Screen surface (emissive with exhibit color)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshStandardMaterial({
      color: data.lightColor,
      emissive: data.lightColor,
      emissiveIntensity: 0.3,
      flatShading: true,
    })
  );
  screen.position.set(0, 1.8, -ALCOVE_DEPTH * 0.3 + 0.06);
  group.add(screen);

  // Label plate below
  addLabel(group, data.name, 0, 0.8, -ALCOVE_DEPTH * 0.3);
}

// ─── Desk + CRT Monitor ────────────────────────────────────────────
function buildCRT(group, data) {
  // Desk
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.08, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x332211, flatShading: true })
  );
  desk.position.set(0, 0.75, -ALCOVE_DEPTH * 0.3);
  group.add(desk);

  // Desk legs
  for (const [dx, dz] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.75, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x332211, flatShading: true })
    );
    leg.position.set(dx, 0.375, -ALCOVE_DEPTH * 0.3 + dz);
    group.add(leg);
  }

  // CRT body
  const crt = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.7, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true })
  );
  crt.position.set(0, 1.14, -ALCOVE_DEPTH * 0.3);
  group.add(crt);

  // CRT screen
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.54),
    new THREE.MeshStandardMaterial({
      color: data.lightColor,
      emissive: data.lightColor,
      emissiveIntensity: 0.4,
      flatShading: true,
    })
  );
  screen.position.set(0, 1.14, -ALCOVE_DEPTH * 0.3 + 0.36);
  group.add(screen);

  addLabel(group, data.name, 0, 0.55, -ALCOVE_DEPTH * 0.3 + 0.5);
}

// ─── Lab Bench + Floating Geometry ──────────────────────────────────
function buildLab(group, data) {
  // Bench
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.08, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x2a2a3a, flatShading: true })
  );
  bench.position.set(0, 0.9, -ALCOVE_DEPTH * 0.3);
  group.add(bench);

  // Bench legs
  for (const dx of [-0.9, 0.9]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.9, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a3a, flatShading: true })
    );
    leg.position.set(dx, 0.45, -ALCOVE_DEPTH * 0.3);
    group.add(leg);
  }

  // Floating polyhedron
  const ico = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.35, 0),
    new THREE.MeshStandardMaterial({
      color: data.lightColor,
      emissive: data.lightColor,
      emissiveIntensity: 0.5,
      flatShading: true,
      wireframe: false,
    })
  );
  ico.position.set(0, 1.7, -ALCOVE_DEPTH * 0.3);
  ico.userData.float = true;
  ico.userData.baseY = 1.7;
  group.add(ico);

  // Wireframe ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.02, 8, 24),
    new THREE.MeshStandardMaterial({
      color: data.lightColor,
      emissive: data.lightColor,
      emissiveIntensity: 0.3,
      flatShading: true,
    })
  );
  ring.position.set(0, 1.7, -ALCOVE_DEPTH * 0.3);
  ring.rotation.x = Math.PI / 2;
  ring.userData.spin = true;
  group.add(ring);

  addLabel(group, data.name, 0, 0.7, -ALCOVE_DEPTH * 0.3 + 0.6);
}

// ─── Film-Frame Carousel ────────────────────────────────────────────
function buildCarousel(group, data) {
  // Central pillar
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x333333, flatShading: true })
  );
  pillar.position.set(0, 1.25, -ALCOVE_DEPTH * 0.3);
  group.add(pillar);

  // Film frames around pillar
  for (let f = 0; f < 5; f++) {
    const fa = (f / 5) * Math.PI * 2;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.6, 0.04),
      new THREE.MeshStandardMaterial({
        color: f === 0 ? data.lightColor : 0x222233,
        emissive: f === 0 ? data.lightColor : 0x000000,
        emissiveIntensity: f === 0 ? 0.3 : 0,
        flatShading: true,
      })
    );
    frame.position.set(
      Math.sin(fa) * 0.7,
      1.5,
      -ALCOVE_DEPTH * 0.3 + Math.cos(fa) * 0.7
    );
    frame.rotation.y = -fa;
    group.add(frame);
  }

  // Carousel userData for rotation
  group.userData.carousel = true;

  addLabel(group, data.name, 0, 0.5, -ALCOVE_DEPTH * 0.3 + 1.0);
}

// ─── Arcade Cabinet ─────────────────────────────────────────────────
function buildArcade(group, data) {
  // Cabinet body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.8, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2e, flatShading: true })
  );
  body.position.set(0, 0.9, -ALCOVE_DEPTH * 0.3);
  group.add(body);

  // Screen bezel (angled top)
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.65, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x111122, flatShading: true })
  );
  bezel.position.set(0, 1.5, -ALCOVE_DEPTH * 0.3 + 0.31);
  bezel.rotation.x = -0.2;
  group.add(bezel);

  // Screen
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.5),
    new THREE.MeshStandardMaterial({
      color: data.lightColor,
      emissive: data.lightColor,
      emissiveIntensity: 0.4,
      flatShading: true,
    })
  );
  screen.position.set(0, 1.5, -ALCOVE_DEPTH * 0.3 + 0.37);
  screen.rotation.x = -0.2;
  group.add(screen);

  // Control panel
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.15, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x222233, flatShading: true })
  );
  panel.position.set(0, 1.0, -ALCOVE_DEPTH * 0.3 + 0.2);
  panel.rotation.x = -0.3;
  group.add(panel);

  // Joystick
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, flatShading: true })
  );
  stick.position.set(-0.15, 1.1, -ALCOVE_DEPTH * 0.3 + 0.25);
  group.add(stick);

  // Buttons
  for (let b = 0; b < 3; b++) {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8),
      new THREE.MeshStandardMaterial({
        color: [0xff4444, 0x44ff44, 0x4444ff][b],
        emissive: [0xff4444, 0x44ff44, 0x4444ff][b],
        emissiveIntensity: 0.3,
        flatShading: true,
      })
    );
    btn.position.set(0.08 + b * 0.08, 1.08, -ALCOVE_DEPTH * 0.3 + 0.25);
    btn.rotation.x = -0.3;
    group.add(btn);
  }

  // Marquee
  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.25, 0.05),
    new THREE.MeshStandardMaterial({
      color: data.lightColor,
      emissive: data.lightColor,
      emissiveIntensity: 0.5,
      flatShading: true,
    })
  );
  marquee.position.set(0, 1.92, -ALCOVE_DEPTH * 0.3 + 0.3);
  group.add(marquee);

  addLabel(group, data.name, 0, 0.3, -ALCOVE_DEPTH * 0.3 + 0.6);
}

// ─── QA Pedestal + Floating Block Letters ────────────────────────────
const Q_GRID = [
  [0,1,1,1,0],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,0,1,0,1],
  [1,0,0,1,0],
  [0,1,1,0,1],
];

const A_GRID = [
  [0,1,1,1,0],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,1,1,1,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
];

function buildLetterGeo(grid, px) {
  const geos = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) {
        const box = new THREE.BoxGeometry(px * 0.88, px * 0.88, px * 0.88);
        box.translate(c * px, (grid.length - 1 - r) * px, 0);
        geos.push(box);
      }
    }
  }
  return mergeGeometries(geos);
}

function buildQA(group, data) {
  const PIXEL = 0.12;

  // Pedestal base
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 0.15, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a3a, flatShading: true })
  );
  base.position.set(0, 0.075, -ALCOVE_DEPTH * 0.3);
  group.add(base);

  // Pedestal column
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.25, 0.65, 8),
    new THREE.MeshStandardMaterial({ color: 0x222233, flatShading: true })
  );
  column.position.set(0, 0.475, -ALCOVE_DEPTH * 0.3);
  group.add(column);

  // Pedestal cap
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.28, 0.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a3a, flatShading: true })
  );
  cap.position.set(0, 0.85, -ALCOVE_DEPTH * 0.3);
  group.add(cap);

  // Glow ring on pedestal top
  const glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.015, 8, 24),
    new THREE.MeshStandardMaterial({
      color: data.lightColor,
      emissive: data.lightColor,
      emissiveIntensity: 0.4,
      flatShading: true,
    })
  );
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.set(0, 0.91, -ALCOVE_DEPTH * 0.3);
  group.add(glowRing);

  // Build QA voxel block text
  const mat = new THREE.MeshStandardMaterial({
    color: data.lightColor,
    emissive: data.lightColor,
    emissiveIntensity: 0.5,
    flatShading: true,
  });

  const qGeo = buildLetterGeo(Q_GRID, PIXEL);
  const aGeo = buildLetterGeo(A_GRID, PIXEL);
  const qMesh = new THREE.Mesh(qGeo, mat);
  const aMesh = new THREE.Mesh(aGeo, mat);

  // Center the two letters
  const letterW = 5 * PIXEL;
  const letterH = 7 * PIXEL;
  const gap = PIXEL * 2;
  const totalW = letterW * 2 + gap;

  qMesh.position.set(-totalW / 2, -letterH / 2, 0);
  aMesh.position.set(-totalW / 2 + letterW + gap, -letterH / 2, 0);

  const qaGroup = new THREE.Group();
  qaGroup.add(qMesh);
  qaGroup.add(aMesh);
  qaGroup.position.set(0, 1.5, -ALCOVE_DEPTH * 0.3);
  qaGroup.userData.float = true;
  qaGroup.userData.baseY = 1.5;
  qaGroup.userData.spinY = true;
  group.add(qaGroup);

  addLabel(group, data.name, 0, 0.55, -ALCOVE_DEPTH * 0.3 + 0.6);
}

// ─── Shared Label ───────────────────────────────────────────────────
function addLabel(group, text, x, y, z) {
  // Simple plate — text is handled by HTML overlay
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.18, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0x0a0a0f,
      emissive: 0x00ff41,
      emissiveIntensity: 0.05,
      flatShading: true,
    })
  );
  plate.position.set(x, y, z);
  group.add(plate);
}

// ─── Animate Exhibits (floating, spinning, carousel) ────────────────
export function updateExhibits(time) {
  for (const { group } of exhibitObjects) {
    group.traverse((child) => {
      if (child.userData.float) {
        child.position.y = child.userData.baseY + Math.sin(time * 1.5) * 0.1;
      }
      if (child.userData.spin) {
        child.rotation.z = time * 0.5;
      }
      if (child.userData.spinY) {
        child.rotation.y = time * 0.5;
      }
    });
    if (group.userData.carousel) {
      // Slowly rotate the film frames (children after the pillar)
      group.children.forEach((child, idx) => {
        if (idx > 0 && idx <= 5) {
          const fa = ((idx - 1) / 5) * Math.PI * 2 + time * 0.3;
          child.position.x = Math.sin(fa) * 0.7;
          child.position.z = -ALCOVE_DEPTH * 0.3 + Math.cos(fa) * 0.7;
          child.rotation.y = -fa;
        }
      });
    }
  }
}
