// ─── Oz Archive Configuration ───────────────────────────────────────
// All constants in one place. No magic numbers elsewhere.

// ─── Layout ─────────────────────────────────────────────────────────
export const ATRIUM_RADIUS = 6;          // hex inscribed radius (center to mid-wall) in meters
export const ATRIUM_OUTER = 6.93;        // circumscribed radius (center to vertex) ≈ R / cos(30°)
export const CEILING_HEIGHT = 3.5;
export const CORRIDOR_LENGTH = 8;
export const CORRIDOR_WIDTH = 4;
export const WALL_THICKNESS = 0.3;
export const ALCOVE_DEPTH = 6;
export const ALCOVE_WIDTH = 6;
export const NUM_SPOKES = 6;

// ─── Player ─────────────────────────────────────────────────────────
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_SPEED = 5;           // m/s
export const MOUSE_SENSITIVITY = 0.002;
export const PLAYER_RADIUS = 0.3;        // collision capsule radius

// ─── Interaction ────────────────────────────────────────────────────
export const INTERACT_RANGE = 4;         // meters
export const EMISSIVE_PULSE_SPEED = 2;   // Hz

// ─── Colors ─────────────────────────────────────────────────────────
export const COLORS = {
  void:         0x08080f,
  walls:        0x5a5570,
  wallEmissive: 0x2a2540,
  floor:        0x484360,
  ceiling:      0x6a6580,
  termGreen:    0x00ff41,
  evidGreen:    0x34d399,
  evidAmber:    0xfbbf24,
  cyan:         0x0abdc6,
  fog:          0x0c0b14,
  ambient:      0x554840,
};

export const CSS_COLORS = {
  void:       '#08080f',
  termGreen:  '#00ff41',
  evidGreen:  '#34d399',
  evidAmber:  '#fbbf24',
  cyan:       '#0abdc6',
  textPrimary:'rgba(255,255,255,0.92)',
  walls:      '#5a5570',
};

// ─── Exhibit Data ───────────────────────────────────────────────────
export const EXHIBITS = [
  {
    id: 'disclosure',
    name: 'Disclosure Files',
    description: 'Interactive intelligence map — public investigations, documented connections, and primary-source evidence across global power structures.',
    url: 'https://qav2.github.io/disclosure-files/',
    action: 'link',
    texture: 'textures/exhibit-disclosure.png',
    lightColor: 0x34d399,
    lightColorCSS: '#34d399',
    type: 'screen',
  },
  {
    id: 'qa',
    name: 'Qualia Algebra',
    description: 'Ontological framework derived from "I exist." Interactive mind map — consciousness as fundamental, quaternion structure, and 3D spatial emergence.',
    url: 'https://qav2.github.io/qualia-algebra/',
    action: 'link',
    texture: 'textures/exhibit-sanctum.png',
    lightColor: 0xfbbf24,
    lightColorCSS: '#fbbf24',
    type: 'qa',
  },
  {
    id: 'intel',
    name: 'Intel Console',
    description: 'Civilian OSINT dashboard — 825 entities, 1,411 relationships, 1,260 sources. 11 thematic branches, branch directory navigator, photo dossiers, and evidence-tiered relationship graphs.',
    url: 'https://qav2.github.io/intel-console/',
    action: 'link',
    texture: 'textures/exhibit-intel.png',
    lightColor: 0x4488ff,
    lightColorCSS: '#4488ff',
    type: 'crt',
  },
  {
    id: 'physics',
    name: 'Suppressed Physics',
    description: 'MHD/PIC simulation workspace — 21 experiments testing RS2 predictions against standard physics. Mercury vortex dynamics, plasma rotation, Faraday induction.',
    url: 'https://qav2.github.io/suppressed-physics-map/',
    action: 'link',
    texture: 'textures/exhibit-physics.png',
    lightColor: 0xaa44ff,
    lightColorCSS: '#aa44ff',
    type: 'lab',
  },
  {
    id: 'youtube',
    name: 'YouTube Pipeline',
    description: 'Disclosure Files channel — long-form documentary episodes. AI-assisted research extraction, scripted narration, and visual production pipeline.',
    url: 'https://www.youtube.com/@jrvh2389',
    action: 'link',
    texture: 'textures/exhibit-youtube.png',
    lightColor: 0xff4444,
    lightColorCSS: '#ff4444',
    type: 'carousel',
  },
  {
    id: 'iceberg',
    name: 'Iceberg Index',
    description: 'Grassroots YouTube archive — 3,684 videos indexed across 16 categories. Suppressed physics, UAP disclosure, consciousness research, black projects. 2,920 transcripts, 11.6M words captured.',
    url: 'https://qav2.github.io/youtube-iceberg/',
    action: 'link',
    texture: 'textures/exhibit-games.png',
    lightColor: 0x40c8ff,
    lightColorCSS: '#40c8ff',
    type: 'iceberg',
  },
];

// ─── Boot Sequence ──────────────────────────────────────────────────
export const BOOT_LINES = [
  { text: 'BIOS v1.0.3 ... OK', delay: 400 },
  { text: 'MEM CHECK ... 640K ... OK', delay: 600 },
  { text: 'MOUNTING /dev/archive ... OK', delay: 500 },
  { text: 'LOADING EXHIBITS [6] ...', delay: 300 },
  { text: null, delay: 1200, type: 'progress' },  // progress bar
  { text: '', delay: 400 },
  { text: '> PRESS ENTER TO ACCESS ARCHIVE_', delay: 0, type: 'prompt' },
];

export const BOOT_CHAR_DELAY = 30;  // ms per character for typewriter
export const PROGRESS_STEPS = 16;
export const PROGRESS_STEP_DELAY = 60;

// ─── Door Animation ─────────────────────────────────────────────────
export const DOOR_SLIDE_DURATION = 1.5;  // seconds
export const DOOR_AUTO_ADVANCE = 2.0;    // meters to move forward after door opens

// ─── CRT Shader ─────────────────────────────────────────────────────
export const CRT_SCANLINE_INTENSITY = 0.06;
export const CRT_BARREL_DISTORTION = 0.02;
export const CRT_CHROMATIC_ABERRATION = 0.003;
export const CRT_VIGNETTE_INTENSITY = 0.15;
export const CRT_FLICKER_INTENSITY = 0.015;
