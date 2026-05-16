// ─── Oz Archive Cinema Mode ─────────────────────────────────────────
// Deterministic camera animation for Remotion pipeline renders.
// Activated by ?cinema=1 query param. Zero cost to normal visitors.
//
// Hash commands:
//   #cinema/entry                     — full entry sequence (overhead→spin→descend→walk→reveal)
//   #cinema/pose/{x},{y},{z}/pitch:{d}/yaw:{d}/hold:{ms}  — static camera pose
//   #cinema/exhibit/{index}           — face exhibit alcove
//   #cinema/reveal/scroll             — fade in scroll prop
//   #cinema/clear                     — reset camera to atrium center
//
// Emits postMessage { type: 'cinema:ready' } to parent when settled.
// ────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

if (!new URLSearchParams(window.location.search).has('cinema')) {
  // Not cinema mode — bail immediately, zero overhead
} else {
  document.body.classList.add('cinema-mode');

  function onReady() {
    const { scene, renderer, camera, composer, clock } = window.__ozarchive;

    // ─── Scroll starts hidden for reveal animation ──────────────────
    // Find scroll mesh via scene graph (exported from scene.js)
    let scrollMesh = null;
    scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry?.type === 'PlaneGeometry' &&
          obj.material?.map?.source?.data?.src?.includes('parchment')) {
        scrollMesh = obj;
      }
    });
    // Fallback: find by position (scroll sits at y≈0.92 on the podium)
    if (!scrollMesh) {
      scene.traverse((obj) => {
        if (obj.isMesh && obj.geometry?.type === 'PlaneGeometry' &&
            Math.abs(obj.position.y - 0.92) < 0.05) {
          scrollMesh = obj;
        }
      });
    }

    // ─── Collect ceiling meshes (hide during overhead phases) ────────
    const ceilingMeshes = [];
    scene.traverse((obj) => {
      if (obj.isMesh && obj.userData?.archType === 'ceiling') {
        ceilingMeshes.push(obj);
      }
    });

    // Store original fog density
    const origFogDensity = scene.fog ? scene.fog.density : 0.020;

    // Overhead fill light (bright from above, only during aerial phases)
    const overheadLight = new THREE.PointLight(0xffe8cc, 0, 50, 1);
    overheadLight.position.set(0, 12, 0);
    scene.add(overheadLight);

    function setAerialMode(on, blend) {
      // blend: 0=full aerial, 1=fully grounded
      const t = blend !== undefined ? blend : (on ? 0 : 1);
      for (const m of ceilingMeshes) m.visible = t > 0.5;
      if (scene.fog) scene.fog.density = lerp(0.004, origFogDensity, t);
      overheadLight.intensity = lerp(8, 0, t);
    }

    // ─── Helpers ────────────────────────────────────────────────────
    function emitReady(cue) {
      const msg = { type: 'cinema:ready', cue: cue || '', timestamp: Date.now() };
      if (window.parent !== window) window.parent.postMessage(msg, '*');
      window.dispatchEvent(new CustomEvent('cinema-ready', { detail: msg }));
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    function easeInOut(t) { return t * t * (3 - 2 * t); }

    function easeOut(t) { return 1 - (1 - t) * (1 - t); }

    // Set camera to look at a target point
    function lookAt(pos, target) {
      camera.position.set(pos.x, pos.y, pos.z);
      camera.lookAt(target.x, target.y, target.z);
    }

    // ─── Entry Sequence Keyframes ───────────────────────────────────
    // All times in seconds, positions in meters, angles in radians
    const ENTRY = {
      // Phase 1: Overhead — bird's eye of hexagonal atrium
      overhead: { start: 0, end: 2.0 },
      // Phase 2: Orbit — half rotation around Y axis
      spin:     { start: 2.0, end: 5.0 },
      // Phase 3: Descend — swoop down from above
      descend:  { start: 5.0, end: 8.0 },
      // Phase 4: Tilt — pivot from looking down to looking forward
      tilt:     { start: 8.0, end: 9.5 },
      // Phase 5: Walk — 4 steps toward podium with head bob
      walk:     { start: 9.5, end: 12.5 },
      // Phase 6: Look down + scroll reveal
      reveal:   { start: 12.5, end: 15.0 },
      // Phase 7: Hold — final frame
      hold:     { start: 15.0, end: 17.0 },
    };

    const TOTAL_DURATION = ENTRY.hold.end;
    const STEP_COUNT = 4;
    const STEP_DURATION = (ENTRY.walk.end - ENTRY.walk.start) / STEP_COUNT;
    const HEAD_BOB_AMP = 0.04; // meters
    const ORBIT_RADIUS = 4.0;
    const OVERHEAD_HEIGHT = 14;
    const APPROACH_START_Z = 3.5; // where camera lands after descent
    const APPROACH_END_Z = 1.0;   // final position near podium
    const EYE_HEIGHT = 1.7;

    // Target point (podium top)
    const PODIUM_TOP = new THREE.Vector3(0, 0.88, 0);
    const PODIUM_CENTER = new THREE.Vector3(0, 0.5, 0);
    const ORIGIN = new THREE.Vector3(0, 0, 0);

    function updateEntryCamera(t) {
      if (t <= ENTRY.overhead.end) {
        // Phase 1: Static overhead — aerial mode ON
        setAerialMode(true);
        lookAt(
          { x: 0, y: OVERHEAD_HEIGHT, z: 0.01 },
          { x: 0, y: 0, z: 0 }
        );

      } else if (t <= ENTRY.spin.end) {
        // Phase 2: Orbit — still aerial
        setAerialMode(true);
        const p = easeInOut((t - ENTRY.spin.start) / (ENTRY.spin.end - ENTRY.spin.start));
        const angle = p * Math.PI; // half rotation
        const cx = Math.sin(angle) * ORBIT_RADIUS;
        const cz = Math.cos(angle) * ORBIT_RADIUS;
        // Slight descent during spin
        const h = lerp(OVERHEAD_HEIGHT, OVERHEAD_HEIGHT * 0.8, p);
        lookAt(
          { x: cx, y: h, z: cz },
          { x: 0, y: 0, z: 0 }
        );

      } else if (t <= ENTRY.descend.end) {
        // Phase 3: Descend — transition from aerial to grounded
        const p = easeInOut((t - ENTRY.descend.start) / (ENTRY.descend.end - ENTRY.descend.start));
        setAerialMode(false, p); // blend from aerial (0) to grounded (1)
        // Orbit ended at angle=π → position (0, h, -ORBIT_RADIUS)
        // Descend to (0, EYE_HEIGHT+1, APPROACH_START_Z)
        const startPos = { x: 0, y: OVERHEAD_HEIGHT * 0.8, z: -ORBIT_RADIUS };
        const endPos = { x: 0, y: EYE_HEIGHT + 1.0, z: APPROACH_START_Z };
        const cx = lerp(startPos.x, endPos.x, p);
        const cy = lerp(startPos.y, endPos.y, p);
        const cz = lerp(startPos.z, endPos.z, p);
        // Look target transitions from origin to podium top
        const tx = 0;
        const ty = lerp(0, PODIUM_TOP.y, p);
        const tz = lerp(0, 0, p);
        lookAt({ x: cx, y: cy, z: cz }, { x: tx, y: ty, z: tz });

      } else if (t <= ENTRY.tilt.end) {
        // Phase 4: Tilt — fully grounded
        setAerialMode(false, 1);
        const p = easeOut((t - ENTRY.tilt.start) / (ENTRY.tilt.end - ENTRY.tilt.start));
        const cy = lerp(EYE_HEIGHT + 1.0, EYE_HEIGHT, p);
        lookAt(
          { x: 0, y: cy, z: APPROACH_START_Z },
          { x: 0, y: lerp(PODIUM_TOP.y, PODIUM_TOP.y + 0.3, p), z: 0 }
        );

      } else if (t <= ENTRY.walk.end) {
        // Phase 5: Walk — 4 steps toward podium with head bob
        const walkT = t - ENTRY.walk.start;
        const p = walkT / (ENTRY.walk.end - ENTRY.walk.start);
        const z = lerp(APPROACH_START_Z, APPROACH_END_Z, easeInOut(p));

        // Head bob: sinusoidal per step
        const stepPhase = (walkT / STEP_DURATION) * Math.PI * 2;
        const bob = Math.abs(Math.sin(stepPhase)) * HEAD_BOB_AMP;
        // Slight lateral sway
        const sway = Math.sin(stepPhase * 0.5) * 0.015;

        lookAt(
          { x: sway, y: EYE_HEIGHT + bob, z: z },
          { x: 0, y: PODIUM_TOP.y + 0.2, z: 0 }
        );

      } else if (t <= ENTRY.reveal.end) {
        // Phase 6: Look down at podium + scroll reveal
        const p = easeInOut((t - ENTRY.reveal.start) / (ENTRY.reveal.end - ENTRY.reveal.start));
        // Camera tilts down toward scroll
        const lookY = lerp(PODIUM_TOP.y + 0.2, PODIUM_TOP.y - 0.1, p);
        lookAt(
          { x: 0, y: EYE_HEIGHT, z: APPROACH_END_Z },
          { x: 0, y: lookY, z: 0 }
        );
        // Scroll fades in
        if (scrollMesh) {
          scrollMesh.material.opacity = easeInOut(p);
          scrollMesh.material.transparent = true;
        }

      } else {
        // Phase 7: Hold — static final frame
        lookAt(
          { x: 0, y: EYE_HEIGHT, z: APPROACH_END_Z },
          { x: 0, y: PODIUM_TOP.y - 0.1, z: 0 }
        );
        if (scrollMesh) {
          scrollMesh.material.opacity = 1.0;
          scrollMesh.material.transparent = false;
        }
      }
    }

    // ─── Static Pose Command ────────────────────────────────────────
    function applyPose(params) {
      const [x, y, z] = (params.pos || '0,1.7,0').split(',').map(Number);
      const pitch = (params.pitch || 0) * Math.PI / 180;
      const yaw = (params.yaw || 0) * Math.PI / 180;

      camera.position.set(x, y, z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
    }

    // ─── Exhibit View Command ───────────────────────────────────────
    function applyExhibit(index) {
      const NUM_SPOKES = 6;
      const ATRIUM_R = 6;
      const CORR_LEN = 8;
      const ALCOVE_D = 6;
      const angle = (index * Math.PI * 2) / NUM_SPOKES;
      // Stand at corridor midpoint
      const dist = ATRIUM_R + CORR_LEN * 0.5;
      const x = Math.sin(angle) * dist;
      const z = Math.cos(angle) * dist;
      // Look toward alcove
      const targetDist = ATRIUM_R + CORR_LEN + ALCOVE_D * 0.5;
      const tx = Math.sin(angle) * targetDist;
      const tz = Math.cos(angle) * targetDist;

      lookAt(
        { x, y: EYE_HEIGHT, z },
        { x: tx, y: EYE_HEIGHT, z: tz }
      );
    }

    // ─── Hash Command Parser ────────────────────────────────────────
    function parseHash() {
      const hash = window.location.hash;
      if (!hash || !hash.startsWith('#cinema/')) return null;

      const parts = hash.slice(8).split('/'); // strip '#cinema/'
      const command = parts[0];

      // Parse key:value params
      const params = {};
      for (let i = 1; i < parts.length; i++) {
        const kv = parts[i].split(':');
        if (kv.length === 2) {
          params[kv[0]] = parseFloat(kv[1]) || kv[1];
        } else {
          params.pos = parts[i]; // positional arg
        }
      }
      params.hold = params.hold || 500;

      return { command, params };
    }

    // ─── Command Dispatch ───────────────────────────────────────────
    function dispatch(parsed) {
      if (!parsed) {
        // No hash command — default to clear
        camera.position.set(0, EYE_HEIGHT, 0);
        camera.lookAt(0, EYE_HEIGHT, 1);
        requestAnimationFrame(() => emitReady('default'));
        return;
      }

      const { command, params } = parsed;

      switch (command) {
        case 'entry':
          runEntrySequence(params);
          break;

        case 'pose':
          applyPose(params);
          setTimeout(() => emitReady('pose'), params.hold);
          break;

        case 'exhibit': {
          const idx = parseInt(params.pos, 10) || 0;
          applyExhibit(idx);
          setTimeout(() => emitReady(`exhibit/${idx}`), params.hold);
          break;
        }

        case 'reveal':
          if (params.pos === 'scroll' && scrollMesh) {
            scrollMesh.material.transparent = true;
            scrollMesh.material.opacity = 0;
            const start = performance.now();
            const dur = 2000;
            (function fadeIn() {
              const p = Math.min(1, (performance.now() - start) / dur);
              scrollMesh.material.opacity = easeInOut(p);
              if (p < 1) {
                requestAnimationFrame(fadeIn);
              } else {
                scrollMesh.material.transparent = false;
                emitReady('reveal/scroll');
              }
            })();
          } else {
            emitReady('reveal');
          }
          break;

        case 'clear':
          camera.position.set(0, EYE_HEIGHT, 0);
          camera.lookAt(0, EYE_HEIGHT, 1);
          if (scrollMesh) {
            scrollMesh.material.opacity = 1;
            scrollMesh.material.transparent = false;
          }
          requestAnimationFrame(() => emitReady('clear'));
          break;

        default:
          console.warn(`[cinema] unknown command: ${command}`);
          emitReady(command);
      }
    }

    // ─── Entry Sequence Runner ──────────────────────────────────────
    function runEntrySequence(params) {
      // Hide scroll initially
      if (scrollMesh) {
        scrollMesh.material.transparent = true;
        scrollMesh.material.opacity = 0;
      }

      const fps = params.fps || 30;
      const frameDuration = 1000 / fps;
      let frame = 0;
      const totalFrames = Math.ceil(TOTAL_DURATION * fps);

      // Determine if we're being driven frame-by-frame by Remotion
      // or self-animating for preview/testing
      const selfAnimate = !params.driven;

      if (selfAnimate) {
        // Self-animate for browser preview
        const startTime = performance.now();
        (function tick() {
          const elapsed = (performance.now() - startTime) / 1000;
          if (elapsed >= TOTAL_DURATION) {
            updateEntryCamera(TOTAL_DURATION);
            emitReady('entry');
            return;
          }
          updateEntryCamera(elapsed);
          requestAnimationFrame(tick);
        })();
      } else {
        // Frame-driven mode: listen for cinema:frame messages from parent
        updateEntryCamera(0);
        window.addEventListener('message', function onFrame(e) {
          if (e.data?.type === 'cinema:frame') {
            const t = e.data.frame / fps;
            updateEntryCamera(Math.min(t, TOTAL_DURATION));
            requestAnimationFrame(() => emitReady(`entry/frame:${e.data.frame}`));
            if (t >= TOTAL_DURATION) {
              window.removeEventListener('message', onFrame);
            }
          }
        });
        // Signal first frame ready
        requestAnimationFrame(() => emitReady('entry/frame:0'));
      }
    }

    // ─── Listen for hash changes (Remotion may update hash per cue) ─
    window.addEventListener('hashchange', () => {
      dispatch(parseHash());
    });

    // ─── Initial dispatch ───────────────────────────────────────────
    // Wait one frame for scene to fully render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dispatch(parseHash());
      });
    });

    console.log('[cinema] Oz Archive cinema mode initialized');
  }

  // Handle race: oz:ready may have already fired (init() is sync in cinema mode)
  if (window.__ozarchive) {
    onReady();
  } else {
    window.addEventListener('oz:ready', onReady);
  }
}
