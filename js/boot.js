// ─── Boot Screen Typewriter Animation ───────────────────────────────
import {
  BOOT_LINES, BOOT_CHAR_DELAY, PROGRESS_STEPS, PROGRESS_STEP_DELAY,
} from './config.js';

let bootContainer = null;
let resolveReady = null;
let mobileMode = false;

// Returns a promise that resolves when the user presses Enter (or taps on mobile)
export function runBootSequence(isMobile = false) {
  mobileMode = isMobile;
  return new Promise((resolve) => {
    resolveReady = resolve;
    bootContainer = document.getElementById('boot-text');
    if (!bootContainer) { resolve(); return; }
    typeLines(0);
  });
}

async function typeLines(index) {
  if (index >= BOOT_LINES.length) return;

  const line = BOOT_LINES[index];

  if (line.type === 'progress') {
    await typeProgressBar();
    typeLines(index + 1);
    return;
  }

  if (line.type === 'prompt') {
    await delay(line.delay);
    const el = addLine('');
    el.classList.add('prompt-line', 'blink-cursor');
    const promptText = mobileMode ? '> TAP TO ENTER ARCHIVE_' : line.text;
    await typeText(el, promptText, BOOT_CHAR_DELAY);
    waitForEnter();
    return;
  }

  await delay(line.delay);
  const el = addLine('');
  await typeText(el, line.text, BOOT_CHAR_DELAY);
  typeLines(index + 1);
}

async function typeProgressBar() {
  const el = addLine('');
  let bar = '';
  for (let i = 0; i < PROGRESS_STEPS; i++) {
    await delay(PROGRESS_STEP_DELAY);
    bar += '\u2588'; // full block
    const pct = Math.round(((i + 1) / PROGRESS_STEPS) * 100);
    el.textContent = `LOADING EXHIBITS [6] ... ${bar}${'░'.repeat(PROGRESS_STEPS - i - 1)} ${pct}%`;
  }
}

function addLine(text) {
  const div = document.createElement('div');
  div.className = 'boot-line';
  div.textContent = text;
  bootContainer.appendChild(div);
  // Auto-scroll
  bootContainer.scrollTop = bootContainer.scrollHeight;
  return div;
}

async function typeText(el, text, charDelay) {
  for (let i = 0; i < text.length; i++) {
    el.textContent = text.slice(0, i + 1);
    await delay(charDelay);
  }
}

function waitForEnter() {
  if (mobileMode) {
    const handler = () => {
      document.removeEventListener('touchstart', handler);
      if (resolveReady) resolveReady();
    };
    document.addEventListener('touchstart', handler);
  } else {
    const handler = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        document.removeEventListener('keydown', handler);
        if (resolveReady) resolveReady();
      }
    };
    document.addEventListener('keydown', handler);
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function hideBootScreen() {
  const boot = document.getElementById('boot-screen');
  if (boot) {
    boot.style.transition = 'opacity 0.5s';
    boot.style.opacity = '0';
    setTimeout(() => { boot.style.display = 'none'; }, 500);
  }
}
