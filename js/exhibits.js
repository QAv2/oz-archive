// ─── Exhibit Objects: 6 Procedural Models ──────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EXHIBITS, CEILING_HEIGHT, ALCOVE_DEPTH } from './config.js';
import { getExhibitPositions } from './scene.js';

// ─── Texture Loader ─────────────────────────────────────────────────
const texLoader = new THREE.TextureLoader();

function loadTex(path, repeatX = 1, repeatY = 1, srgb = true) {
  const tex = texLoader.load(path);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Shared Exhibit Materials (vault-cohesive, textured) ────────────
const ironMat = new THREE.MeshStandardMaterial({
  color: 0x2e2c28, roughness: 0.65, metalness: 0.45,
  map: loadTex('textures/metal-color.jpg'),
  normalMap: loadTex('textures/metal-normal.jpg', 1, 1, false),
  normalScale: new THREE.Vector2(0.7, 0.7),
});
const stoneMat = new THREE.MeshStandardMaterial({
  color: 0x383632, roughness: 0.9, metalness: 0.0,
  map: loadTex('textures/stone-furniture-color.jpg'),
  normalMap: loadTex('textures/stone-furniture-normal.jpg', 1, 1, false),
  normalScale: new THREE.Vector2(0.6, 0.6),
});
const darkMat = new THREE.MeshStandardMaterial({
  color: 0x141412, roughness: 0.8, metalness: 0.1,
});
const beigeMat = new THREE.MeshStandardMaterial({
  color: 0xc8b898, roughness: 0.85, metalness: 0.05,
  map: loadTex('textures/plastic-color.jpg'),
  normalMap: loadTex('textures/plastic-normal.jpg', 1, 1, false),
  normalScale: new THREE.Vector2(0.5, 0.5),
});
const beigeDarkMat = new THREE.MeshStandardMaterial({
  color: 0xa89878, roughness: 0.85, metalness: 0.05,
  map: loadTex('textures/plastic-color.jpg'),
  normalMap: loadTex('textures/plastic-normal.jpg', 1, 1, false),
  normalScale: new THREE.Vector2(0.5, 0.5),
});
const labelMat = new THREE.MeshStandardMaterial({
  color: 0x0c0c0a, emissive: 0x00ff41, emissiveIntensity: 0.05,
  roughness: 0.7, metalness: 0.3,
});

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
      case 'arcade':   buildScreen(group, data); break;  // no exhibit uses this — fallback to screen
      case 'iceberg':  buildIceberg(group, data); break;
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
    ironMat
  );
  frame.position.set(0, 1.8, -ALCOVE_DEPTH * 0.3);
  group.add(frame);

  // Screen material — load texture if available, else solid color
  const screenMat = new THREE.MeshStandardMaterial({
    color: data.lightColor,
    emissive: data.lightColor,
    emissiveIntensity: 0.3,
  });

  if (data.texture) {
    const loader = new THREE.TextureLoader();
    loader.load(data.texture, (tex) => {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      screenMat.map = tex;
      screenMat.color.set(0xffffff);
      screenMat.emissive.set(0xffffff);
      screenMat.emissiveMap = tex;
      screenMat.emissiveIntensity = 0.8;
      screenMat.needsUpdate = true;
    });
  }

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    screenMat
  );
  screen.position.set(0, 1.8, -ALCOVE_DEPTH * 0.3 + 0.06);
  group.add(screen);

  // Label plate below
  addLabel(group, data.name, 0, 0.8, -ALCOVE_DEPTH * 0.3);
}

// ─── 90s PC Workstation ─────────────────────────────────────────────
function buildCRT(group, data) {
  const z0 = -ALCOVE_DEPTH * 0.3;

  // ── Desk (stone slab) ──
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.06, 0.9),
    stoneMat
  );
  desk.position.set(0, 0.74, z0);
  group.add(desk);

  // Desk legs — stone pillars
  for (const [dx, dz] of [[-1.0, -0.38], [1.0, -0.38], [-1.0, 0.38], [1.0, 0.38]]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.74, 0.06),
      stoneMat
    );
    leg.position.set(dx, 0.37, z0 + dz);
    group.add(leg);
  }

  // Desk back panel (modesty panel)
  const backPanel = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.50, 0.04),
    stoneMat
  );
  backPanel.position.set(0, 0.50, z0 - 0.43);
  group.add(backPanel);

  // ── CRT Monitor (beige, chunky) ──
  // Monitor base/stand
  const monStand = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.04, 0.35),
    beigeDarkMat
  );
  monStand.position.set(0, 0.79, z0 - 0.05);
  group.add(monStand);

  // Monitor body — deep CRT box
  const monBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.72, 0.65),
    beigeMat
  );
  monBody.position.set(0, 1.17, z0 - 0.08);
  group.add(monBody);

  // Monitor bezel (darker inset frame around screen)
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.60, 0.03),
    darkMat
  );
  bezel.position.set(0, 1.19, z0 + 0.24);
  group.add(bezel);

  // Monitor screen — texture loaded
  const screenMat = new THREE.MeshStandardMaterial({
    color: data.lightColor,
    emissive: data.lightColor,
    emissiveIntensity: 0.4,
  });

  if (data.texture) {
    const loader = new THREE.TextureLoader();
    loader.load(data.texture, (tex) => {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      screenMat.map = tex;
      screenMat.color.set(0xffffff);
      screenMat.emissive.set(0xffffff);
      screenMat.emissiveMap = tex;
      screenMat.emissiveIntensity = 0.7;
      screenMat.needsUpdate = true;
    });
  }

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.74, 0.52),
    screenMat
  );
  screen.position.set(0, 1.19, z0 + 0.255);
  group.add(screen);

  // Power LED on monitor (green dot)
  const monLed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6),
    new THREE.MeshStandardMaterial({
      color: 0x00ff41, emissive: 0x00ff41, emissiveIntensity: 0.8,
    })
  );
  monLed.rotation.x = Math.PI / 2;
  monLed.position.set(0.32, 0.92, z0 + 0.24);
  group.add(monLed);

  // ── Tower PC (beige, right side of desk) ──
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.45, 0.42),
    beigeMat
  );
  tower.position.set(0.85, 1.0, z0 - 0.05);
  group.add(tower);

  // Tower front panel (slightly darker)
  const towerFront = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.43, 0.01),
    beigeDarkMat
  );
  towerFront.position.set(0.85, 1.0, z0 + 0.16);
  group.add(towerFront);

  // Floppy drive slot
  const floppy = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.012, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.2 })
  );
  floppy.position.set(0.85, 1.14, z0 + 0.17);
  group.add(floppy);

  // CD-ROM drive slot
  const cdrom = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.025, 0.01),
    beigeDarkMat
  );
  cdrom.position.set(0.85, 1.08, z0 + 0.17);
  group.add(cdrom);

  // CD-ROM eject button
  const ejectBtn = new THREE.Mesh(
    new THREE.BoxGeometry(0.015, 0.012, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x999988, roughness: 0.6, metalness: 0.3 })
  );
  ejectBtn.position.set(0.90, 1.06, z0 + 0.175);
  group.add(ejectBtn);

  // Power button on tower
  const powerBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.008, 8),
    new THREE.MeshStandardMaterial({ color: 0x888877, roughness: 0.6, metalness: 0.3 })
  );
  powerBtn.rotation.x = Math.PI / 2;
  powerBtn.position.set(0.85, 1.18, z0 + 0.175);
  group.add(powerBtn);

  // Tower power LED (green)
  const towerLed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.008, 6),
    new THREE.MeshStandardMaterial({
      color: 0x00ff41, emissive: 0x00ff41, emissiveIntensity: 0.8,
    })
  );
  towerLed.rotation.x = Math.PI / 2;
  towerLed.position.set(0.85, 1.16, z0 + 0.175);
  group.add(towerLed);

  // ── Keyboard ──
  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.02, 0.16),
    beigeDarkMat
  );
  keyboard.position.set(-0.05, 0.78, z0 + 0.28);
  group.add(keyboard);

  // Key rows (dark inset to suggest keys)
  for (let row = 0; row < 4; row++) {
    const keys = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.003, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x555550, roughness: 0.8 })
    );
    keys.position.set(-0.05, 0.80, z0 + 0.22 + row * 0.035);
    group.add(keys);
  }

  // ── Mouse + pad ──
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.005, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.9 })
  );
  pad.position.set(0.42, 0.775, z0 + 0.28);
  group.add(pad);

  const mouse = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.02, 0.08),
    beigeMat
  );
  mouse.position.set(0.42, 0.79, z0 + 0.28);
  group.add(mouse);

  addLabel(group, data.name, 0, 0.55, z0 + 0.55);
}

// ─── Lab Bench + Floating Geometry ──────────────────────────────────
function buildLab(group, data) {
  // Bench
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.08, 0.9),
    stoneMat
  );
  bench.position.set(0, 0.9, -ALCOVE_DEPTH * 0.3);
  group.add(bench);

  // Bench legs
  for (const dx of [-0.9, 0.9]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.9, 0.8),
      stoneMat
    );
    leg.position.set(dx, 0.45, -ALCOVE_DEPTH * 0.3);
    group.add(leg);
  }

  // Floating polyhedron — flatShading kept for crystalline look
  const ico = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.35, 0),
    new THREE.MeshStandardMaterial({
      color: data.lightColor,
      emissive: data.lightColor,
      emissiveIntensity: 0.5,
      flatShading: true,
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
    ironMat
  );
  pillar.position.set(0, 1.25, -ALCOVE_DEPTH * 0.3);
  group.add(pillar);

  // Film frames around pillar
  for (let f = 0; f < 5; f++) {
    const fa = (f / 5) * Math.PI * 2;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.6, 0.04),
      f === 0
        ? new THREE.MeshStandardMaterial({
            color: data.lightColor,
            emissive: data.lightColor,
            emissiveIntensity: 0.3,
          })
        : ironMat
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


// ─── Iceberg — Stacked Horizontal Slabs ─────────────────────────────
function buildIceberg(group, data) {
  const z0 = -ALCOVE_DEPTH * 0.3;
  const layers = [
    { w: 0.6, h: 0.12, y: 2.05, color: 0xeeffff, emissive: 0xccffff, intensity: 0.5 },  // tip
    { w: 0.9, h: 0.10, y: 1.85, color: 0x88ddff, emissive: 0x66ccee, intensity: 0.35 },
    { w: 1.2, h: 0.14, y: 1.65, color: 0x55bbdd, emissive: 0x44aacc, intensity: 0.25 },
    { w: 1.5, h: 0.16, y: 1.42, color: 0x3399bb, emissive: 0x228899, intensity: 0.2 },
    { w: 1.8, h: 0.18, y: 1.16, color: 0x226688, emissive: 0x115577, intensity: 0.15 },
    { w: 2.0, h: 0.20, y: 0.88, color: 0x114466, emissive: 0x0a3355, intensity: 0.1 },
  ];

  // Waterline disc between layer 1 and 2
  const waterline = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.01, 16),
    new THREE.MeshStandardMaterial({
      color: 0x4488aa,
      emissive: 0x336688,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.35,
      flatShading: true,
    })
  );
  waterline.position.set(0, 1.92, z0);
  group.add(waterline);

  // Build iceberg slabs — flatShading kept for crystalline ice
  const iceGroup = new THREE.Group();
  layers.forEach((l) => {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(l.w, l.h, l.w * 0.6),
      new THREE.MeshStandardMaterial({
        color: l.color,
        emissive: l.emissive,
        emissiveIntensity: l.intensity,
        flatShading: true,
      })
    );
    slab.position.set(0, l.y, 0);
    iceGroup.add(slab);
  });

  iceGroup.position.set(0, 0, z0);
  iceGroup.userData.float = true;
  iceGroup.userData.baseY = 0;
  group.add(iceGroup);

  addLabel(group, data.name, 0, 0.55, z0 + 0.7);
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
    stoneMat
  );
  base.position.set(0, 0.075, -ALCOVE_DEPTH * 0.3);
  group.add(base);

  // Pedestal column
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.25, 0.65, 8),
    ironMat
  );
  column.position.set(0, 0.475, -ALCOVE_DEPTH * 0.3);
  group.add(column);

  // Pedestal cap
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.28, 0.1, 8),
    stoneMat
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
    })
  );
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.set(0, 0.91, -ALCOVE_DEPTH * 0.3);
  group.add(glowRing);

  // Build QA voxel block text — flatShading kept for voxel aesthetic
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
    labelMat
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
