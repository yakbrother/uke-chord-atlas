// ═══════════════════════════════════════════════════════════
// CHORD IDENTIFIER PAGE (resonator guitar)
// Depends on: instrument.js, music-theory.js, theme.js, tuning.js
// ═══════════════════════════════════════════════════════════

// Current fret selection per string, low -> high. 0 = open, null = muted.
let selectedFrets = new Array(stringCount()).fill(0);

// ── URL State Management ───────────────────────────────────────────

/**
 * Parse URL search params and update fret selection.
 * `x` encodes a muted string (e.g. "x,0,2,2,x,0").
 */
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('frets')) {
    const fretsStr = params.get('frets');
    const parts = fretsStr.split(',');
    const n = stringCount();
    if (parts.length === n) {
      const frets = parts.map(p => (p === 'x' ? null : parseInt(p, 10)));
      if (frets.every(f => f === null || (!isNaN(f) && f >= 0 && f <= MAX_FRET))) {
        selectedFrets = frets;
      }
    }
  }
}

/**
 * Update URL to reflect current fret selection
 */
function updateUrl() {
  const params = new URLSearchParams();
  params.set('frets', selectedFrets.map(f => (f === null ? 'x' : f)).join(','));
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

// ── Fretboard SVG ───────────────────────────────────────────

// Guitar-style position markers (single dots + double dot at 12)
const SINGLE_MARKER_FRETS = [3, 5, 7, 9, 15, 17, 19];

function renderFretboard() {
  const STRINGS = stringCount();
  const FRETS = MAX_FRET;

  // Layout constants
  const leftMargin = 42;   // room for fret numbers
  const topMargin = 36;    // room for open-string note labels
  const cellW = 40;        // horizontal spacing between strings
  const cellH = 26;        // vertical spacing between frets
  const rightPad = 20;
  const bottomPad = 28;    // room for string names

  const gridW = (STRINGS - 1) * cellW;
  const gridH = FRETS * cellH;
  const W = leftMargin + gridW + rightPad;
  const H = topMargin + gridH + bottomPad;

  let svg = `<svg id="fretboard-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Interactive resonator guitar fretboard">`;

  // Background
  svg += `<rect class="fb-bg" x="0" y="0" width="${W}" height="${H}" rx="4"/>`;

  // Nut
  svg += `<rect class="fb-nut" x="${leftMargin - 2}" y="${topMargin - 4}" width="${gridW + 4}" height="5" rx="1"/>`;

  // Fret lines
  for (let f = 1; f <= FRETS; f++) {
    const y = topMargin + f * cellH;
    svg += `<line class="fb-fret-line" x1="${leftMargin}" y1="${y}" x2="${leftMargin + gridW}" y2="${y}"/>`;
  }

  // Strings
  for (let s = 0; s < STRINGS; s++) {
    const x = leftMargin + s * cellW;
    svg += `<line class="fb-string-line" x1="${x}" y1="${topMargin}" x2="${x}" y2="${topMargin + gridH}" stroke-width="${1.2 + s * 0.15}"/>`;
  }

  // Position dots (guitar markers)
  const midX = leftMargin + gridW / 2;
  for (const mf of SINGLE_MARKER_FRETS) {
    if (mf > FRETS) continue;
    const cy = topMargin + (mf - 0.5) * cellH;
    svg += `<circle class="fb-marker" cx="${midX}" cy="${cy}" r="4"/>`;
  }
  // Double dot at 12
  if (FRETS >= 12) {
    const cy12 = topMargin + (12 - 0.5) * cellH;
    svg += `<circle class="fb-marker" cx="${midX - 10}" cy="${cy12}" r="3.5"/>`;
    svg += `<circle class="fb-marker" cx="${midX + 10}" cy="${cy12}" r="3.5"/>`;
  }

  // Fret numbers on the left
  for (let f = 1; f <= FRETS; f++) {
    const cy = topMargin + (f - 0.5) * cellH;
    svg += `<text class="fb-fret-num" x="${leftMargin - 10}" y="${cy + 4}" text-anchor="end">${f}</text>`;
  }

  // String name labels at the bottom
  currentStringNames().forEach((name, s) => {
    const x = leftMargin + s * cellW;
    svg += `<text class="fb-string-name" x="${x}" y="${topMargin + gridH + 20}" text-anchor="middle">${name}</text>`;
  });

  // Open/mute row — clickable, cycles open <-> muted
  for (let s = 0; s < STRINGS; s++) {
    const x = leftMargin + s * cellW;
    const cy = topMargin - 16;
    const val = selectedFrets[s];
    const isOpen = val === 0;
    const isMuted = val === null;

    svg += `<rect class="fb-hit fb-hit-open" x="${x - cellW / 2 + 1}" y="${cy - 14}" width="${cellW - 2}" height="28" data-string="${s}"/>`;

    if (isMuted) {
      svg += `<circle class="fb-open-ring fb-muted" cx="${x}" cy="${cy}" r="10"/>`;
      svg += `<text class="fb-open-note fb-mute-text" x="${x}" y="${cy + 4}" text-anchor="middle">&#215;</text>`;
    } else {
      const note = noteName(noteAtOpen(s), 0);
      svg += `<circle class="fb-open-ring${isOpen ? ' fb-selected' : ''}" cx="${x}" cy="${cy}" r="10"/>`;
      svg += `<text class="fb-open-note${isOpen ? '' : ' fb-dim'}" x="${x}" y="${cy + 4}" text-anchor="middle">${note}</text>`;
    }
  }

  // Fret cells — clickable targets + dots for selected frets
  for (let f = 1; f <= FRETS; f++) {
    for (let s = 0; s < STRINGS; s++) {
      const x = leftMargin + s * cellW;
      const cy = topMargin + (f - 0.5) * cellH;
      const isSelected = selectedFrets[s] === f;

      svg += `<rect class="fb-hit" x="${x - cellW / 2 + 1}" y="${cy - cellH / 2 + 1}" width="${cellW - 2}" height="${cellH - 2}" data-string="${s}" data-fret="${f}"/>`;

      if (isSelected) {
        const note = noteName(noteAtFret(s, f), 0);
        svg += `<circle class="fb-dot fb-selected" cx="${x}" cy="${cy}" r="${cellH * 0.4}"/>`;
        svg += `<text class="fb-dot-text" x="${x}" y="${cy + 4}" text-anchor="middle">${note}</text>`;
      }
    }
  }

  svg += `</svg>`;

  document.getElementById('fretboard-container').innerHTML = svg;

  // Attach click handlers
  document.querySelectorAll('.fb-hit-open').forEach(el => {
    el.addEventListener('click', onOpenToggleClick);
  });
  document.querySelectorAll('.fb-hit:not(.fb-hit-open)').forEach(el => {
    el.addEventListener('click', onFretClick);
  });
}

function noteAtOpen(s) {
  return currentOpen()[s] % 12;
}
function noteAtFret(s, f) {
  return (currentOpen()[s] + f) % 12;
}

// ── Click handlers ───────────────────────────────────────────

function onOpenToggleClick(e) {
  const s = parseInt(e.currentTarget.dataset.string, 10);
  selectedFrets[s] = selectedFrets[s] === null ? 0 : null;
  renderFretboard();
  renderResult();
  updateUrl();
}

function onFretClick(e) {
  const s = parseInt(e.currentTarget.dataset.string, 10);
  const f = parseInt(e.currentTarget.dataset.fret, 10);

  // Toggle: if already selected, reset to open
  selectedFrets[s] = selectedFrets[s] === f ? 0 : f;

  renderFretboard();
  renderResult();
  updateUrl();
}

function clearFretboard() {
  selectedFrets = new Array(stringCount()).fill(0);
  renderFretboard();
  renderResult();
  updateUrl();
}

// ── Result rendering ────────────────────────────────────────

function renderResult() {
  const container = document.getElementById('identify-result');
  const strNames = currentStringNames();

  // Always show current notes
  const notesDisplay = selectedFrets.map((f, i) => {
    if (f === null) return `<span class="id-note id-note-muted">${strNames[i]}: <small>(muted)</small></span>`;
    const name = noteName(noteAtFret(i, f), 0);
    return `<span class="id-note">${strNames[i]}: ${name}${f > 0 ? ' <small>(fret ' + f + ')</small>' : ' <small>(open)</small>'}</span>`;
  }).join('');

  const results = identifyChord(selectedFrets);

  if (results.length === 0) {
    container.innerHTML = `
      <div class="id-notes-row">${notesDisplay}</div>
      <div class="id-primary">?</div>
      <div class="id-hint">No known chord matches these notes.</div>
    `;
    return;
  }

  const primary = results[0];
  const alternates = results.slice(1);

  let html = `<div class="id-notes-row">${notesDisplay}</div>`;
  html += `<div class="id-primary">${primary.label}</div>`;
  html += `<div class="id-intervals">${primary.intervals}</div>`;

  if (alternates.length > 0) {
    html += `<div class="id-also">Also matches:</div>`;
    html += `<div class="id-alt-list">`;
    alternates.forEach(a => {
      html += `<span class="id-alt-chip">${a.label} <small>${a.intervals}</small></span>`;
    });
    html += `</div>`;
  }

  // Add chord progression suggestions
  if (primary.root !== undefined && primary.type && primary.type.id) {
    const progressions = getProgressionSuggestions(primary.root, primary.type.id);
    if (progressions.length > 0) {
      html += `<div class="id-progressions">`;
      html += `<div class="id-progression-label">Common progressions:</div>`;
      html += `<div class="id-progression-list">`;
      progressions.forEach(p => {
        html += `<span class="id-progression-chip">${p.name}: ${p.chords.join(' - ')}</span>`;
      });
      html += `</div></div>`;
    }
  }

  // Add strumming/slide pattern suggestions
  const patterns = getStrummingPatterns();
  if (patterns.length > 0) {
    html += `<div class="id-strumming">`;
    html += `<div class="id-strumming-label">Strumming patterns:</div>`;
    html += `<div class="id-strumming-list">`;
    patterns.forEach(p => {
      const patternDisplay = p.pattern.map(s =>
        s === '-' ? '<span class="strum-rest">•</span>' :
        s === 'D' ? '<span class="strum-down">↓</span>' :
        '<span class="strum-up">↑</span>'
      ).join('');
      html += `<span class="id-strumming-chip">${p.name}: ${patternDisplay}</span>`;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html;
}

// ── Boot ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Parse URL parameters
  parseUrlParams();

  renderFretboard();
  renderResult();
  applyTheme(currentTheme());

  // Update URL to match current state
  updateUrl();

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('clear-btn').addEventListener('click', clearFretboard);

  renderTuningToggle('tuning-toggle', clearFretboard);
});
