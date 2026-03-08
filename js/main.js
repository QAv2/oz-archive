// ─── Oz Archive — Main Entry Point ──────────────────────────────────
import * as THREE from 'three';
import { COLORS, PLAYER_HEIGHT, DOOR_SLIDE_DURATION, DOOR_AUTO_ADVANCE, EXHIBITS } from './config.js';
import { buildScene } from './scene.js';
import { buildExhibits, updateExhibits } from './exhibits.js';
import { createPlayer, lockPointer, enableMovement, disableMovement, updatePlayer, getCamera, getControls, isLocked } from './player.js';
import { initInteraction, updateInteraction, getActiveExhibitName } from './interaction.js';
import { initPortal, updatePortal } from './portal.js';
import { initSkyPortal, updateSkyPortal } from './portal-sky.js';
import { runBootSequence, hideBootScreen } from './boot.js';
import { createComposer, updateCRT, toggleCRT, renderComposer } from './shaders/crt.js';
import { initProxyChat, toggleProxyChat } from './proxychat.js';

let renderer, scene, composer;
const clock = new THREE.Clock();
let isMobileMode = false;

// Tour module — lazy-loaded only on mobile
let tourModule = null;

// ─── Mobile Detection ───────────────────────────────────────────────
function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    || (window.matchMedia && window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches);
}

// ─── Init ───────────────────────────────────────────────────────────
async function init() {
  isMobileMode = isMobile();

  // Renderer — lower settings on mobile
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobileMode,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileMode ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.5;

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Scene
  scene = new THREE.Scene();
  buildScene(scene);
  buildExhibits(scene);

  // Camera setup — desktop vs mobile
  let cam;
  if (isMobileMode) {
    tourModule = await import('./tour.js');
    cam = tourModule.createTourCamera(renderer);
    tourModule.initTourControls(renderer);
    tourModule.initHotspots(scene);
    initProxyChat(() => tourModule.getCurrentExhibitName());
  } else {
    const result = createPlayer(renderer);
    cam = result.camera;
    initInteraction();
    initPortal(scene);
    initSkyPortal(scene);
    initProxyChat(() => getActiveExhibitName());
  }

  // Post-processing
  composer = createComposer(renderer, scene, cam);

  // CRT toggle button
  const crtBtn = document.getElementById('crt-toggle');
  crtBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = toggleCRT();
    crtBtn.textContent = on ? 'CRT: ON' : 'CRT: OFF';
  });

  // ─── Start render loop NOW (renders behind overlays) ────────────
  clock.start();
  animate();

  // ─── Boot Sequence (skip with ?skipboot for dev/testing) ───────
  const skipBoot = new URLSearchParams(window.location.search).has('skipboot');
  if (skipBoot) {
    hideBootScreen();
    const door = document.getElementById('door-overlay');
    if (door) door.style.display = 'none';
  } else {
    await runBootSequence(isMobileMode);
    hideBootScreen();
    await doorSequence();
  }

  // ─── Post-door: diverge by mode ─────────────────────────────────
  crtBtn.style.display = 'block';

  if (isMobileMode) {
    // Start tour mode
    tourModule.startTour();

    // Curator button for mobile
    const curatorBtn = document.getElementById('tour-curator-btn');
    curatorBtn.style.display = 'block';
    curatorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleProxyChat();
    });
  } else {
    // Desktop pointer lock flow
    const hud = document.getElementById('hud-prompt');
    const crosshair = document.getElementById('crosshair');

    hud.innerHTML = '<span style="display:block; margin-bottom:0.8rem;">CLICK TO ENTER THE ARCHIVE</span>'
      + '<span style="display:block; font-size:clamp(7px, 0.9vw, 9px); opacity:0.55;">PRESS T TO SPEAK WITH THE CURATOR</span>';
    hud.style.opacity = '0';
    // Fade in the legend after a short delay so the museum renders first
    setTimeout(() => { hud.style.opacity = '1'; }, 600);

    const ctrl = getControls();

    ctrl.addEventListener('lock', () => {
      enableMovement();
      crosshair.style.display = 'block';
      hud.style.opacity = '0';
    });

    ctrl.addEventListener('unlock', () => {
      disableMovement();
      crosshair.style.display = 'none';
      hud.innerHTML = '<span style="display:block; margin-bottom:0.8rem;">Click to resume</span>'
        + '<span style="display:block; font-size:clamp(7px, 0.9vw, 9px); opacity:0.55;">PRESS T TO SPEAK WITH THE CURATOR</span>';
      hud.style.opacity = '1';
    });

    document.addEventListener('click', () => {
      if (!isLocked()) {
        lockPointer();
      }
    });
  }
}

// ─── Door Animation ─────────────────────────────────────────────────
function doorSequence() {
  return new Promise((resolve) => {
    const door = document.getElementById('door-overlay');
    door.style.display = 'flex';

    setTimeout(() => {
      door.style.opacity = '0';
      setTimeout(() => {
        door.style.display = 'none';
        resolve();
      }, 600);
    }, 1500);
  });
}

// ─── Render Loop ────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  if (isMobileMode) {
    if (tourModule) tourModule.updateTour(delta, elapsed);
  } else {
    updatePlayer(delta);
    updateInteraction(elapsed);
    updatePortal(delta, elapsed);
    updateSkyPortal(delta, elapsed);
  }

  updateExhibits(elapsed);
  updateCRT(elapsed);
  renderComposer();
}

// ─── Start ──────────────────────────────────────────────────────────
init().catch(console.error);
