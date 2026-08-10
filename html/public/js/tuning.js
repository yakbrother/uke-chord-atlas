// ═══════════════════════════════════════════════════════════
// TUNING MODULE (shared)
// Renders the tuning toggle for every tuning in TUNINGS: standard GCEA and
// low-G, D tuning ADF#B in high-A and low-A, and baritone DGBE in low-D and
// high-D. Ordered low-to-high by instrument size.
// Depends on: music-theory.js (TUNINGS, currentTuning, setTuning)
// ═══════════════════════════════════════════════════════════

const TUNING_ORDER = [
  'standard', 'lowg',
  'dTuning', 'dTuningLowA',
  'baritone', 'baritoneHighD',
];

// Containers that have already had their delegated click listener attached.
// Re-rendering replaces innerHTML only, so the listener is bound exactly once
// per container no matter how many times the toggle is redrawn.
const wiredToggles = new WeakSet();
const toggleCallbacks = new WeakMap();

/**
 * Render tuning toggle buttons into the specified container
 * @param {string} containerId - The ID of the container element
 * @param {function} [onSwitchCallback] - Optional callback when tuning is switched
 */
function renderTuningToggle(containerId, onSwitchCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (onSwitchCallback) toggleCallbacks.set(container, onSwitchCallback);

  container.innerHTML = TUNING_ORDER.map(id => {
    const t = TUNINGS[id];
    return `<button type="button" class="tuning-btn" aria-pressed="${currentTuning === id}"
      data-tuning="${id}" title="${t.short}">${t.label}</button>`;
  }).join('');

  if (wiredToggles.has(container)) return;
  wiredToggles.add(container);

  container.addEventListener('click', e => {
    const btn = e.target.closest('.tuning-btn');
    if (!btn || !btn.dataset.tuning) return;

    switchTuning(btn.dataset.tuning);

    const cb = toggleCallbacks.get(container);
    if (cb) cb();
  });
}

/**
 * Switch to a different tuning and redraw every toggle on the page
 * @param {string} tuning - a key of TUNINGS
 */
function switchTuning(tuning) {
  setTuning(tuning);
  document.querySelectorAll('[id^="tuning-toggle"]').forEach(container => {
    renderTuningToggle(container.id);
  });
}

/**
 * Initialize tuning from localStorage or default
 * Call this early in your page initialization
 */
function initTuning() {
  try {
    // setTuning falls back to the default for unknown ids, so a stale or
    // hand-edited storage value can't leave the app in a broken tuning.
    setTuning(localStorage.getItem('uca-tuning') || DEFAULT_TUNING);
  } catch (e) {
    currentTuning = DEFAULT_TUNING;
  }
}

// Initialize tuning immediately if this module is loaded
document.addEventListener('DOMContentLoaded', initTuning);
