// ═══════════════════════════════════════════════════════════
// TUNING MODULE (resonator guitar)
// Handles Open D and Open Dm.
// Depends on: instrument.js (currentTuning, setTuning, initTuning)
// ═══════════════════════════════════════════════════════════

/**
 * Render tuning toggle buttons into the specified container
 * @param {string} containerId - The ID of the container element
 * @param {function} onSwitchCallback - Optional callback when tuning is switched
 */
function renderTuningToggle(containerId, onSwitchCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const t = currentTuning || DEFAULT_TUNING;

  container.innerHTML = `
    <button type="button" class="tuning-btn" aria-pressed="${t === 'openD'}" data-tuning="openD">Open D</button>
    <button type="button" class="tuning-btn" aria-pressed="${t === 'openDm'}" data-tuning="openDm">Open Dm</button>
  `;

  container.addEventListener('click', e => {
    const btn = e.target.closest('.tuning-btn');
    if (btn && btn.dataset.tuning) {
      switchTuning(btn.dataset.tuning);
      if (onSwitchCallback) onSwitchCallback();
    }
  });
}

/**
 * Switch to a different tuning
 * @param {string} id - 'openD' or 'openDm'
 */
function switchTuning(id) {
  setTuning(id);
  // Re-render all tuning toggles on the page
  const toggleContainers = document.querySelectorAll('[id^="tuning-toggle"]');
  toggleContainers.forEach(container => {
    renderTuningToggle(container.id);
  });
}

// Initialize tuning immediately if this module is loaded
document.addEventListener('DOMContentLoaded', initTuning);
