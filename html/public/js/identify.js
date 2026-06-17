// ═══════════════════════════════════════════════════════════
// CHORD IDENTIFIER PAGE
// Depends on: music-theory.js, theme.js, tuning.js
// ═══════════════════════════════════════════════════════════

const MAX_FRET = 12;

// Current fret selection per string [G, C, E, A] — 0 = open
const selectedFrets = [0, 0, 0, 0];

// ── Fretboard SVG ───────────────────────────────────────────

function renderFretboard() {
  const STRINGS = 4;
  const FRETS = MAX_FRET;

  // Layout constants
  const leftMargin = 42;   // room for fret numbers
  const topMargin = 36;    // room for open-string note labels
  const cellW = 52;        // horizontal spacing between strings
  const cellH = 38;        // vertical spacing between frets
  const rightPad = 20;
  const bottomPad = 28;    // room for string names

  const gridW = (STRINGS - 1) * cellW;
  const gridH = FRETS * cellH;
  const W = leftMargin + gridW + rightPad;
  const H = topMargin + gridH + bottomPad;

  let svg = `<svg id="fretboard-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Interactive ukulele fretboard">`;

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
    svg += `<line class="fb-string-line" x1="${x}" y1="${topMargin}" x2="${x}" y2="${topMargin + gridH}" stroke-width="${1.2 + s * 0.2}"/>`;
  }

  // Position dots (standard uke markers at 5, 7, 10, 12)
  const markerFrets = [5, 7, 10];
  const midX = leftMargin + gridW / 2;
  for (const mf of markerFrets) {
    const cy = topMargin + (mf - 0.5) * cellH;
    svg += `<circle class="fb-marker" cx="${midX}" cy="${cy}" r="4"/>`;
  }
  // Double dot at 12
  const cy12 = topMargin + (12 - 0.5) * cellH;
  svg += `<circle class="fb-marker" cx="${midX - 12}" cy="${cy12}" r="3.5"/>`;
  svg += `<circle class="fb-marker" cx="${midX + 12}" cy="${cy12}" r="3.5"/>`;

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

  // Open-string note labels and clickable open row
  for (let s = 0; s < STRINGS; s++) {
    const x = leftMargin + s * cellW;
    const cy = topMargin - 16;
    const isSelected = selectedFrets[s] === 0;
    const note = noteName(noteAtCurrent(s, 0), 0);

    // Clickable area for "open"
    svg += `<rect class="fb-hit" x="${x - cellW / 2 + 1}" y="${cy - 14}" width="${cellW - 2}" height="28" data-string="${s}" data-fret="0"/>`;

    if (isSelected) {
      svg += `<circle class="fb-open-ring${isSelected ? ' fb-selected' : ''}" cx="${x}" cy="${cy}" r="10"/>`;
      svg += `<text class="fb-open-note" x="${x}" y="${cy + 4}" text-anchor="middle">${note}</text>`;
    } else {
      svg += `<circle class="fb-open-ring" cx="${x}" cy="${cy}" r="10"/>`;
      svg += `<text class="fb-open-note fb-dim" x="${x}" y="${cy + 4}" text-anchor="middle">${note}</text>`;
    }
  }

  // Fret cells — clickable targets + dots for selected frets
  for (let f = 1; f <= FRETS; f++) {
    for (let s = 0; s < STRINGS; s++) {
      const x = leftMargin + s * cellW;
      const cy = topMargin + (f - 0.5) * cellH;
      const isSelected = selectedFrets[s] === f;

      // Invisible hit area
      svg += `<rect class="fb-hit" x="${x - cellW / 2 + 1}" y="${cy - cellH / 2 + 1}" width="${cellW - 2}" height="${cellH - 2}" data-string="${s}" data-fret="${f}"/>`;

      if (isSelected) {
        const note = noteName(noteAtCurrent(s, f), 0);
        svg += `<circle class="fb-dot fb-selected" cx="${x}" cy="${cy}" r="${cellH * 0.34}"/>`;
        svg += `<text class="fb-dot-text" x="${x}" y="${cy + 4}" text-anchor="middle">${note}</text>`;
      }
    }
  }

  svg += `</svg>`;

  document.getElementById('fretboard-container').innerHTML = svg;

  // Attach click handlers to all hit areas
  document.querySelectorAll('.fb-hit').forEach(el => {
    el.addEventListener('click', onFretClick);
  });
}

// ── Click handler ───────────────────────────────────────────

function onFretClick(e) {
  const s = parseInt(e.currentTarget.dataset.string, 10);
  const f = parseInt(e.currentTarget.dataset.fret, 10);

  // Toggle: if already selected, reset to open
  selectedFrets[s] = selectedFrets[s] === f ? 0 : f;

  renderFretboard();
  renderResult();
}

function clearFretboard() {
  for (let i = 0; i < 4; i++) selectedFrets[i] = 0;
  renderFretboard();
  renderResult();
}

// ── Result rendering ────────────────────────────────────────

function renderResult() {
  const container = document.getElementById('identify-result');
  const notes = selectedFrets.map((f, i) => noteAtCurrent(i, f));
  const noteNamesArr = notes.map(n => noteName(n, 0));
  const strNames = currentStringNames();

  // Always show current notes
  const notesDisplay = selectedFrets.map((f, i) => {
    const name = noteName(noteAtCurrent(i, f), 0);
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

  container.innerHTML = html;
}

// ── Boot ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderFretboard();
  renderResult();
  applyTheme(currentTheme());

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('clear-btn').addEventListener('click', clearFretboard);

  renderTuningToggle('tuning-toggle', clearFretboard);
});
