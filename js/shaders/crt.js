// ─── CRT Post-Processing Shader ─────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  CRT_SCANLINE_INTENSITY, CRT_BARREL_DISTORTION,
  CRT_CHROMATIC_ABERRATION, CRT_VIGNETTE_INTENSITY,
  CRT_FLICKER_INTENSITY, CRT_NOISE_INTENSITY, CRT_GREEN_TINT,
} from '../config.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const CRTShader = {
  uniforms: {
    tDiffuse:    { value: null },
    time:        { value: 0.0 },
    scanlines:   { value: CRT_SCANLINE_INTENSITY },
    barrel:      { value: CRT_BARREL_DISTORTION },
    chromatic:   { value: CRT_CHROMATIC_ABERRATION },
    vignette:    { value: CRT_VIGNETTE_INTENSITY },
    flicker:     { value: CRT_FLICKER_INTENSITY },
    noise:       { value: CRT_NOISE_INTENSITY },
    greenTint:   { value: CRT_GREEN_TINT },
    resolution:  { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float scanlines;
    uniform float barrel;
    uniform float chromatic;
    uniform float vignette;
    uniform float flicker;
    uniform float noise;
    uniform float greenTint;
    uniform vec2 resolution;
    varying vec2 vUv;

    vec2 barrelDistort(vec2 uv) {
      vec2 cc = uv - 0.5;
      float dist = dot(cc, cc);
      return uv + cc * dist * barrel;
    }

    void main() {
      vec2 uv = barrelDistort(vUv);

      // Chromatic aberration
      float r = texture2D(tDiffuse, uv + vec2(chromatic, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(chromatic, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // Scanlines
      float scanline = sin(uv.y * resolution.y * 1.5) * 0.5 + 0.5;
      color *= 1.0 - scanlines * (1.0 - scanline);

      // Flicker
      color *= 1.0 - flicker * sin(time * 8.0);

      // Vignette
      vec2 vig = uv * (1.0 - uv);
      float vigFactor = vig.x * vig.y * 15.0;
      vigFactor = pow(vigFactor, vignette);
      color *= vigFactor;

      // Film grain / static noise
      float grain = fract(sin(dot(uv * resolution + time * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
      color += (grain - 0.5) * noise;

      // Terminal green tint
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 greenMono = vec3(luma * 0.2, luma * 1.0, luma * 0.3);
      color = mix(color, greenMono, greenTint);

      // Clamp out-of-bounds from barrel distortion
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        color = vec3(0.0);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

let composer = null;
let crtPass = null;
let crtEnabled = false;

let bloomPass = null;

export function createComposer(renderer, scene, camera, mobile = false) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Phosphor bloom — bright areas (screens, emissives) glow through CRT
  if (!mobile) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3,    // strength
      0.4,    // radius
      0.85    // threshold — only bright pixels bloom
    );
    composer.addPass(bloomPass);
  }

  window.addEventListener('resize', () => {
    composer.setSize(window.innerWidth, window.innerHeight);
    if (bloomPass) bloomPass.resolution.set(window.innerWidth, window.innerHeight);
  });

  return composer;
}

export function updateCRT(time) {
  if (crtPass) {
    crtPass.uniforms.time.value = time;
  }
}

export function toggleCRT() {
  crtEnabled = !crtEnabled;
  if (crtPass) crtPass.enabled = crtEnabled;
  return crtEnabled;
}

export function isCRTEnabled() {
  return crtEnabled;
}

export function startCRTWarmup() {
  if (!crtPass) return;
  // Start with heavy CRT effects, ease down to normal values
  crtPass.uniforms.vignette.value = 0.7;
  crtPass.uniforms.scanlines.value = 0.4;
  crtPass.uniforms.chromatic.value = 0.02;

  const startTime = performance.now();
  const duration = 2000;

  function ease(t) { return t * t * (3 - 2 * t); }

  function warmup() {
    const t = Math.min((performance.now() - startTime) / duration, 1);
    const e = ease(t);
    crtPass.uniforms.vignette.value = 0.7 - e * (0.7 - CRT_VIGNETTE_INTENSITY);
    crtPass.uniforms.scanlines.value = 0.4 - e * (0.4 - CRT_SCANLINE_INTENSITY);
    crtPass.uniforms.chromatic.value = 0.02 - e * (0.02 - CRT_CHROMATIC_ABERRATION);
    if (t < 1) requestAnimationFrame(warmup);
  }
  requestAnimationFrame(warmup);
}

export function renderComposer() {
  if (composer) composer.render();
}
