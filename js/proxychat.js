// ─── PROXYCHAT — Archive Curator Interface ──────────────────────────
// Self-contained ES6 module. Creates DOM, manages state, handles API.
// Usage: import { initProxyChat, toggleProxyChat } from './proxychat.js';

// ─── Configuration ──────────────────────────────────────────────────

const PROXYCHAT_API_URL = 'https://proxychat-api.qav2.workers.dev';
const MAX_MSG_LENGTH = 500;
const TYPEWRITER_DELAY = 25; // ms per character
const BOOT_MESSAGES = [
  { text: 'LOADING PROXYCHAT...', isSystem: true },
  { text: 'PROXYCHAT v1.0 ONLINE', isSystem: true },
  { text: "I'm PROXYCHAT — the proxy voice for the architect of this archive. I know every exhibit, every project, every connection. I'm a program, and I'm here to help you find what you're looking for.", isProxy: true },
];

// ─── State ──────────────────────────────────────────────────────────

let isOpen = false;
let isThinking = false;
let hasBooted = false;
let isAnimating = false;
let history = []; // { role: 'user'|'assistant', content: string }
let contextProviderFn = null; // injected by main.js

// DOM references
let container = null;
let messagesEl = null;
let inputEl = null;
let charCountEl = null;
let statusDot = null;
let statusText = null;

// ─── DOM Construction ───────────────────────────────────────────────

function buildDOM() {
  // Inject stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/proxychat.css';
  document.head.appendChild(link);

  // Main container
  container = document.createElement('div');
  container.id = 'proxychat-container';
  container.style.display = 'none';

  // Prevent clicks/touches from propagating to the game canvas
  container.addEventListener('mousedown', (e) => e.stopPropagation());
  container.addEventListener('click', (e) => e.stopPropagation());
  container.addEventListener('touchstart', (e) => e.stopPropagation());
  container.addEventListener('touchmove', (e) => e.stopPropagation());
  container.addEventListener('touchend', (e) => e.stopPropagation());

  // ── Header ──
  const header = document.createElement('div');
  header.id = 'proxychat-header';

  const title = document.createElement('span');
  title.id = 'proxychat-header-title';
  title.textContent = 'PROXYCHAT \u2014 ARCHIVE CURATOR';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'proxychat-close-btn';
  closeBtn.textContent = '\u00D7';
  closeBtn.title = 'Close (T or Esc)';
  closeBtn.addEventListener('click', () => closeProxyChat());

  header.appendChild(title);
  header.appendChild(closeBtn);

  // ── Status bar ──
  const status = document.createElement('div');
  status.id = 'proxychat-status';

  statusDot = document.createElement('div');
  statusDot.id = 'proxychat-status-dot';

  statusText = document.createElement('span');
  statusText.id = 'proxychat-status-text';
  statusText.textContent = 'CONNECTED';

  status.appendChild(statusDot);
  status.appendChild(statusText);

  // ── Messages area ──
  messagesEl = document.createElement('div');
  messagesEl.id = 'proxychat-messages';

  // ── Input area ──
  const inputArea = document.createElement('div');
  inputArea.id = 'proxychat-input-area';

  const prompt = document.createElement('span');
  prompt.id = 'proxychat-input-prompt';
  prompt.textContent = '>';

  inputEl = document.createElement('input');
  inputEl.id = 'proxychat-input';
  inputEl.type = 'text';
  inputEl.placeholder = 'Ask the curator...';
  inputEl.maxLength = MAX_MSG_LENGTH;
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;

  charCountEl = document.createElement('span');
  charCountEl.id = 'proxychat-char-count';

  const sendBtn = document.createElement('button');
  sendBtn.id = 'proxychat-send-btn';
  sendBtn.textContent = '>';
  sendBtn.title = 'Send';
  sendBtn.addEventListener('click', () => {
    if (isThinking) return;
    const text = inputEl.value.trim();
    if (text.length === 0) return;
    handleUserMessage(text);
  });

  inputArea.appendChild(prompt);
  inputArea.appendChild(inputEl);
  inputArea.appendChild(charCountEl);
  inputArea.appendChild(sendBtn);

  // ── Assemble ──
  container.appendChild(header);
  container.appendChild(status);
  container.appendChild(messagesEl);
  container.appendChild(inputArea);

  document.body.appendChild(container);

  // ── Input events ──
  inputEl.addEventListener('keydown', onInputKeydown);
  inputEl.addEventListener('input', onInputChange);

  // Prevent game keys from firing while typing in chat
  inputEl.addEventListener('keydown', (e) => e.stopPropagation());
  inputEl.addEventListener('keyup', (e) => e.stopPropagation());
  inputEl.addEventListener('keypress', (e) => e.stopPropagation());
}

// ─── Input Handlers ─────────────────────────────────────────────────

function onInputKeydown(e) {
  if (e.key === 'Enter' && !isThinking) {
    const text = inputEl.value.trim();
    if (text.length === 0) return;
    handleUserMessage(text);
  }
}

function onInputChange() {
  const len = inputEl.value.length;
  if (len > MAX_MSG_LENGTH * 0.8) {
    charCountEl.textContent = `${len}/${MAX_MSG_LENGTH}`;
    charCountEl.className = len >= MAX_MSG_LENGTH ? 'pc-char-limit' : 'pc-char-warn';
  } else {
    charCountEl.textContent = '';
    charCountEl.className = '';
  }
}

// ─── Global Key Binding ─────────────────────────────────────────────

function onGlobalKey(e) {
  // T key toggles — only when pointer is NOT locked
  if (e.code === 'KeyT' && !isPointerLocked() && !isInputFocused()) {
    e.preventDefault();
    toggleProxyChat();
    return;
  }

  // Escape closes (only if open and no overlay is active)
  if (e.code === 'Escape' && isOpen) {
    const overlayPanel = document.getElementById('overlay-panel');
    if (overlayPanel && overlayPanel.style.display === 'flex') return;
    e.preventDefault();
    closeProxyChat();
  }
}

function isPointerLocked() {
  return !!document.pointerLockElement;
}

function isInputFocused() {
  const active = document.activeElement;
  return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
}

// ─── Open / Close ───────────────────────────────────────────────────

function openProxyChat() {
  if (isOpen || isAnimating) return;
  isAnimating = true;
  isOpen = true;

  container.style.display = 'flex';
  container.classList.remove('pc-closing');
  container.classList.add('pc-opening');

  setTimeout(() => {
    container.classList.remove('pc-opening');
    isAnimating = false;
    inputEl.focus();
  }, 260);

  if (!hasBooted) {
    hasBooted = true;
    runBootSequence();
  }
}

function closeProxyChat() {
  if (!isOpen || isAnimating) return;
  isAnimating = true;
  isOpen = false;

  container.classList.remove('pc-opening');
  container.classList.add('pc-closing');
  inputEl.blur();

  setTimeout(() => {
    container.style.display = 'none';
    container.classList.remove('pc-closing');
    isAnimating = false;
  }, 220);
}

// ─── Boot Sequence ──────────────────────────────────────────────────

async function runBootSequence() {
  setStatus('connected');
  for (const msg of BOOT_MESSAGES) {
    if (msg.isSystem) {
      await appendSystemMessage(msg.text);
    } else if (msg.isProxy) {
      await appendProxyMessage(msg.text);
    }
    await sleep(300);
  }
}

// ─── Message Rendering ──────────────────────────────────────────────

function appendUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'pc-msg pc-msg-user';

  const prefix = document.createElement('span');
  prefix.className = 'pc-msg-prefix';
  prefix.textContent = '> ';

  el.appendChild(prefix);
  el.appendChild(document.createTextNode(text));
  messagesEl.appendChild(el);
  scrollToBottom();
}

function appendProxyMessage(text) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'pc-msg pc-msg-proxy';

    const prefix = document.createElement('span');
    prefix.className = 'pc-msg-prefix';
    prefix.textContent = 'PROXYCHAT: ';

    const body = document.createElement('span');
    body.className = 'pc-msg-body';

    el.appendChild(prefix);
    el.appendChild(body);
    messagesEl.appendChild(el);
    scrollToBottom();

    typewriter(body, text, resolve);
  });
}

function appendSystemMessage(text) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'pc-msg pc-msg-system';
    messagesEl.appendChild(el);
    scrollToBottom();
    typewriter(el, text, resolve);
  });
}

function appendErrorMessage(text) {
  const el = document.createElement('div');
  el.className = 'pc-msg pc-msg-proxy pc-msg-error';

  const prefix = document.createElement('span');
  prefix.className = 'pc-msg-prefix';
  prefix.textContent = 'PROXYCHAT: ';

  el.appendChild(prefix);
  el.appendChild(document.createTextNode(text));
  messagesEl.appendChild(el);
  scrollToBottom();
}

function typewriter(el, text, onComplete) {
  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
      scrollToBottom();
    } else {
      clearInterval(interval);
      if (onComplete) onComplete();
    }
  }, TYPEWRITER_DELAY);
}

function showThinkingIndicator() {
  const el = document.createElement('div');
  el.className = 'pc-msg pc-msg-proxy';

  const prefix = document.createElement('span');
  prefix.className = 'pc-msg-prefix';
  prefix.textContent = 'PROXYCHAT: ';

  const dots = document.createElement('span');
  dots.className = 'pc-thinking-dots';
  dots.innerHTML = '<span>.</span><span>.</span><span>.</span>';

  el.appendChild(prefix);
  el.appendChild(dots);
  messagesEl.appendChild(el);
  scrollToBottom();

  return {
    remove: () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ─── Status Management ──────────────────────────────────────────────

function setStatus(state) {
  statusDot.className = '';
  switch (state) {
    case 'thinking':
      statusDot.classList.add('thinking');
      statusText.textContent = 'THINKING';
      break;
    case 'offline':
      statusDot.classList.add('offline');
      statusText.textContent = 'OFFLINE';
      break;
    default:
      statusText.textContent = 'CONNECTED';
      break;
  }
}

// ─── Message Handling ───────────────────────────────────────────────

async function handleUserMessage(text) {
  appendUserMessage(text);
  inputEl.value = '';
  charCountEl.textContent = '';
  charCountEl.className = '';

  history.push({ role: 'user', content: text });

  await sendMessage(text);
}

async function sendMessage(text) {
  isThinking = true;
  inputEl.disabled = true;
  setStatus('thinking');

  const indicator = showThinkingIndicator();

  try {
    if (!PROXYCHAT_API_URL) {
      await sleep(800);
      indicator.remove();
      const fallback = "I'm not connected to a server yet — my endpoint hasn't been configured. Once Joseph finishes the backend wiring, I'll be fully operational. In the meantime, feel free to explore the museum. Press Escape to close this window.";
      await appendProxyMessage(fallback);
      history.push({ role: 'assistant', content: fallback });
      setStatus('offline');
      return;
    }

    // Capture user's location in the museum for spatial context
    let nearExhibit = null;
    try { nearExhibit = contextProviderFn ? contextProviderFn() : null; } catch (_) { /* not available */ }

    const res = await fetch(PROXYCHAT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: history.slice(-20),
        context: nearExhibit ? { nearExhibit } : { nearExhibit: null },
      }),
    });

    indicator.remove();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const reply = data.response || data.message || 'No response received.';

    await appendProxyMessage(reply);
    history.push({ role: 'assistant', content: reply });
    setStatus('connected');
  } catch (err) {
    indicator.remove();
    appendErrorMessage('[CONNECTION LOST] Unable to reach server. Try again.');
    setStatus('offline');
    console.warn('[PROXYCHAT] API error:', err);
  } finally {
    isThinking = false;
    inputEl.disabled = false;
    if (isOpen) inputEl.focus();
  }
}

// ─── Utilities ──────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ─────────────────────────────────────────────────────

export function initProxyChat(contextProvider) {
  contextProviderFn = contextProvider || null;
  buildDOM();
  document.addEventListener('keydown', onGlobalKey);
}

export { openProxyChat, closeProxyChat };

export function isProxyChatOpen() { return isOpen; }

export function toggleProxyChat() {
  if (isOpen) {
    closeProxyChat();
  } else {
    openProxyChat();
  }
}
