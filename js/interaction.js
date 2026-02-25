// ─── Proximity Detection + Info Panels + Click/E-Key Handlers ──────
import * as THREE from 'three';
import { INTERACT_RANGE, EMISSIVE_PULSE_SPEED, EXHIBITS } from './config.js';
import { exhibitObjects } from './exhibits.js';
import { getCamera, isLocked } from './player.js';

let activeExhibit = null;
let infoPanel = null;
let overlayPanel = null;
let overlayActive = false;
let overlayClickBound = false;

export function initInteraction() {
  infoPanel = document.getElementById('info-panel');
  overlayPanel = document.getElementById('overlay-panel');

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && !overlayActive) {
      interact();
    }
    if (e.code === 'Escape' && overlayActive) {
      closeOverlay();
    }
  });

  document.addEventListener('click', () => {
    if (isLocked() && activeExhibit && !overlayActive) {
      interact();
    }
  });

  // Close overlay button
  const closeBtn = document.getElementById('overlay-close');
  if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
}

export function updateInteraction(time) {
  const cam = getCamera();
  if (!cam || overlayActive) return;

  let closest = null;
  let closestDist = Infinity;

  for (const exhibit of exhibitObjects) {
    const dist = cam.position.distanceTo(exhibit.worldPos);
    if (dist < INTERACT_RANGE && dist < closestDist) {
      closest = exhibit;
      closestDist = dist;
    }
  }

  // Reset previous highlight
  if (activeExhibit && activeExhibit !== closest) {
    setEmissive(activeExhibit, 0);
    hideInfo();
  }

  activeExhibit = closest;

  if (activeExhibit) {
    // Pulse emissive
    const pulse = 0.2 + Math.sin(time * EMISSIVE_PULSE_SPEED * Math.PI * 2) * 0.15;
    setEmissive(activeExhibit, pulse);
    showInfo(activeExhibit.data, closestDist);
  }
}

function setEmissive(exhibit, intensity) {
  exhibit.group.traverse((child) => {
    if (child.isMesh && child.material.emissive) {
      child.material.emissiveIntensity = intensity + (child.userData.float ? 0.3 : 0);
    }
  });
}

function showInfo(data, dist) {
  if (!infoPanel) return;
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    <div class="info-name" style="color: ${data.lightColorCSS}">${data.name}</div>
    <div class="info-desc">${data.description}</div>
    <div class="info-action">${data.action === 'link' ? '[E] Open in new tab' : '[E] View details'}</div>
  `;
}

function hideInfo() {
  if (infoPanel) infoPanel.style.display = 'none';
}

function interact() {
  if (!activeExhibit) return;
  triggerExhibitAction(exhibitObjects.indexOf(activeExhibit));
}

export function triggerExhibitAction(exhibitIndex) {
  const exhibit = exhibitObjects[exhibitIndex];
  if (!exhibit) return;
  const data = exhibit.data;

  if (data.action === 'link' && data.url) {
    window.open(data.url, '_blank');
  } else {
    showOverlay(data);
  }
}

function showOverlay(data) {
  if (!overlayPanel) overlayPanel = document.getElementById('overlay-panel');
  if (!overlayPanel) return;
  overlayActive = true;
  overlayPanel.style.display = 'flex';
  overlayPanel.innerHTML = `
    <div class="overlay-content">
      <div class="overlay-header" style="color: ${data.lightColorCSS}">
        <span class="overlay-title">${data.name}</span>
        <button class="overlay-close-btn" id="overlay-close-inner">&times;</button>
      </div>
      <div class="overlay-body">
        <p>${data.description}</p>
        ${data.url ? `<p class="overlay-link"><a href="${data.url}" target="_blank" style="color: ${data.lightColorCSS}">&gt; Open Project</a></p>` : ''}
        <p class="overlay-hint">Press ESC or tap X to close</p>
      </div>
    </div>
  `;
  document.getElementById('overlay-close-inner')?.addEventListener('click', closeOverlay);

  // Tap outside content to close (mobile-friendly) — bind once
  if (!overlayClickBound) {
    overlayClickBound = true;
    overlayPanel.addEventListener('click', (e) => {
      if (e.target === overlayPanel) closeOverlay();
    });
  }
}

export function closeOverlay() {
  if (!overlayPanel) overlayPanel = document.getElementById('overlay-panel');
  if (!overlayPanel) return;
  overlayActive = false;
  overlayPanel.style.display = 'none';
}

export function isOverlayActive() {
  return overlayActive;
}
