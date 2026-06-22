// ═══════════════════════════════════════════════════════════
// TUNING MODULE (shared)
// Handles standard GCEA and baritone DGBE tuning
// Depends on: music-theory.js (currentTuning, setTuning, isBaritone)
// ═══════════════════════════════════════════════════════════

/**
 * Render tuning toggle buttons into the specified container
 * @param {string} containerId - The ID of the container element
 * @param {function} onSwitchCallback - Optional callback when tuning is switched
 */
function renderTuningToggle(containerId, onSwitchCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <button type="button" class="tuning-btn" aria-pressed="${!isBaritone()}" data-tuning="standard">Standard</button>
    <button type="button" class="tuning-btn" aria-pressed="${isBaritone()}" data-tuning="baritone">Baritone</button>
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
 * @param {string} tuning - 'standard' or 'baritone'
 */
function switchTuning(tuning) {
  setTuning(tuning);
  // Re-render all tuning toggles on the page
  const toggleContainers = document.querySelectorAll('[id^="tuning-toggle"]');
  toggleContainers.forEach(container => {
    renderTuningToggle(container.id);
  });
}

/**
 * Initialize tuning from localStorage or default
 * Call this early in your page initialization
 */
function initTuning() {
  try {
    currentTuning = localStorage.getItem('uca-tuning') || 'standard';
  } catch (e) {
    // localStorage may be unavailable, use default
    currentTuning = 'standard';
  }
}

// Initialize tuning immediately if this module is loaded
document.addEventListener('DOMContentLoaded', initTuning);
